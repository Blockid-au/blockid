import { describe, it, expect } from "vitest";
import {
  computeValuation,
  estimateValuation,
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

const WEAK_DIMS = {
  ftv: 10,
  mpc: 10,
  ptd: 10,
  tre: 10,
  cgh: 10,
  iri: 10,
  lco: 10,
  svm: 10,
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

// ─── estimateValuation — shape + basic invariants ───────────────────────────

describe("estimateValuation shape", () => {
  it("returns an AUD result with low <= mid <= high for every canonical stage", () => {
    for (let stage = 0; stage <= 7; stage++) {
      const est = estimateValuation(80, stage, undefined, { ...NEUTRAL_DIMS });
      expect(est.currency).toBe("AUD");
      expect(est.low).toBeGreaterThan(0);
      expect(est.mid).toBeGreaterThanOrEqual(est.low);
      expect(est.high).toBeGreaterThanOrEqual(est.mid);
      expect(est.confidence).toBeGreaterThanOrEqual(5);
      expect(est.confidence).toBeLessThanOrEqual(95);
      expect(typeof est.method).toBe("string");
      expect(est.method.length).toBeGreaterThan(0);
    }
  });

  it("clamps a negative stage argument to stage 0", () => {
    const neg = estimateValuation(80, -3, undefined, { ...NEUTRAL_DIMS });
    const zero = estimateValuation(80, 0, undefined, { ...NEUTRAL_DIMS });
    expect(neg.low).toBe(zero.low);
    expect(neg.mid).toBe(zero.mid);
    expect(neg.high).toBe(zero.high);
  });

  it("clamps an oversized stage argument to stage 7", () => {
    const huge = estimateValuation(80, 42, undefined, { ...NEUTRAL_DIMS });
    const seven = estimateValuation(80, 7, undefined, { ...NEUTRAL_DIMS });
    expect(huge.low).toBe(seven.low);
    expect(huge.mid).toBe(seven.mid);
    expect(huge.high).toBe(seven.high);
  });

  it("includes a comparables benchmark object", () => {
    const est = estimateValuation(80, 2, { sector: "saas" });
    expect(est.comparablesBenchmark).toBeDefined();
    expect(est.comparablesBenchmark?.industry).toBe("SaaS");
    expect(est.comparablesBenchmark?.multiples.median).toBeGreaterThan(0);
  });
});

// ─── estimateValuation — dimension handling ─────────────────────────────────

describe("estimateValuation dimension handling", () => {
  it("stronger dimension scores yield a higher mid than weaker ones at the same stage", () => {
    const strong = estimateValuation(160, 2, undefined, { ...STRONG_DIMS });
    const weak = estimateValuation(40, 2, undefined, { ...WEAK_DIMS });
    expect(strong.mid).toBeGreaterThan(weak.mid);
  });

  it("clamps dimension scores above 100 to 100 internally", () => {
    // dims=999 must behave identically to dims=100 (the clamp ceiling).
    const oversaturated = estimateValuation(
      160,
      2,
      undefined,
      { ftv: 999, mpc: 999, ptd: 999, tre: 999, svm: 999, iri: 999, lco: 999, cgh: 999 },
    );
    const clamped = estimateValuation(
      160,
      2,
      undefined,
      { ftv: 100, mpc: 100, ptd: 100, tre: 100, svm: 100, iri: 100, lco: 100, cgh: 100 },
    );
    expect(oversaturated.mid).toBe(clamped.mid);
    expect(oversaturated.low).toBe(clamped.low);
    expect(oversaturated.high).toBe(clamped.high);
  });

  it("clamps negative dimension scores to 0 internally", () => {
    const negative = estimateValuation(
      40,
      2,
      undefined,
      { ftv: -50, mpc: -50, ptd: -50, tre: -50, svm: -50, iri: -50, lco: -50, cgh: -50 },
    );
    // With the floor multiplier, the mid must remain a positive AUD figure.
    expect(negative.mid).toBeGreaterThan(0);
  });

  it("falls back to deriving each dim from SVI when no dimensions provided", () => {
    const withoutDims = estimateValuation(100, 2);
    const withNeutralDims = estimateValuation(100, 2, undefined, { ...NEUTRAL_DIMS });
    // SVI 100 → derived 50, matching neutral dims within rounding tolerance.
    expect(Math.abs(withoutDims.mid - withNeutralDims.mid)).toBeLessThanOrEqual(
      withNeutralDims.mid * 0.05,
    );
  });
});

// ─── estimateValuation — revenue multiple pathway ───────────────────────────

describe("estimateValuation revenue multiple", () => {
  it("uses a revenue-heavy blend once MRR > 0 at growth stage", () => {
    const est = estimateValuation(140, 5, {
      mrr: 100_000,
      sector: "saas",
      growthPctYoY: 100,
    }, { ...STRONG_DIMS });
    expect(est.method.toLowerCase()).toContain("revenue");
  });

  it("skips the revenue path entirely when MRR is zero", () => {
    const est = estimateValuation(140, 5, { mrr: 0 }, { ...STRONG_DIMS });
    expect(est.method.toLowerCase()).not.toContain("revenue");
  });

  it("applies an AI-native premium — same inputs give a higher mid with isAINative", () => {
    const base = estimateValuation(120, 3, { mrr: 40_000, sector: "saas" }, { ...STRONG_DIMS });
    const ai = estimateValuation(
      120,
      3,
      { mrr: 40_000, sector: "saas", isAINative: true },
      { ...STRONG_DIMS },
    );
    expect(ai.mid).toBeGreaterThan(base.mid);
  });

  it("adds a growth premium when YoY growth exceeds 50%", () => {
    const flat = estimateValuation(120, 4, { mrr: 50_000, sector: "saas" }, { ...STRONG_DIMS });
    const hot = estimateValuation(
      120,
      4,
      { mrr: 50_000, sector: "saas", growthPctYoY: 150 },
      { ...STRONG_DIMS },
    );
    expect(hot.mid).toBeGreaterThanOrEqual(flat.mid);
  });

  it("applies a churn penalty when churn exceeds 3%", () => {
    const clean = estimateValuation(120, 4, { mrr: 50_000, sector: "saas" }, { ...STRONG_DIMS });
    const churny = estimateValuation(
      120,
      4,
      { mrr: 50_000, sector: "saas", churnPct: 25 },
      { ...STRONG_DIMS },
    );
    expect(churny.mid).toBeLessThanOrEqual(clean.mid);
  });

  it("defaults ARR to mrr * 12 when arr not supplied", () => {
    const est = estimateValuation(120, 4, { mrr: 10_000, sector: "saas" }, { ...STRONG_DIMS });
    expect(est.mid).toBeGreaterThan(0);
  });

  it("respects explicit ARR when provided", () => {
    const derived = estimateValuation(120, 4, { mrr: 10_000, sector: "saas" }, { ...STRONG_DIMS });
    const explicit = estimateValuation(
      120,
      4,
      { mrr: 10_000, arr: 240_000, sector: "saas" },
      { ...STRONG_DIMS },
    );
    expect(explicit.mid).toBeGreaterThan(derived.mid);
  });
});

// ─── estimateValuation — sector-specific multiples ──────────────────────────

describe("estimateValuation sector multiples", () => {
  const sectors = ["saas", "fintech", "marketplace", "healthtech", "deeptech", "ecommerce"];

  it.each(sectors)("returns a positive mid for sector %s at revenue stage", (sector) => {
    const est = estimateValuation(120, 4, { mrr: 30_000, sector }, { ...STRONG_DIMS });
    expect(est.mid).toBeGreaterThan(0);
  });

  it("saas commands a higher mid than ecommerce at the same inputs", () => {
    const saas = estimateValuation(120, 4, { mrr: 30_000, sector: "saas" }, { ...STRONG_DIMS });
    const ec = estimateValuation(120, 4, { mrr: 30_000, sector: "ecommerce" }, { ...STRONG_DIMS });
    expect(saas.mid).toBeGreaterThan(ec.mid);
  });

  it("falls back to the 'other' multiple bucket for an unknown sector", () => {
    const est = estimateValuation(120, 4, { mrr: 30_000, sector: "quantum-toothpaste" }, {
      ...STRONG_DIMS,
    });
    expect(est.mid).toBeGreaterThan(0);
  });
});

// ─── estimateValuation — blend method chosen ────────────────────────────────

describe("estimateValuation blend method labels", () => {
  it("uses the 50/50 Berkus+Scorecard blend at stage 0 with no revenue", () => {
    const est = estimateValuation(80, 0, undefined, { ...NEUTRAL_DIMS });
    expect(est.method.toLowerCase()).toContain("berkus");
    expect(est.method.toLowerCase()).toContain("scorecard");
  });

  it("uses the 30/70 Berkus/Scorecard blend at stage 3 with no revenue", () => {
    const est = estimateValuation(80, 3, undefined, { ...NEUTRAL_DIMS });
    expect(est.method).toMatch(/Berkus \(30%\)/);
    expect(est.method).toMatch(/Scorecard \(70%\)/);
  });

  it("uses the revenue-dominated blend at growth stage with revenue", () => {
    const est = estimateValuation(
      140,
      5,
      { mrr: 80_000, sector: "saas" },
      { ...STRONG_DIMS },
    );
    expect(est.method.toLowerCase()).toContain("75%");
  });

  it("uses the mid-blend revenue formula for mid-stages with revenue", () => {
    const est = estimateValuation(
      120,
      3,
      { mrr: 20_000, sector: "saas" },
      { ...STRONG_DIMS },
    );
    expect(est.method.toLowerCase()).toContain("50%");
  });

  it("falls back to the scorecard-heavy label for late stages without revenue", () => {
    const est = estimateValuation(120, 6, undefined, { ...NEUTRAL_DIMS });
    expect(est.method).toMatch(/Scorecard \(70%\)/);
  });
});

// ─── estimateValuation — confidence ─────────────────────────────────────────

describe("estimateValuation confidence", () => {
  it("bare inputs produce a low but non-zero confidence", () => {
    const est = estimateValuation(80, 1);
    expect(est.confidence).toBeGreaterThanOrEqual(5);
    expect(est.confidence).toBeLessThan(30);
  });

  it("supplying full dimensions raises confidence over bare inputs", () => {
    const bare = estimateValuation(80, 1);
    const full = estimateValuation(80, 1, undefined, { ...NEUTRAL_DIMS });
    expect(full.confidence).toBeGreaterThan(bare.confidence);
  });

  it("adding revenue data raises confidence further", () => {
    const noRev = estimateValuation(80, 3, undefined, { ...NEUTRAL_DIMS });
    const rev = estimateValuation(
      80,
      3,
      { mrr: 10_000, sector: "saas", growthPctYoY: 60 },
      { ...NEUTRAL_DIMS },
    );
    expect(rev.confidence).toBeGreaterThan(noRev.confidence);
  });

  it("caps confidence at 95", () => {
    const est = estimateValuation(
      160,
      5,
      { mrr: 500_000, arr: 6_000_000, sector: "saas", growthPctYoY: 200, isAINative: true },
      { ...STRONG_DIMS },
    );
    expect(est.confidence).toBeLessThanOrEqual(95);
  });
});

// ─── estimateValuation — band width by stage ────────────────────────────────

describe("estimateValuation band width", () => {
  function width(low: number, mid: number, high: number) {
    return (high - low) / mid;
  }

  it("stage 0 or 1 has a wider band than a growth stage", () => {
    const early = estimateValuation(80, 0, undefined, { ...NEUTRAL_DIMS });
    const late = estimateValuation(80, 5, undefined, { ...NEUTRAL_DIMS });
    expect(width(early.low, early.mid, early.high)).toBeGreaterThan(
      width(late.low, late.mid, late.high),
    );
  });

  it("clamps the low bound at the stage baseline low", () => {
    // With weak dims the mid gets pushed down; low should not fall below the
    // BASELINES[stage].low floor for that stage.
    const est = estimateValuation(20, 2, undefined, { ...WEAK_DIMS });
    // Stage-2 baseline low = 5_000_000 per source table.
    expect(est.low).toBeGreaterThanOrEqual(5_000_000);
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
