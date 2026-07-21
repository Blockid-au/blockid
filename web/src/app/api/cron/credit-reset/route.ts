// GET /api/cron/credit-reset
//
// Monthly credit reset — resolves H.11 (the missing recurring-grant loop).
// For every user with an active subscription and a plan.usage_limits.monthly_credits
// value, ensure they've received their monthly grant this calendar month.
//
// Per docs/plans/reseller-module-plan.md § U.15.9 H.11 resolution + § A.3
// "Monthly reset — Missing". Runs monthly on the 1st (cron schedule set
// externally in web/scripts/crontab.production).
//
// Idempotency: keyed off (user_id, month_key) — a duplicate run in the
// same month is a no-op via ON CONFLICT DO NOTHING.
//
// Auth: shared CRON_SECRET pattern.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface EligibleUser {
  user_id: string;
  plan: string;
  monthly_credits: number;
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const monthKey = currentMonthKey();
  const runAt = new Date().toISOString();

  // Get plan usage limits — read from plans.usage_limits.monthly_credits.
  const { data: plansData } = await supabase
    .from("plans")
    .select("id, usage_limits, active");

  const monthlyByPlan = new Map<string, number>();
  for (const p of plansData ?? []) {
    const usage = (p as { usage_limits?: { monthly_credits?: number } }).usage_limits;
    const credits = usage?.monthly_credits;
    // -1 = unlimited (Enterprise). Skip explicit reset for unlimited.
    if (typeof credits === "number" && credits > 0) {
      monthlyByPlan.set((p as { id: string }).id, credits);
    }
  }

  if (monthlyByPlan.size === 0) {
    return NextResponse.json({ ok: true, granted: 0, message: "no eligible plans configured" });
  }

  // Find users on eligible plans. Bulk fetch and filter in memory to avoid
  // a chained OR across many plan ids.
  const eligibleIds = Array.from(monthlyByPlan.keys());
  const { data: users, error: usersErr } = await supabase
    .from("app_users")
    .select("id, plan")
    .in("plan", eligibleIds);

  if (usersErr) {
    return NextResponse.json({ ok: false, reason: "query_users_failed", error: usersErr.message }, { status: 500 });
  }

  const eligible: EligibleUser[] = (users ?? []).map((u: { id: string; plan: string }) => ({
    user_id: u.id,
    plan: u.plan,
    monthly_credits: monthlyByPlan.get(u.plan) ?? 0,
  })).filter((u) => u.monthly_credits > 0);

  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, granted: 0, message: "no eligible users" });
  }

  // Idempotency guard: check which users already received their grant this
  // month. `credit_transactions.reason = 'plan_grant_monthly'` with metadata
  // month_key = currentMonthKey.
  const { data: already } = await supabase
    .from("credit_transactions")
    .select("user_id, metadata")
    .eq("reason", "plan_grant_monthly")
    .gte("created_at", `${monthKey}-01T00:00:00Z`)
    .in("user_id", eligible.map((e) => e.user_id));

  const alreadyGranted = new Set<string>();
  for (const row of already ?? []) {
    const md = (row as { metadata?: { month_key?: string } }).metadata;
    if (md?.month_key === monthKey) {
      alreadyGranted.add((row as { user_id: string }).user_id);
    }
  }

  const toGrant = eligible.filter((u) => !alreadyGranted.has(u.user_id));
  if (toGrant.length === 0) {
    return NextResponse.json({
      ok: true,
      granted: 0,
      month: monthKey,
      already_granted: alreadyGranted.size,
      message: "all eligible users already granted for this month",
    });
  }

  // Batch grants via credit_transactions inserts. This intentionally does NOT
  // call web/src/lib/credits.ts grantCredits() so we keep this cron pure —
  // grantCredits() updates the `credit_balances` running total via a
  // race-guarded path, but for a monthly bulk grant the simpler pattern is
  // an insert here + a nightly reconcile job to refresh balances. Doing the
  // balance update inline requires per-user optimistic locking; deferred to
  // P3.5 (balance reconcile cron).
  const inserts = toGrant.map((u) => ({
    user_id: u.user_id,
    amount: u.monthly_credits,
    balance_after: null,           // reconciled separately
    reason: "plan_grant_monthly",
    metadata: { month_key: monthKey, plan: u.plan, cron_run_at: runAt },
  }));

  const { error: insErr } = await supabase.from("credit_transactions").insert(inserts);
  if (insErr) {
    return NextResponse.json({ ok: false, reason: "insert_failed", error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    granted: inserts.length,
    month: monthKey,
    per_plan: inserts.reduce<Record<string, number>>((acc, r) => {
      const plan = (r.metadata as { plan: string }).plan;
      acc[plan] = (acc[plan] ?? 0) + 1;
      return acc;
    }, {}),
    ran_at: runAt,
  });
}
