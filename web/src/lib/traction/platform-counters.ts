// /api/platform-stats ← traction snapshot (G14-S33).
//
// Reduces the raw daily snapshot to the three public counters the directory
// widgets show. Only a FRESH snapshot (< 26 h, isTractionFresh) is used; a
// figure the snapshot could not measure (null + warning) stays null so the
// route falls back to its live query for that counter only.
//
//   founders       users.founders (QA / seeded / erased excluded)
//   analyses       analyses.svi_analyses
//   paidCustomers  Σ evaluators.paying_by_plan — active evaluator
//                  subscriptions, not the live `app_users.plan != 'free'`
//                  proxy (which counts trialing rows and QA fixtures).

import { isTractionFresh } from "./status";

export interface SnapshotCounters {
  founders: number | null;
  analyses: number | null;
  paidCustomers: number | null;
}

function nonNegInt(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
}

/** Pure. `null` when there is no fresh snapshot at all. */
export function countersFromSnapshot(raw: Record<string, unknown> | null, now: number = Date.now()): SnapshotCounters | null {
  if (!raw || !isTractionFresh(raw as { generated_at?: unknown }, now)) return null;
  const users = (raw.users ?? {}) as Record<string, unknown>;
  const analyses = (raw.analyses ?? {}) as Record<string, unknown>;
  const evaluators = (raw.evaluators ?? {}) as Record<string, unknown>;
  const paying = evaluators.paying_by_plan;
  let paidCustomers: number | null = null;
  if (paying && typeof paying === "object" && !Array.isArray(paying)) {
    paidCustomers = 0;
    for (const v of Object.values(paying as Record<string, unknown>)) paidCustomers += nonNegInt(v) ?? 0;
  }
  return {
    founders: nonNegInt(users.founders),
    analyses: nonNegInt(analyses.svi_analyses),
    paidCustomers,
  };
}
