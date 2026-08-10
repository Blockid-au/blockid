/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module – Updated with 2024‑2026 Australian market research
 */

export interface CompetitorProfile {
  /** Competitor company name */
  name: string;
  /** Competitor website URL */
  website: string;
  /** Competitor category */
  category: string;
  /** Competitor funding stage */
  fundingStage: string;
  /** Competitor estimated revenue */
  estimatedRevenue: string;
  /** Competitor strengths */
  strengths: string[];
  /** Competitor weaknesses */
  weaknesses: string[];
  /** Competitor market share (0‑1) */
  marketShare: number;
  /** Number of AI‑powered features */
  aiPoweredFeatures: number;
  /** Feature release frequency per quarter */
  featureReleaseFrequency: number;
  /** Adoption rate of cybersecurity features (0‑1) */
  cybersecurityFeatureAdoption: number;
  /** Data refresh latency in minutes (Industry Benchmark: 4.2m) */
  dataRefreshLatencyMinutes?: number;
  /** AI valuation accuracy percentage (Industry Benchmark: 92%) */
  aiValuationAccuracy?: number;
  /** Time to generate valuation report in minutes (Current Benchmark: < 5m) */
  reportGenerationTimeMinutes?: number;
  /** Support for dynamic equity tracking (Boolean) */
  hasDynamicEquityTracking?: boolean;
  /** Date of latest major capital/equity module release */
  latestCapitalModuleReleaseDate?: string;
  /** Early adopter adoption rate for new capital features (0‑1) */
  capitalFeatureAdoptionRate?: number;
}

/**
 * Customer segment definition
 */
export interface CustomerSegment {
  /** Segment name */
  name: string;
  /** Segment size (number of companies) */
  size: number;
  /** Willingness to pay */
  willingness: 'high' | 'medium' | 'low';
  /** Primary focus: 'domestic' | 'global' */
  marketFocus: 'domestic' | 'global';
  /** Percentage of this segment prioritizing AI adoption (0‑1) */
  aiPrioritizationRate: number;
  /** Average dilution rate observed in this segment (0‑1) */
  averageDilutionRate: number;
}

/**
 * Valuation benchmark data for Australian startups
 */
export const valuationBenchmarks = {
  preSeed: { min: 1_000_000, max: 3_000_000 },
  seed: { min: 3_000_000, max: 7_000_000 },
  saasMultipleCompression: { min: 4, max: 8 },
  medianRevenueMultiple: { min: 4, max: 7 },
  burnMultipleHealthy: 1.5,
  aiPremiumMultiplier: { min: 1.5, max: 2.5 },
} as const;

/**
 * Content‑marketing benchmark data
 */
export const contentMarketingBenchmarks = {
  conversionRate: { min: 0.021, max: 0.054 }, // 2.1%‑5.4%
  shortFormVideoEngagement: { min: 0.03, max: 0.07 }, // 3%‑7%
  genAIProductionReduction: 0.30, // 30% reduction
  editingCostIncrease: 0.20, // 20% increase
} as const;

/**
 * SEO benchmark data
 */
export const seoBenchmarks = {
  ctrDrop: { min: -0.25, max: -0.15 }, // -15% to -25%
  coreWebVitalsINPThresholdMs: 200,
  contentDecayDrop: { min: 0.30, max: 0.50 }, // 30%‑50%
} as const;

/**
 * Calculates a valuation range based on startup stage and optional ARR.
 * Applies SaaS multiple compression when ARR is supplied.
 *
 * @param stage Startup funding stage ('pre-seed' | 'seed')
 * @param arr Annual Recurring Revenue in AUD (optional)
 * @returns Minimum and maximum valuation in AUD
 */
export function estimateValuation(
  stage: 'pre-seed' | 'seed',
  arr?: number
): { min: number; max: number } {
  const base = stage === 'pre-seed' ? valuationBenchmarks.preSeed : valuationBenchmarks.seed;
  if (arr !== undefined) {
    const minMultiple = valuationBenchmarks.saasMultipleCompression.min;
    const maxMultiple = valuationBenchmarks.saasMultipleCompression.max;
    return {
      min: Math.round(arr * minMultiple),
      max: Math.round(arr * maxMultiple),
    };
  }
  return { min: base.min, max: base.max };
}

/**
 * Computes dilution percentage for a funding round.
 *
 * @param roundAmount Amount raised in the round (AUD)
 * @param preMoneyValuation Pre‑money valuation before the round (AUD)
 * @returns Dilution as a fraction (0‑1)
 */
export function calculateDilution(
  roundAmount: number,
  preMoneyValuation: number
): number {
  if (preMoneyValuation <= 0) return 0;
  return roundAmount / (preMoneyValuation + roundAmount);
}

/**
 * Estimates the number of conversions from traffic based on the appropriate benchmark.
 *
 * @param traffic Monthly website visitors
 * @param stage Funnel stage ('awareness' | 'consideration' | 'decision')
 * @returns Expected conversions
 */
export function estimateConversions(
  traffic: number,
  stage: 'awareness' | 'consideration' | 'decision'
): number {
  const rate = contentMarketingBenchmarks.conversionRate;
  const factor = stage === 'decision' ? rate.max : rate.min;
  return Math.round(traffic * factor);
}

/**
 * Adjusts organic traffic after a Core Update based on content decay benchmark.
 *
 * @param currentTraffic Current organic traffic volume
 * @param isAIGenerated Whether the content was primarily AI‑generated without human edit
 * @returns Adjusted traffic estimate
 */
export function adjustTrafficForCoreUpdate(
  currentTraffic: number,
  isAIGenerated: boolean
): number {
  const drop = isAIGenerated ? seoBenchmarks.contentDecayDrop.max : seoBenchmarks.contentDecayDrop.min;
  return Math.round(currentTraffic * (1 - drop));
}

/**
 * Returns the expected time to generate a valuation report based on competitor benchmarks.
 *
 * @param competitorFeatureCount Number of AI‑powered valuation features a competitor offers
 * @returns Estimated generation time in minutes
 */
export function valuationReportTime(competitorFeatureCount: number): number {
  const baseTime = 5; // minutes (benchmark <5)
  const reductionPerFeature = 0.3;
  const estimated = baseTime - competitorFeatureCount * reductionPerFeature;
  return Math.max(1, Math.round(estimated));
}

/**
 * Provides a snapshot of Australian startup ecosystem metrics.
 */
export const australianStartupMetrics = {
  averagePreSeedValuation: valuationBenchmarks.preSeed,
  averageSeedValuation: valuationBenchmarks.seed,
  medianRevenueMultiple: valuationBenchmarks.medianRevenueMultiple,
  healthyBurnMultiple: valuationBenchmarks.burnMultipleHealthy,
  aiPremiumMultiplier: valuationBenchmarks.aiPremiumMultiplier,
  founderToolAdoptionRate: 0.65, // 65% prefer integrated guidance
  typicalSeedDilution: { min: 0.15, max: 0.25 },
} as const;
