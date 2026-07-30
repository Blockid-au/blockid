/**
 * Colocated vitest for the pure equity engine at ./engine.ts.
 *
 * P0-equity-engine-lib-test — pins the 5-function AU equity + ESOP kernel
 * (calculateVestingSchedule / calculateCapTable / calculateDilution /
 * calculateESOP / generateVestingTimeline) so a silent drift in the cliff
 * arithmetic, the rounding-remainder absorption on the final tranche, the
 * dilution price-per-share rounding (round4), the ESOP unallocated clamp, or
 * the Div 83A tax-note branch cannot leak into a founder-facing cap-table,
 * grant letter, or round dilution number without a red CI dot.
 */

import { describe, expect, it } from "vitest";

import {
  calculateCapTable,
  calculateDilution,
  calculateESOP,
  calculateVestingSchedule,
  generateVestingTimeline,
  type EquityMember,
  type EquityPlan,
  type ESOPPool,
  type RoundInput,
  type VestingInput,
} from "./engine";

const MONTHLY_4Y_CLIFF: VestingInput = {
  totalShares: 48_000,
  cliffMonths: 12,
  vestMonths: 48,
  scheduleType: "monthly",
  startDate: "2024-01-01",
};

describe("calculateVestingSchedule", () => {
  it("returns [] when totalShares is 0", () => {
    expect(calculateVestingSchedule({ ...MONTHLY_4Y_CLIFF, totalShares: 0 })).toEqual([]);
  });

  it("returns [] when totalShares is negative", () => {
    expect(calculateVestingSchedule({ ...MONTHLY_4Y_CLIFF, totalShares: -5 })).toEqual([]);
  });

  it("returns [] when vestMonths <= 0", () => {
    expect(calculateVestingSchedule({ ...MONTHLY_4Y_CLIFF, vestMonths: 0 })).toEqual([]);
  });

  it("returns [] when cliffMonths is negative", () => {
    expect(calculateVestingSchedule({ ...MONTHLY_4Y_CLIFF, cliffMonths: -1 })).toEqual([]);
  });

  it("throws when cliffMonths exceeds vestMonths", () => {
    expect(() =>
      calculateVestingSchedule({ ...MONTHLY_4Y_CLIFF, cliffMonths: 60, vestMonths: 48 }),
    ).toThrow(/cliffMonths cannot exceed vestMonths/);
  });

  it("monthly 4y/1y cliff emits 37 events (12-cliff + 36 monthly)", () => {
    const events = calculateVestingSchedule(MONTHLY_4Y_CLIFF);
    // periods 12..48 inclusive = 37 events
    expect(events.length).toBe(37);
  });

  it("monthly 4y/1y cliff releases exactly 12*perPeriod = 12,000 on the cliff", () => {
    const events = calculateVestingSchedule(MONTHLY_4Y_CLIFF);
    const cliff = events.find((e) => e.isCliff);
    expect(cliff).toBeDefined();
    expect(cliff!.sharesVested).toBe(12_000);
    expect(cliff!.cumulativeVested).toBe(12_000);
  });

  it("monthly 4y/1y cliff final cumulative equals totalShares (no rounding leak)", () => {
    const events = calculateVestingSchedule(MONTHLY_4Y_CLIFF);
    const last = events[events.length - 1];
    expect(last.cumulativeVested).toBe(48_000);
  });

  it("monthly cliff event dated 12 months after start", () => {
    const events = calculateVestingSchedule(MONTHLY_4Y_CLIFF);
    const cliff = events.find((e) => e.isCliff)!;
    expect(cliff.eventDate).toBe("2025-01-01");
  });

  it("final tranche absorbs rounding remainder to reconcile totalShares", () => {
    // 100 shares over 3 monthly periods; floor(100/3)=33 → cliff-less path
    const events = calculateVestingSchedule({
      totalShares: 100,
      cliffMonths: 0,
      vestMonths: 3,
      scheduleType: "monthly",
      startDate: "2024-01-01",
    });
    expect(events.map((e) => e.sharesVested)).toEqual([33, 33, 34]);
    expect(events[events.length - 1].cumulativeVested).toBe(100);
  });

  it("no cliff (cliffMonths=0) never flags isCliff", () => {
    const events = calculateVestingSchedule({
      totalShares: 48,
      cliffMonths: 0,
      vestMonths: 48,
      scheduleType: "monthly",
      startDate: "2024-01-01",
    });
    expect(events.every((e) => e.isCliff === false)).toBe(true);
    expect(events.length).toBe(48);
  });

  it("returns [] when vestMonths < periodMonths (totalPeriods=0)", () => {
    const events = calculateVestingSchedule({
      totalShares: 1000,
      cliffMonths: 0,
      vestMonths: 2,
      scheduleType: "quarterly",
      startDate: "2024-01-01",
    });
    expect(events).toEqual([]);
  });

  it("quarterly 4y/1y cliff yields 16 periods total", () => {
    const events = calculateVestingSchedule({
      totalShares: 16_000,
      cliffMonths: 12,
      vestMonths: 48,
      scheduleType: "quarterly",
      startDate: "2024-01-01",
    });
    // cliffPeriods=4; suppressed periods 1..3; emitted periods 4..16 = 13 events
    expect(events.length).toBe(13);
    const cliff = events.find((e) => e.isCliff)!;
    expect(cliff.sharesVested).toBe(4_000); // 4 * (16000/16)
    expect(events[events.length - 1].cumulativeVested).toBe(16_000);
  });

  it("annual cadence emits 4 periods for 4y vest", () => {
    const events = calculateVestingSchedule({
      totalShares: 4_000,
      cliffMonths: 0,
      vestMonths: 48,
      scheduleType: "annual",
      startDate: "2024-01-01",
    });
    expect(events.length).toBe(4);
    expect(events[0].eventDate).toBe("2025-01-01");
    expect(events[3].eventDate).toBe("2028-01-01");
  });

  it("month clamping: Jan 31 start + 1 month → Feb 28/29 (non-overflow)", () => {
    const events = calculateVestingSchedule({
      totalShares: 12,
      cliffMonths: 0,
      vestMonths: 12,
      scheduleType: "monthly",
      startDate: "2024-01-31",
    });
    // Feb 2024 is leap year → Feb 29
    expect(events[0].eventDate).toBe("2024-02-29");
  });

  it("milestone schedule filters out entries without achievedAt", () => {
    const events = calculateVestingSchedule({
      totalShares: 1000,
      cliffMonths: 0,
      vestMonths: 12,
      scheduleType: "milestone",
      startDate: "2024-01-01",
      milestones: [
        { description: "MVP", shares: 500, achievedAt: "2024-03-15" },
        { description: "Series A", shares: 500 }, // no achievedAt → skipped
      ],
    });
    expect(events.length).toBe(1);
    expect(events[0].sharesVested).toBe(500);
  });

  it("milestone schedule sorts by achievedAt ascending, cumulative accumulates", () => {
    const events = calculateVestingSchedule({
      totalShares: 3000,
      cliffMonths: 0,
      vestMonths: 24,
      scheduleType: "milestone",
      startDate: "2024-01-01",
      milestones: [
        { description: "C", shares: 300, achievedAt: "2024-06-01" },
        { description: "A", shares: 100, achievedAt: "2024-02-01" },
        { description: "B", shares: 200, achievedAt: "2024-04-01" },
      ],
    });
    expect(events.map((e) => e.eventDate)).toEqual([
      "2024-02-01",
      "2024-04-01",
      "2024-06-01",
    ]);
    expect(events.map((e) => e.cumulativeVested)).toEqual([100, 300, 600]);
    expect(events.every((e) => e.isCliff === false)).toBe(true);
  });

  it("milestone schedule with no milestones returns []", () => {
    const events = calculateVestingSchedule({
      totalShares: 1000,
      cliffMonths: 0,
      vestMonths: 12,
      scheduleType: "milestone",
      startDate: "2024-01-01",
    });
    expect(events).toEqual([]);
  });
});

describe("calculateCapTable", () => {
  const plan: EquityPlan = { totalShares: 1_000_000, preMoneyValuation: 5_000_000 };

  const alice: EquityMember = {
    name: "Alice",
    role: "founder",
    sharesIssued: 500_000,
    optionsGranted: 0,
  };
  const bob: EquityMember = {
    name: "Bob",
    role: "cofounder",
    sharesIssued: 300_000,
    optionsGranted: 100_000,
  };

  it("computes ownershipPct against plan.totalShares", () => {
    const rows = calculateCapTable(plan, [alice, bob]);
    expect(rows[0].ownershipPct).toBe(50);
    expect(rows[1].ownershipPct).toBe(30);
  });

  it("computes fullyDilutedPct against sum(shares + options)", () => {
    const rows = calculateCapTable(plan, [alice, bob]);
    // FD total = 500k + 300k + 100k = 900k
    expect(rows[0].fullyDilutedPct).toBeCloseTo((500_000 / 900_000) * 100, 2);
    expect(rows[1].fullyDilutedPct).toBeCloseTo((400_000 / 900_000) * 100, 2);
  });

  it("computes valueAud from preMoneyValuation / totalShares", () => {
    const rows = calculateCapTable(plan, [alice]);
    // pricePerShare = 5_000_000 / 1_000_000 = 5 AUD → 500_000 * 5 = 2.5M
    expect(rows[0].valueAud).toBe(2_500_000);
  });

  it("valueAud = 0 when preMoneyValuation is null/absent", () => {
    const rows = calculateCapTable({ totalShares: 1_000_000 }, [alice]);
    expect(rows[0].valueAud).toBe(0);
  });

  it("defaults shareClass to 'Ordinary' when missing", () => {
    const rows = calculateCapTable(plan, [alice]);
    expect(rows[0].shareClass).toBe("Ordinary");
  });

  it("preserves explicit shareClass", () => {
    const rows = calculateCapTable(plan, [{ ...alice, shareClass: "Preferred" }]);
    expect(rows[0].shareClass).toBe("Preferred");
  });

  it("empty members returns []", () => {
    expect(calculateCapTable(plan, [])).toEqual([]);
  });

  it("clamps plan.totalShares to 1 when zero (no divide-by-zero)", () => {
    const rows = calculateCapTable({ totalShares: 0, preMoneyValuation: null }, [alice]);
    // ownershipPct = 500_000 / 1 * 100 = 50_000_000 (indicative; test guards against NaN)
    expect(Number.isFinite(rows[0].ownershipPct)).toBe(true);
  });

  it("falls back to plan.totalShares when fullyDilutedTotal computes to 0", () => {
    const zeroMember: EquityMember = {
      name: "Placeholder",
      role: "advisor",
      sharesIssued: 0,
      optionsGranted: 0,
    };
    const rows = calculateCapTable(plan, [zeroMember]);
    expect(rows[0].fullyDilutedPct).toBe(0);
    expect(Number.isFinite(rows[0].fullyDilutedPct)).toBe(true);
  });
});

describe("calculateDilution", () => {
  const plan: EquityPlan = { totalShares: 1_000_000 };
  const round: RoundInput = {
    raiseAmountAud: 1_000_000,
    preMoneyValuationAud: 4_000_000,
  };

  it("computes postMoney = pre + raise", () => {
    const result = calculateDilution(plan, round);
    expect(result.postMoneyValuationAud).toBe(5_000_000);
  });

  it("computes pricePerShare = pre / totalShares, rounded to 4dp", () => {
    const result = calculateDilution(plan, round);
    expect(result.pricePerShareAud).toBe(4);
  });

  it("investorOwnershipPct = newShares / newTotal * 100", () => {
    const result = calculateDilution(plan, round);
    // newShares = 1M/4 = 250_000; newTotal = 1_250_000; pct = 20
    expect(result.newSharesIssued).toBe(250_000);
    expect(result.investorOwnershipPct).toBe(20);
    expect(result.existingOwnershipPct).toBe(80);
  });

  it("no top-up when optionPoolTopUpPct is unspecified", () => {
    const result = calculateDilution(plan, round);
    expect(result.optionPoolTopUpShares).toBe(0);
  });

  it("optionPoolTopUpPct=10 issues > 0 top-up shares", () => {
    const result = calculateDilution(plan, { ...round, optionPoolTopUpPct: 10 });
    expect(result.optionPoolTopUpShares).toBeGreaterThan(0);
    // pool = 10% of newTotal
    const poolPct = result.optionPoolTopUpShares / result.newTotalShares;
    expect(poolPct).toBeCloseTo(0.1, 2);
  });

  it("throws when preMoneyValuation is zero (pricePerShare <= 0)", () => {
    expect(() =>
      calculateDilution({ totalShares: 1_000_000 }, { ...round, preMoneyValuationAud: 0 }),
    ).toThrow(/preMoneyValuationAud and totalShares must be positive/);
  });

  it("pricePerShare uses 4dp rounding (0.6667 not 0.67)", () => {
    // pre=2, totalShares=3 → 0.6666... → round4 = 0.6667
    const result = calculateDilution(
      { totalShares: 3 },
      { raiseAmountAud: 1, preMoneyValuationAud: 2 },
    );
    expect(result.pricePerShareAud).toBe(0.6667);
  });
});

describe("calculateESOP", () => {
  const pool: ESOPPool = {
    poolSizeShares: 100_000,
    schemeType: "ESS",
    auTaxConcession: true,
  };

  it("computes poolSizePct against totalShares", () => {
    const summary = calculateESOP(pool, 1_000_000, 20_000);
    expect(summary.poolSizePct).toBe(10);
  });

  it("unallocatedShares = pool - allocated", () => {
    const summary = calculateESOP(pool, 1_000_000, 20_000);
    expect(summary.unallocatedShares).toBe(80_000);
    expect(summary.unallocatedPct).toBe(80);
  });

  it("clamps unallocatedShares at 0 when allocated exceeds pool", () => {
    const summary = calculateESOP(pool, 1_000_000, 200_000);
    expect(summary.unallocatedShares).toBe(0);
    expect(summary.unallocatedPct).toBe(0);
  });

  it("poolSizePct = 0 when totalShares is 0", () => {
    const summary = calculateESOP(pool, 0, 0);
    expect(summary.poolSizePct).toBe(0);
  });

  it("unallocatedPct = 0 when poolSizeShares is 0 (no divide-by-zero)", () => {
    const summary = calculateESOP(
      { poolSizeShares: 0, schemeType: "ESOP", auTaxConcession: false },
      1_000_000,
      0,
    );
    expect(summary.unallocatedPct).toBe(0);
    expect(Number.isFinite(summary.unallocatedPct)).toBe(true);
  });

  it("auTaxNote cites Division 83A startup concession when eligible", () => {
    const summary = calculateESOP(pool, 1_000_000, 0);
    expect(summary.auTaxNote).toMatch(/Division 83A/);
    expect(summary.auTaxNote).toMatch(/startup ESS tax concession/);
  });

  it("auTaxNote cites standard Div 83A treatment when NOT eligible", () => {
    const summary = calculateESOP(
      { ...pool, auTaxConcession: false },
      1_000_000,
      0,
    );
    expect(summary.auTaxNote).toMatch(/Standard Division 83A/);
  });

  it("schemeType round-trips through the summary", () => {
    const summary = calculateESOP({ ...pool, schemeType: "phantom" }, 1_000_000, 0);
    expect(summary.schemeType).toBe("phantom");
  });
});

describe("generateVestingTimeline", () => {
  it("projects date + cumulativeVested + isCliff from vesting events", () => {
    const events = calculateVestingSchedule(MONTHLY_4Y_CLIFF);
    const timeline = generateVestingTimeline(events);
    expect(timeline.length).toBe(events.length);
    expect(timeline[0]).toEqual({
      date: events[0].eventDate,
      cumulativeVested: events[0].cumulativeVested,
      isCliff: events[0].isCliff,
    });
  });

  it("empty events → empty timeline", () => {
    expect(generateVestingTimeline([])).toEqual([]);
  });
});
