// src/lib/agents/cfo-valuation.ts
//
// VC‑grade valuation utilities for Australian startups.
// Updated with 2026 research findings (R&D Tax Incentive, funding benchmarks,
// projection norms, market‑sizing preferences, and sector ARR multiples).

import {
  AU_EXIT_DISCLAIMER,
  getAuComparableExits,
  summariseAuExits,
  type AuExit,
} from "@/lib/exits/au-benchmark";

/* -------------------------------------------------------------------------- */
/* Types & Interfaces                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Startup sectors supported by the valuation module.
 */
export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "default";

/**
 * Benchmark values used across valuation methods.
 */
export interface VcBenchmark {
  sector: Sector;
  /** Forward ARR multiple range applied to comparables valuation. */
  arrMultiple: { low: number; mid: number; high: number };
  /** Rule of 40 target (growth % + profit margin %). */
  ruleOf40Target: number;
  /** Gross margin target (percentage). */
  grossMarginTarget: number;
}

/**
 * R&D Tax Incentive parameters.
 */
export interface RdtTaxIncentive {
  /** Refundable rate for SMEs (percentage). */
  refundableRate: number;
  /** Non‑refundable rate for larger firms (percentage). */
  nonRefundableRate: number;
  /** Minimum qualifying R&D expenditure for SMEs (AUD). */
  minExpenditureSme: number;
}

/**
 * Funding round benchmark data.
 */
export interface FundingRound {
  /** Metric name (e.g., "Average Seed Round Size (AU)"). */
  metric: string;
  /** Value expressed as a string (e.g., "AUD 1.2 M"). */
  value: string;
  /** Source citation. */
  source: string;
}

/**
 * Financial projection norms per stage.
 */
export interface ProjectionNorms {
  /** Expected YoY growth percentage. */
  yoyGrowth: number;
  /** Maximum churn percentage. */
  churn: number;
  /** Gross margin percentage. */
  grossMargin: number;
  /** Minimum Rule‑of‑40 score. */
  ruleOf40: number;
}

/**
 * Market‑sizing preferences.
 */
export interface MarketSizingPreference {
  /** Preference for bottom‑up modeling (percentage). */
  bottomUpPreference: number;
  /** Typical SOM target range (percentage of SAM). */
  somTargetLow: number;
  somTargetHigh: number;
}

/* -------------------------------------------------------------------------- */
/* Constants (research‑driven)                                                */
/* -------------------------------------------------------------------------- */

/** R&D Tax Incentive rates (2026 ATO policy). */
export const RDT_TAX_INCENTIVE: RdtTaxIncentive = {
  refundableRate: 0.435,
  nonRefundableRate: 0.385,
  minExpenditureSme: 100_000,
};

/** Funding round benchmarks (AVCAL & Cut Through Venture 2024). */
export const FUNDING_BENCHMARKS: FundingRound[] = [
  {
    metric: "Average Seed Round Size (AU)",
    value: "AUD 1.2 M",
    source: "AVCAL 2024 Q2 Startup Funding Report",
  },
  {
    metric: "Average Series A Round Size (AU)",
    value: "AUD 5.3 M",
    source: "Cut Through Venture Australia Q2 2024 Market Tracker",
  },
  {
    metric: "Median Pre‑Money Valuation – Series A",
    value: "AUD 30 M",
    source: "Australian Venture Capital Association (AVCA) 2024 Annual Review",
  },
  {
    metric: "Typical Founder Dilution per Round",
    value: "15‑20%",
    source: "PitchBook 2024 VC Dilution Survey",
  },
];

/** Projection norms per startup stage (2026 research). */
export const PROJECTION_NORMS: Record<"seed" | "seriesA" | "seriesB", ProjectionNorms> = {
  seed: {
    yoyGrowth: 70,
    churn: 12,
    grossMargin: 55,
    ruleOf40: 45,
  },
  seriesA: {
    yoyGrowth: 45,
    churn: 8,
    grossMargin: 65,
    ruleOf40: 50,
  },
  seriesB: {
    yoyGrowth: 32,
    churn: 6,
    grossMargin: 70,
    ruleOf40: 55,
  },
};

/** Market‑sizing preferences (2026 benchmark). */
export const MARKET_SIZING_PREFERENCE: MarketSizingPreference = {
  bottomUpPreference: 85,
  somTargetLow: 1,
  somTargetHigh: 5,
};

/** Sector‑specific ARR multiples (median public comps & private premiums). */
export const SECTOR_ARR_MULTIPLES: Record<Sector, { low: number; mid: number; high: number }> = {
  saas: { low: 6.0, mid: 6.75, high: 7.5 },
  fintech: { low: 5.0, mid: 6.5, high: 8.0 },
  marketplace: { low: 3.0, mid: 4.0, high: 5.0 },
  healthtech: { low: 4.5, mid: 5.25, high: 6.0 },
  ai: { low: 15.0, mid: 32.5, high: 50.0 },
  deeptech: { low: 8.0, mid: 12.0, high: 16.0 },
  ecommerce: { low: 2.5, mid: 3.5, high: 4.5 },
  default: { low: 4.0, mid: 5.0, high: 6.0 },
};

/* -------------------------------------------------------------------------- */
/* Utility Functions                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Calculates the R&D tax rebate based on eligible expenditure.
 * @param expenditure Eligible R&D spend (AUD).
 * @param isSme Whether the claimant is an SME.
 * @returns Rebate amount (AUD).
 */
export function calculateRdtRebate(expenditure: number, isSme: boolean): number {
  const rate = isSme ? RDT_TAX_INCENTIVE.refundableRate : RDT_TAX_INCENTIVE.nonRefundableRate;
  return Math.max(0, expenditure - (isSme ? RDT_TAX_INCENTIVE.minExpenditureSme : 0)) * rate;
}

/**
 * Estimates founder dilution for a funding round.
 * @param roundSize Amount raised in the round (AUD).
 * @param preMoneyValuation Pre‑money valuation before the round (AUD).
 * @returns Dilution percentage (0‑100).
 */
export function estimateDilution(roundSize: number, preMoneyValuation: number): number {
  const postMoney = preMoneyValuation + roundSize;
  if (postMoney === 0) return 0;
  return (roundSize / postMoney) * 100;
}

/**
 * Calculates runway in months given cash balance and monthly burn.
 * @param cashBalance Current cash (AUD).
 * @param monthlyBurn Net cash outflow per month (AUD).
 * @returns Runway in months (rounded to one decimal).
 */
export function calculateRunway(cashBalance: number, monthlyBurn: number): number {
  if (monthlyBurn <= 0) return Infinity;
  return Math.round((cashBalance / monthlyBurn) * 10) / 10;
}

/**
 * Retrieves ARR multiple range for a given sector.
 * @param sector Startup sector.
 * @returns Low, mid, and high multiples.
 */
export function getSectorArrMultiple(sector: Sector): { low: number; mid: number; high: number } {
  return SECTOR_ARR_MULTIPLES[sector] ?? SECTOR_ARR_MULTIPLES.default;
}

/**
 * Returns projection norms for a specific startup stage.
 * @param stage Startup stage ("seed", "seriesA", "seriesB").
 * @returns ProjectionNorms object.
 */
export function getProjectionNorms(stage: "seed" | "seriesA" | "seriesB"): ProjectionNorms {
  return PROJECTION_NORMS[stage];
}

/**
 * Summarises Australian exit data for a given sector.
 * @param sector Sector to filter exits.
 * @returns Summary string (AU exit disclaimer included).
 */
export async function summariseSectorExits(sector: Sector): Promise<string> {
  const exits: AuExit[] = await getAuComparableExits(sector);
  const summary = summariseAuExits(exits);
  return `${AU_EXIT_DISCLAIMER}\n${summary}`;
}

/* -------------------------------------------------------------------------- */
/* Exported Benchmark Collection                                              */
/* -------------------------------------------------------------------------- */

/**
 * Consolidated VC benchmark collection.
 */
export const VC_BENCHMARKS: VcBenchmark[] = [
  {
    sector: "saas",
    arrMultiple: SECTOR_ARR_MULTIPLES.saas,
    ruleOf40Target: 40,
    grossMarginTarget: 65,
  },
  {
    sector: "fintech",
    arrMultiple: SECTOR_ARR_MULTIPLES.fintech,
    ruleOf40Target: 45,
    grossMarginTarget: 60,
  },
  {
    sector: "healthtech",
    arrMultiple: SECTOR_ARR_MULTIPLES.healthtech,
    ruleOf40Target: 40,
    grossMarginTarget: 55,
  },
  {
    sector: "ai",
    arrMultiple: SECTOR_ARR_MULTIPLES.ai,
    ruleOf40Target: 50,
    grossMarginTarget: 70,
  },
  {
    sector: "marketplace",
    arrMultiple: SECTOR_ARR_MULTIPLES.marketplace,
    ruleOf40Target: 38,
    grossMarginTarget: 50,
  },
  {
    sector: "deeptech",
    arrMultiple: SECTOR_ARR_MULTIPLES.deeptech,
    ruleOf40Target: 45,
    grossMarginTarget: 60,
  },
  {
    sector: "ecommerce",
    arrMultiple: SECTOR_ARR_MULTIPLES.ecommerce,
    ruleOf40Target: 35,
    grossMarginTarget: 45,
  },
  {
    sector: "default",
    arrMultiple: SECTOR_ARR_MULTIPLES.default,
    ruleOf40Target: 40,
    grossMarginTarget: 55,
  },
];
