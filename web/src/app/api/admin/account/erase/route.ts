// POST /api/admin/account/erase — immediate, audited account erasure (S24-B).
//
// Body: { user_id?: uuid, email?: string, reason: string, dry_run?: boolean }
//
// requireAdmin gate; an admin can never erase their own account (the same
// self-lockout guard as DELETE /api/admin/users/[id]). Resolves the target
// by id or email, then calls eraseAccount() — Stripe cancel + detach, the
// atomic `erase_account` RPC (0348), storage purge, and ONE `account.erased`
// audit row carrying the admin as actor. `dry_run: true` returns the
// per-table report without touching anything (use it before a real run).
//
// This is the "in the operator's hands" path for erasing test / QA accounts
// and for privacy@ removal requests; the DB-only equivalent is
// scripts/db/erase-account.mjs.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { isUuid, readJsonBody } from "@/lib/security/request-guards";
import { eraseAccount } from "@/lib/privacy/erase-account";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface Body {
  user_id?: string;
  email?: string;
  reason?: string;
  dry_run?: boolean;
}

async function POST_handler(request: Request) {
  const currentUser = await getCurrentUser();
  try {
    requireAdmin(currentUser);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: err.code === "no_user" ? 401 : 403 });
    }
    throw err;
  }

  const parsed = await readJsonBody<Body>(request, 8 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body ?? {};
  const reason = (body.reason ?? "").toString().trim();
  if (!reason) return NextResponse.json({ ok: false, reason: "reason_required" }, { status: 400 });

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  let targetId: string | null = null;
  if (body.user_id !== undefined) {
    if (!isUuid(body.user_id)) return NextResponse.json({ ok: false, reason: "invalid_user_id" }, { status: 400 });
    targetId = body.user_id;
  } else if (typeof body.email === "string" && body.email.includes("@")) {
    const { data } = await db.from("app_users").select("id").eq("email", body.email.trim().toLowerCase()).maybeSingle();
    targetId = (data?.id as string | undefined) ?? null;
  } else {
    return NextResponse.json({ ok: false, reason: "user_id_or_email_required" }, { status: 400 });
  }
  if (!targetId) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (targetId === currentUser!.id) return NextResponse.json({ ok: false, reason: "cannot_erase_self" }, { status: 400 });

  const result = await eraseAccount(targetId, {
    dryRun: body.dry_run === true,
    reason: `admin: ${reason}`,
    actor: "admin",
    actorUserId: currentUser!.id,
  });

  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "supabase_unavailable" ? 503 : 500;
    return NextResponse.json({ ok: false, reason: result.error ?? "erase_failed", result }, { status });
  }
  return NextResponse.json({ ok: true, result });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/admin/account/erase/route.ts", method: "POST" }, POST_handler);
