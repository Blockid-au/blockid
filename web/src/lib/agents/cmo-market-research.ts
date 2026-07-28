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
  /** Current growth rate (CAGR) */
  cagr: number;
  /** Number of active startups in target region */
  activeStartupCount: number;
  /** Total VC funding in current period (AU$) */
  totalVCFunding: number;
  /** Average seed-stage monthly funding intensity (AU$) */
  seedFundingIntensity: number;
  /** Number of unicorns in the region */
  unicornCount: number;
  /** Total startup employment (FTEs) */
  totalStartupEmployment: number;
}

/** Content and SEO Benchmarks based on 2025/2026 research */
export interface ContentBenchmarks {
  /** Target length for B2B top-ranking pages (words) */
  targetB2BBlogLength: number;
  /** Expected organic traffic lift from AI-generated long-form content (multiplier) */
  aiContentTrafficLift: number;
  /** Average LinkedIn organic post CTR (0-1) */
  linkedinOrganicCTR: number;
  /** Average organic traffic drop after Core Update for high-risk sites (0-1) */
  coreUpdateTrafficRisk: number;
  /** CTR increase for high E-E-A-T score pages (multiplier) */
  eeatCtrMultiplier: number;
}

/** Constants based on latest market research findings */
export const AU_STARTUP_MARKET_DATA: MarketResearch = {
  tam: 4200000000, // Global context converted/aligned to platform scale
  sam: 5200000000, // Based on H1 2026 VC Funding
  som: 150000000, // Based on Seed-stage monthly intensity
  cagr: 0.147, // 14.7% CAGR for navigation tools
  activeStartupCount: 7800, // Q2 2024 baseline
  totalVCFunding: 5200000000, // AU$5.2B (H1 2026)
  seedFundingIntensity: 150000000, // AU$150M monthly
  unicornCount: 14, // Startup Genome 2026
  totalStartupEmployment: 210000, // Q2 2026 FTEs
};

export const GLOBAL_CONTENT_BENCHMARKS: ContentBenchmarks = {
  targetB2BBlogLength: 1900,
  aiContentTrafficLift: 1.15, // 15% higher
  linkedinOrganicCTR: 0.012, // 1.2%
  coreUpdateTrafficRisk: 0.123, // 12.3% drop
  eeatCtrMultiplier: 1.22, // 22% higher
};

/**
 * Calculates the projected organic traffic lift if switching to 
 * AI-generated long-form content (>=1500 words) based on 2025 benchmarks.
 * @param currentTraffic Current monthly organic traffic
 * @returns Projected organic traffic
 */
export function calculateAIContentLift(currentTraffic: number): number {
  return currentTraffic * GLOBAL_CONTENT_BENCHMARKS.aiContentTrafficLift;
}

/**
 * Estimates the impact of E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) 
 * improvements on the Click-Through Rate.
 * @param currentCTR Current organic CTR (0-1)
 * @returns Improved CTR (0-1)
 */
export function estimateEEATImpact(currentCTR: number): number {
  return currentCTR * GLOBAL_CONTENT_BENCHMARKS.eeatCtrMultiplier;
}

/**
 * Calculates the potential market penetration based on AU startup employment.
 * @param targetFtePercentage Percentage of startup FTEs targeted as users (0-1)
 * @returns Estimated number of target users
 */
export function calculateUserBasePotential(targetFtePercentage: number): number {
  return AU_STARTUP_MARKET_DATA.totalStartupEmployment * targetFtePercentage;
}

/**
 * Evaluates the risk of traffic loss during a Google Core Update.
 * @param currentTraffic Current monthly organic traffic
 * @param isHighRisk Whether the site is categorized as high-risk
 * @returns Projected traffic after update
 */
export function projectCoreUpdateImpact(currentTraffic: number, isHighRisk: boolean): number {
  if (!isHighRisk) return currentTraffic;
  return currentTraffic * (1 - GLOBAL_CONTENT_BENCHMARKS.coreUpdateTrafficRisk);
}
