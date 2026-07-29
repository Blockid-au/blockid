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
  /** Average dilution rate observed in this segment (0-1) */
  avgDilutionRate: number;
}

/** Content performance metrics based on 2025 B2B benchmarks */
export interface ContentBenchmark {
  /** Target word count for high ranking (B2B SEO Benchmark: 1900) */
  targetWordCount: number;
  /** Expected organic traffic lift from AI-assisted long-form content (Benchmark: 0.15) */
  aiTrafficLift: number;
  /** Expected LinkedIn organic CTR (Benchmark: 0.012) */
  linkedinCTR: number;
  /** EEAT score impact on CTR (Benchmark: 0.22) */
  eeatCTRBoost: number;
}

/** Australian Market Intelligence Constants (Updated 2026) */
export const AU_STARTUP_MARKET_DATA = {
  activeStartups: 7800,
  unicorns: 14,
  totalVCFundingH1_2026: 5200000000,
  seedStageMonthlyIntensity: 150000000,
  totalStartupEmploymentFTE: 210000,
  globalSaaSMarketSize: 4200000000,
  navigationToolsCAGR: 0.147,
};

/** SEO Risk Constants */
export const SEO_RISK_METRICS = {
  coreUpdateFrequencyPerYear: 2,
  avgTrafficDropHighRiskSites: 0.123,
  trafficDropVariance: 0.041,
};

/**
 * Calculates the projected market opportunity for BlockID in the AU region
 * @param penetrationRate Expected market penetration (0-1)
 * @param avgAnnualContractValue Average ACV in AUD
 * @returns Projected Annual Recurring Revenue
 */
export function calculateAUMarketOpportunity(penetrationRate: number, avgAnnualContractValue: number): number {
  return AU_STARTUP_MARKET_DATA.activeStartups * penetrationRate * avgAnnualContractValue;
}

/**
 * Estimates the organic traffic lift for a content piece based on length and AI usage
 * @param wordCount Length of the article
 * @param isAiAssisted Whether AI was used for long-form generation
 * @param hasHighEEAT Whether the content meets high E-E-A-T standards
 * @returns Estimated traffic multiplier
 */
export function estimateContentTrafficMultiplier(wordCount: number, isAiAssisted: boolean, hasHighEEAT: boolean): number {
  let multiplier = 1.0;
  if (wordCount >= 1500 && isAiAssisted) {
    multiplier += 0.15;
  }
  if (hasHighEEAT) {
    multiplier += 0.22;
  }
  return multiplier;
}

/**
 * Evaluates if a content piece meets the 2025 B2B SEO Gold Standard
 * @param wordCount Actual word count
 * @returns Boolean indicating if it meets top-ranking benchmarks
 */
export function isB2BSEOOptimized(wordCount: number): boolean {
  return wordCount >= 1900;
}

/**
 * calculates the risk of traffic loss following a Google Core Update
 * @param siteRiskProfile 'high' | 'medium' | 'low'
 * @returns Estimated traffic loss percentage
 */
export function calculateCoreUpdateRisk(siteRiskProfile: 'high' | 'medium' | 'low'): number {
  const baseDrop = SEO_RISK_METRICS.avgTrafficDropHighRiskSites;
  switch (siteRiskProfile) {
    case 'high': return baseDrop;
    case 'medium': return baseDrop * 0.5;
    case 'low': return baseDrop * 0.2;
    default: return 0;
  }
}

/**
 * Benchmarks BlockID's feature adoption against industry leaders (e.g., Carta/Pulley)
 * @param currentAdoption Actual adoption rate (0-1)
 * @param competitorAdoption Benchmark adoption rate (0-1)
 * @returns Gap analysis percentage
 */
export function analyzeFeatureAdoptionGap(currentAdoption: number, competitorAdoption: number): number {
  return ((competitorAdoption - currentAdoption) / competitorAdoption) * 100;
}

export const DEFAULT_CONTENT_BENCHMARKS: ContentBenchmark = {
  targetWordCount: 1900,
  aiTrafficLift: 0.15,
  linkedinCTR: 0.012,
  eeatCTRBoost: 0.22,
};
