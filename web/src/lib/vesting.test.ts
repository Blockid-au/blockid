// Colocated vitest for the pure vesting compute engine.
//
// `web/src/lib/vesting.ts` is imported by the workspace vesting client, the
// nightly cron, and the /api/vesting/[id] route — so the wire-level shape of
// the snapshot list and the cliff/percent maths are load-bearing. Pinned rules:
//
//   • timeline emits totalMonths+1 snapshots (month 0 through totalMonths
//     inclusive) so callers can seek by month index
//   • pre-cliff months vest zero shares
//   • the cliff month vests EXACTLY (totalShares/totalMonths)*cliffMonths
//     regardless of vestingType — the type branching only starts post-cliff
//   • linear + milestone are equivalent per-month post-cliff
//   • front_weighted pays 1.5×linear until totalMonths/2, then 0.5×linear
//   • back_weighted pays 0.5×linear until totalMonths/2, then 1.5×linear
//   • cumulative is clamped at totalShares (so back_weighted overshoot stops
//     at the grant total and front_weighted with a cliff underfills — the
//     schedule owner is expected to reconcile via a top-up grant)
//   • isCliff is true iff month === cliffMonths (exactly one snapshot)
//   • sharesVested + cumulativeVested rounded to 2 dp, percentVested to 2 dp
//   • getCurrentVested short-circuits on "accelerated" (100 %) and
//     "terminated" (uses persisted vestedShares) — active/completed hit the
//     timeline
//   • computeSharePrice: baseline valuation 100 000 AUD at SVI 100, +2000/pt
//     above 100, +500/pt below 100 (i.e. negative delta), with a 10 000 floor

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  computeSharePrice,
  computeVestingTimeline,
  getCurrentVested,
  type VestingSchedule,
} from "./vesting";

function schedule(overrides: Partial<VestingSchedule> = {}): VestingSchedule {
  return {
    id: "vs_test",
    shareholderName: "Alice Founder",
    grantDate: "2024-01-15",
    totalShares: 48_000,
    vestedShares: 0,
    vestingType: "linear",
    cliffMonths: 12,
    totalMonths: 48,
    singleTrigger: false,
    doubleTrigger: false,
    status: "active",
    ...overrides,
  };
}

describe("computeVestingTimeline", () => {
  it("emits totalMonths + 1 snapshots (month 0 through totalMonths inclusive)", () => {
    const t = computeVestingTimeline(schedule({ totalMonths: 24, cliffMonths: 6 }));
    expect(t).toHaveLength(25);
    expect(t[0].month).toBe(0);
    expect(t[24].month).toBe(24);
  });

  it("vests zero for every pre-cliff month", () => {
    const t = computeVestingTimeline(schedule());
    for (let m = 0; m < 12; m++) {
      expect(t[m].sharesVested).toBe(0);
      expect(t[m].cumulativeVested).toBe(0);
      expect(t[m].percentVested).toBe(0);
    }
  });

  it("vests exactly (totalShares/totalMonths)*cliffMonths on the cliff month", () => {
    const t = computeVestingTimeline(schedule());
    expect(t[12].sharesVested).toBe(12_000);
    expect(t[12].cumulativeVested).toBe(12_000);
    expect(t[12].percentVested).toBe(25);
  });

  it("sets isCliff true iff month === cliffMonths (exactly one snapshot)", () => {
    const t = computeVestingTimeline(schedule({ cliffMonths: 6, totalMonths: 24 }));
    const cliffFlags = t.filter(s => s.isCliff);
    expect(cliffFlags).toHaveLength(1);
    expect(cliffFlags[0].month).toBe(6);
  });

  it("linear vesting pays totalShares/totalMonths per post-cliff month", () => {
    const t = computeVestingTimeline(schedule({ vestingType: "linear" }));
    expect(t[13].sharesVested).toBe(1000);
    expect(t[24].sharesVested).toBe(1000);
    expect(t[48].sharesVested).toBe(1000);
  });

  it("linear vesting reaches totalShares at the last snapshot", () => {
    const t = computeVestingTimeline(schedule({ vestingType: "linear" }));
    expect(t[48].cumulativeVested).toBe(48_000);
    expect(t[48].percentVested).toBe(100);
  });

  it("milestone vesting behaves identically to linear per-month post-cliff", () => {
    const lin = computeVestingTimeline(schedule({ vestingType: "linear" }));
    const ms = computeVestingTimeline(schedule({ vestingType: "milestone" }));
    for (let i = 0; i < lin.length; i++) {
      expect(ms[i].sharesVested).toBe(lin[i].sharesVested);
      expect(ms[i].cumulativeVested).toBe(lin[i].cumulativeVested);
    }
  });

  it("front_weighted pays 1.5×linear before totalMonths/2 and 0.5×linear after", () => {
    const t = computeVestingTimeline(schedule({ vestingType: "front_weighted" }));
    expect(t[13].sharesVested).toBe(1500);
    expect(t[24].sharesVested).toBe(1500);
    expect(t[25].sharesVested).toBe(500);
    expect(t[48].sharesVested).toBe(500);
  });

  it("back_weighted pays 0.5×linear before totalMonths/2 and 1.5×linear after", () => {
    const t = computeVestingTimeline(schedule({ vestingType: "back_weighted" }));
    expect(t[13].sharesVested).toBe(500);
    expect(t[24].sharesVested).toBe(500);
    expect(t[25].sharesVested).toBe(1500);
    expect(t[48].sharesVested).toBe(1500);
  });

  it("back_weighted cumulative is clamped at totalShares (never overshoots)", () => {
    const t = computeVestingTimeline(schedule({ vestingType: "back_weighted" }));
    expect(t[48].cumulativeVested).toBe(48_000);
    expect(t[48].percentVested).toBe(100);
    for (const s of t) expect(s.cumulativeVested).toBeLessThanOrEqual(48_000);
  });

  it("front_weighted with a cliff under-fills (documented behaviour: reconcile via top-up)", () => {
    // cliff 12 000 + 12 mo × 1500 + 24 mo × 500 = 42 000, no top-up applied.
    const t = computeVestingTimeline(schedule({ vestingType: "front_weighted" }));
    expect(t[48].cumulativeVested).toBe(42_000);
    expect(t[48].percentVested).toBe(87.5);
  });

  it("date strings advance one calendar month per snapshot from grantDate", () => {
    const t = computeVestingTimeline(schedule({ grantDate: "2024-01-15", totalMonths: 3, cliffMonths: 0 }));
    expect(t[0].date).toBe("2024-01-15");
    expect(t[1].date).toBe("2024-02-15");
    expect(t[2].date).toBe("2024-03-15");
    expect(t[3].date).toBe("2024-04-15");
  });

  it("rounds sharesVested and cumulativeVested to 2 decimal places", () => {
    // 1000 shares over 3 months, no cliff → 333.333… per month, rounded to 333.33.
    const t = computeVestingTimeline(schedule({ totalShares: 1000, totalMonths: 3, cliffMonths: 0 }));
    expect(t[1].sharesVested).toBe(333.33);
    expect(t[2].sharesVested).toBe(333.33);
    expect(t[3].sharesVested).toBe(333.33);
    expect(t[3].cumulativeVested).toBeCloseTo(1000, 1);
  });

  it("rounds percentVested to 2 decimal places", () => {
    const t = computeVestingTimeline(schedule({ totalShares: 300, totalMonths: 3, cliffMonths: 0 }));
    // After month 1: 100 / 300 = 33.333…% → 33.33 (10000-scale rounding).
    expect(t[1].percentVested).toBe(33.33);
    expect(t[2].percentVested).toBe(66.67);
    expect(t[3].percentVested).toBe(100);
  });
});

describe("getCurrentVested", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns full total + 100 % immediately when status is 'accelerated' (does not read timeline)", () => {
    vi.setSystemTime(new Date("2024-06-15T00:00:00Z"));
    const s = schedule({ status: "accelerated", totalShares: 20_000, vestedShares: 5_000 });
    const r = getCurrentVested(s);
    expect(r.vested).toBe(20_000);
    expect(r.percent).toBe(100);
    expect(r.monthsElapsed).toBe(5);
  });

  it("returns persisted vestedShares + derived percent when status is 'terminated'", () => {
    vi.setSystemTime(new Date("2025-01-15T00:00:00Z"));
    const s = schedule({ status: "terminated", totalShares: 40_000, vestedShares: 10_000 });
    const r = getCurrentVested(s);
    expect(r.vested).toBe(10_000);
    expect(r.percent).toBe(25);
    expect(r.monthsElapsed).toBe(12);
  });

  it("returns pre-cliff snapshot (zero) for an active grant before the cliff month", () => {
    vi.setSystemTime(new Date("2024-07-15T00:00:00Z")); // 6 months in, cliff at 12
    const r = getCurrentVested(schedule({ status: "active" }));
    expect(r.vested).toBe(0);
    expect(r.percent).toBe(0);
    expect(r.monthsElapsed).toBe(6);
  });

  it("returns the cliff-month snapshot exactly at monthsElapsed === cliffMonths", () => {
    vi.setSystemTime(new Date("2025-01-15T00:00:00Z")); // exactly 12 months
    const r = getCurrentVested(schedule({ status: "active" }));
    expect(r.vested).toBe(12_000);
    expect(r.percent).toBe(25);
    expect(r.monthsElapsed).toBe(12);
  });

  it("falls back to the last snapshot when monthsElapsed exceeds totalMonths", () => {
    vi.setSystemTime(new Date("2030-01-15T00:00:00Z")); // 72 months, past 48
    const r = getCurrentVested(schedule({ status: "active" }));
    expect(r.vested).toBe(48_000);
    expect(r.percent).toBe(100);
    expect(r.monthsElapsed).toBe(72);
  });
});

describe("computeSharePrice", () => {
  it("baseline SVI 100 → valuation 100 000 AUD", () => {
    const r = computeSharePrice(100, 1_000_000);
    expect(r.valuationAud).toBe(100_000);
    expect(r.priceAud).toBe(0.1);
  });

  it("positive SVI delta adds 2000 AUD per point", () => {
    const r = computeSharePrice(150, 1_000_000);
    expect(r.valuationAud).toBe(200_000); // 100000 + 50*2000
    expect(r.priceAud).toBe(0.2);
  });

  it("negative SVI delta subtracts 500 AUD per point (asymmetric)", () => {
    const r = computeSharePrice(50, 1_000_000);
    expect(r.valuationAud).toBe(75_000); // 100000 + (-50)*500
    expect(r.priceAud).toBe(0.075);
  });

  it("clamps valuation to the 10 000 AUD floor for extreme negative SVI", () => {
    const r = computeSharePrice(-200, 1_000_000);
    // 100000 + (-300)*500 = -50000 → floored at 10000.
    expect(r.valuationAud).toBe(10_000);
    expect(r.priceAud).toBe(0.01);
  });

  it("rounds priceAud to 4 decimal places", () => {
    // 100000 / 333333 ≈ 0.30000030000… → rounded to 0.3.
    const r = computeSharePrice(100, 333_333);
    expect(r.priceAud).toBe(0.3);
    expect(r.valuationAud).toBe(100_000);
  });
});
