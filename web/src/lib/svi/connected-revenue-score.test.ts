// S25-A — pins the connected-revenue → TRE contribution table: tier
// boundaries, growth bonus/penalty, churn penalty, freshness decay and the
// clamp-at-zero. Pure, so no mocks.

import { describe, expect, it } from "vitest";
import {
  CHURN_RULES,
  FRESHNESS_FULL_DAYS,
  FRESHNESS_HALF_DAYS,
  MRR_TIERS,
  churnPoints,
  freshnessDecay,
  growthPct,
  growthPoints,
  mrrTier,
  scoreConnectedRevenue,
} from "./connected-revenue-score";

const NOW = new Date("2026-09-12T05:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("MRR tiers (reuse svi-analysis 5/10/15 rungs, extended in +5 steps)", () => {
  it("maps the six bands deterministically at their boundaries", () => {
    expect(mrrTier(0).key).toBe("none");
    expect(mrrTier(-5).key).toBe("none");
    expect(mrrTier(Number.NaN).key).toBe("none");
    expect(mrrTier(1).key).toBe("lt_1k");
    expect(mrrTier(999.99).key).toBe("lt_1k");
    expect(mrrTier(1_000).key).toBe("1k_10k");
    expect(mrrTier(9_999).key).toBe("1k_10k");
    expect(mrrTier(10_000).key).toBe("10k_50k");
    expect(mrrTier(49_999).key).toBe("10k_50k");
    expect(mrrTier(50_000).key).toBe("50k_200k");
    expect(mrrTier(199_999).key).toBe("50k_200k");
    expect(mrrTier(200_000).key).toBe("gt_200k");
    expect(mrrTier(5_000_000).key).toBe("gt_200k");
  });

  it("points are monotonic 0/5/10/15/20/25 — the first three match computeMetricsBonus()", () => {
    expect(MRR_TIERS.map((t) => t.points)).toEqual([0, 5, 10, 15, 20, 25]);
  });
});

describe("growth vs the 90-day-old snapshot", () => {
  it("percent change is rounded to one decimal; no prior → null → 0 points", () => {
    expect(growthPct(1_100, 1_000)).toBe(10);
    expect(growthPct(1_234, 1_000)).toBe(23.4);
    expect(growthPct(1_000, null)).toBeNull();
    expect(growthPct(1_000, 0)).toBeNull();
    expect(growthPoints(null)).toBe(0);
  });

  it("bonus / penalty rungs", () => {
    expect(growthPoints(30)).toBe(5);
    expect(growthPoints(80)).toBe(5);
    expect(growthPoints(10)).toBe(3);
    expect(growthPoints(29.9)).toBe(3);
    expect(growthPoints(0)).toBe(0);
    expect(growthPoints(-9.9)).toBe(0);
    expect(growthPoints(-10)).toBe(0);
    expect(growthPoints(-10.1)).toBe(-2);
    expect(growthPoints(-25)).toBe(-2);
    expect(growthPoints(-25.1)).toBe(-5);
    expect(growthPoints(-100)).toBe(-5);
  });
});

describe("churn penalty (Stripe 90-day subscription churn)", () => {
  it("unknown churn is neutral; rungs at 3 / 5 / 10 %", () => {
    expect(churnPoints(null)).toBe(0);
    expect(churnPoints(undefined)).toBe(0);
    expect(churnPoints(0)).toBe(0);
    expect(churnPoints(2.9)).toBe(0);
    expect(churnPoints(3)).toBe(-2);
    expect(churnPoints(4.9)).toBe(-2);
    expect(churnPoints(5)).toBe(-4);
    expect(churnPoints(9.9)).toBe(-4);
    expect(churnPoints(10)).toBe(-6);
    expect(churnPoints(50)).toBe(-6);
    expect(CHURN_RULES[CHURN_RULES.length - 1].points).toBe(-6);
  });
});

describe("freshness decay", () => {
  it("full weight to 90 d, half to 180 d, zero after; unparsable → 0", () => {
    expect(freshnessDecay(daysAgo(0), NOW)).toEqual({ decay: 1, ageDays: 0 });
    expect(freshnessDecay(daysAgo(FRESHNESS_FULL_DAYS), NOW)).toEqual({ decay: 1, ageDays: 90 });
    expect(freshnessDecay(daysAgo(91), NOW)).toEqual({ decay: 0.5, ageDays: 91 });
    expect(freshnessDecay(daysAgo(FRESHNESS_HALF_DAYS), NOW)).toEqual({ decay: 0.5, ageDays: 180 });
    expect(freshnessDecay(daysAgo(181), NOW)).toEqual({ decay: 0, ageDays: 181 });
    expect(freshnessDecay("not a date", NOW)).toEqual({ decay: 0, ageDays: null });
    // A future timestamp (clock skew) is treated as today, never negative.
    expect(freshnessDecay(daysAgo(-2), NOW).ageDays).toBe(0);
  });
});

describe("scoreConnectedRevenue — composed", () => {
  it("A$8.2k fresh MRR, +12 % growth, 2.1 % churn → 10 + 3 + 0 = 13", () => {
    const s = scoreConnectedRevenue({ mrrAud: 8_200, capturedAt: daysAgo(3), priorMrrAud: 7_321, churnRate90dPct: 2.1, now: NOW });
    expect(s.points).toBe(13);
    expect(s.tier).toBe("1k_10k");
    expect(s.growthPct).toBe(12);
    expect(s.breakdown).toContain("A$8.2k MRR (A$1k–10k MRR: +10)");
    expect(s.breakdown).toContain("+12% growth (+3)");
    expect(s.breakdown).toContain("2.1% churn (0)");
    expect(s.breakdown).toMatch(/→ \+13 TRE$/);
  });

  it("same MRR with no baseline and unknown churn → the tier alone (magnitude replaces the flat +15)", () => {
    expect(scoreConnectedRevenue({ mrrAud: 40, capturedAt: daysAgo(1), now: NOW }).points).toBe(5);
    expect(scoreConnectedRevenue({ mrrAud: 400_000, capturedAt: daysAgo(1), now: NOW }).points).toBe(25);
  });

  it("decay halves at 91–180 d and zeroes after 180 d", () => {
    expect(scoreConnectedRevenue({ mrrAud: 20_000, capturedAt: daysAgo(120), now: NOW }).points).toBe(8); // 15 × 0.5 = 7.5 → 8
    expect(scoreConnectedRevenue({ mrrAud: 20_000, capturedAt: daysAgo(200), now: NOW }).points).toBe(0);
    expect(scoreConnectedRevenue({ mrrAud: 20_000, capturedAt: "garbage", now: NOW }).points).toBe(0);
  });

  it("penalties can drag a small tier to zero but never below (connecting is never worse than not connecting)", () => {
    const s = scoreConnectedRevenue({ mrrAud: 500, capturedAt: daysAgo(2), priorMrrAud: 1_000, churnRate90dPct: 15, now: NOW });
    expect(s.tierPoints).toBe(5);
    expect(s.growthPoints).toBe(-5);
    expect(s.churnPoints).toBe(-6);
    expect(s.points).toBe(0);
  });

  it("zero MRR is zero regardless of the other inputs", () => {
    expect(scoreConnectedRevenue({ mrrAud: 0, capturedAt: daysAgo(0), priorMrrAud: 100, now: NOW }).points).toBe(0);
  });

  it("is deterministic for the same inputs", () => {
    const a = scoreConnectedRevenue({ mrrAud: 60_000, capturedAt: daysAgo(10), priorMrrAud: 40_000, churnRate90dPct: 4, now: NOW });
    const b = scoreConnectedRevenue({ mrrAud: 60_000, capturedAt: daysAgo(10), priorMrrAud: 40_000, churnRate90dPct: 4, now: NOW });
    expect(a).toEqual(b);
    expect(a.points).toBe(20 + 5 - 2);
  });
});
