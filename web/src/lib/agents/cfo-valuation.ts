/**
 * src/lib/agents/cfo-valuation.ts
 * 
 * CFO domain module — VC-grade startup valuation methodology + research basis.
 * Updated with 2026 AU Venture benchmarks (AVCAL, Cut Through Venture, ATO).
 */

import {
  AU_EXIT_DISCLAIMER,
  getAuComparableExits,
  summariseAuExits,
  type AuExit,
} from "@/lib/exits/au-benchmark";

export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "default";

export type FundingStage = "pre-seed" | "seed" | "series-a" | "series-b" | "late-stage";

export interface VcBenchmark {
  sector: Sector;
  /** Forward ARR multiple range applied to comparables valuation (2026 Update). */
  arrMultiple: { low: number; mid: number; high: number };
  /** Rule of 40 target (growth% + profit margin%). */
  ruleOf40Target: number;
  grossMarginTarget: number;
  /** Target LTV/CAC ratio for healthy growth. */
  ltvcacTarget: number;
}

/**
 * Latest AU Research Data (2024-2026)
 * Sources: AVCAL, Cut Through Venture, ATO, Australian Treasury.
 */
export const AU_FINANCIAL_RESEARCH = {
  rdTaxIncentive: {
    smeRefundableRate: 0.435, // 43.5%
    largeFirmNonRefundableRate: 0.385, // 38.5%
    esicMaxExpenditure: 1000000, // AU$1.0M
    source: "Australian Treasury Budget Paper 2024-25 / ATO Handbook July 2024",
  },
  fundingBenchmarks: {
    preSeed: { medianRound: 1200000, source: "AVCAL Q2 2026" },
    seed: { medianRound: 2800000, source: "Cut Through Venture Q2 2026" },
    seriesA: { medianRound: 7500000, preMoneyMedian: 20000000, source: "AVCAL/Cut Through 2026" },
  },
  marketSizing: {
    topDownDiscount: { min: 0.6, max: 0.8 }, // 20-40% reduction if not validated
    seedSomTarget: { min: 0.01, max: 0.05 }, // 1-5% of SAM
    source: "BlockID Intelligence / Global Startup Benchmarks",
  },
  performance: {
    ruleOf40: {
      seriesA: 0.45,
      seriesB: 0.55,
    },
    growthTargets: {
      earlyStageYoY: { min: 0.5, max: 0.8 }, // 50-80%
    },
    grossMargins: {
      seed: 0.70,
      scale: 0.80,
    },
  },
};

export const VC_BENCHMARKS: Record<Sector, VcBenchmark> = {
  saas: {
    sector: "saas",
    arrMultiple: { low: 4.0, mid: 6.2, high: 10.0 },
    ruleOf40Target: 0.40,
    grossMarginTarget: 0.80,
    ltvcacTarget: 3.0,
  },
  ai: {
    sector: "ai",
    arrMultiple: { low: 12.0, mid: 18.5, high: 25.0 },
    ruleOf40Target: 0.50,
    grossMarginTarget: 0.70, // Lower due to compute costs
    ltvcacTarget: 4.0,
  },
  fintech: {
    sector: "fintech",
    arrMultiple: { low: 4.5, mid: 5.75, high: 7.0 },
    ruleOf40Target: 0.35,
    grossMarginTarget: 0.75,
    ltvcacTarget: 3.0,
  },
  healthtech: {
    sector: "healthtech",
    arrMultiple: { low: 5.0, mid: 7.0, high: 9.0 },
    ruleOf40Target: 0.30,
    grossMarginTarget: 0.70,
    ltvcacTarget: 3.0,
  },
  marketplace: {
    sector: "marketplace",
    arrMultiple: { low: 3.0, mid: 4.5, high: 6.0 },
    ruleOf40Target: 0.30,
    grossMarginTarget: 0.60,
    ltvcacTarget: 2.5,
  },
  deeptech: {
    sector: "deeptech",
    arrMultiple: { low: 5.0, mid: 8.0, high: 15.0 },
    ruleOf40Target: 0.20,
    grossMarginTarget: 0.50,
    ltvcacTarget: 5.0,
  },
  ecommerce: {
    sector: "ecommerce",
    arrMultiple: { low: 1.0, mid: 2.5, high: 4.0 },
    ruleOf40Target: 0.20,
    grossMarginTarget: 0.40,
    ltvcacTarget: 2.0,
  },
  default: {
    sector: "default",
    arrMultiple: { low: 3.0, mid: 5.0, high: 8.0 },
    ruleOf40Target: 0.40,
    grossMarginTarget: 0.70,
    ltvcacTarget: 3.0,
  },
};

export interface ValuationInput {
  arr: number;
  growthRate: number;
  churnRate: number;
  grossMargin: number;
  sector: Sector;
  stage: FundingStage;
  tam: number;
  sam: number;
  som: number;
  isBottomUpSizing: boolean;
  rdExpenditure: number;
  isSme: boolean;
}

export interface VcValuationReport {
  valuationRange: { low: number; mid: number; high: number };
  impliedMultiple: number;
  rdTaxBenefit: number;
  benchmarkComparison: {
    ruleOf40Score: number;
    marginGap: number;
    growthGap: number;
  };
  marketSizingAnalysis: {
    somPercentageOfSam: number;
    isSizingConservative: boolean;
  };
  comparables: AuExit[];
  disclaimer: string;
}

export async function buildVcValuationReport(input: ValuationInput): Promise<VcValuationReport> {
  const benchmark = VC_BENCHMARKS[input.sector] || VC_BENCHMARKS.default;
  
  const lowVal = input.arr * benchmark.arrMultiple.low;
  const midVal = input.arr * benchmark.arrMultiple.mid;
  const highVal = input.arr * benchmark.arrMultiple.high;
  
  const rdBenefit = input.isSme 
    ? input.rdExpenditure * AU_FINANCIAL_RESEARCH.rdTaxIncentive.smeRefundableRate 
    : input.rdExpenditure * AU_FINANCIAL_RESEARCH.rdTaxIncentive.largeFirmNonRefundableRate;

  const ruleOf40 = (input.growthRate * 100) + (input.grossMargin * 100);
  
  const exits = await getAuComparableExits(input.sector);
  const summary = summariseAuExits(exits);

  return {
    valuationRange: { low: lowVal, mid: midVal, high: highVal },
    impliedMultiple: benchmark.arrMultiple.mid,
    rdTaxBenefit: rdBenefit,
    benchmarkComparison: {
      ruleOf40Score: ruleOf40,
      marginGap: benchmark.grossMarginTarget - input.grossMargin,
      growthGap: 0, // Simplified
    },
    marketSizingAnalysis: {
      somPercentageOfSam: input.som / input.sam,
      isSizingConservative: (input.som / input.sam) <= 0.05,
    },
    comparables: exits,
    disclaimer: AU_EXIT_DISCLAIMER,
  };
}

/**
 * Calculates the R&D Tax Incentive benefit based on AU Treasury 2024-25 rates.
 * @param input ValuationInput containing rdExpenditure and SME
 */
export function calculateRdTaxBenefit(input: ValuationInput): number {
  const rates = AU_FINANCIAL_RESEARCH.rdTaxIncentive;
  return input.isSme 
    ? input.rdExpenditure * rates.smeRefundableRate 
    : input.rdExpenditure * rates.largeFirmNonRefundableRate;
}
