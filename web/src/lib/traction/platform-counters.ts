// Public snapshot counters retain source definitions. Analyses are raw stored
// svi_analyses rows, not unique companies or QA-filtered completed reports.
import { isTractionFresh } from "./status";

export interface SnapshotCounters {
  founders: number | null;
  analyses: number | null;
  paidCustomers: number | null;
}
export function nonNegInt(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}
export function hasSnapshotWarning(raw: Record<string, unknown>, prefixes: readonly string[]): boolean {
  return Array.isArray(raw.warnings) && raw.warnings.some(w => typeof w === "string"
    && ["supabase:", ...prefixes].some(prefix => w.startsWith(prefix)));
}
export function sumCountRecord(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  let sum = 0;
  for (const v of Object.values(value)) {
    const count = nonNegInt(v);
    if (count === null) return null;
    sum += count;
  }
  return nonNegInt(sum);
}
/** A failed or incomplete source stays unavailable, including empty maps left
 * by emptyTractionSnapshot. A measured zero requires successful source scans. */
export function countersFromSnapshot(raw: Record<string, unknown> | null, now: number = Date.now()): SnapshotCounters | null {
  if (!raw || !isTractionFresh(raw, now)) return null;
  const users = (raw.users ?? {}) as Record<string, unknown>;
  const analyses = (raw.analyses ?? {}) as Record<string, unknown>;
  const evaluators = (raw.evaluators ?? {}) as Record<string, unknown>;
  const userUnavailable = hasSnapshotWarning(raw, ["app_users:"]) || nonNegInt(users.total) === null;
  return {
    founders: userUnavailable ? null : nonNegInt(users.founders),
    analyses: hasSnapshotWarning(raw, ["svi_analyses:"]) ? null : nonNegInt(analyses.svi_analyses),
    paidCustomers: userUnavailable || hasSnapshotWarning(raw, ["subscription_trial_state:"])
      || nonNegInt(evaluators.trials) === null ? null : sumCountRecord(evaluators.paying_by_plan),
  };
}
