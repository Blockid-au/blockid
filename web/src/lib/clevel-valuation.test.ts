import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./auth", () => ({ ADMIN_EMAIL: "admin@blockid.au" }));

import {
  computeCLevelValuation,
  BLOCKID_SELF_PROFILE,
  type CLevelValuationInput,
  type MethodResult,
} from "./clevel-valuation";

const BASE_INPUT: CLevelValuationInput = {
  name: "Test Co",
  email: "founder@test.au",
  sviScore: 120,
  stage: 2,
  dimensions: {
    ftv: 60,
    mpc: 70,
    ptd: 75,
    tre: 40,
    cgh: 45,
    iri: 60,
    lco: 65,
    svm: 55,
  },
  mrrAud: 5_000,
  monthlyGrowthRate: 0.1,
  churnRate: 0.05,
  arpu: 75,
  burnRateAud: 3_000,
  runwayMonths: 18,
  tamAud: 1_000_000_000,
  samAud: 100_000_000,
  sector: "SaaS",
  teamSize: 3,
  customers: 60,
};

function idealisedProfile(): CLevelValuationInput {
  return {
    ...BASE_INPUT,
    name: "Unicorn Co",
    sviScore: 195,
    stage: 6,
    dimensions: {
      ftv: 90, mpc: 90, ptd: 90, tre: 90,
      cgh: 90, iri: 90, lco: 90, svm: 90,
    },
    mrrAud: 500_000,
    monthlyGrowthRate: 0.2,
    burnRateAud: 200_000,
    runwayMonths: 36,
    teamSize: 40,
    customers: 5_000,
  };
}

function preRevenueProfile(): CLevelValuationInput {
  return {
    ...BASE_INPUT,
    mrrAud: 0,
    monthlyGrowthRate: 0,
    runwayMonths: 8,
    dimensions: {
      ftv: 30, mpc: 40, ptd: 45, tre: 20,
      cgh: 20, iri: 30, lco: 40, svm: 35,
    },
  };
}

function methodByName(methods: MethodResult[], needle: string): MethodResult {
  const found = methods.find((m) => m.method.includes(needle));
  if (!found) throw new Error(`method not found: ${needle}`);
  return found;
}

describe("computeCLevelValuation — result shape", () => {
  const r = computeCLevelValuation(BASE_INPUT);

  it("echoes the input", () => {
    expect(r.input).toEqual(BASE_INPUT);
  });

  it("emits exactly 5 methods", () => {
    expect(r.methods).toHaveLength(5);
    expect(r.methods.map((m) => m.method)).toEqual([
      "Berkus Method (AU-Adjusted)",
      "Scorecard Method (AU Stage Median)",
      "DCF — 5yr, 35% WACC",
      "VC Method (10x return, 8x ARR exit)",
      "BlockID SVI-Based (BSI-AU Proprietary)",
    ]);
  });

  it("method weights sum to 1.0", () => {
    const sum = r.methods.reduce((s, m) => s + m.weight, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("individual weights match the spec (15/25/10/25/25)", () => {
    expect(methodByName(r.methods, "Berkus").weight).toBe(0.15);
    expect(methodByName(r.methods, "Scorecard").weight).toBe(0.25);
    expect(methodByName(r.methods, "DCF").weight).toBe(0.10);
    expect(methodByName(r.methods, "VC Method").weight).toBe(0.25);
    expect(methodByName(r.methods, "SVI-Based").weight).toBe(0.25);
  });

  it("every method has low <= mid <= high", () => {
    for (const m of r.methods) {
      expect(m.lowAud).toBeLessThanOrEqual(m.midAud);
      expect(m.midAud).toBeLessThanOrEqual(m.highAud);
    }
  });

  it("every method has non-empty notes", () => {
    for (const m of r.methods) {
      expect(m.notes).toBeTruthy();
      expect(m.notes.length).toBeGreaterThan(5);
    }
  });

  it("SVI-Based method has High confidence", () => {
    expect(methodByName(r.methods, "SVI-Based").confidence).toBe("High");
  });

  it("blended range preserves low <= mid <= high ordering", () => {
    expect(r.blended.lowAud).toBeLessThanOrEqual(r.blended.midAud);
    expect(r.blended.midAud).toBeLessThanOrEqual(r.blended.highAud);
  });

  it("blended values are integers", () => {
    expect(Number.isInteger(r.blended.lowAud)).toBe(true);
    expect(Number.isInteger(r.blended.midAud)).toBe(true);
    expect(Number.isInteger(r.blended.highAud)).toBe(true);
  });

  it("blended.mid equals weighted sum of method mids (rounded)", () => {
    const expected = Math.round(
      r.methods.reduce((s, m) => s + m.midAud * m.weight, 0),
    );
    expect(r.blended.midAud).toBe(expected);
  });

  it("generatedAt is a valid ISO timestamp", () => {
    expect(new Date(r.generatedAt).toString()).not.toBe("Invalid Date");
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("projections carries all four expected month buckets", () => {
    expect(r.projections).toHaveProperty("arrMonth12");
    expect(r.projections).toHaveProperty("arrMonth24");
    expect(r.projections).toHaveProperty("arrMonth36");
    expect(r.projections).toHaveProperty("grossMarginEst");
  });

  it("gross margin estimate is the SaaS default", () => {
    expect(r.projections.grossMarginEst).toBe(0.78);
  });
});

describe("computeCLevelValuation — DCF sensitivity to revenue", () => {
  it("DCF value grows when growth rate increases", () => {
    const slow = computeCLevelValuation({ ...BASE_INPUT, monthlyGrowthRate: 0.05 });
    const fast = computeCLevelValuation({ ...BASE_INPUT, monthlyGrowthRate: 0.20 });
    expect(methodByName(fast.methods, "DCF").midAud).toBeGreaterThan(
      methodByName(slow.methods, "DCF").midAud,
    );
  });

  it("DCF is downgraded to Low confidence when MRR=0", () => {
    const noRev = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 0 });
    expect(methodByName(noRev.methods, "DCF").confidence).toBe("Low");
  });

  it("DCF returns Medium confidence when MRR > 0", () => {
    const withRev = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 500 });
    expect(methodByName(withRev.methods, "DCF").confidence).toBe("Medium");
  });

  it("DCF is never negative", () => {
    const zero = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 0, monthlyGrowthRate: 0 });
    expect(methodByName(zero.methods, "DCF").midAud).toBeGreaterThanOrEqual(0);
  });
});

describe("computeCLevelValuation — VC method sensitivity", () => {
  it("VC value grows with MRR", () => {
    const low = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 1_000 });
    const high = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 100_000 });
    expect(methodByName(high.methods, "VC Method").midAud).toBeGreaterThan(
      methodByName(low.methods, "VC Method").midAud,
    );
  });

  it("VC method is never negative even at zero MRR", () => {
    const zero = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 0, monthlyGrowthRate: 0 });
    expect(methodByName(zero.methods, "VC Method").midAud).toBeGreaterThanOrEqual(0);
  });
});

describe("computeCLevelValuation — SVI-based method sensitivity", () => {
  it("SVI-based mid grows with sviScore", () => {
    const low = computeCLevelValuation({ ...BASE_INPUT, sviScore: 100 });
    const high = computeCLevelValuation({ ...BASE_INPUT, sviScore: 200 });
    expect(methodByName(high.methods, "SVI-Based").midAud).toBeGreaterThan(
      methodByName(low.methods, "SVI-Based").midAud,
    );
  });

  it("SVI-based scales with stage base", () => {
    const s1 = computeCLevelValuation({ ...BASE_INPUT, stage: 1 });
    const s5 = computeCLevelValuation({ ...BASE_INPUT, stage: 5 });
    expect(methodByName(s5.methods, "SVI-Based").midAud).toBeGreaterThan(
      methodByName(s1.methods, "SVI-Based").midAud,
    );
  });

  it("SVI-based method has low < mid < high (spread present)", () => {
    const r = computeCLevelValuation(BASE_INPUT);
    const svi = methodByName(r.methods, "SVI-Based");
    expect(svi.lowAud).toBeLessThan(svi.midAud);
    expect(svi.midAud).toBeLessThan(svi.highAud);
  });

  it("SVI score of exactly 100 sets premium to zero (mid == base)", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, sviScore: 100, stage: 2 });
    const svi = methodByName(r.methods, "SVI-Based");
    // Stage 2 base = A$2,000,000; premium = (100-100)/100 = 0
    expect(svi.midAud).toBe(2_000_000);
    expect(svi.lowAud).toBe(2_000_000);
    expect(svi.highAud).toBe(2_000_000);
  });

  it("SVI score below 100 still clamps premium to 0 (no negative discount)", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, sviScore: 40, stage: 2 });
    const svi = methodByName(r.methods, "SVI-Based");
    expect(svi.midAud).toBe(2_000_000);
  });

  it("SVI notes mention stage base and score", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, sviScore: 156, stage: 3 });
    const svi = methodByName(r.methods, "SVI-Based");
    expect(svi.notes).toContain("SVI 156");
    expect(svi.notes).toContain("Stage 3");
  });

  it("falls back to stage-2 base for an unknown stage index", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, sviScore: 100, stage: 999 });
    const svi = methodByName(r.methods, "SVI-Based");
    expect(svi.midAud).toBe(2_000_000);
  });
});

describe("valuationBand — via blended.mid", () => {
  it("labels a concept-stage profile", () => {
    const r = computeCLevelValuation({
      ...BASE_INPUT,
      sviScore: 40,
      stage: 0,
      mrrAud: 0,
      monthlyGrowthRate: 0,
      dimensions: undefined,
    });
    expect(r.band).toMatch(/Concept Stage|Idea-Stage/);
  });

  it("labels a scaled unicorn-track profile", () => {
    const r = computeCLevelValuation(idealisedProfile());
    expect(r.band).toMatch(/Unicorn Track|Series A Ready/);
  });

  it("band string always starts with a bracketed dollar hint", () => {
    const r = computeCLevelValuation(BASE_INPUT);
    expect(r.band).toMatch(/A\$/);
  });
});

describe("actionPlan generator", () => {
  it("caps output at 6 items", () => {
    const r = computeCLevelValuation(preRevenueProfile());
    expect(r.actionPlan.length).toBeLessThanOrEqual(6);
  });

  it("includes the Product Hunt strategic item for a well-scored startup", () => {
    const r = computeCLevelValuation(idealisedProfile());
    const hasProductHunt = r.actionPlan.some((s) => s.includes("Product Hunt"));
    expect(hasProductHunt).toBe(true);
  });

  it("includes the monthly investor update item", () => {
    const r = computeCLevelValuation(idealisedProfile());
    const hasUpdate = r.actionPlan.some((s) => s.includes("Investor update"));
    expect(hasUpdate).toBe(true);
  });

  it("flags critical runway when < 12 months", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, runwayMonths: 3 });
    const hasRunway = r.actionPlan.some((s) => s.toLowerCase().includes("runway"));
    expect(hasRunway).toBe(true);
  });

  it("does NOT flag runway when >= 12 months", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, runwayMonths: 24 });
    const hasCriticalRunway = r.actionPlan.some((s) =>
      s.toLowerCase().includes("runway critical"),
    );
    expect(hasCriticalRunway).toBe(false);
  });

  it("flags zero MRR with a revenue prompt", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 0 });
    const hasRev = r.actionPlan.some((s) => s.includes("Revenue"));
    expect(hasRev).toBe(true);
  });

  it("does NOT flag zero MRR when revenue is present", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, mrrAud: 10_000 });
    const hasRev = r.actionPlan.some((s) => s.startsWith("Revenue:"));
    expect(hasRev).toBe(false);
  });

  it("emits FTV gap advice when ftv < 60", () => {
    const r = computeCLevelValuation({
      ...BASE_INPUT,
      dimensions: { ...BASE_INPUT.dimensions!, ftv: 20 },
    });
    const hasFtv = r.actionPlan.some((s) => s.startsWith("FTV gap"));
    expect(hasFtv).toBe(true);
  });

  it("does NOT emit FTV gap advice when ftv >= 60", () => {
    const r = computeCLevelValuation({
      ...BASE_INPUT,
      dimensions: { ...BASE_INPUT.dimensions!, ftv: 80 },
    });
    const hasFtv = r.actionPlan.some((s) => s.startsWith("FTV gap"));
    expect(hasFtv).toBe(false);
  });

  it("emits TRE gap advice when tre < 55", () => {
    const r = computeCLevelValuation({
      ...BASE_INPUT,
      dimensions: { ...BASE_INPUT.dimensions!, tre: 10 },
    });
    const hasTre = r.actionPlan.some((s) => s.startsWith("TRE gap"));
    expect(hasTre).toBe(true);
  });

  it("emits CGH gap advice when cgh < 50", () => {
    const r = computeCLevelValuation({
      ...BASE_INPUT,
      dimensions: { ...BASE_INPUT.dimensions!, cgh: 10 },
    });
    const hasCgh = r.actionPlan.some((s) => s.startsWith("CGH gap"));
    expect(hasCgh).toBe(true);
  });

  it("emits LCO gap advice when lco < 65", () => {
    const r = computeCLevelValuation({
      ...BASE_INPUT,
      dimensions: { ...BASE_INPUT.dimensions!, lco: 30 },
    });
    const hasLco = r.actionPlan.some((s) => s.startsWith("LCO gap"));
    expect(hasLco).toBe(true);
  });

  it("emits MPC gap advice when mpc < 70", () => {
    const r = computeCLevelValuation({
      ...BASE_INPUT,
      dimensions: { ...BASE_INPUT.dimensions!, mpc: 30 },
    });
    const hasMpc = r.actionPlan.some((s) => s.startsWith("MPC gap"));
    expect(hasMpc).toBe(true);
  });

  it("returns a single SVI-analysis prompt when dimensions are missing", () => {
    const r = computeCLevelValuation({ ...BASE_INPUT, dimensions: undefined });
    expect(r.actionPlan).toEqual([
      "Run a full SVI analysis to unlock dimension-specific recommendations.",
    ]);
  });
});

describe("BLOCKID_SELF_PROFILE", () => {
  it("uses the ADMIN_EMAIL constant", () => {
    expect(BLOCKID_SELF_PROFILE.email).toBe("admin@blockid.au");
  });

  it("declares BlockID.au as the display name", () => {
    expect(BLOCKID_SELF_PROFILE.name).toBe("BlockID.au");
  });

  it("has all 8 SVI dimensions populated", () => {
    const d = BLOCKID_SELF_PROFILE.dimensions!;
    expect(Object.keys(d).sort()).toEqual(
      ["cgh", "ftv", "iri", "lco", "mpc", "ptd", "svm", "tre"],
    );
    for (const v of Object.values(d)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("is a valid input for computeCLevelValuation", () => {
    const r = computeCLevelValuation(BLOCKID_SELF_PROFILE);
    expect(r.methods).toHaveLength(5);
    expect(r.blended.midAud).toBeGreaterThan(0);
    expect(r.band).toBeTruthy();
    expect(r.actionPlan.length).toBeGreaterThan(0);
    expect(r.actionPlan.length).toBeLessThanOrEqual(6);
  });

  it("bootstrap runway signals 24 months (no critical-runway alert)", () => {
    const r = computeCLevelValuation(BLOCKID_SELF_PROFILE);
    const hasCriticalRunway = r.actionPlan.some((s) =>
      s.toLowerCase().includes("runway critical"),
    );
    expect(hasCriticalRunway).toBe(false);
  });
});

describe("computeCLevelValuation — determinism", () => {
  it("produces the same blended.mid for the same input across calls", () => {
    const a = computeCLevelValuation(BASE_INPUT);
    const b = computeCLevelValuation(BASE_INPUT);
    expect(a.blended).toEqual(b.blended);
    expect(a.methods.map((m) => m.midAud)).toEqual(b.methods.map((m) => m.midAud));
  });
});
