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
  /** Date of latest major capital/equity module release */
  latestCapitalModuleReleaseDate?: string;
  /** Early adopter adoption rate for new capital features (0-1) */
  capitalFeatureAdoptionRate?: number;
  /** Percentage of features utilizing AI-assisted automation (Research Trend: ~65%) */
  aiIntegrationRate?: number;
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
  avgDilutionRate: number;
  /** Percentage of employees reporting equity value clarity (Research Baseline: 60%) */
  equityClarityRate: number;
}

/** Australian Market Valuation Benchmarks 2024 */
export const AU_MARKET_BENCHMARKS = {
  PRE_SEED: {
    MIN_VALUATION: 1000000,
    MAX_VALUATION: 3000000,
    CURRENCY: 'AUD',
  },
  SEED: {
    MIN_VALUATION: 4000000,
    MAX_VALUATION: 7000000,
    CURRENCY: 'AUD',
  },
  SAAS_MULTIPLES: {
    MIN_ARR_MULTIPLE: 4,
    MAX_ARR_MULTIPLE: 8,
    HISTORICAL_PEAK: 10,
  },
  AI_PREMIUM: {
    MIN_VALUATION_INCREASE: 0.20,
    MAX_VALUATION_INCREASE: 0.40,
  },
  REGIONAL_DISCOUNT: {
    AU_VS_US_PRE_REVENUE: 0.20,
    AU_VS_US_MAX_DISCOUNT: 0.30,
  },
  HEALTHY_SEED: {
    MAX_BURN_MULTIPLE: 1.5,
  },
};

/** Content Marketing & SEO Benchmarks 2024 */
export const GROWTH_BENCHMARKS = {
  B2B_CONVERSION: {
    MIN_RATE: 0.021,
    MAX_RATE: 0.035,
  },
  MID_MARKET_SPEND: {
    MIN_MONTHLY_AUD: 5000,
    MAX_MONTHLY_AUD: 15000,
  },
  AI_DISRUPTION: {
    HOW_TO_TRAFFIC_DECLINE_MIN: 0.15,
    HOW_TO_TRAFFIC_DECLINE_MAX: 0.30,
    SGE_CTR_DECREASE_MIN: 0.15,
    SGE_CTR_DECREASE_MAX: 0.25,
    LOW_QUALITY_CONTENT_REDUCTION: 0.40,
  },
  MESSAGING_LIFT: {
    GROWTH_ROADMAP_VS_EQUITY_TOOLS: 2.5,
    VIDEO_ENGAGEMENT_LIFT: 2.5,
  },
};

/**
 * Calculates the estimated AU valuation for a startup based on 2024 benchmarks.
 * @param arr Annual Recurring Revenue
 * @param isAiDriven Whether the startup has an AI-driven core
 * @param isPreRevenue Whether the startup is pre-revenue
 * @returns Calculated valuation in AUD
 */
export function calculateAUValuation(
  arr: number,
  isAiDriven: boolean,
  isPreRevenue: boolean
): number {
  if (isPreRevenue) {
    const base = (AU_MARKET_BENCHMARKS.PRE_SEED.MIN_VALUATION + AU_MARKET_BENCHMARKS.PRE_SEED.MAX_VALUATION) / 2;
    const aiPremium = isAiDriven ? (1 + (AU_MARKET_BENCHMARKS.AI_PREMIUM.MIN_VALUATION_INCREASE + AU_MARKET_BENCHMARKS.AI_PREMIUM.MAX_VALUATION_INCREASE) / 2) : 1;
    return base * aiPremium;
  }

  const avgMultiple = (AU_MARKET_BENCHMARKS.SAAS_MULTIPLES.MIN_ARR_MULTIPLE + AU_MARKET_BENCHMARKS.SAAS_MULTIPLES.MAX_ARR_MULTIPLE) / 2;
  let valuation = arr * avgMultiple;

  if (isAiDriven) {
    const aiPremium = (AU_MARKET_BENCHMARKS.AI_PREMIUM.MIN_VALUATION_INCREASE + AU_MARKET_BENCHMARKS.AI_PREMIUM.MAX_VALUATION_INCREASE) / 2;
    valuation *= (1 + aiPremium);
  }

  return valuation;
}

/**
 * Estimates the potential impact of AI-driven SEO updates on organic traffic.
 * @param currentTraffic Monthly organic traffic
 * @param contentPercentage Percentage of content that is 'How-to' or informational
 * @returns Estimated traffic after AI-impact (SGE/Core Updates)
 */
export function estimateTrafficDecline(currentTraffic: number, contentPercentage: number): number {
  const avgDecline = (GROWTH_BENCHMARKS.AI_DISRUPTION.HOW_TO_TRAFFIC_DECLINE_MIN + GROWTH_BENCHMARKS.AI_DISRUPTION.HOW_TO_TRAFFIC_DECLINE_MAX) / 2;
  const informationalTraffic = currentTraffic * contentPercentage;
  const remainingInformational = informationalTraffic * (1 - avgDecline);
  const stableTraffic = currentTraffic * (1 - contentPercentage);
  
  return stableTraffic + remainingInformational;
}

/**
 * Validates if a seed stage startup's burn multiple is within healthy AU benchmarks.
 * @param netBurn Monthly net burn
 * @param netNewARR Monthly net new ARR
 * @returns Boolean indicating if the burn multiple is healthy
 */
export function isBurnMultipleHealthy(netBurn: number, netNewARR: number): boolean {
  if (netNewARR === 0) return false;
  const burnMultiple = netBurn / netNewARR;
  return burnMultiple <= AU_MARKET_BENCHMARKS.HEALTHY_SEED.MAX_BURN_MULTIPLE;
}

/**
 * Calculates the 'Equity Value Gap' based on employee clarity research.
 * @param totalEmployees Total number of employees with equity
 * @param clarityRate Current reported clarity rate (0-1)
 * @returns Number of employees likely experiencing a lack of clarity
 */
export function calculateEquityClarityGap(totalEmployees: number, clarityRate: number): number {
  const researchBaseline = 0.60; // 40% gap from research
  const effectiveClarity = Math.min(clarityRate, researchBaseline);
  return Math.round(totalEmployees * (1 - effectiveClarity));
}
