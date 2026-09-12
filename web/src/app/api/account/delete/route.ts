// GET  /api/account/delete — deletion status for the signed-in user
// POST /api/account/delete — self-service account deletion (S24-B, 2026-09-12)
//
// Privacy Policy v2.3 clause 8 ("removal on request") mechanised. Body:
//
//   { action: "reauth" }                                   → email a 15-min re-auth link
//     (passwordless accounts — Google / magic-link — cannot type a password)
//   { action: "request", confirmation: "DELETE",
//     password?: string | token?: string, reason?: string } → schedule deletion
//   { action: "cancel" }                                   → cancel a pending request
//
// Gates on "request", in order:
//   401 reauth_required   no valid password / re-auth token (5 attempts / 15 min)
//   400 confirmation      the typed phrase is not exactly "DELETE"
//   403 admin_account     admins use POST /api/admin/account/erase (never self)
//   409 shared_projects   the user owns a live project with other accepted
//                         members — transfer or archive first; the list is returned
//   200 { scheduled_for } deletion_requested_at stamped; a cancel link is
//                         emailed; /api/cron/account-erasure erases after 7 days
//
// Nothing is erased here. The cron calls eraseAccount() (Stripe cancel +
// detach, atomic erase_account RPC, storage purge, audit row).

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  CONFIRMATION_PHRASE,
  GRACE_DAYS,
  cancelDeletion,
  consumeReauthToken,
  getDeletionStatus,
  mintReauthToken,
  requestDeletion,
  sharedProjectsOwnedBy,
} from "@/lib/privacy/deletion-request";
import { sendDeletionReauth, sendDeletionScheduled } from "@/lib/privacy/erasure-emails";

export const dynamic = "force-dynamic";

interface Body {
  action?: "reauth" | "request" | "cancel";
  confirmation?: string;
  password?: string;
  token?: string;
  reason?: string;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  const status = await getDeletionStatus(db, user.id);
  if (!status) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...status, graceDays: GRACE_DAYS, isAdmin: user.role === "admin" });
}

async function POST_handler(request: Request) {

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const parsed = await readJsonBody<Body>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};
  const action = body.action ?? "request";

  if (action === "cancel") {
    const res = await cancelDeletion(db, user.id);
    if (!res.ok) return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
    return NextResponse.json({ ok: true, pending: false });
  }

  if (user.role === "admin") {
    return NextResponse.json({ ok: false, reason: "admin_account" }, { status: 403 });
  }

  if (action === "reauth") {
    const limited = enforceRateLimit("account-delete-reauth", user.id, request, 3, 15 * 60_000);
    if (limited) return limited;
    const minted = await mintReauthToken(db, user.id);
    if (!minted.ok) return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
    void sendDeletionReauth({ to: user.email, token: minted.token }).catch(() => {});
    return NextResponse.json({ ok: true, sent: true, expiresAt: minted.expiresAt });
  }

  if (action !== "request") return NextResponse.json({ ok: false, reason: "invalid_action" }, { status: 400 });

  // ── re-authentication ──────────────────────────────────────────────────
  const limited = enforceRateLimit("account-delete", user.id, request, 5, 15 * 60_000);
  if (limited) return limited;

  const status = await getDeletionStatus(db, user.id);
  if (!status) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (status.erased) return NextResponse.json({ ok: false, reason: "already_erased" }, { status: 410 });

  let reauthed = false;
  if (typeof body.token === "string" && body.token) {
    const verdict = await consumeReauthToken(db, user.id, body.token);
    reauthed = verdict === "ok";
    if (!reauthed) {
      return NextResponse.json({ ok: false, reason: "reauth_required", detail: verdict, hasPassword: status.hasPassword }, { status: 401 });
    }
  } else if (typeof body.password === "string" && body.password) {
    if (!status.hasPassword) {
      return NextResponse.json({ ok: false, reason: "reauth_required", detail: "no_password", hasPassword: false }, { status: 401 });
    }
    const { data } = await db.from("app_users").select("password_hash").eq("id", user.id).maybeSingle();
    const hash = (data?.password_hash as string | null) ?? null;
    reauthed = Boolean(hash) && (await bcrypt.compare(body.password, hash as string));
    if (!reauthed) {
      return NextResponse.json({ ok: false, reason: "reauth_required", detail: "bad_password", hasPassword: true }, { status: 401 });
    }
  } else {
    return NextResponse.json({ ok: false, reason: "reauth_required", detail: "missing", hasPassword: status.hasPassword }, { status: 401 });
  }

  // ── typed confirmation ─────────────────────────────────────────────────
  if ((body.confirmation ?? "").trim() !== CONFIRMATION_PHRASE) {
    return NextResponse.json({ ok: false, reason: "confirmation", expected: CONFIRMATION_PHRASE }, { status: 400 });
  }

  // ── shared projects: co-founders must not lose their workspace ─────────
  const shared = await sharedProjectsOwnedBy(db, user.id);
  if (shared.length > 0) {
    return NextResponse.json({ ok: false, reason: "shared_projects", projects: shared }, { status: 409 });
  }

  // ── schedule ───────────────────────────────────────────────────────────
  const req = await requestDeletion(db, user.id, { reason: body.reason ?? null });
  if (!req.ok) return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  void sendDeletionScheduled({ to: user.email, cancelToken: req.cancelToken, scheduledFor: req.scheduledFor }).catch(() => {});
  return NextResponse.json({ ok: true, pending: true, requestedAt: req.requestedAt, scheduledFor: req.scheduledFor, graceDays: GRACE_DAYS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/account/delete/route.ts", method: "POST" }, POST_handler);
