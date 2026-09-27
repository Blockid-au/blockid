import { describe, it, expect } from "vitest";
import {
  VALUATION_BASELINES_AUD,
  computeValuation,
  crossCheckStatedCap,
  formatAUD,
  type ValuationInput,
} from "./valuation";

// Baseline dimensions at the neutral midpoint so blends land near the
// scorecard baseline for the given stage.
const NEUTRAL_DIMS = {
  ftv: 50,
  mpc: 50,
  ptd: 50,
  tre: 50,
  cgh: 50,
  iri: 50,
  lco: 50,
  svm: 50,
} as const;

const STRONG_DIMS = {
  ftv: 90,
  mpc: 90,
  ptd: 90,
  tre: 90,
  cgh: 90,
  iri: 90,
  lco: 90,
  svm: 90,
} as const;

// ─── formatAUD ──────────────────────────────────────────────────────────────

describe("formatAUD", () => {
  it("returns raw dollars for values below A$1,000", () => {
    expect(formatAUD(0)).toBe("A$0");
    expect(formatAUD(999)).toBe("A$999");
  });

  it("uses thousands (K) formatting from A$1,000 up to A$999,999", () => {
    expect(formatAUD(1_000)).toBe("A$1K");
    expect(formatAUD(12_345)).toBe("A$12K");
    expect(formatAUD(999_499)).toBe("A$999K");
  });

  it("uses millions (M) formatting once value crosses A$1,000,000", () => {
    expect(formatAUD(1_000_000)).toBe("A$1.0M");
    expect(formatAUD(1_500_000)).toBe("A$1.5M");
    expect(formatAUD(12_345_678)).toBe("A$12.3M");
  });

  it("keeps one decimal for large millions", () => {
    expect(formatAUD(250_000_000)).toBe("A$250.0M");
  });
});

// ─── Stage baselines + stated-cap cross-check (2026-09-15) ────────────────
//
// V04a (D22, 2026-09-27): `estimateValuation` — the SVI/dimension-driven
// quick estimate — was removed with its suites (shape, dimension handling,
// revenue multiple, sector multiples, blend labels, confidence, band width,
// Berkus cap, ARR clamp, the 2026-09-15 live-input pin). Those pinned an
// SVI→dollar path the founder retired; no surface prices off the SVI now.
// What stays is shared with the CFO valuation chapter: the dated stage
// baselines and the founder-stated cap cross-check.

describe("AU stage baselines + stated-cap cross-check", () => {
  it("pins the stage baselines to the CTV 2024/25 medians", () => {
    expect(VALUATION_BASELINES_AUD[2]).toEqual({ low: 3_000_000, mid: 5_000_000, high: 8_000_000 }); // pre-seed
    expect(VALUATION_BASELINES_AUD[3]).toEqual({ low: 6_000_000, mid: 10_000_000, high: 15_000_000 }); // seed
    expect(VALUATION_BASELINES_AUD[4]).toEqual({ low: 15_000_000, mid: 30_000_000, high: 45_000_000 }); // Series A
    // Growth / Scale / Corporation unchanged.
    expect(VALUATION_BASELINES_AUD[5].mid).toBe(100_000_000);
    expect(VALUATION_BASELINES_AUD[6].mid).toBe(250_000_000);
    expect(VALUATION_BASELINES_AUD[7].mid).toBe(750_000_000);
    for (let s = 1; s <= 7; s++) {
      expect(VALUATION_BASELINES_AUD[s].mid).toBeGreaterThan(VALUATION_BASELINES_AUD[s - 1].mid);
    }
  });

  it("flags the cross-check only outside 0.5×–2× of the founder's number", () => {
    const est = { low: 4_000_000, mid: 6_000_000, high: 9_000_000 };
    expect(crossCheckStatedCap(est, 6_000_000)?.verdict).toBe("consistent");
    expect(crossCheckStatedCap(est, 3_000_000)?.verdict).toBe("consistent"); // ratio 2.0 is still consistent
    expect(crossCheckStatedCap(est, 2_500_000)?.verdict).toBe("indicative_above");
    expect(crossCheckStatedCap(est, 12_000_000)?.verdict).toBe("consistent"); // ratio 0.5
    expect(crossCheckStatedCap(est, 15_000_000)?.verdict).toBe("indicative_below");
    expect(crossCheckStatedCap(est, 15_000_000, "pre_money")?.note).toMatch(/stated pre-money A\$15\.0M/);
    expect(crossCheckStatedCap(est, 0)).toBeUndefined();
  });
});

// ─── computeValuation — shape + baseline ────────────────────────────────────

describe("computeValuation shape", () => {
  const stages: Array<ValuationInput["stage"]> = ["idea", "validation", "mvp", "growth"];

  it.each(stages)("returns a plausible range at the %s stage", (stage) => {
    const result = computeValuation({
      sviScore: 100,
      stage,
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.lowAud).toBeGreaterThan(0);
    expect(result.midAud).toBeGreaterThanOrEqual(result.lowAud);
    expect(result.highAud).toBeGreaterThanOrEqual(result.midAud);
    expect(result.breakdown.berkus.value).toBeGreaterThanOrEqual(0);
    expect(result.breakdown.scorecard.value).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it("uses the pre-revenue blend label when no MRR is supplied", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.method).toContain("berkus 50%");
    expect(result.method).toContain("scorecard 50%");
    expect(result.breakdown.revenueMultiple).toBeUndefined();
  });

  it("uses the revenue blend label when MRR is present", () => {
    const result = computeValuation({
      sviScore: 130,
      stage: "growth",
      mrrAud: 40_000,
      dimensions: { ...STRONG_DIMS },
    });
    expect(result.method).toContain("revenue multiple 50%");
    expect(result.breakdown.revenueMultiple).toBeDefined();
    expect(result.breakdown.revenueMultiple?.multiple).toBeGreaterThan(0);
  });
});

// ─── computeValuation — Berkus math ─────────────────────────────────────────

describe("computeValuation berkus factors", () => {
  it("exposes the five Berkus pillars by name", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ...NEUTRAL_DIMS },
    });
    const keys = Object.keys(result.breakdown.berkus.factors);
    expect(keys).toContain("Sound idea (MPC)");
    expect(keys).toContain("Prototype (PTD)");
    expect(keys).toContain("Quality team (FTV)");
    expect(keys).toContain("Strategic relationships (IRI+SVM)");
    expect(keys).toContain("Product rollout (TRE)");
  });

  it("caps each Berkus factor at A$750K when a dimension is 100", () => {
    const result = computeValuation({
      sviScore: 200,
      stage: "validation",
      dimensions: {
        ftv: 100,
        mpc: 100,
        ptd: 100,
        tre: 100,
        cgh: 100,
        iri: 100,
        lco: 100,
        svm: 100,
      },
    });
    for (const value of Object.values(result.breakdown.berkus.factors)) {
      expect(value).toBeLessThanOrEqual(750_000);
    }
    expect(result.breakdown.berkus.value).toBe(750_000 * 5);
  });

  it("Berkus value is zero when every dimension score is zero", () => {
    const result = computeValuation({
      sviScore: 0,
      stage: "idea",
      dimensions: { ftv: 0, mpc: 0, ptd: 0, tre: 0, cgh: 0, iri: 0, lco: 0, svm: 0 },
    });
    expect(result.breakdown.berkus.value).toBe(0);
  });
});

// ─── computeValuation — Scorecard math ──────────────────────────────────────

describe("computeValuation scorecard adjustments", () => {
  it("exposes the five scorecard adjustments by name", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ...NEUTRAL_DIMS },
    });
    const keys = Object.keys(result.breakdown.scorecard.adjustments);
    expect(keys).toEqual([
      "Team (FTV)",
      "Market (MPC)",
      "Product (PTD)",
      "Competition (SVM)",
      "Traction (TRE)",
    ]);
  });

  it("neutral dims (50) produce roughly zero net adjustments and equal the stage baseline", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ...NEUTRAL_DIMS },
    });
    const totalAdj = Object.values(result.breakdown.scorecard.adjustments).reduce(
      (sum, v) => sum + v,
      0,
    );
    expect(Math.abs(totalAdj)).toBeLessThan(1e-9);
    expect(result.breakdown.scorecard.value).toBe(750_000);
  });

  it("strong dims push the scorecard value above the stage baseline", () => {
    const result = computeValuation({
      sviScore: 180,
      stage: "validation",
      dimensions: { ...STRONG_DIMS },
    });
    expect(result.breakdown.scorecard.value).toBeGreaterThan(750_000);
  });

  it("weak dims are floored at 10% of the stage baseline", () => {
    const result = computeValuation({
      sviScore: 20,
      stage: "validation",
      dimensions: { ftv: 0, mpc: 0, ptd: 0, tre: 0, cgh: 0, iri: 0, lco: 0, svm: 0 },
    });
    expect(result.breakdown.scorecard.value).toBeGreaterThanOrEqual(75_000);
  });

  it("unknown stage falls back to the idea baseline (A$300K)", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "planet-scale",
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.breakdown.scorecard.value).toBe(300_000);
  });
});

// ─── computeValuation — Revenue multiple ────────────────────────────────────

describe("computeValuation revenue multiple", () => {
  it("skips the revenue block when mrrAud is zero or missing", () => {
    const missing = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ...NEUTRAL_DIMS },
    });
    const zero = computeValuation({
      sviScore: 100,
      stage: "validation",
      mrrAud: 0,
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(missing.breakdown.revenueMultiple).toBeUndefined();
    expect(zero.breakdown.revenueMultiple).toBeUndefined();
  });

  it("assigns a low multiple range for MRR under A$10K", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 5_000,
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.breakdown.revenueMultiple?.multiple).toBeGreaterThanOrEqual(3);
    // Base midpoint of 3–5 band is 4, and no growth premium given here.
    expect(result.breakdown.revenueMultiple?.multiple).toBeLessThanOrEqual(10);
  });

  it("assigns the mid-tier band for MRR between A$10K and A$50K", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 25_000,
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.breakdown.revenueMultiple?.multiple).toBeGreaterThanOrEqual(5);
    expect(result.breakdown.revenueMultiple?.multiple).toBeLessThanOrEqual(15);
  });

  it("assigns the high-tier band for MRR above A$50K", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 200_000,
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.breakdown.revenueMultiple?.multiple).toBeGreaterThanOrEqual(10);
  });

  it("adds a growth premium of +1x per 20% MoM growth", () => {
    const flat = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 25_000,
      dimensions: { ...NEUTRAL_DIMS },
    });
    const growing = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 25_000,
      revenueGrowthPct: 60, // +3x premium
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(growing.breakdown.revenueMultiple!.multiple).toBeGreaterThan(
      flat.breakdown.revenueMultiple!.multiple,
    );
  });

  it("caps the multiple at highMult + 5 even for very high growth", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 200_000,
      revenueGrowthPct: 500,
      dimensions: { ...NEUTRAL_DIMS },
    });
    // High band top is 20, +5 cap → 25.
    expect(result.breakdown.revenueMultiple!.multiple).toBeLessThanOrEqual(25);
  });

  it("uses ARR * multiple to derive revenue value", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 5_000,
      arrAud: 60_000,
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.breakdown.revenueMultiple!.value).toBe(
      60_000 * result.breakdown.revenueMultiple!.multiple,
    );
  });
});

// ─── computeValuation — confidence & range width ────────────────────────────

describe("computeValuation confidence & range", () => {
  it("baseline confidence with no extras is 20", () => {
    const result = computeValuation({ sviScore: 100, stage: "validation" });
    expect(result.confidence).toBe(20);
  });

  it("each dimension present adds 5 to confidence", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ftv: 60, mpc: 60, ptd: 60, tre: 60 },
    });
    // 20 base + 4 * 5 = 40
    expect(result.confidence).toBe(40);
  });

  it("revenue presence adds 20 to confidence", () => {
    const withRev = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 30_000,
      dimensions: { ...NEUTRAL_DIMS },
    });
    const withoutRev = computeValuation({
      sviScore: 100,
      stage: "growth",
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(withRev.confidence - withoutRev.confidence).toBeGreaterThanOrEqual(20);
  });

  it("each extra metric (growth, churn, burn, runway) adds 5 to confidence", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 30_000,
      revenueGrowthPct: 10,
      monthlyChurnPct: 2,
      burnRateAud: 40_000,
      runwayMonths: 12,
      dimensions: { ...NEUTRAL_DIMS },
    });
    // 20 base + 8*5 (dims) + 20 (revenue) + 4*5 (extras) = 100 clamped to 100
    expect(result.confidence).toBe(100);
  });

  it("uses a narrower ±20% band when revenue is present", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "growth",
      mrrAud: 30_000,
      dimensions: { ...NEUTRAL_DIMS },
    });
    const spreadLow = (result.midAud - result.lowAud) / result.midAud;
    const spreadHigh = (result.highAud - result.midAud) / result.midAud;
    expect(spreadLow).toBeCloseTo(0.2, 2);
    expect(spreadHigh).toBeCloseTo(0.2, 2);
  });

  it("uses a wider ±30% band when there is no revenue", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ...NEUTRAL_DIMS },
    });
    const spreadLow = (result.midAud - result.lowAud) / result.midAud;
    const spreadHigh = (result.highAud - result.midAud) / result.midAud;
    expect(spreadLow).toBeCloseTo(0.3, 2);
    expect(spreadHigh).toBeCloseTo(0.3, 2);
  });
});

// ─── computeValuation — dimension fallback path ─────────────────────────────

describe("computeValuation dimension fallback", () => {
  it("derives dimension scores from SVI when the dimensions object is omitted", () => {
    // With SVI 200, fallback dim = clamp((200/200)*100, 0, 100) = 100.
    // Each Berkus factor should hit the A$750K cap.
    const result = computeValuation({ sviScore: 200, stage: "validation" });
    for (const v of Object.values(result.breakdown.berkus.factors)) {
      expect(v).toBe(750_000);
    }
  });

  it("uses the SVI-derived score even when only some dims are supplied", () => {
    // ftv=100 explicit, rest derived from SVI 100 → 50.
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ftv: 100 },
    });
    expect(result.breakdown.berkus.factors["Quality team (FTV)"]).toBe(750_000);
    // Sound idea from MPC derived at 50 → half cap = 375_000.
    expect(result.breakdown.berkus.factors["Sound idea (MPC)"]).toBe(375_000);
  });
});

// ─── computeValuation — comparables benchmark passthrough ───────────────────

describe("computeValuation comparables benchmark", () => {
  it("attaches a comparables benchmark for the supplied sector", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      sector: "saas",
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.comparablesBenchmark).toBeDefined();
    expect(result.comparablesBenchmark?.industry).toBe("SaaS");
  });

  it("still attaches a benchmark even when sector is unspecified", () => {
    const result = computeValuation({
      sviScore: 100,
      stage: "validation",
      dimensions: { ...NEUTRAL_DIMS },
    });
    expect(result.comparablesBenchmark).toBeDefined();
    expect(result.comparablesBenchmark?.multiples.median).toBeGreaterThan(0);
  });
});
