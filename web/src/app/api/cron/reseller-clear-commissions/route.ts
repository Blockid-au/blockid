// GET /api/cron/reseller-clear-commissions
//
// Nightly cron that promotes reseller_commissions rows past their
// pending_until timestamp from "pending_clearance" to "cleared" by inserting
// a 'cleared' event into reseller_commission_events.
//
// Per docs/plans/reseller-module-plan.md § D.5 + § U.15.1 (append-only
// event flow — the reseller_commissions row itself is NEVER mutated).
//
// Idempotency: the 'cleared' event insert is a plain APPEND; the derived
// status view already treats duplicate 'cleared' events as harmless (the
// status stays 'cleared'). No unique key required beyond the row's id.
//
// Auth: shared CRON_SECRET pattern used by every existing cron endpoint
// (see other files under web/src/app/api/cron/*).

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface PendingRow {
  id: string;
  reseller_id: string;
  commission_aud_cents: number;
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

  // Read the reseller_commissions_current view to find rows whose derived
  // status is 'pending_clearance' AND whose pending_until has passed.
  // The view already folds in any dispute/refund events, so if a row shows
  // 'pending_clearance' here, no clawback events exist and clearance is safe.
  const nowIso = new Date().toISOString();
  const { data: pending, error: pendErr } = await supabase
    .from("reseller_commissions_current")
    .select("commission_id, reseller_id, commission_aud_cents, status, pending_until")
    .eq("status", "pending_clearance")
    .lt("pending_until", nowIso)
    .limit(500);

  if (pendErr) {
    return NextResponse.json({ ok: false, reason: "query_failed", error: pendErr.message }, { status: 500 });
  }

  const rows = (pending ?? []) as unknown as Array<PendingRow & { commission_id: string; status: string; pending_until: string }>;
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, cleared: 0, message: "no pending rows past window" });
  }

  // Batch-insert 'cleared' events. delta_aud_cents = 0 (informational; net_owed
  // is derived from the accrual + subsequent clawbacks).
  const events = rows.map((r) => ({
    commission_id: r.commission_id,
    event_type: "cleared" as const,
    delta_aud_cents: 0,
    metadata: { cleared_by: "cron:reseller-clear-commissions", pending_until: r.pending_until },
  }));

  const { error: insErr } = await supabase.from("reseller_commission_events").insert(events);
  if (insErr) {
    return NextResponse.json({ ok: false, reason: "insert_failed", error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cleared: rows.length,
    per_reseller: rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.reseller_id] = (acc[r.reseller_id] ?? 0) + 1;
      return acc;
    }, {}),
    ran_at: nowIso,
  });
}

export { GET as POST };
