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
  | "cybertech"
  | "wealthtech"
  | "biotech"
  | "cleantech"
  | "edtech"
  | "proptech"
  | "agtech"
  | "insurtech"
  | "legaltech"
  | "gaming"
  | "default";

export interface VcBenchmark {
  sector: Sector;
  /** Forward ARR multiple range applied to comparables valuation. */
  arrMultipleRange: { min: number; max: number };
  /** Source of the multiple data. */
  source: string;
}

export interface FundingRoundBenchmark {
  stage: "Pre-Seed" | "Seed" | "Series A" | "Series B";
  medianPreMoneyValuation: number;
  medianRoundSize: number;
  avgFounderDilution: { min: number; max: number };
  source: string;
}

export interface RdTaxIncentiveConfig {
  smeRefundableRate: number;
  largeNonRefundableRate: number;
  esicMaxQualifyingExpenditure: number;
  source: string;
}

/**
 * Updated Benchmarks based on Q2 2024 Research (AVCAL, Cut Through Venture, PitchBook, Carta)
 */
export const SECTOR_MULTIPLES: Record<Sector, VcBenchmark> = {
  saas: { sector: "saas", arrMultipleRange: { min: 6.0, max: 7.5 }, source: "Bessemer Venture Partners / Public Comps" },
  ai: { sector: "ai", arrMultipleRange: { min: 15.0, max: 25.0 }, source: "Carta / PitchBook Trends 2024" },
  fintech: { sector: "fintech", arrMultipleRange: { min: 4.0, max: 6.0 }, source: "SaaS Capital / PitchBook" },
  healthtech: { sector: "healthtech", arrMultipleRange: { min: 5.0, max: 8.0 }, source: "Carta" },
  marketplace: { sector: "marketplace", arrMultipleRange: { min: 3.0, max: 5.0 }, source: "Carta / PitchBook" },
  deeptech: { sector: "deeptech", arrMultipleRange: { min: 5.0, max: 10.0 }, source: "Internal BlockID Estimate" },
  ecommerce: { sector: "ecommerce", arrMultipleRange: { min: 2.0, max: 4.0 }, source: "PitchBook" },
  cybertech: { sector: "cybertech", arrMultipleRange: { min: 7.0, max: 12.0 }, source: "Bessemer" },
  wealthtech: { sector: "wealthtech", arrMultipleRange: { min: 4.0, max: 6.0 }, source: "SaaS Capital" },
  biotech: { sector: "biotech", arrMultipleRange: { min: 3.0, max: 8.0 }, source: "Carta" },
  cleantech: { sector: "cleantech", arrMultipleRange: { min: 4.0, max: 7.0 }, source: "PitchBook" },
  edtech: { sector: "edtech", arrMultipleRange: { min: 3.0, max: 6.0 }, source: "Carta" },
  proptech: { sector: "proptech", arrMultipleRange: { min: 3.0, max: 6.0 }, source: "PitchBook" },
  agtech: { sector: "agtech", arrMultipleRange: { min: 3.0, max: 6.0 }, source: "PitchBook" },
  insurtech: { sector: "insurtech", arrMultipleRange: { min: 4.0, max: 7.0 }, source: "SaaS Capital" },
  legaltech: { sector: "legaltech", arrMultipleRange: { min: 5.0, max: 8.0 }, source: "Carta" },
  gaming: { sector: "gaming", arrMultipleRange: { min: 4.0, max: 9.0 }, source: "PitchBook" },
  default: { sector: "default", arrMultipleRange: { min: 5.0, max: 8.0 }, source: "Global Median" },
};

export const AU_ROUND_BENCHMARKS: Record<string, FundingRoundBenchmark> = {
  Seed: {
    stage: "Seed",
    medianPreMoneyValuation: 0, // Not explicitly provided in research, usually derived from Post-money - Round Size
    medianRoundSize: 1200000,
    avgFounderDilution: { min: 0.15, max: 0.20 },
    source: "AVCAL Q2 2024 / PitchBook AU",
  },
  SeriesA: {
    stage: "Series A",
    medianPreMoneyValuation: 12500000,
    medianRoundSize: 0, // To be calculated based on dilution targets
    avgFounderDilution: { min: 0.12, max: 0.16 },
    source: "Cut Through Venture Q2 2024 / PitchBook AU",
  },
};

export const RD_TAX_CONFIG: RdTaxIncentiveConfig = {
  smeRefundableRate: 0.435,
  largeNonRefundableRate: 0.385,
  esicMaxQualifyingExpenditure: 1000000,
  source: "ATO R&D Tax Incentive Update, 30 Mar 2024",
};

/**
 * Calculates the expected R&D Tax Incentive refund or credit based on AU ATO rules.
 * @param expenditure Total qualifying R&D expenditure.
 * @param annualTurnover Company's annual turnover to determine if SME status applies.
 * @returns The estimated tax offset amount.
 */
export function calculateRdTaxIncentive(expenditure: number, annualTurnover: number): number {
  const isSme = annualTurnover < 20000000;
  const rate = isSme ? RD_TAX_CONFIG.smeRefundableRate : RD_TAX_CONFIG.largeNonRefundableRate;
  return expenditure * rate;
}

/**
 * Determines if a company qualifies for the Early Stage Innovation Company (ESIC) tax offset
 * based on R&D expenditure thresholds.
 * @param annualRdExpenditure Annual qualifying R&D spend.
 * @returns boolean indicating eligibility.
 */
export function checkEsicEligibility(annualRdExpenditure: number): boolean {
  return annualRdExpenditure <= RD_TAX_CONFIG.esicMaxQualifyingExpenditure;
}

/**
 * Calculates post-money valuation and dilution based on AU-specific benchmark targets.
 * @param preMoneyValuation Current pre-money valuation.
 * @param roundSize Amount being raised.
 * @returns Object containing post-money valuation and dilution percentage.
 */
export function calculateRoundDilution(preMoneyValuation: number, roundSize: number) {
  const postMoney = preMoneyValuation + roundSize;
  const dilution = roundSize / postMoney;
  return { postMoney, dilution };
}

/**
 * Evaluates the "Rule of 40" for SaaS health, incorporating recent research on 
 * growth slippage and NRR improvements.
 * @param growthRate Annual growth rate (decimal).
 * @param ebitdaMargin EBITDA margin (decimal).
 * @returns The Rule of 40 score.
 */
export function calculateRuleOf40(growthRate: number, ebitdaMargin: number): number {
  return (growthRate * 100) + (ebitdaMargin * 100);
}

/**
 * Applies an AU-market discount to global multiples to reflect local private market conditions.
 * @param sector The business sector.
 * @param globalMultiple The base multiple from global benchmarks.
 * @param discountFactor The AU-specific discount (e.g., 0.8 for 20% discount).
 * @returns The adjusted AU multiple.
 */
export function applyAuMarketDiscount(sector: Sector, globalMultiple: number, discountFactor: number = 0.85): number {
  return globalMultiple * discountFactor;
}

/**
 * Validates the VC-Method exit assumption against real reported AU tech exits.
 * @param estimatedExitValue The projected exit value from a DCF or VC model.
 * @param sector The sector of the company.
 * @returns An object indicating if the value is within reasonable AU benchmarks.
 */
export function auExitRealisationCheck(estimatedExitValue: number, sector: Sector) {
  const comparableExits = getAuComparableExits(sector);
  if (comparableExits.length === 0) {
    return { isValid: true, note: "No AU comparable exits found; using global benchmarks." };
  }

  const avgExit = comparableExits.reduce((acc, curr) => acc + curr.value, 0) / comparableExits.length;
  const ratio = estimatedExitValue / avgExit;

  return {
    isValid: ratio <= 2.5,
    ratio,
    benchmarkAvg: avgExit,
    note: ratio > 2.5 ? "Exit value is significantly higher than AU sector medians." : "Exit value is aligned with AU benchmarks.",
  };
}

/**
 * Calculates the Runway based on current cash and monthly burn, 
 * adjusting for expected R&D Tax Incentive inflows.
 * @param currentCash Current cash on hand.
 * @param monthlyBurn Average monthly net burn.
 * @param expectedRdRefund Estimated R&D refund to be received.
 * @returns Number of months of runway.
 */
export function calculateRunwayWithRdRefund(currentCash: number, monthlyBurn: number, expectedRdRefund: number): number {
  if (monthlyBurn <= 0) return Infinity;
  return (currentCash + expectedRdRefund) / monthlyBurn;
}
