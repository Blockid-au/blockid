/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module – Updated with 2024-2026 Australian market research
 * Focus: Positioning 'Startup Navigation System' vs Financial Utilities
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
  /** Whether the tool is positioned as a 'Navigation/Roadmap' system vs a 'Utility' (Strategic Multiple Impact) */
  isPositionedAsStrategicNavigation: boolean;
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
  /** Preference for roadmap/dilution planning over simple valuation (0-1) */
  roadmapPreferenceRate: number;
  /** Target Burn Multiple for this segment (Benchmark: < 1.5x) */
  targetBurnMultiple: number;
}

/**
 * Australian Market Benchmarks 2024-2026
 */
export const AU_MARKET_BENCHMARKS = {
  VALUATIONS: {
    /** Average Seed Stage Valuation (AU) - Range A$3M to A$7M */
    SEED_AVG_MIN: 3000000,
    SEED_AVG_MAX: 7000000,
    /** Typical discount rate applied to AU pre-revenue startups vs US counterpart (0.10 - 0.15) */
    AU_US_DISCOUNT_RATE: 0.125,
    /** Median Revenue Multiple for B2B SaaS AU (4x - 8x) */
    B2B_SAAS_MEDIAN_MULTIPLE_MIN: 4,
    B2B_SAAS_MEDIAN_MULTIPLE_MAX: 8,
    /** Strategic/Growth Tool Multiples (8x - 12x) */
    STRATEGIC_MULTIPLE_MIN: 8,
    STRATEGIC_MULTIPLE_MAX: 12,
    /** Financial Utility Multiples (4x - 6x) */
    UTILITY_MULTIPLE_MIN: 4,
    UTILITY_MULTIPLE_MAX: 6,
    /** Seed-stage AI startups Global/AU Multiples (15x - 25x) */
    AI_SEED_MULTIPLE_MIN: 15,
    AI_SEED_MULTIPLE_MAX: 25,
  },
  MARKETING: {
    /** Average B2B Content Marketing Conversion Rate (2.3% - 5.2%) */
    B2B_CONTENT_CONV_MIN: 0.023,
    B2B_CONTENT_CONV_MAX: 0.052,
    /** Organic CTR for Top 3 Search Results (Declining due to AI Overviews: 10% - 30%) */
    ORGANIC_CTR_MIN: 0.10,
    ORGANIC_CTR_MAX: 0.30,
    /** CPA reduction via Content vs Paid over 12 months (62% lower) */
    CONTENT_CPA_REDUCTION: 0.62,
    /** SGE/AI Overview Click-Through Rate Reduction (18% - 30%) */
    SGE_CTR_IMPACT_MIN: 0.18,
    SGE_CTR_IMPACT_MAX: 0.30,
    /** Gen Z preference for Social Discovery over Google (40%) */
    GENZ_SOCIAL_DISCOVERY_RATE: 0.40,
    /** Traffic Volatility Post-Core Update (15% - 25%) */
    CORE_UPDATE_VOLATILITY_MIN: 0.15,
    CORE_UPDATE_VOLATILITY_MAX: 0.25,
  },
  ECOSYSTEM: {
    /** VC Funding Volume Trend YoY (-20% to -30%) */
    VC_FUNDING_TREND_MIN: -0.30,
    VC_FUNDING_TREND_MAX: -0.20,
    /** Adoption rate of AI-assisted valuation tools among VCs (35% increase YoY) */
    VC_AI_TOOL_ADOPTION_INCREASE: 0.35,
  }
};

/**
 * Calculates the estimated valuation based on positioning (Strategic vs Utility)
 * Incorporates the finding that 'Navigation' tools command higher multiples.
 */
export function calculatePositioningValuation(arr: number, isStrategic: boolean, isAI: boolean = false): number {
  if (isAI) {
    return arr * ((AU_MARKET_BENCHMARKS.VALUATIONS.AI_SEED_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.AI_SEED_MULTIPLE_MAX) / 2);
  }
  
  const multiple = isStrategic 
    ? (AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MAX) / 2
    : (AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MAX) / 2;
    
  return arr * multiple;
}

/**
 * Forecasts the impact of SGE (Search Generative Experience) on top-of-funnel traffic
 */
export function forecastSGETrafficImpact(currentMonthlyClicks: number): { expectedClicks: number; potentialLoss: number } {
  const avgLoss = (AU_MARKET_BENCHMARKS.MARKETING.SGE_CTR_IMPACT_MIN + AU_MARKET_BENCHMARKS.MARKETING.SGE_CTR_IMPACT_MAX) / 2;
  const potentialLoss = currentMonthlyClicks * avgLoss;
  return {
    expectedClicks: currentMonthlyClicks - potentialLoss,
    potentialLoss: potentialLoss
  };
}

/**
 * Evaluates if a startup is within the healthy burn multiple range for AU B2B SaaS
 */
export function evaluateBurnHealth(netBurn: number, netNewARR: number): { isHealthy: boolean; burnMultiple: number } {
  const burnMultiple = netNewARR === 0 ? Infinity : netBurn / netNewARR;
  return {
    isHealthy: burnMultiple < 1.5,
    burnMultiple: burnMultiple
  };
}

/**
 * Calculates the content marketing ROI advantage over paid channels
 */
export function calculateContentCPASavings(paidCPA: number): number {
  return paidCPA * AU_MARKET_BENCHMARKS.MARKETING.CONTENT_CPA_REDUCTION;
}
