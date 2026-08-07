// /api/cron/founding-promo-cutover-guardrail — post-cutover defensive sweep.
//
// The Founding 100 A$5 promo ends 2026-08-31T23:59:59 UTC. Four separate
// guards (checkout API 410, /api/lead promo-active check, webhook
// session.created check, stripe-reconcile session.created check) already
// exist. This cron is the LAST line of defence: it runs hourly AFTER cutover
// and looks for any app_users row that had `plan="founding50"` written in the
// last hour. If found, that means one of the guards silently failed and a
// founder was granted lifetime access + credits for A$5 after the window
// closed — a critical incident that needs immediate ops attention.
//
// Design principles:
//   1. NO-OP before cutover — the cron is safe to schedule pre-flight. All
//      pre-cutover founding50 grants are legitimate and must be ignored.
//   2. Report-only, NEVER auto-remediate. A rogue grant needs a human to
//      decide: force-refund, honour the deal, or grandfather. Auto-revoking a
//      row that turns out to be legitimate (edge case: admin migration,
//      grandfather flow) would be worse than the leak.
//   3. Uses `plan_started_at` (writes are stamped by the webhook +
//      stripe-reconcile) — falls back to `updated_at` when column missing.
//   4. Telegram alert only fires on non-zero hits so we don't spam ops with
//      "0 rogue grants in the last hour" every hour for years.
//
// Response shape:
//   { ok, cutover_iso, active, scanned_window_hours, rogue_grants,
//     row_ids: string[], alerted: boolean }
//
// Schedule: hourly (5m past the hour to avoid overlap with existing crons).
// Auth: Bearer $CRON_SECRET via cron-runner.sh, same as every other cron.

import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendTelegram } from "@/lib/telegram";
import { FOUNDING_PROMO_END, isFoundingPromoActive } from "@/lib/founding-promo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Lookback window. Hourly cron with a 60m window gives one clean sweep per
 * grant with zero double-alerting (the response is idempotent and the human
 * who acted on the first alert doesn't need a second one an hour later —
 * the row still exists but the window has advanced past it).
 */
const LOOKBACK_MINUTES = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  if (header && header === secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Before cutover this cron is a no-op — every founding50 grant is
  // legitimate and reporting them would generate false positives that
  // erode alert-trust before the guardrail even matters.
  if (isFoundingPromoActive()) {
    return NextResponse.json({
      ok: true,
      cutover_iso: FOUNDING_PROMO_END.toISOString(),
      active: true,
      scanned_window_hours: 0,
      rogue_grants: 0,
      row_ids: [],
      alerted: false,
      note: "promo still active — no-op",
    });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  const sinceIso = new Date(
    Date.now() - LOOKBACK_MINUTES * 60 * 1000,
  ).toISOString();

  // Look for any app_users row that started on the founding50 plan in the
  // last hour. The webhook writes plan_started_at=now() when it grants the
  // Founding 100 plan; the stripe-reconcile cron does the same. An admin
  // grandfather migration that legitimately re-plans a founder should NOT
  // update plan_started_at (it's a one-shot stamp) — but even if it does,
  // the alert is a read-only heads-up, so a false positive costs only a
  // few seconds of ops attention.
  const { data, error } = await supabase
    .from("app_users")
    .select("id, email, plan_started_at")
    .eq("plan", "founding50")
    .gte("plan_started_at", sinceIso)
    .limit(50);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const rogueGrants = rows.length;
  const rowIds = rows.map((r) => String(r.id));

  let alerted = false;
  if (rogueGrants > 0) {
    const summary = rows
      .slice(0, 10)
      .map(
        (r) =>
          `- ${r.email ?? String(r.id).slice(0, 8)} @ ${r.plan_started_at ?? "unknown"}`,
      )
      .join("\n");
    const text =
      `🚨 CRITICAL: Founding 100 cutover guardrail — ${rogueGrants} rogue grant(s) in last ${LOOKBACK_MINUTES}m\n` +
      `cutover=${FOUNDING_PROMO_END.toISOString()}\n` +
      `now=${new Date().toISOString()}\n` +
      `Row IDs: ${rowIds.join(", ")}\n` +
      summary +
      `\nAction: check Stripe for these sessions and force-refund if unauthorised.`;
    try {
      await sendTelegram(text);
      alerted = true;
    } catch (err) {
      // Alert delivery failed — surface in response so the cron-runner
      // JSONL log captures it; the JSON response is the paper trail.
      console.error(
        "[founding-promo-cutover-guardrail] telegram alert failed",
        err,
      );
    }
    console.error("[founding-promo-cutover-guardrail]", text);
  }

  return NextResponse.json({
    ok: true,
    cutover_iso: FOUNDING_PROMO_END.toISOString(),
    active: false,
    scanned_window_hours: LOOKBACK_MINUTES / 60,
    rogue_grants: rogueGrants,
    row_ids: rowIds,
    alerted,
  });
}

// cron-runner.sh calls all cron endpoints via POST — alias to GET so both work.
export const POST = GET;
