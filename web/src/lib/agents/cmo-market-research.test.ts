import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AU_MARKET_DATA,
  CONTENT_BENCHMARKS,
  calculateMarketProjection,
  isContentCompetitive,
  calculateAUFundingVelocity,
  calculateSEOUpdateRisk,
} from "./cmo-market-research";

describe("AU_MARKET_DATA constant", () => {
  it("exposes the 7 canonical keys with positive numeric values", () => {
    const keys = [
      "ACTIVE_STARTUPS",
      "TOTAL_VC_FUNDING_H1_2026",
      "UNICORN_COUNT",
      "SEED_MONTHLY_FUNDING_INTENSITY",
      "TOTAL_STARTUP_EMPLOYMENT_FTE",
      "GLOBAL_SAAS_MARKET_SIZE_2024",
      "NAVIGATION_TOOL_CAGR",
    ] as const;
    expect(Object.keys(AU_MARKET_DATA).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      const v = AU_MARKET_DATA[k];
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("pins the 14.7% AU navigation-tool CAGR anchor cited in the module JSDoc", () => {
    expect(AU_MARKET_DATA.NAVIGATION_TOOL_CAGR).toBe(0.147);
  });

  it("pins the 7,800 active-startup + 14-unicorn AU 2026 anchor", () => {
    expect(AU_MARKET_DATA.ACTIVE_STARTUPS).toBe(7800);
    expect(AU_MARKET_DATA.UNICORN_COUNT).toBe(14);
  });
});

describe("CONTENT_BENCHMARKS constant", () => {
  it("exposes the 5 canonical keys with in-range numeric values", () => {
    const keys = [
      "targetB2BBlogLength",
      "aiContentTrafficLift",
      "linkedinOrganicCTR",
      "eeatCTRBoost",
      "coreUpdateRiskDrop",
    ] as const;
    expect(Object.keys(CONTENT_BENCHMARKS).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      const v = CONTENT_BENCHMARKS[k];
      expect(typeof v).toBe("number");
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it("pins the 1,900-word B2B power-page threshold used by isContentCompetitive", () => {
    expect(CONTENT_BENCHMARKS.targetB2BBlogLength).toBe(1900);
  });

  it("keeps ratio-typed benchmarks in the (0,1] band", () => {
    expect(CONTENT_BENCHMARKS.aiContentTrafficLift).toBeLessThanOrEqual(1);
    expect(CONTENT_BENCHMARKS.linkedinOrganicCTR).toBeLessThanOrEqual(1);
    expect(CONTENT_BENCHMARKS.eeatCTRBoost).toBeLessThanOrEqual(1);
    expect(CONTENT_BENCHMARKS.coreUpdateRiskDrop).toBeLessThanOrEqual(1);
  });
});

describe("calculateMarketProjection", () => {
  it("returns currentVal unchanged for a 0-year horizon (compounding identity)", () => {
    expect(calculateMarketProjection(1_000_000, 0)).toBe(1_000_000);
  });

  it("applies the 14.7% CAGR exactly once for a 1-year projection", () => {
    const projected = calculateMarketProjection(1_000_000, 1);
    expect(projected).toBeCloseTo(1_147_000, 6);
  });

  it("compounds the CAGR across multiple years", () => {
    // (1.147)^5 ≈ 1.98492…
    const projected = calculateMarketProjection(100, 5);
    expect(projected).toBeCloseTo(100 * Math.pow(1.147, 5), 10);
    expect(projected).toBeGreaterThan(100 * 1.147);
  });

  it("returns 0 when currentVal is 0 (no capital to grow)", () => {
    expect(calculateMarketProjection(0, 10)).toBe(0);
  });

  it("supports fractional-year horizons via Math.pow", () => {
    const half = calculateMarketProjection(1_000_000, 0.5);
    expect(half).toBeCloseTo(1_000_000 * Math.sqrt(1.147), 6);
    expect(half).toBeGreaterThan(1_000_000);
    expect(half).toBeLessThan(1_147_000);
  });
});

describe("isContentCompetitive", () => {
  it("returns true at the exact 1,900-word threshold when E-E-A-T is present (boundary)", () => {
    expect(isContentCompetitive(1900, true)).toBe(true);
  });

  it("returns false just below the 1,900-word threshold even with E-E-A-T", () => {
    expect(isContentCompetitive(1899, true)).toBe(false);
  });

  it("returns false at threshold without E-E-A-T signals", () => {
    expect(isContentCompetitive(1900, false)).toBe(false);
  });

  it("returns false above threshold when E-E-A-T is absent (both gates required)", () => {
    expect(isContentCompetitive(5000, false)).toBe(false);
  });

  it("returns true well above threshold with E-E-A-T", () => {
    expect(isContentCompetitive(3200, true)).toBe(true);
  });

  it("returns false on a zero-length draft regardless of E-E-A-T", () => {
    expect(isContentCompetitive(0, true)).toBe(false);
    expect(isContentCompetitive(0, false)).toBe(false);
  });
});

describe("calculateAUFundingVelocity", () => {
  it("divides average-per-startup by the AU seed monthly-funding intensity", () => {
    // 10 startups × A$15m each = A$150m; per-startup A$15m vs 150m/mo intensity → 0.1
    const v = calculateAUFundingVelocity(150_000_000, 10);
    expect(v).toBeCloseTo(0.1, 10);
  });

  it("returns 1.0 when the single startup absorbs one month's national intensity", () => {
    expect(
      calculateAUFundingVelocity(AU_MARKET_DATA.SEED_MONTHLY_FUNDING_INTENSITY, 1),
    ).toBeCloseTo(1, 10);
  });

  it("returns Infinity when the cohort is empty (div-by-zero surfaces to caller)", () => {
    expect(calculateAUFundingVelocity(1_000_000, 0)).toBe(Infinity);
  });

  it("returns 0 when nothing has been raised", () => {
    expect(calculateAUFundingVelocity(0, 10)).toBe(0);
  });

  it("scales linearly with totalRaised at fixed cohort size", () => {
    const single = calculateAUFundingVelocity(15_000_000, 10);
    const doubled = calculateAUFundingVelocity(30_000_000, 10);
    expect(doubled).toBeCloseTo(single * 2, 10);
  });
});

describe("calculateSEOUpdateRisk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Freeze "now" so monthsSinceUpdate is deterministic across cases.
    vi.setSystemTime(new Date("2026-07-30T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the raw coreUpdateRiskDrop baseline when E-E-A-T is mid-band and update is fresh", () => {
    // eeat 0.5 skips the >0.8 discount; 1-month-old update skips the >6mo penalty
    const risk = calculateSEOUpdateRisk(0.5, new Date("2026-06-30T00:00:00.000Z"));
    expect(risk).toBeCloseTo(CONTENT_BENCHMARKS.coreUpdateRiskDrop, 10);
  });

  it("drops risk by 0.05 when E-E-A-T > 0.8 on a fresh update", () => {
    const risk = calculateSEOUpdateRisk(0.9, new Date("2026-06-30T00:00:00.000Z"));
    expect(risk).toBeCloseTo(CONTENT_BENCHMARKS.coreUpdateRiskDrop - 0.05, 10);
  });

  it("does NOT drop when E-E-A-T is exactly 0.8 (strict-greater boundary)", () => {
    const risk = calculateSEOUpdateRisk(0.8, new Date("2026-06-30T00:00:00.000Z"));
    expect(risk).toBeCloseTo(CONTENT_BENCHMARKS.coreUpdateRiskDrop, 10);
  });

  it("raises risk by 0.05 when the last update is > 6 months stale", () => {
    // 10 months prior → strictly > 6mo
    const risk = calculateSEOUpdateRisk(0.5, new Date("2025-09-01T00:00:00.000Z"));
    expect(risk).toBeCloseTo(CONTENT_BENCHMARKS.coreUpdateRiskDrop + 0.05, 10);
  });

  it("does NOT raise when the last update is exactly at the 6-month boundary (strict-greater)", () => {
    // Function uses ms / (1000*60*60*24*30) which treats "30 days" as 1 month.
    // Feed exactly 6*30 = 180 days → monthsSinceUpdate === 6, guard is >6 so no penalty.
    const sixMonthsAgo = new Date("2026-07-30T00:00:00.000Z");
    sixMonthsAgo.setUTCDate(sixMonthsAgo.getUTCDate() - 180);
    const risk = calculateSEOUpdateRisk(0.5, sixMonthsAgo);
    expect(risk).toBeCloseTo(CONTENT_BENCHMARKS.coreUpdateRiskDrop, 10);
  });

  it("applies both adjustments when strong E-E-A-T is paired with stale content (cancel-out)", () => {
    const risk = calculateSEOUpdateRisk(0.95, new Date("2025-09-01T00:00:00.000Z"));
    // baseline 0.123 -0.05 (eeat) +0.05 (stale) = 0.123
    expect(risk).toBeCloseTo(CONTENT_BENCHMARKS.coreUpdateRiskDrop, 10);
  });

  it("clamps to 0 as the lower bound (negative-risk floor)", () => {
    // Coerce the baseline so the -0.05 discount alone would drop below zero.
    const originalBaseline = CONTENT_BENCHMARKS.coreUpdateRiskDrop;
    (CONTENT_BENCHMARKS as { coreUpdateRiskDrop: number }).coreUpdateRiskDrop = 0.01;
    try {
      const risk = calculateSEOUpdateRisk(0.9, new Date("2026-06-30T00:00:00.000Z"));
      expect(risk).toBe(0); // 0.01 - 0.05 = -0.04 → clamped to 0
    } finally {
      (CONTENT_BENCHMARKS as { coreUpdateRiskDrop: number }).coreUpdateRiskDrop = originalBaseline;
    }
  });

  it("clamps to 1 as the upper bound (100%-risk ceiling)", () => {
    // Force the baseline high enough that the +0.05 stale penalty would exceed 1.
    const originalBaseline = CONTENT_BENCHMARKS.coreUpdateRiskDrop;
    (CONTENT_BENCHMARKS as { coreUpdateRiskDrop: number }).coreUpdateRiskDrop = 0.98;
    try {
      const risk = calculateSEOUpdateRisk(0.5, new Date("2025-09-01T00:00:00.000Z"));
      expect(risk).toBe(1); // 0.98 + 0.05 = 1.03 → clamped to 1
    } finally {
      (CONTENT_BENCHMARKS as { coreUpdateRiskDrop: number }).coreUpdateRiskDrop = originalBaseline;
    }
  });

  it("stays within [0, 1] across a stress-sweep of eeat × age combinations", () => {
    const ages = [
      new Date("2026-07-29T00:00:00.000Z"), // 1 day
      new Date("2026-01-30T00:00:00.000Z"), // ~6 months
      new Date("2024-07-30T00:00:00.000Z"), // 2 years
    ];
    for (const eeat of [0, 0.5, 0.81, 1]) {
      for (const age of ages) {
        const risk = calculateSEOUpdateRisk(eeat, age);
        expect(risk).toBeGreaterThanOrEqual(0);
        expect(risk).toBeLessThanOrEqual(1);
      }
    }
  });
});
