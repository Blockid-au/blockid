import { describe, it, expect } from "vitest";
import {
  estimateRdti,
  evaluateEsic,
  RDTI_MIN_SPEND_AUD,
  RDTI_REFUNDABLE_TURNOVER_CAP_AUD,
  RDTI_EXPENDITURE_CAP_AUD,
  ESIC_POINTS_THRESHOLD,
  ESIC_SOPHISTICATED_MAX_OFFSET_AUD,
  ESIC_RETAIL_MAX_OFFSET_AUD,
} from "./cfo-au-tax-incentives";

describe("cfo-au-tax-incentives — RDTI estimator", () => {
  it("applies the refundable premium when turnover is below the A$20M cap", () => {
    const r = estimateRdti({
      aggregatedTurnoverAud: 500_000,
      eligibleRdExpenditureAud: 100_000,
    });
    expect(r.eligible).toBe(true);
    expect(r.tier).toBe("refundable");
    // 25% base + 18.5% premium = 43.5% -> 43,500 offset on 100k spend.
    expect(r.offsetRate).toBeCloseTo(0.435, 3);
    expect(r.estimatedOffsetAud).toBe(43_500);
    expect(r.premiumComponentAud).toBe(18_500);
  });

  it("uses the non-refundable low-intensity tier when turnover >= A$20M and intensity <= 2%", () => {
    const r = estimateRdti({
      aggregatedTurnoverAud: RDTI_REFUNDABLE_TURNOVER_CAP_AUD,
      eligibleRdExpenditureAud: 1_000_000,
      rdIntensityPct: 1.5,
    });
    expect(r.tier).toBe("non-refundable");
    // 25% base + 8.5% low premium = 33.5%.
    expect(r.offsetRate).toBeCloseTo(0.335, 3);
    expect(r.estimatedOffsetAud).toBe(335_000);
  });

  it("uses the non-refundable high-intensity tier when R&D intensity > 2%", () => {
    const r = estimateRdti({
      aggregatedTurnoverAud: 30_000_000,
      eligibleRdExpenditureAud: 1_000_000,
      rdIntensityPct: 4,
    });
    expect(r.tier).toBe("non-refundable");
    // 25% base + 16.5% high premium = 41.5%.
    expect(r.offsetRate).toBeCloseTo(0.415, 3);
  });

  it("marks the company ineligible when spend is below the A$20k minimum and no RSP is used", () => {
    const r = estimateRdti({
      aggregatedTurnoverAud: 100_000,
      eligibleRdExpenditureAud: RDTI_MIN_SPEND_AUD - 1,
    });
    expect(r.eligible).toBe(false);
    expect(r.tier).toBe("ineligible");
    expect(r.estimatedOffsetAud).toBe(0);
    expect(r.notes.some(n => n.includes("Registered Research Service Provider"))).toBe(true);
  });

  it("waives the minimum spend when the work is contracted to an RSP", () => {
    const r = estimateRdti({
      aggregatedTurnoverAud: 100_000,
      eligibleRdExpenditureAud: 5_000,
      contractedToRsp: true,
    });
    expect(r.eligible).toBe(true);
    expect(r.estimatedOffsetAud).toBeGreaterThan(0);
  });

  it("caps eligible spend at the A$150M ceiling", () => {
    const r = estimateRdti({
      aggregatedTurnoverAud: 100_000,
      eligibleRdExpenditureAud: RDTI_EXPENDITURE_CAP_AUD + 50_000_000,
    });
    // Offset should be capped at RDTI_EXPENDITURE_CAP_AUD * 43.5%.
    expect(r.estimatedOffsetAud).toBe(Math.round(RDTI_EXPENDITURE_CAP_AUD * 0.435));
    expect(r.notes.some(n => n.includes("capped at A$150"))).toBe(true);
  });
});

describe("cfo-au-tax-incentives — ESIC evaluator", () => {
  const baseEarlyStage = {
    yearsSinceIncorporation: 2,
    cumulativePriorYearExpensesAud: 250_000,
    priorYearAssessableIncomeAud: 50_000,
    priorYearTotalExpensesAud: 300_000,
    listedOnExchange: false,
  };

  it("qualifies via the 100-point test when signals clear the threshold", () => {
    const r = evaluateEsic({
      ...baseEarlyStage,
      points: {
        rdExpenditure50pctOfExpenses: true, // 75 pts
        qualifyingEquityFinance50k: true, // 50 pts
      },
    });
    expect(r.qualifies).toBe(true);
    expect(r.innovation.method).toBe("points");
    expect(r.innovation.pointsScored).toBeGreaterThanOrEqual(ESIC_POINTS_THRESHOLD);
  });

  it("does not double-count the 15% and 50% R&D expenditure signals", () => {
    const r = evaluateEsic({
      ...baseEarlyStage,
      points: {
        rdExpenditure50pctOfExpenses: true, // 75 pts, supersedes 15% signal
        rdExpenditure15pctOfExpenses: true, // should NOT add extra 50 pts
      },
    });
    // Only 75 pts from R&D expenditure, so total is 75 — below threshold.
    expect(r.innovation.pointsScored).toBe(75);
    expect(r.innovation.method).toBe(null);
  });

  it("falls back to the principles-based test when all five limbs are met", () => {
    const r = evaluateEsic({
      ...baseEarlyStage,
      principles: {
        genuinelyDevelopingInnovation: true,
        broadCommercialisationScope: true,
        highGrowthPotential: true,
        scalable: true,
        competitiveAdvantage: true,
      },
    });
    expect(r.qualifies).toBe(true);
    expect(r.innovation.method).toBe("principles");
  });

  it("fails the early-stage limb when the company is listed on an exchange", () => {
    const r = evaluateEsic({
      ...baseEarlyStage,
      listedOnExchange: true,
      principles: {
        genuinelyDevelopingInnovation: true,
        broadCommercialisationScope: true,
        highGrowthPotential: true,
        scalable: true,
        competitiveAdvantage: true,
      },
    });
    expect(r.qualifies).toBe(false);
    expect(r.earlyStage.passes).toBe(false);
  });

  it("passes the extended limb when incorporated <=6 yrs ago and prior expenses <A$1M", () => {
    const r = evaluateEsic({
      ...baseEarlyStage,
      yearsSinceIncorporation: 5,
      cumulativePriorYearExpensesAud: 400_000,
      points: { rdExpenditure50pctOfExpenses: true, eligibleGovernmentGrant50k: true },
    });
    expect(r.earlyStage.passes).toBe(true);
    expect(r.qualifies).toBe(true);
  });

  it("fails the early-stage limb when prior-year assessable income exceeds A$200k", () => {
    const r = evaluateEsic({
      ...baseEarlyStage,
      priorYearAssessableIncomeAud: 250_000,
    });
    expect(r.earlyStage.passes).toBe(false);
  });

  it("reports the correct investor offset caps", () => {
    const r = evaluateEsic({
      ...baseEarlyStage,
      points: { rdExpenditure50pctOfExpenses: true, eligibleGovernmentGrant50k: true },
    });
    expect(r.investor.sophisticated.maxOffsetAud).toBe(ESIC_SOPHISTICATED_MAX_OFFSET_AUD);
    expect(r.investor.sophisticated.offsetRate).toBe(0.2);
    // Sophisticated investors can put in up to A$1M to hit the A$200k cap.
    expect(r.investor.sophisticated.maxInvestmentAud).toBe(1_000_000);
    // Retail cap of A$50k invested -> A$10k offset.
    expect(r.investor.retail.maxOffsetAud).toBe(ESIC_RETAIL_MAX_OFFSET_AUD);
    expect(r.investor.retail.maxInvestmentAud).toBe(50_000);
  });
});
