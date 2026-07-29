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

/** Marketing Content Benchmarks for 2025-2026 */
export interface ContentBenchmarks {
  /** Target length for B2B SEO dominance (Words) */
  targetB2BBlogLength: number;
  /** Expected organic traffic lift for AI-generated long-form content (Ratio) */
  aiContentTrafficLift: number;
  /** Average LinkedIn organic CTR (Ratio) */
  linkedinOrganicCTR: number;
  /** Impact of high E-E-A-T scores on CTR (Ratio) */
  eeatCTRBoost: number;
  /** Average organic traffic drop for high-risk sites after Core Update (Ratio) */
  coreUpdateRiskDrop: number;
}

/** Australian Startup Market Constants (Updated 2026) */
export const AU_MARKET_DATA = {
  ACTIVE_STARTUPS: 7800,
  TOTAL_VC_FUNDING_H1_2026: 5200000000,
  UNICORN_COUNT: 14,
  SEED_MONTHLY_FUNDING_INTENSITY: 150000000,
  TOTAL_STARTUP_EMPLOYMENT_FTE: 210000,
  GLOBAL_SAAS_MARKET_SIZE_2024: 4200000000,
  NAVIGATION_TOOL_CAGR: 0.147,
};

/** Current Content Performance Benchmarks */
export const CONTENT_BENCHMARKS: ContentBenchmarks = {
  targetB2BBlogLength: 1900,
  aiContentTrafficLift: 0.15,
  linkedinOrganicCTR: 0.012,
  eeatCTRBoost: 0.22,
  coreUpdateRiskDrop: 0.123,
};

/**
 * Calculates the projected market size for startup navigation tools in AU
 * based on global CAGR and local startup density.
 * 
 * @param currentVal - Current estimated market value
 * @param years - Projection period
 * @returns Projected market value
 */
export function calculateMarketProjection(currentVal: number, years: number): number {
  return currentVal * Math.pow(1 + AU_MARKET_DATA.NAVIGATION_TOOL_CAGR, years);
}

/**
 * Evaluates if a piece of content meets the current B2B SEO "Power Page" criteria
 * based on 2025 research findings.
 * 
 * @param wordCount - Length of the content
 * @param hasEEATSignals - Whether the content includes expert citations/authoritative data
 * @returns Boolean indicating if content is optimized for top rankings
 */
export function isContentCompetitive(wordCount: number, hasEEATSignals: boolean): boolean {
  return wordCount >= CONTENT_BENCHMARKS.targetB2BBlogLength && hasEEATSignals;
}

/**
 * Calculates the estimated "Funding Velocity" for the AU seed stage
 * 
 * @param totalRaised - Total amount raised by a cohort
 * @param cohortSize - Number of startups in the cohort
 * @returns Average funding per startup relative to monthly intensity
 */
export function calculateAUFundingVelocity(totalRaised: number, cohortSize: number): number {
  const avgPerStartup = totalRaised / cohortSize;
  return avgPerStartup / AU_MARKET_DATA.SEED_MONTHLY_FUNDING_INTENSITY;
}

/**
 * Determines the "Risk Score" of a domain based on core update frequency and E-E-A-T
 * 
 * @param eeatScore - Normalized E-E-A-T score (0-1)
 * @param lastUpdateDate - Date of last major content overhaul
 * @returns Risk percentage (0-1)
 */
export function calculateSEOUpdateRisk(eeatScore: number, lastUpdateDate: Date): number {
  const now = new Date();
  const monthsSinceUpdate = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  
  let risk = CONTENT_BENCHMARKS.coreUpdateRiskDrop;
  if (eeatScore > 0.8) risk -= 0.05;
  if (monthsSinceUpdate > 6) risk += 0.05;
  
  return Math.max(0, Math.min(1, risk));
}
