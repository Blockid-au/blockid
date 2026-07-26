/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module
 * Focus: Startup Navigation System positioning and AU Market Intelligence
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
  /** Data refresh latency in minutes (Benchmark: 4.2m) */
  dataRefreshLatencyMinutes?: number;
  /** AI valuation accuracy percentage (Benchmark: 92%) */
  aiValuationAccuracy?: number;
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
  /** Market trends */
  trends: string[];
}

/** AU Market Benchmarks based on 2024 Research */
export const AU_STARTUP_BENCHMARKS = {
  VALUATION: {
    SEED_POST_MONEY_MIN: 4000000,
    SEED_POST_MONEY_MAX: 7000000,
    MEDIAN_REVENUE_MULTIPLE_MIN: 4,
    MEDIAN_REVENUE_MULTIPLE_MAX: 8,
    AI_PREMIUM_MULTIPLIER: 1.3,
  },
  OPERATIONAL: {
    AVG_RUNWAY_REQUIREMENT_MONTHS: 21,
    NEW_COMPANY_RECORD_VELOCITY_MONTHLY: 5200,
  },
  MARKETING: {
    B2B_BLOG_CONVERSION_RATE_MIN: 0.021,
    B2B_BLOG_CONVERSION_RATE_MAX: 0.025,
    SHORT_FORM_VIDEO_ENGAGEMENT_MIN: 0.035,
    SHORT_FORM_VIDEO_ENGAGEMENT_MAX: 0.05,
    AI_CONTENT_BUDGET_ALLOCATION_MIN: 0.15,
    AI_CONTENT_BUDGET_ALLOCATION_MAX: 0.25,
    AU_CONTENT_CPL_MIN: 45,
    AU_CONTENT_CPL_MAX: 120,
  },
  SEO: {
    AI_OVERVIEW_CTR_REDUCTION_MIN: 0.18,
    AI_OVERVIEW_CTR_REDUCTION_MAX: 0.25,
    AI_CONTENT_VOLATILITY_MIN: 0.3,
    AI_CONTENT_VOLATILITY_MAX: 0.5,
  }
};

/** Positioning Metrics for 'Startup Navigation System' */
export interface NavigationSystemMetrics {
  /** Target reduction in founder dilution (from 12% to 9%) */
  targetDilutionReduction: number;
  /** Global market growth rate for Navigation SaaS (22%) */
  navigationSaaSGrowthRate: number;
  /** Traditional valuation tool growth rate (13%) */
  valuationToolGrowthRate: number;
  /** Projected global market size by 2028 (USD 4.1B) */
  projectedMarketSize2028USD: number;
}

export const NAVIGATION_POSITIONING_DATA: NavigationSystemMetrics = {
  targetDilutionReduction: 0.03,
  navigationSaaSGrowthRate: 0.22,
  valuationToolGrowthRate: 0.13,
  projectedMarketSize2028USD: 4100000000,
};

/**
 * Calculates the estimated valuation for an AU SaaS startup 
 * incorporating the AI Premium Multiplier.
 * @param arr Annual Recurring Revenue
 * @param hasAI Whether the company has core AI integration
 * @returns Estimated Valuation in AU$
 */
export function calculateAUValuation(arr: number, hasAI: boolean): number {
  const medianMultiple = (AU_STARTUP_BENCHMARKS.VALUATION.MEDIAN_REVENUE_MULTIPLE_MIN + AU_STARTUP_BENCHMARKS.VALUATION.MEDIAN_REVENUE_MULTIPLE_MAX) / 2;
  const baseValuation = arr * medianMultiple;
  return hasAI ? baseValuation * AU_STARTUP_BENCHMARKS.VALUATION.AI_PREMIUM_MULTIPLIER : baseValuation;
}

/**
 * Calculates the expected Cost Per Lead (CPL) for a content campaign in the AU market.
 * @param leadVolume Target number of leads
 * @returns Estimated total spend range [min, max]
 */
export function estimateAUContentSpend(leadVolume: number): [number, number] {
  const minSpend = leadVolume * AU_STARTUP_BENCHMARKS.MARKETING.AU_CONTENT_CPL_MIN;
  const maxSpend = leadVolume * AU_STARTUP_BENCHMARKS.MARKETING.AU_CONTENT_CPL_MAX;
  return [minSpend, maxSpend];
}

/**
 * Estimates the impact of AI Overviews on organic traffic CTR.
 * @param currentCTR The current click-through rate (0-1)
 * @returns The adjusted CTR after AI Overview impact
 */
export function estimateAIOverviewImpact(currentCTR: number): number {
  const avgReduction = (AU_STARTUP_BENCHMARKS.SEO.AI_OVERVIEW_CTR_REDUCTION_MIN + AU_STARTUP_BENCHMARKS.SEO.AI_OVERVIEW_CTR_REDUCTION_MAX) / 2;
  return currentCTR * (1 - avgReduction);
}

/**
 * Evaluates if a competitor's performance is below the industry benchmark.
 * @param profile The competitor profile to evaluate
 * @returns An object identifying benchmark gaps
 */
export function evaluateCompetitorGaps(profile: CompetitorProfile) {
  return {
    latencyGap: (profile.dataRefreshLatencyMinutes || 0) > 4.2,
    accuracyGap: (profile.aiValuationAccuracy || 0) < 92,
    isUnderperforming: (profile.dataRefreshLatencyMinutes || 0) > 4.2 || (profile.aiValuationAccuracy || 0) < 92,
  };
}
