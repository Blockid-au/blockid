import { describe, it, expect } from "vitest";
import {
  buildCFODCFValuation,
  scanForRealNames,
  REAL_NAME_REGEX,
  type FinancialModelSnapshot,
  type SviAnalysisSnapshot,
  type ExitStrategySnapshot,
} from "./compute-c-level-dcf";

const baseModel: FinancialModelSnapshot = {
  mrrAud: 40_000,
  monthlyGrowthRate: 0.10,
  churnRate: 0.03,
  monthlyBurnAud: 60_000,
  grossMarginPct: 0.75,
  rndSpendFraction: 0.4,
  sector: "saas",
  cashBalanceAud: 900_000,
};

const baseSvi: SviAnalysisSnapshot = {
  totalScore: 145,
  evidenceCompleteness: 0.8,
  stage: 3,
};

const baseExit: ExitStrategySnapshot = {
  founderStakePct: 45,
  costBaseAud: 5_000,
};

describe("compute-c-level-dcf: deterministic scenarios", () => {
  it("returns identical outputs for identical inputs (determinism)", () => {
    const a = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const b = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    // Ignore computedAt (timestamps drift)
    expect(a.scenarios).toEqual(b.scenarios);
    expect(a.sensitivity).toEqual(b.sensitivity);
    expect(a.founderExits).toEqual(b.founderExits);
    expect(a.comps).toEqual(b.comps);
  });

  it("bull EV > base EV > bear EV", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.scenarios.bull.enterpriseValueAud).toBeGreaterThan(r.scenarios.base.enterpriseValueAud);
    expect(r.scenarios.base.enterpriseValueAud).toBeGreaterThan(r.scenarios.bear.enterpriseValueAud);
  });

  it("uses correct WACC per scenario (bear 42%, base 38%, bull 34%)", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.scenarios.bear.wacc).toBe(0.42);
    expect(r.scenarios.base.wacc).toBe(0.38);
    expect(r.scenarios.bull.wacc).toBe(0.34);
  });

  it("returns exactly 5 FCF years per scenario", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.scenarios.bear.fcfYears).toHaveLength(5);
    expect(r.scenarios.base.fcfYears).toHaveLength(5);
    expect(r.scenarios.bull.fcfYears).toHaveLength(5);
  });

  it("Gordon growth g = 4% (AU long-run nominal GDP)", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.scenarios.base.gordonGrowthG).toBe(0.04);
  });

  it("enterprise value floor is non-negative", () => {
    const bad: FinancialModelSnapshot = { ...baseModel, mrrAud: 0, monthlyGrowthRate: 0, churnRate: 0.5, monthlyBurnAud: 200_000, grossMarginPct: 0.10 };
    const r = buildCFODCFValuation(bad, baseSvi, baseExit);
    expect(r.enterpriseValue.lowAud).toBeGreaterThanOrEqual(0);
    expect(r.enterpriseValue.midAud).toBeGreaterThanOrEqual(0);
    expect(r.enterpriseValue.highAud).toBeGreaterThanOrEqual(0);
  });

  it("handles pre-revenue projects without throwing", () => {
    const preRev = { ...baseModel, mrrAud: 0, monthlyGrowthRate: 0.15 };
    const r = buildCFODCFValuation(preRev, { ...baseSvi, stage: 1 }, baseExit);
    expect(r.enterpriseValue.midAud).toBeGreaterThan(0);
  });
});

describe("compute-c-level-dcf: sensitivity", () => {
  it("returns exactly 5 drivers", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.sensitivity.drivers).toHaveLength(5);
  });

  it("marks exactly one driver as dominant", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const dominants = r.sensitivity.drivers.filter((d) => d.dominantLever);
    expect(dominants).toHaveLength(1);
    expect(r.sensitivity.dominantLever).toBe(dominants[0].driver);
  });

  it("bear impact is negative for growth-related drivers", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const growth = r.sensitivity.drivers.find((d) => d.driver === "ARR growth MoM");
    expect(growth?.bearImpactPct).toBeLessThanOrEqual(0);
  });

  it("bull impact is positive for growth-related drivers", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const growth = r.sensitivity.drivers.find((d) => d.driver === "ARR growth MoM");
    expect(growth?.bullImpactPct).toBeGreaterThanOrEqual(0);
  });

  it("includes all 5 named drivers", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const names = r.sensitivity.drivers.map((d) => d.driver);
    expect(names).toContain("ARR growth MoM");
    expect(names).toContain("Monthly churn");
    expect(names).toContain("Gross margin");
    expect(names).toContain("OpEx burn");
    expect(names).toContain("S&M efficiency (proxy: MRR)");
  });
});

describe("compute-c-level-dcf: AU tax + RDTI + ESIC", () => {
  it("computes RDTI Y1 refund at 43.5% of R&D spend when turnover < A$20M", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const expected = Math.round(baseModel.monthlyBurnAud * 12 * baseModel.rndSpendFraction * 0.435);
    expect(r.rdtiRefundYear1Aud).toBe(expected);
  });

  it("zeroes RDTI refund when turnover exceeds A$20M cap", () => {
    const large = { ...baseModel, mrrAud: 2_500_000 };
    const r = buildCFODCFValuation(large, baseSvi, baseExit);
    expect(r.rdtiRefundYear1Aud).toBe(0);
  });

  it("marks ESIC qualified for stage ≤ 4 and revenue < A$200k", () => {
    const model = { ...baseModel, mrrAud: 5_000 };
    const r = buildCFODCFValuation(model, { ...baseSvi, stage: 2 }, baseExit);
    expect(r.esicQualifies).toBe(true);
  });

  it("marks ESIC not-qualified for stage 5+", () => {
    const r = buildCFODCFValuation(baseModel, { ...baseSvi, stage: 5 }, baseExit);
    expect(r.esicQualifies).toBe(false);
  });

  it("marks ESIC not-qualified when revenue > A$200k", () => {
    const model = { ...baseModel, mrrAud: 25_000 };
    const r = buildCFODCFValuation(model, { ...baseSvi, stage: 2 }, baseExit);
    expect(r.esicQualifies).toBe(false);
  });
});

describe("compute-c-level-dcf: founder exit + CGT", () => {
  it("applies 50% CGT discount + 47% marginal rate", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const base = r.founderExits.find((e) => e.scenario === "base")!;
    // Manual: gain = gross - costBase; discounted = gain × 0.5; tax = discounted × 0.47
    const expectedGain = base.grossPayoutAud - base.costBaseAud;
    const expectedDiscounted = Math.round(expectedGain * 0.5);
    const expectedTax = Math.round(expectedDiscounted * 0.47);
    expect(base.capitalGainAud).toBe(expectedGain);
    expect(base.cgtDiscountedGainAud).toBe(expectedDiscounted);
    expect(base.cgtEstimateAud).toBe(expectedTax);
    expect(base.netPayoutAud).toBe(base.grossPayoutAud - expectedTax);
  });

  it("produces 3 founder exit rows (bear/base/bull)", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.founderExits).toHaveLength(3);
    expect(r.founderExits.map((e) => e.scenario).sort()).toEqual(["base", "bear", "bull"]);
  });

  it("scales gross payout linearly with founder stake %", () => {
    const r1 = buildCFODCFValuation(baseModel, baseSvi, { ...baseExit, founderStakePct: 20 });
    const r2 = buildCFODCFValuation(baseModel, baseSvi, { ...baseExit, founderStakePct: 40 });
    const base1 = r1.founderExits.find((e) => e.scenario === "base")!;
    const base2 = r2.founderExits.find((e) => e.scenario === "base")!;
    expect(base2.grossPayoutAud).toBeCloseTo(base1.grossPayoutAud * 2, -3);
  });

  it("honours targetExitValuationAud override", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, { ...baseExit, targetExitValuationAud: 100_000_000 });
    r.founderExits.forEach((e) => expect(e.exitValuationAud).toBe(100_000_000));
  });
});

describe("compute-c-level-dcf: anonymised comps", () => {
  it("returns comps for the requested sector", () => {
    const r = buildCFODCFValuation({ ...baseModel, sector: "saas" }, baseSvi, baseExit);
    expect(r.comps.length).toBeGreaterThan(0);
    r.comps.forEach((c) => expect(c.label).toBeTruthy());
  });

  it("falls back to default comps for unknown sectors", () => {
    // Force cast to test the fallback path
    const r = buildCFODCFValuation({ ...baseModel, sector: "default" }, baseSvi, baseExit);
    expect(r.comps.length).toBeGreaterThan(0);
  });

  it("comp labels contain NO real company names", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    r.comps.forEach((c) => {
      const scan = scanForRealNames(c.label);
      expect(scan.ok).toBe(true);
    });
  });
});

describe("compute-c-level-dcf: confidence band", () => {
  it("high confidence with strong SVI + evidence", () => {
    const r = buildCFODCFValuation(baseModel, { totalScore: 160, evidenceCompleteness: 0.9, stage: 4 }, baseExit);
    expect(r.enterpriseValue.confidence).toBe("high");
  });
  it("medium confidence with mid SVI", () => {
    const r = buildCFODCFValuation(baseModel, { totalScore: 120, evidenceCompleteness: 0.6, stage: 3 }, baseExit);
    expect(r.enterpriseValue.confidence).toBe("medium");
  });
  it("low confidence with weak SVI", () => {
    const r = buildCFODCFValuation(baseModel, { totalScore: 80, evidenceCompleteness: 0.3, stage: 2 }, baseExit);
    expect(r.enterpriseValue.confidence).toBe("low");
  });
});

describe("compute-c-level-dcf: narrative markdown", () => {
  it("includes NFA disclaimer", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.narrativeMarkdown).toMatch(/NFA/);
  });

  it("includes DCF table headers", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.narrativeMarkdown).toMatch(/Enterprise Value/);
    expect(r.narrativeMarkdown).toMatch(/Terminal PV/);
    expect(r.narrativeMarkdown).toMatch(/WACC/);
  });

  it("includes sensitivity table headers", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.narrativeMarkdown).toMatch(/Bear impact/);
    expect(r.narrativeMarkdown).toMatch(/Bull impact/);
  });

  it("includes founder exit table with CGT column", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.narrativeMarkdown).toMatch(/CGT/);
    expect(r.narrativeMarkdown).toMatch(/Founder exit/);
  });

  it("mentions RDTI and ESIC in tax section", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    expect(r.narrativeMarkdown).toMatch(/RDTI/);
    expect(r.narrativeMarkdown).toMatch(/ESIC/);
  });
});

describe("compute-c-level-dcf: COMPLIANCE — real-name regex", () => {
  it("catches Canva", () => {
    expect(scanForRealNames("Canva is a great example").ok).toBe(false);
  });
  it("catches Atlassian", () => {
    expect(scanForRealNames("Atlassian trajectory").ok).toBe(false);
  });
  it("catches Xero, Afterpay, MYOB", () => {
    expect(scanForRealNames("Xero and MYOB and Afterpay").ok).toBe(false);
  });
  it("catches VC firm names (Blackbird, Airtree, Square Peg)", () => {
    expect(scanForRealNames("Blackbird led the round with Airtree").ok).toBe(false);
    expect(scanForRealNames("Square Peg co-invested").ok).toBe(false);
  });
  it("does NOT flag anonymised labels", () => {
    expect(scanForRealNames("AU SaaS Strategic Buyer 2022").ok).toBe(true);
    expect(scanForRealNames("Tier-1 AU VC 2024 lead pattern").ok).toBe(true);
    expect(scanForRealNames("ASX-listed Cybertech Acquirer 2023").ok).toBe(true);
  });
  it("case-insensitive match", () => {
    expect(scanForRealNames("canva").ok).toBe(false);
    expect(scanForRealNames("CANVA").ok).toBe(false);
  });
  it("returns each violation once (deduped)", () => {
    const scan = scanForRealNames("Canva Canva Canva");
    expect(scan.ok).toBe(false);
    expect(scan.violations).toEqual(["Canva"]);
  });
  it("full narrative from a normal report is clean", () => {
    const r = buildCFODCFValuation(baseModel, baseSvi, baseExit);
    const scan = scanForRealNames(r.narrativeMarkdown);
    expect(scan.ok).toBe(true);
    expect(scan.violations).toHaveLength(0);
  });
  it("REAL_NAME_REGEX exports as reusable pattern", () => {
    expect(REAL_NAME_REGEX).toBeInstanceOf(RegExp);
    expect(REAL_NAME_REGEX.test("Canva")).toBe(true);
  });
});
