// G14-S33 — /api/platform-stats counters from the traction snapshot.
import { describe, expect, it } from "vitest";
import { countersFromSnapshot } from "./platform-counters";

const NOW = Date.parse("2026-09-16T12:00:00Z");
const fresh = new Date(NOW - 3600e3).toISOString();
const stale = new Date(NOW - 27 * 3600e3).toISOString();

describe("countersFromSnapshot", () => {
  it("null when there is no snapshot or it is stale", () => {
    expect(countersFromSnapshot(null, NOW)).toBeNull();
    expect(countersFromSnapshot({ generated_at: stale, users: { founders: 9 } }, NOW)).toBeNull();
    expect(countersFromSnapshot({ users: { founders: 9 } }, NOW)).toBeNull();
  });

  it("founders / svi_analyses / Σ paying_by_plan from a fresh snapshot", () => {
    const c = countersFromSnapshot(
      { generated_at: fresh, users: { founders: 9, total: 12 }, analyses: { svi_analyses: 41, analyses: 7 }, evaluators: { paying_by_plan: { investor_angel: 2, investor_vc_small: 1 } } },
      NOW,
    );
    expect(c).toEqual({ founders: 9, analyses: 41, paidCustomers: 3 });
  });

  it("null per figure the snapshot could not measure; empty paying map is 0 paid (a measurement, not a gap)", () => {
    expect(countersFromSnapshot({ generated_at: fresh, users: { founders: null }, analyses: { svi_analyses: null }, evaluators: { paying_by_plan: {} } }, NOW)).toEqual({
      founders: null,
      analyses: null,
      paidCustomers: 0,
    });
    expect(countersFromSnapshot({ generated_at: fresh }, NOW)).toEqual({ founders: null, analyses: null, paidCustomers: null });
    expect(countersFromSnapshot({ generated_at: fresh, users: { founders: -1 }, evaluators: { paying_by_plan: ["x"] } }, NOW)).toEqual({ founders: null, analyses: null, paidCustomers: null });
  });
});
