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

// ─── Public API consumed by cmo-market-research.test.ts (authoritative) ──
// Kept separate from the AU_MARKET_BENCHMARKS block above so intent stays
// clear: these anchors are pinned by the colocated test suite; edits must
// update the test in the same tick or the test-gate will revert them.

/** 2024–2026 Australian startup-ecosystem anchor set. Pinned by test suite. */
export const AU_MARKET_DATA = {
  ACTIVE_STARTUPS: 7800,
  TOTAL_VC_FUNDING_H1_2026: 2_400_000_000,
  UNICORN_COUNT: 14,
  // A$150M/month of seed capital flows into AU startups (2024–2026 avg).
  // Used as the denominator for calculateAUFundingVelocity.
  SEED_MONTHLY_FUNDING_INTENSITY: 150_000_000,
  TOTAL_STARTUP_EMPLOYMENT_FTE: 87_000,
  GLOBAL_SAAS_MARKET_SIZE_2024: 317_000_000_000,
  NAVIGATION_TOOL_CAGR: 0.147,
} as const;

/**
 * SEO / content-marketing benchmarks. Mutable so tests can force clamp edges.
 */
export const CONTENT_BENCHMARKS = {
  targetB2BBlogLength: 1900,
  aiContentTrafficLift: 0.45,
  linkedinOrganicCTR: 0.055,
  eeatCTRBoost: 0.12,
  coreUpdateRiskDrop: 0.123,
};

/** Compound the AU navigation-tool CAGR (14.7%) over `years`. */
export function calculateMarketProjection(currentVal: number, years: number): number {
  return currentVal * Math.pow(1 + AU_MARKET_DATA.NAVIGATION_TOOL_CAGR, years);
}

/** A page is competitive only when it clears BOTH the length and E-E-A-T gates. */
export function isContentCompetitive(wordCount: number, hasEEAT: boolean): boolean {
  return wordCount >= CONTENT_BENCHMARKS.targetB2BBlogLength && hasEEAT;
}

/**
 * Cohort funding velocity = per-startup raise / national monthly seed intensity.
 * Empty cohort surfaces as Infinity (div-by-zero); zero raise → 0.
 */
export function calculateAUFundingVelocity(totalRaised: number, cohortSize: number): number {
  const avgPerStartup = totalRaised / cohortSize;
  return avgPerStartup / AU_MARKET_DATA.SEED_MONTHLY_FUNDING_INTENSITY;
}

/**
 * Estimated post-core-update SEO risk in [0, 1].
 * Baseline = CONTENT_BENCHMARKS.coreUpdateRiskDrop. E-E-A-T > 0.8 shaves 0.05;
 * content older than 6 months (30-day months) adds 0.05. Result is clamped.
 */
export function calculateSEOUpdateRisk(eeat: number, lastUpdate: Date): number {
  let risk = CONTENT_BENCHMARKS.coreUpdateRiskDrop;
  if (eeat > 0.8) risk -= 0.05;
  const monthsSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsSinceUpdate > 6) risk += 0.05;
  return Math.max(0, Math.min(1, risk));
}
