// G35 Pricing v5 P4 — KPI hook: "Verified review SLA hit rate" (plan §6.8).
// W5 renders it on the admin KPI dashboard (lib/admin/report-kpis.ts).
//
// Population: Verified orders (SKU report_verified / upgrade_full_verified —
// the only SKUs that enter review) whose SLA deadline falls in the window
// [now − N days, now+)
// — i.e. every order that was due, or delivered early, inside the window.
//   on time  delivered_at ≤ sla_due_at
//   late     delivered_at  > sla_due_at
//   breached still IN_REVIEW and now > sla_due_at (counts as a miss)
//   excluded REFUNDED, and IN_REVIEW orders not yet due
// rate = onTime / (onTime + late + breached); null when nothing qualifies.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toInstant } from "./sla";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;
type Row = Record<string, unknown>;

export const VERIFIED_ORDER_SKUS = ["report_verified", "upgrade_full_verified"] as const;
const DAY_MS = 86_400_000;

export interface SlaHitRate {
  windowDays: number;
  onTime: number;
  late: number;
  /** IN_REVIEW orders already past their deadline. */
  breached: number;
  /** onTime / (onTime + late + breached), 0–1 rounded to 3 dp; null when the denominator is 0. */
  rate: number | null;
  error: string | null;
}

/** Pure: the hit rate over pre-filtered Verified order rows. */
export function computeSlaHitRate(rows: readonly Row[], now: Date, windowDays = 30): SlaHitRate {
  const start = now.getTime() - windowDays * DAY_MS;
  let onTime = 0;
  let late = 0;
  let breached = 0;
  for (const r of rows) {
    const due = toInstant(r.sla_due_at);
    if (!due || due.getTime() < start) continue;
    const status = String(r.status ?? "");
    if (status === "REFUNDED") continue;
    const delivered = toInstant(r.delivered_at);
    if (delivered && (status === "READY" || status === "SHARED" || status === "EXPIRED")) {
      if (delivered.getTime() <= due.getTime()) onTime++;
      else late++;
    } else if (status === "IN_REVIEW" && now.getTime() > due.getTime()) {
      breached++;
    }
  }
  const denom = onTime + late + breached;
  return { windowDays, onTime, late, breached, rate: denom ? Math.round((onTime / denom) * 1000) / 1000 : null, error: null };
}

/** DB-backed hit rate. Fail-soft: an error (e.g. 0474 not applied) returns rate null + `error`. */
export async function verifiedSlaHitRate(db: Db, opts: { now?: Date; windowDays?: number } = {}): Promise<SlaHitRate> {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 30;
  const since = new Date(now.getTime() - windowDays * DAY_MS).toISOString();
  try {
    const { data, error } = await db
      .from("report_orders")
      .select("id, status, product_sku, tier, sla_due_at, delivered_at")
      .in("product_sku", [...VERIFIED_ORDER_SKUS])
      .gte("sla_due_at", since)
      .limit(5000);
    if (error) return { windowDays, onTime: 0, late: 0, breached: 0, rate: null, error: (error as { message?: string }).message ?? "query_failed" };
    return computeSlaHitRate((data ?? []) as Row[], now, windowDays);
  } catch (e) {
    return { windowDays, onTime: 0, late: 0, breached: 0, rate: null, error: e instanceof Error ? e.message : "query_failed" };
  }
}
