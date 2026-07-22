// GET    /api/admin/users/[id] — full detail for one app_users row.
// DELETE /api/admin/users/[id] — anonymise the account (soft delete).
//
// requireAdmin gate. Every mutation logs to audit_events via appendAudit()
// (see web/src/lib/audit.ts — hash-chained, HMAC-signed).
//
// Anonymisation policy (retention over erasure):
//   - keep the row + its FK references to transactions, sessions, etc.
//   - scrub PII: email → deleted-<id>@removed.blockid.local
//                display_name, avatar_url, google_id, stripe_customer_id,
//                startup_name/stage/industry/goals, referral_code → null
//   - password_hash cleared, role forced to "user", plan → "free"
//   - revoke all sessions for the user
//
// If the caller needs a true hard-delete for legal reasons, they should do
// it directly against the DB — this endpoint deliberately preserves history.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface Params {
  id: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  try {
    requireAdmin(currentUser);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json(
        { ok: false, reason: err.code },
        { status: err.code === "no_user" ? 401 : 403 },
      );
    }
    throw err;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  try {
    const { data: user, error: userErr } = await supabase
      .from("app_users")
      .select(
        [
          "id",
          "email",
          "display_name",
          "role",
          "plan",
          "segment",
          "account_type",
          "jurisdiction",
          "google_id",
          "avatar_url",
          "stripe_customer_id",
          "discount_pct",
          "startup_name",
          "startup_stage",
          "industry",
          "startup_goals",
          "onboarding_completed",
          "onboarding_completed_at",
          "referral_code",
          "referred_by",
          "referral_credits_earned",
          "attribution_reseller_id",
          "verified_at",
          "created_at",
          "last_login_at",
        ].join(", "),
      )
      .eq("id", id)
      .maybeSingle();

    if (userErr) throw userErr;
    if (!user) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    const [balRes, txRes, sessRes] = await Promise.all([
      supabase
        .from("credit_balances")
        .select("balance, lifetime_earned, lifetime_spent, updated_at")
        .eq("user_id", id)
        .maybeSingle(),
      supabase
        .from("credit_transactions")
        .select("amount, balance_after, reason, metadata, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("sessions")
        .select("token, created_at, last_used_at, expires_at, ip_hash, user_agent")
        .eq("user_id", id)
        .order("last_used_at", { ascending: false })
        .limit(5),
    ]);

    return NextResponse.json({
      ok: true,
      user,
      balance: balRes.data ?? null,
      transactions: txRes.data ?? [],
      sessions: (sessRes.data ?? []).map((s: { token: string; ip_hash: string | null } & Record<string, unknown>) => ({
        ...s,
        // Redact the session token — admin has no reason to see it.
        token: `${String(s.token).slice(0, 6)}…`,
        // Redact ip_hash to first 8 chars.
        ip_hash: s.ip_hash ? `${s.ip_hash.slice(0, 8)}…` : null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "query_failed", error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  try {
    requireAdmin(currentUser);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json(
        { ok: false, reason: err.code },
        { status: err.code === "no_user" ? 401 : 403 },
      );
    }
    throw err;
  }

  if (currentUser!.id === id) {
    return NextResponse.json(
      { ok: false, reason: "cannot_delete_self" },
      { status: 400 },
    );
  }

  let body: { reason?: string } = {};
  try {
    body = (await request.json()) as { reason?: string };
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }
  const reason = (body.reason ?? "").trim();
  if (!reason) {
    return NextResponse.json(
      { ok: false, reason: "reason_required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  try {
    const { data: existing, error: readErr } = await supabase
      .from("app_users")
      .select("id, email, role, plan")
      .eq("id", id)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!existing) {
      return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
    }

    // Audit BEFORE the mutation so the pre-state and reason are chained even
    // if the anonymisation writes below partially fail.
    await appendAudit({
      user_id: currentUser!.id,
      actor: "admin",
      action: "admin.user.deleted",
      resource_type: "app_users",
      resource_id: id,
      detail: {
        target_email: existing.email,
        target_prev_role: existing.role,
        target_prev_plan: existing.plan,
        reason,
        actor_email: currentUser!.email,
      },
    });

    const anonEmail = `deleted-${id}@removed.blockid.local`;
    const { error: updErr } = await supabase
      .from("app_users")
      .update({
        email: anonEmail,
        display_name: null,
        avatar_url: null,
        google_id: null,
        stripe_customer_id: null,
        password_hash: null,
        role: "user",
        plan: "free",
        startup_name: null,
        startup_stage: null,
        industry: null,
        startup_goals: null,
        referral_code: null,
      })
      .eq("id", id);
    if (updErr) throw updErr;

    // Revoke all active sessions so the account can't be used post-delete.
    await supabase.from("sessions").delete().eq("user_id", id);

    return NextResponse.json({ ok: true, anonymised_email: anonEmail });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "delete_failed", error: (err as Error).message },
      { status: 500 },
    );
  }
}
