/**
 * src/lib/agents/cfo-valuation.ts
 * 
 * CFO domain module — VC-grade startup valuation methodology + research basis.
 * Improved with 2026 AU-specific funding benchmarks and global SaaS metrics.
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
  medianMultiple: number;
  multipleRange: [number, number];
  source: string;
  premiumFactor?: number;
}

export interface AuMarketBenchmarks {
  preSeedValuation: [number, number];
  seedValuation: [number, number];
  avgSeedRoundSize: [number, number];
  targetRunwayMonths: [number, number];
  rdtiRefundRate: number;
  esicOffset: number;
  marketSizeDiscount: number;
}

/**
 * Latest research-backed AU Market Benchmarks (2024-2026)
 * Sources: AVCAL, Cut Through Venture, ATO, AusIndustry
 */
export const AU_MARKET_DATA: AuMarketBenchmarks = {
  preSeedValuation: [1500000, 3000000],
  seedValuation: [4000000, 8000000],
  avgSeedRoundSize: [1000000, 3000000],
  targetRunwayMonths: [18, 24],
  rdtiRefundRate: 0.435,
  esicOffset: 0.20,
  marketSizeDiscount: 0.20, // 20% avg discount for lack of bottom-up validation
};

/**
 * Sector Multiples based on Bessemer, Carta, and PitchBook 2024/25
 */
export const SECTOR_MULTIPLES: Record<Sector, VcBenchmark> = {
  saas: { sector: "saas", medianMultiple: 6.75, multipleRange: [6.0, 7.5], source: "Bessemer Venture Partners" },
  ai: { sector: "ai", medianMultiple: 16.0, multipleRange: [12.0, 20.0], source: "Carta / PitchBook", premiumFactor: 1.5 },
  fintech: { sector: "fintech", medianMultiple: 5.25, multipleRange: [4.5, 6.0], source: "SaaS Capital / PitchBook" },
  marketplace: { sector: "marketplace", medianMultiple: 4.0, multipleRange: [3.0, 5.0], source: "PitchBook" },
  healthtech: { sector: "healthtech", medianMultiple: 6.5, multipleRange: [5.0, 8.0], source: "Digital Health Benchmarks" },
  deeptech: { sector: "deeptech", medianMultiple: 8.0, multipleRange: [6.0, 12.0], source: "Internal BlockID / Industry" },
  ecommerce: { sector: "ecommerce", medianMultiple: 2.5, multipleRange: [1.5, 4.0], source: "Public Comps" },
  cybertech: { sector: "cybertech", medianMultiple: 7.0, multipleRange: [6.0, 9.0], source: "Bessemer" },
  wealthtech: { sector: "wealthtech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "PitchBook" },
  biotech: { sector: "biotech", medianMultiple: 10.0, multipleRange: [5.0, 25.0], source: "Biotech VC Index" },
  cleantech: { sector: "cleantech", medianMultiple: 6.0, multipleRange: [4.0, 10.0], source: "Clean Energy VC" },
  edtech: { sector: "edtech", medianMultiple: 4.0, multipleRange: [3.0, 6.0], source: "SaaS Capital" },
  proptech: { sector: "proptech", medianMultiple: 4.5, multipleRange: [3.5, 6.0], source: "PitchBook" },
  agtech: { sector: "agtech", medianMultiple: 4.0, multipleRange: [3.0, 5.0], source: "AgTech Global" },
  insurtech: { sector: "insurtech", medianMultiple: 5.0, multipleRange: [4.0, 7.0], source: "SaaS Capital" },
  legaltech: { sector: "legaltech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "PitchBook" },
  gaming: { sector: "gaming", medianMultiple: 6.0, multipleRange: [4.0, 10.0], source: "Gaming Industry Benchmarks" },
  default: { sector: "default", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "Generalist VC" },
};

export interface UnitEconomics {
  cac: number;
  ltv: number;
  churnRate: number;
  nrr: number;
  grossMargin: number;
  burnMultiple: number;
}

/**
 * Calculates the "Rule of 40" health score.
 * Rule of 40 = Growth Rate (%) + Profit Margin (%)
 */
export function calculateRuleOf40(growthRate: number, profitMargin: number): number {
  return growthRate + profitMargin;
}

/**
 * Evaluates unit economics against global SaaS benchmarks (ChartMogul/Bessemer).
 * Returns a health assessment for each metric.
 */
export function evaluateUnitEconomics(metrics: UnitEconomics) {
  const ltvCacRatio = metrics.ltv / metrics.cac;
  const cacPaybackMonths = (metrics.cac / (metrics.ltv * metrics.churnRate)) || 0;

  return {
    ltvCacStatus: ltvCacRatio >= 3 ? "Strong" : ltvCacRatio >= 1 ? "Moderate" : "Weak",
    nrrStatus: metrics.nrr >= 1.2 ? "World Class" : metrics.nrr >= 1.0 ? "Good" : "At Risk",
    burnMultipleStatus: metrics.burnMultiple < 1.5 ? "Efficient" : "High Burn",
    grossMarginStatus: metrics.grossMargin >= 0.78 ? "Healthy" : "Below Median",
    metrics: { ltvCacRatio, cacPaybackMonths },
  };
}

/**
 * Calculates the potential cash injection from the R&D Tax Incentive (RDTI).
 * Specifically for early-stage AU companies with refundable offsets.
 */
export function calculateRdtiBenefit(eligibleExpenditure: number): number {
  return eligibleExpenditure * AU_MARKET_DATA.rdtiRefundRate;
}

/**
 * Applies a valuation discount if the market sizing methodology is top-down.
 * Research indicates a 15-25% reduction for GTMs lacking bottom-up validation.
 */
export function applyMarketSizingDiscount(valuation: number, isBottomUp: boolean): number {
  if (isBottomUp) return valuation;
  return valuation * (1 - AU_MARKET_DATA.marketSizeDiscount);
}

/**
 * Calculates Post-Money Valuation and Dilution for a funding round.
 */
export function calculateRoundDynamics(preMoneyValuation: number, investmentAmount: number) {
  const postMoneyValuation = preMoneyValuation + investmentAmount;
  const dilution = investmentAmount / postMoneyValuation;
  return {
    postMoneyValuation,
    dilution,
    equityGiven: dilution * 100,
  };
}

/**
 * VC Method Valuation: Estimates current valuation based on target exit price.
 */
export function calculateVcMethodValuation(
  expectedExitValue: number, 
  targetReturnMultiple: number, 
  dilutionExpected: number = 0.25
): number {
  const postMoneyValuation = expectedExitValue / targetReturnMultiple;
  const preMoneyValuation = postMoneyValuation * (1 - dilutionExpected);
  return preMoneyValuation;
}

/**
 * Berkus Method: For pre-revenue startups.
 * Assigns value to key risk-mitigation milestones.
 */
export function calculateBerkusValuation(
  hasSoundIdea: boolean,
  hasPrototype: boolean,
  hasQualityTeam: boolean,
  hasStrategicRelationships: boolean,
  hasProductLaunch: boolean
): number {
  const valuePerMilestone = 500000; // Standard Berkus unit for early AU stage
  let total = 0;
  if (hasSoundIdea) total += valuePerMilestone;
  if (hasPrototype) total += valuePerMilestone;
  if (hasQualityTeam) total += valuePerMilestone;
  if (hasStrategicRelationships) total += valuePerMilestone;
  if (hasProductLaunch) total += valuePerMilestone;
  return total;
}

/**
 * Anchors the valuation against AU-specific exit data to prevent "valuation drift".
 */
export async function auExitRealisationCheck(
  sector: Sector, 
  proposedValuation: number
): Promise<{ isRealistic: boolean; suggestion: string }> {
  const exits = await getAuComparableExits(sector);
  const summary = summariseAuExits(exits);
  
  if (!summary.medianExitValue) {
    return { isRealistic: true, suggestion: "Insufficient AU exit data for a hard check." };
  }

  const ratio = proposedValuation / summary.medianExitValue;
  
  if (ratio > 0.5) {
    return { 
      isRealistic: false, 
      suggestion: `Proposed valuation is ${Math.round(ratio * 100)}% of median AU exit for ${sector}. This may be overly optimistic for the local market.` 
    };
  }

  return { isRealistic: true, suggestion: "Valuation aligns with AU exit benchmarks." };
}
