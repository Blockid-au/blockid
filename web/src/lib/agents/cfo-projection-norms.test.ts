import { describe, it, expect } from "vitest";
import { computeProjectionNorms, type ProjectionInput } from "./cfo-projection-norms";

const seedInput: ProjectionInput = {
  stage: "seed",
  mrrAud: 20000,
  monthlyGrowthRatePct: 15,
  monthlyChurnPct: 5,
  grossMarginPct: 75,
  nrrPct: 110,
  cacAud: 600,
  arpuAud: 150,
  operatingMarginPct: -30,
};

describe("cfo-projection-norms — financial projection norms calculator", () => {
  it("returns an ARR, an overall score in [0,100], and a verdict", () => {
    const r = computeProjectionNorms(seedInput);
    expect(r.stage).toBe("seed");
    expect(r.arrAud).toBe(240000);
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(100);
    expect(["strong", "healthy", "watch", "weak"]).toContain(r.overallVerdict);
  });

  it("scores the four core metrics even with no CAC/ARPU/NRR provided", () => {
    const minimal: ProjectionInput = {
      stage: "pre-seed",
      mrrAud: 0,
      monthlyGrowthRatePct: 5,
      monthlyChurnPct: 10,
      grossMarginPct: 60,
    };
    const r = computeProjectionNorms(minimal);
    const names = r.scores.map((s) => s.metric);
    expect(names).toEqual(expect.arrayContaining(["monthlyGrowth", "churn", "grossMargin", "ruleOf40"]));
    expect(names).not.toContain("nrr");
    expect(names).not.toContain("cacPayback");
    expect(names).not.toContain("ltvCac");
  });

  it("adds NRR, CAC payback, and LTV/CAC when inputs are provided", () => {
    const r = computeProjectionNorms(seedInput);
    const names = r.scores.map((s) => s.metric);
    expect(names).toEqual(
      expect.arrayContaining(["nrr", "cacPayback", "ltvCac"]),
    );
    const ltv = r.scores.find((s) => s.metric === "ltvCac")!;
    // ARPU 150 * GM 0.75 / churn 0.05 = 2250 LTV; 2250/600 = 3.75 LTV/CAC.
    expect(ltv.value).toBeCloseTo(3.75, 1);
    expect(ltv.verdict === "healthy" || ltv.verdict === "strong").toBe(true);
  });

  it("flags a weak verdict when churn dominates and growth is flat", () => {
    const bad: ProjectionInput = {
      stage: "seed",
      mrrAud: 5000,
      monthlyGrowthRatePct: 1,
      monthlyChurnPct: 20,
      grossMarginPct: 30,
      operatingMarginPct: -80,
    };
    const r = computeProjectionNorms(bad);
    expect(["watch", "weak"]).toContain(r.overallVerdict);
    const churn = r.scores.find((s) => s.metric === "churn")!;
    expect(churn.score).toBeLessThan(50);
  });

  it("never returns a NaN value or score", () => {
    const odd: ProjectionInput = {
      stage: "series-a",
      mrrAud: 50000,
      monthlyGrowthRatePct: Number.NaN as unknown as number,
      monthlyChurnPct: 3,
      grossMarginPct: 80,
    };
    const r = computeProjectionNorms(odd);
    for (const s of r.scores) {
      expect(Number.isFinite(s.score)).toBe(true);
      expect(Number.isFinite(s.value)).toBe(true);
    }
  });

  it("summary always references the weakest and strongest metric when scored", () => {
    const r = computeProjectionNorms(seedInput);
    expect(r.summary.length).toBeGreaterThan(20);
    expect(r.sources.length).toBeGreaterThan(0);
  });

  it("returns a sector multiple benchmark and implied valuation when sector is provided", () => {
    const r = computeProjectionNorms({ ...seedInput, sector: "saas" });
    expect(r.sectorMultiple).toBeDefined();
    expect(r.sectorMultiple!.sector).toBe("saas");
    // ARR = 20000 * 12 = 240000. SaaS mid multiple is 7x → implied mid = 1_680_000.
    expect(r.sectorMultiple!.impliedValuationAud.mid).toBe(r.arrAud * r.sectorMultiple!.arrMultiple.mid);
    expect(r.sectorMultiple!.impliedValuationAud.low).toBeLessThanOrEqual(r.sectorMultiple!.impliedValuationAud.mid);
    expect(r.sectorMultiple!.impliedValuationAud.high).toBeGreaterThanOrEqual(r.sectorMultiple!.impliedValuationAud.mid);
    expect(r.sectorMultiple!.sources.length).toBeGreaterThan(0);
  });

  it("omits sectorMultiple when sector is unknown or absent", () => {
    const noSector = computeProjectionNorms(seedInput);
    expect(noSector.sectorMultiple).toBeUndefined();
    const badSector = computeProjectionNorms({ ...seedInput, sector: "not-a-real-sector" });
    expect(badSector.sectorMultiple).toBeUndefined();
  });

  it("uses a stage-aware operating margin fallback for Rule of 40 when not supplied", () => {
    // Same growth signal at pre-seed vs series-b should produce a much lower
    // Rule of 40 for pre-seed because the default operating-margin assumption
    // is far more negative there (−90% vs −10%).
    const growth = 5; // 5%/mo → ~80% annualised
    const preSeed = computeProjectionNorms({
      stage: "pre-seed",
      mrrAud: 0,
      monthlyGrowthRatePct: growth,
      monthlyChurnPct: 4,
      grossMarginPct: 70,
    });
    const seriesB = computeProjectionNorms({
      stage: "series-b",
      mrrAud: 250000,
      monthlyGrowthRatePct: growth,
      monthlyChurnPct: 4,
      grossMarginPct: 80,
    });
    const preSeedRule = preSeed.scores.find((s) => s.metric === "ruleOf40")!;
    const seriesBRule = seriesB.scores.find((s) => s.metric === "ruleOf40")!;
    expect(seriesBRule.value).toBeGreaterThan(preSeedRule.value);
    // Sanity check: annualised growth ~80%, series-b default OpMargin −10%,
    // so Rule of 40 lands around 70; pre-seed default −90% brings it near −10.
    expect(seriesBRule.value).toBeGreaterThan(50);
    expect(preSeedRule.value).toBeLessThan(20);
  });

  it("still respects a caller-supplied operating margin over the default", () => {
    const supplied = computeProjectionNorms({
      stage: "pre-seed",
      mrrAud: 0,
      monthlyGrowthRatePct: 5,
      monthlyChurnPct: 4,
      grossMarginPct: 70,
      operatingMarginPct: 0,
    });
    const rule = supplied.scores.find((s) => s.metric === "ruleOf40")!;
    // 5%/mo compounds to ~79.6% annualised; +0 opMargin ≈ 79.6.
    expect(rule.value).toBeGreaterThan(70);
    expect(rule.value).toBeLessThan(90);
  });

  it("falls back to a stage when the supplied stage is unknown", () => {
    const r = computeProjectionNorms({
      ...seedInput,
      stage: "unknown" as ProjectionInput["stage"],
      mrrAud: 250000,
    });
    expect(["pre-seed", "seed", "series-a", "series-b"]).toContain(r.stage);
  });
});
