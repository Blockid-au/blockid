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
  /** Data refresh latency in minutes (Industry Benchmark: 4.2m) */
  dataRefreshLatencyMinutes?: number;
  /** AI valuation accuracy percentage (Industry Benchmark: 92%) */
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

/** AU-Specific Valuation Benchmarks (2024 Research) */
export const AU_STARTUP_BENCHMARKS = {
  SEED_VALUATION: {
    MIN: 4000000,
    MAX: 7000000,
    CURRENCY: 'AUD',
    STAGE: 'Post-money'
  },
  REVENUE_MULTIPLES: {
    MEDIAN_EARLY_STAGE: { MIN: 4, MAX: 8 },
    AI_PREMIUM_MULTIPLIER: 1.3
  },
  RUNWAY_REQUIREMENT_MONTHS: {
    MIN: 18,
    MAX: 24
  },
  CONTENT_CPL_AU_AVG: {
    MIN: 45,
    MAX: 120
  }
};

/** Content Marketing & SEO Performance Metrics (2024 Research) */
export const CONTENT_PERFORMANCE_METRICS = {
  B2B_BLOG_CONVERSION_RATE: { MIN: 0.021, MAX: 0.025 },
  SHORT_FORM_VIDEO_ENGAGEMENT: { MIN: 0.035, MAX: 0.050 },
  AI_TOOL_BUDGET_ALLOCATION: { MIN: 0.15, MAX: 0.25 },
  AI_OVERVIEW_CTR_REDUCTION: { MIN: 0.18, MAX: 0.25 },
  AI_CONTENT_TRAFFIC_VOLATILITY: { MIN: 0.30, MAX: 0.50 }
};

/** Valuation and Equity Calculation Module */
export class ValuationEngine {
  /**
   * Calculates estimated valuation based on AU SaaS benchmarks
   * @param arr Annual Recurring Revenue
   * @param isAiPowered Whether the product leverages AI for the premium multiplier
   */
  static calculateEstimatedValuation(arr: number, isAiPowered: boolean = false): number {
    const medianMultiple = (AU_STARTUP_BENCHMARKS.REVENUE_MULTIPLES.MEDIAN_EARLY_STAGE.MIN + AU_STARTUP_BENCHMARKS.REVENUE_MULTIPLES.MEDIAN_EARLY_STAGE.MAX) / 2;
    const multiplier = isAiPowered ? medianMultiple * AU_STARTUP_BENCHMARKS.REVENUE_MULTIPLES.AI_PREMIUM_MULTIPLIER : medianMultiple;
    return arr * multiplier;
  }

  /**
   * Estimates dilution reduction based on 'Navigation System' vs 'Pure Valuation' tool positioning
   * Research indicates reduction from 12% to 9%
   * @param currentDilution Current estimated dilution percentage (e.g., 0.12)
   * @param isUsingNavigationSystem Whether the founder uses a holistic navigation platform
   */
  static estimateDilutionOptimization(currentDilution: number, isUsingNavigationSystem: boolean): number {
    if (!isUsingNavigationSystem) return currentDilution;
    const reductionFactor = 0.09 / 0.12;
    return currentDilution * reductionFactor;
  }
}

/** Market Positioning and Messaging Utilities */
export class PositioningStrategy {
  /**
   * Generates messaging focus based on the 'Startup Navigation System' (Google Maps for Startups) framework
   * @param segment The target customer segment
   */
  static getMessagingFocus(segment: CustomerSegment): string[] {
    const coreValueProps = [
      'Road-mapping integration',
      'Real-time market intelligence',
      'Equity modelling'
    ];
    
    if (segment.aiPrioritizationRate > 0.7) {
      return [...coreValueProps, 'AI-driven valuation accuracy (92% benchmark)'];
    }
    return coreValueProps;
  }

  /**
   * Calculates the projected growth of the Analytics & Navigation SaaS market
   * @param currentMarketValue Market value in Billions USD
   * @param years Projection period
   */
  static projectNavigationMarketGrowth(currentMarketValue: number, years: number): number {
    const YOY_GROWTH_NAVIGATION = 0.22;
    return currentMarketValue * Math.pow(1 + YOY_GROWTH_NAVIGATION, years);
  }
}

/**
 * Validates if a competitor's performance is below industry standards
 * @param profile Competitor data
 * @returns Object containing boolean flags for underperformance
 */
export function evaluateCompetitorPerformance(profile: CompetitorProfile) {
  return {
    latencyIsHigh: (profile.dataRefreshLatencyMinutes ?? 0) > 4.2,
    valuationAccuracyIsLow: (profile.aiValuationAccuracy ?? 0) < 92,
    featureVelocityIsLow: profile.featureReleaseFrequency < 3
  };
}
