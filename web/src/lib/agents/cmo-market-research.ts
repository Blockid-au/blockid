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
  marketTrends: string[];
  /** Customer segments */
  customerSegments: CustomerSegment[];
  /** Average Series A funding round size in Australia (AU$) */
  averageSeriesAFunding: number;
  /** Number of Australian unicorns */
  australianUnicorns: number;
}

/** Content Marketing Benchmarks based on 2023 research */
export interface ContentBenchmarks {
  /** Average % of overall marketing budget allocated to content */
  budgetAllocation: number;
  /** Expected ROI multiplier (e.g., 12 for 12:1) */
  expectedRoiMultiplier: number;
  /** Most effective channels sorted by efficacy */
  topChannels: string[];
  /** Average daily hours spent by marketers on content (1-3 range) */
  dailyTimeInvestment: number;
}

/** SEO Performance Metrics based on Helpful Content Updates */
export interface SeoMetrics {
  /** Weightage of page experience signals in algorithm (0-1) */
  pageExperienceWeight: number;
  /** Average ranking jump for high E-E-A-T scores */
  eeatRankingImprovement: number;
  /** Percentage of sites affected by Helpful Content Update (0-1) */
  hcuImpactRate: number;
}

/** Australian Startup Ecosystem Constants */
export const AU_MARKET_DATA = {
  TOTAL_FUNDING_Q2_2023: 1400000000,
  STARTUP_COUNT_2022: 2500,
  TOP_INVESTMENT_SECTOR: 'Artificial Intelligence',
  DOMESTIC_FOCUS_RATE: 0.71,
  NAVIGATION_TOOL_ADOPTION_RATE: 0.56,
  NAVIGATION_MARKET_CAGR: 0.346,
  VALUATION_TOOL_CRITICALITY: 0.71,
};

/** Global Content Benchmarks */
export const CONTENT_MARKETING_BENCHMARKS: ContentBenchmarks = {
  budgetAllocation: 0.26,
  expectedRoiMultiplier: 12,
  topChannels: ['Blog posts', 'Social media', 'Email newsletters'],
  dailyTimeInvestment: 2,
};

/** SEO Algorithm Constants */
export const SEO_ALGORITHM_DATA: SeoMetrics = {
  pageExperienceWeight: 0.17,
  eeatRankingImprovement: 12.5,
  hcuImpactRate: 0.25,
};

/** 
 * Calculates the projected market size for Startup Navigation tools 
 * based on CAGR and current adoption rates.
 * @param currentMarketValue Current market value in AU$
 * @param years Projection period in years
 * @returns Projected market value
 */
export function calculateNavigationMarketGrowth(currentMarketValue: number, years: number): number {
  return currentMarketValue * Math.pow(1 + AU_MARKET_DATA.NAVIGATION_MARKET_CAGR, years);
}

/** 
 * Determines the positioning weight between "Navigation" and "Valuation" tools
 * based on research priority (KPMG vs CB Insights data).
 * @param userNeed 'growth' | 'funding'
 * @returns Positioning score (0-1) where 1 is heavy focus on Valuation/Equity
 */
export function getPositioningWeight(userNeed: 'growth' | 'funding'): number {
  if (userNeed === 'funding') {
    return AU_MARKET_DATA.VALUATION_TOOL_CRITICALITY;
  }
  return 1 - AU_MARKET_DATA.VALUATION_TOOL_CRITICALITY;
}

/** 
 * Estimates the potential AU customer base for the 'Startup Navigation System'
 * @returns Estimated number of targetable AU startups
 */
export function estimateAUAddressableStartups(): number {
  return Math.floor(AU_MARKET_DATA.STARTUP_COUNT_2022 * AU_MARKET_DATA.NAVIGATION_TOOL_ADOPTION_RATE);
}

/** 
 * Calculates the suggested content budget based on a total marketing spend
 * @param totalBudget Total marketing budget in AU$
 * @returns Suggested content marketing spend
 */
export function calculateSuggestedContentBudget(totalBudget: number): number {
  return totalBudget * CONTENT_MARKETING_BENCHMARKS.budgetAllocation;
}
