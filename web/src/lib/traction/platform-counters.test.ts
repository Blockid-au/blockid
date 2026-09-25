import { describe, expect, it } from "vitest";
import { countersFromSnapshot, sumCountRecord } from "./platform-counters";
import { emptyTractionSnapshot } from "./snapshot";
const NOW = Date.parse("2026-09-25T12:00:00Z");
const fixture = () => ({ generated_at: new Date(NOW - 3600e3).toISOString(), users: { total: 12, founders: 9 },
  analyses: { svi_analyses: 41 }, evaluators: { trials: 0, paying_by_plan: { angel: 2, vc: 1 } }, warnings: [] as string[] });
describe("snapshot count contracts", () => {
  it("accepts measured counts and explicit zero", () => {
    expect(countersFromSnapshot(fixture(), NOW)).toEqual({ founders: 9, analyses: 41, paidCustomers: 3 });
    const raw = fixture(); raw.evaluators.paying_by_plan = {} as typeof raw.evaluators.paying_by_plan;
    expect(countersFromSnapshot(raw, NOW)?.paidCustomers).toBe(0);
  });
  it("empty snapshot is not zero paying customers", () => {
    expect(countersFromSnapshot(emptyTractionSnapshot(new Date(NOW)), NOW)).toEqual({ founders: null, analyses: null, paidCustomers: null });
  });
  it.each(["app_users: failed", "subscription_trial_state: failed", "subscription_trial_state: scan capped at 5000 rows", "supabase: unavailable"])("source warning invalidates paying total: %s", warning => {
    const raw = fixture(); raw.warnings = [warning]; expect(countersFromSnapshot(raw, NOW)?.paidCustomers).toBeNull();
  });
  it("malformed counts never silently contribute zero or round to new counts", () => {
    for (const v of [{ angel: -1 }, { angel: 1.2 }, { angel: null }, { angel: "2" }, { angel: Infinity }, [2]]) expect(sumCountRecord(v)).toBeNull();
    const raw = fixture(); raw.analyses.svi_analyses = 1.2; expect(countersFromSnapshot(raw, NOW)?.analyses).toBeNull();
  });
  it("rejects missing, stale and future observations", () => {
    for (const raw of [null, {}, { ...fixture(), generated_at: new Date(NOW - 27 * 3600e3).toISOString() }, { ...fixture(), generated_at: new Date(NOW + 1).toISOString() }]) expect(countersFromSnapshot(raw, NOW)).toBeNull();
  });
});
