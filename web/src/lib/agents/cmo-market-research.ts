/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module
 * Focus: Startup Navigation System positioning, AU Market Intelligence, and Growth Benchmarks
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
  /** Adoption rate of cybersecurity features (0-1) */
  cybersecurityFeatureAdoption: number;
  /** Data refresh latency in minutes (Industry Benchmark: 4.2m) */
  dataRefreshLatencyMinutes?: number;
  /** AI valuation accuracy percentage (Industry Benchmark: 92%) */
  aiValuationAccuracy?: number;
  /** Time to generate valuation report in minutes (Current Benchmark: < 5m) */
  reportGenerationTimeMinutes?: number;
  /** Support for dynamic equity tracking (Boolean) */
  hasDynamicEquityTracking?: boolean;
}

/** Customer segment definition */
export interface CustomerSegment {
  /** Segment name */
  name: string;
  /** Segment size (number of companies) */
  size: number;
  /** Willingness to pay */
  willingness: 'high' | 'medium' | 'low';
  /** Primary focus: 'domestic' | 'global' */
  marketFocus: 'domestic' | 'global';
  /** Percentage of this segment prioritizing AI adoption (0-1) */
  aiPrioritizationRate: number;
  /** Average dilution rate observed in this segment (0-1) */
  avgDilutionRate?: number;
}

/** Market research overview */
export interface MarketResearch {
  /** Total Addressable Market (AU$) */
  tam: number;
  /** Serviceable Available Market (AU$) */
  sam: number;
  /** Serviceable Obtainable Market (AU$) */
  som: number;
  /** TAM data source */
  tamSource: string;
  /** Industry */
  industry: string;
  /** Region */
  region: string;
  /** Annual growth rate (0‑1) */
  growthRate: number;
  /** Competitor profiles */
  competitors: CompetitorProfile[];
}

/** AU Specific Valuation Benchmarks 2024 */
export const AU_STARTUP_BENCHMARKS = {
  seedValuation: { min: 4000000, max: 7000000, currency: 'AUD' },
  revenueMultiples: { min: 4, max: 8, metric: 'ARR' },
  aiPremiumMultiplier: 1.3,
  avgRunwayRequirementMonths: { min: 18, max: 24 },
};

/** Content Marketing & SEO Performance Benchmarks */
export const CONTENT_MARKETING_BENCHMARKS = {
  b2bBlogConversionRate: { min: 0.021, max: 0.025 },
  shortFormVideoEngagement: { min: 0.035, max: 0.050 },
  aiContentBudgetAllocation: { min: 0.15, max: 0.25 },
  auContentCPL: { min: 45, max: 120, currency: 'AUD' },
  aiOverviewCtrReduction: { min: 0.18, max: 0.25 },
  organicTrafficVolatilityIndex: { min: 0.30, max: 0.50 },
};

/**
 * Calculates the valuation of an AU SaaS startup based on current market benchmarks.
 * Incorporates the AI Premium Multiplier if the startup is AI-driven.
 * 
 * @param arr Annual Recurring Revenue
 * @param isAiDriven Whether the startup leverages core AI technology
 * @param multiple Custom multiple or uses median benchmark
 */
export function calculateAUStartupValuation(
  arr: number, 
  isAiDriven: boolean, 
  multiple?: number
): number {
  const medianMultiple = (AU_STARTUP_BENCHMARKS.revenueMultiples.min + AU_STARTUP_BENCHMARKS.revenueMultiples.max) / 2;
  const baseMultiple = multiple ?? medianMultiple;
  const multiplier = isAiDriven ? AU_STARTUP_BENCHMARKS.aiPremiumMultiplier : 1.0;
  
  return arr * baseMultiple * multiplier;
}

/**
 * Estimates the potential reduction in equity dilution when moving from a 
 * pure valuation tool to a 'Startup Navigation System' (Holistic Platform).
 * 
 * @param currentDilution Current average dilution rate (0-1)
 * @returns Predicted new dilution rate based on research findings (12% -> 9% trend)
 */
export function predictDilutionOptimization(currentDilution: number): number {
  const reductionFactor = 0.09 / 0.12;
  return currentDilution * reductionFactor;
}

/**
 * Calculates the AI-adjusted variance for valuation accuracy.
 * Based on 15-20% reduction in variance vs manual DCF.
 * 
 * @param manualVariance The variance observed in manual Discounted Cash Flow models
 * @returns The expected variance using AI-automated valuation
 */
export function calculateAiValuationVariance(manualVariance: number): number {
  const avgReduction = 0.175; // Midpoint of 15-20%
  return manualVariance * (1 - avgReduction);
}

/**
 * Evaluates the health of a content strategy based on SEO volatility and conversion benchmarks.
 * 
 * @param actualConversionRate Current blog conversion rate
 * @param trafficVolatility Current organic traffic volatility
 * @returns Health score (0-1)
 */
export function evaluateContentStrategyHealth(
  actualConversionRate: number, 
  trafficVolatility: number
): number {
  const targetConv = (CONTENT_MARKETING_BENCHMARKS.b2bBlogConversionRate.min + CONTENT_MARKETING_BENCHMARKS.b2bBlogConversionRate.max) / 2;
  const maxVol = CONTENT_MARKETING_BENCHMARKS.organicTrafficVolatilityIndex.max;
  
  const convScore = Math.min(actualConversionRate / targetConv, 1.2);
  const volScore = 1 - (trafficVolatility / maxVol);
  
  return (convScore + volScore) / 2;
}
