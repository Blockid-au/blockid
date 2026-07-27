/**
 * src/lib/agents/cfo-valuation.ts
 * 
 * CFO domain module — VC-grade startup valuation methodology + research basis.
 * Updated with 2026 AU Venture benchmarks (AVCAL, Cut Through Venture, ATO, a16z, Bessemer).
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
  /** Forward ARR multiple range applied to comparables valuation. */
  arrMultiple: { low: number; mid: number; high: number };
  /** Rule of 40 target (growth% + profit margin%). */
  ruleOf40Target: number;
  grossMarginTarget: number;
  /** Target LTV/CAC ratio for healthy growth. */
  ltvcacTarget: number;
  /** Max acceptable CAC payback period in months. */
  maxCacPaybackMonths: number;
}

export interface VcValuationInput {
  arr: number;
  growthRate: number;
  sector: Sector;
  stage: FundingStage;
  burnRate: number;
  cac: number;
  ltv: number;
}

export interface VcValuationReport {
  valuationRange: { min: number; max: number; mid: number };
  metrics: {
    burnMultiple: number;
    ltvCac: number;
    cacPayback: number;
    efficiencyScore: number;
  };
  comparables: AuExit[];
  summary: string;
}

/**
 * Latest AU & Global Research Data (2024-2026)
 * Sources: AVCAL, Cut Through Venture, ATO, Australian Treasury, Bessemer, a16z, Carta.
 */
export const AU_FINANCIAL_RESEARCH = {
  taxIncentives: {
    rdti: {
      smallCompanyRefundableRate: 0.435, // 43.5% for turnover <$20M
      source: "Australian Taxation Office (ATO)",
    },
    esic: {
      investorTaxOffset: 0.20, // 20% non-refundable offset
      source: "Treasury.gov.au",
    },
  },
  fundingBenchmarks: {
    seed: {
      avgValuationRange: { min: 3000000, max: 7000000 },
      avgRoundSize: { min: 1000000, max: 3000000 },
      targetRunwayMonths: { min: 18, max: 24 },
      source: "Cut Through Venture / AVCAL 2024",
    },
    seriesA: {
      typicalDilution: { min: 0.20, max: 0.30 },
      source: "AVCAL Member Guidelines",
    },
    efficiency: {
      maxBurnMultiple: 1.5, // Acceptable Burn Multiple (Seed/Series A)
      source: "VC Financial Intelligence",
    },
  },
  marketSizing: {
    vcPreference: "bottom-up",
    somCaptureTarget: { min: 0.01, max: 0.05 }, // 1% to 5% of SAM
    auTechCagr: { min: 0.10, max: 0.15 }, // 10-15% growth
    source: "Austrade / Startup Vic",
  },
  performanceNorms: {
    saas: {
      grossMargin: { min: 0.75, max: 0.85 },
      nrrBestInClass: 1.20, // >120%
      cacPaybackMonths: 12, // <12 months
      ltvcacRatio: { min: 3, max: 5 },
      seriesAGrowthYoY: { min: 1.0, max: 3.0 }, // 100% - 300%
      source: "KeyBanc / ChartMogul / OpenView / a16z",
    },
  },
  sectorMultiples: {
    saas: { low: 6.0, mid: 6.75, high: 7.5 },
    ai: { low: 15.0, mid: 32.5, high: 50.0 },
    fintech: { low: 4.5, mid: 5.25, high: 6.0 },
    healthtech: { low: 5.0, mid: 6.5, high: 8.0 },
    marketplace: { low: 3.0, mid: 4.0, high: 5.0 },
    source: "Bessemer / PitchBook / Carta",
  },
};

export const VC_BENCHMARKS: Record<Sector, VcBenchmark> = {
  saas: {
    sector: "saas",
    arrMultiple: { low: 6.0, mid: 6.75, high: 7.5 },
    ruleOf40Target: 40,
    grossMarginTarget: 0.8,
    ltvcacTarget: 3,
    maxCacPaybackMonths: 12,
  },
  ai: {
    sector: "ai",
    arrMultiple: { low: 15.0, mid: 32.5, high: 50.0 },
    ruleOf40Target: 50,
    grossMarginTarget: 0.7,
    ltvcacTarget: 4,
    maxCacPaybackMonths: 18,
  },
  fintech: {
    sector: "fintech",
    arrMultiple: { low: 4.5, mid: 5.25, high: 6.0 },
    ruleOf40Target: 30,
    grossMarginTarget: 0.6,
    ltvcacTarget: 3,
    maxCacPaybackMonths: 15,
  },
  healthtech: {
    sector: "healthtech",
    arrMultiple: { low: 5.0, mid: 6.5, high: 8.0 },
    ruleOf40Target: 30,
    grossMarginTarget: 0.7,
    ltvcacTarget: 3,
    maxCacPaybackMonths: 18,
  },
  marketplace: {
    sector: "marketplace",
    arrMultiple: { low: 3.0, mid: 4.0, high: 5.0 },
    ruleOf40Target: 20,
    grossMarginTarget: 0.5,
    ltvcacTarget: 3,
    maxCacPaybackMonths: 12,
  },
  deeptech: {
    sector: "deeptech",
    arrMultiple: { low: 5.0, mid: 10.0, high: 20.0 },
    ruleOf40Target: 20,
    grossMarginTarget: 0.6,
    ltvcacTarget: 4,
    maxCacPaybackMonths: 24,
  },
  ecommerce: {
    sector: "ecommerce",
    arrMultiple: { low: 2.0, mid: 3.0, high: 5.0 },
    ruleOf40Target: 20,
    grossMarginTarget: 0.4,
    ltvcacTarget: 3,
    maxCacPaybackMonths: 6,
  },
  default: {
    sector: "default",
    arrMultiple: { low: 4.0, mid: 5.0, high: 6.0 },
    ruleOf40Target: 30,
    grossMarginTarget: 0.6,
    ltvcacTarget: 3,
    maxCacPaybackMonths: 12,
  },
};

/**
 * Calculates the projected R&D Tax Incentive refund for AU startups.
 * @param expenditure Total qualifying R&D expenditure.
 * @param turnover Annual turnover to determine eligibility for refundable offset.
 */
export function calculateRdtiRefund(expenditure: number, turnover: number): number {
  if (turnover < 20000000) {
    return expenditure * AU_FINANCIAL_RESEARCH.taxIncentives.rdti.smallCompanyRefundableRate;
  }
  return 0; // Simplified: Non-refundable for larger firms in this module
}

/**
 * Determines if a startup's efficiency metrics meet VC-grade benchmarks.
 * @param burnRate Monthly net burn.
 * @param netNewArr Monthly net new ARR.
 * @param stage Current funding stage.
 */
export function evaluateBurnEfficiency(burnRate: number, netNewArr: number, stage: FundingStage): {
  burnMultiple: number;
  isEfficient: boolean;
} {
  const burnMultiple = burnRate / netNewArr;
  const threshold = AU_FINANCIAL_RESEARCH.fundingBenchmarks.efficiency.maxBurnMultiple;
  return {
    burnMultiple,
    isEfficient: burnMultiple <= threshold,
  };
}

export async function buildVcValuationReport(input: VcValuationInput): Promise<VcValuationReport> {
  const benchmark = VC_BENCHMARKS[input.sector] || VC_BENCHMARKS.default;
  const valuationMin = input.arr * benchmark.arrMultiple.low;
  const valuationMid = input.arr * benchmark.arrMultiple.mid;
  const valuationMax = input.arr * benchmark.arrMultiple.high;
  
  const burnMultiple = input.burnRate / (input.arr / 12); 
  const ltvCac = input.ltv / input.cac;
  const cacPayback = input.cac / (input.arr / 12 / 100); // Simplified proxy

  const exits = await getAuComparableExits(input.sector);
  const summary = summariseAuExits(exits);

  return {
    valuationRange: { min: valuationMin, mid: valuationMid, max: valuationMax },
    metrics: {
      burnMultiple,
      ltvCac,
      cacPayback,
      efficiencyScore: (ltvCac / benchmark.ltvcacTarget) * 100,
    },
    comparables: exits,
    summary: `${summary}. Based on current ${input.sector} multiples, the company is valued at $${valuationMid.toLocaleString()}.`,
  };
}
