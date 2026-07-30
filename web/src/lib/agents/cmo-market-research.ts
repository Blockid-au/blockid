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
  /** Average dilution rate observed in this segment (%) */
  averageDilutionRate: number;
}

/** Market Intelligence Constants based on 2024-2026 Research */
export const AU_STARTUP_MARKET_DATA = {
  activeStartupsQ2_2024: 7800,
  startupEmploymentFTE_2026: 210000,
  totalVCFundingH1_2026: 5200000000, // AU$5.2 billion
  seedStageMonthlyIntensity: 150000000, // AU$150 million
  unicornCount_2026: 14,
  globalSaaSMarketSize_2024: 4200000000, // $4.2 billion
  navigationToolsCAGR_2024_2029: 0.147, // 14.7%
};

/** Content Performance Benchmarks based on 2025 Reports */
export const CONTENT_BENCHMARKS = {
  aiLongFormTrafficLift: 0.15, // 15% higher vs human-only
  topB2BPageAvgLength: 1900, // words
  linkedinOrganicCTR: 0.012, // 1.2%
  eeatCTRBoost: 0.22, // 22% higher for high E-E-A-T scores
};

/** SEO Risk and Stability Constants */
export const SEO_STABILITY_METRICS = {
  annualCoreUpdateFrequency: 2,
  highRiskTrafficDropAvg: 0.123, // 12.3%
  highRiskTrafficDropVariance: 0.041, // ±4.1%
};

/**
 * Calculates the projected market size for startup navigation tools
 * @param currentSize Current market size in USD
 * @param years Projection horizon in years
 * @returns Projected market size
 */
export function projectNavigationMarketSize(currentSize: number, years: number): number {
  return currentSize * Math.pow(1 + AU_STARTUP_MARKET_DATA.navigationToolsCAGR_2024_2029, years);
}

/**
 * Estimates the potential reach within the Australian startup ecosystem
 * @param segmentPenetration Target penetration rate (0-1)
 * @returns Estimated number of target companies
 */
export function estimateAUReach(segmentPenetration: number): number {
  return Math.floor(AU_STARTUP_MARKET_DATA.activeStartupsQ2_2024 * segmentPenetration);
}

/**
 * Calculates the expected traffic lift for a B2B content piece based on length and AI usage
 * @param wordCount Length of the content
 * @param isAIGenerated Whether AI was used for long-form structure
 * @param hasHighEEAT Whether the content meets high E-E-A-T standards
 * @returns Estimated traffic multiplier
 */
export function calculateExpectedTrafficLift(
  wordCount: number,
  isAIGenerated: boolean,
  hasHighEEAT: boolean
): number {
  let lift = 1.0;
  if (wordCount >= 1500 && isAIGenerated) {
    lift += CONTENT_BENCHMARKS.aiLongFormTrafficLift;
  }
  if (hasHighEEAT) {
    lift += CONTENT_BENCHMARKS.eeatCTRBoost;
  }
  return lift;
}

/**
 * Evaluates the risk level of a site's organic traffic based on recent Core Update data
 * @param currentTraffic Current monthly organic traffic
 * @param isHighRisk Whether the site falls into the 'high-risk' category (e.g., low E-E-A-T)
 * @returns Potential traffic loss during a core update
 */
export function evaluateCoreUpdateRisk(currentTraffic: number, isHighRisk: boolean): number {
  if (!isHighRisk) return 0;
  return currentTraffic * SEO_STABILITY_METRICS.highRiskTrafficDropAvg;
}

/**
 * Analyzes competitor capital feature adoption speed
 * @param earlyAdopters Number of companies that adopted in first 30 days
 * @param totalBase Total active customer base
 * @returns Adoption rate (0-1)
 */
export function calculateFeatureAdoptionRate(earlyAdopters: number, totalBase: number): number {
  return earlyAdopters / totalBase;
}
