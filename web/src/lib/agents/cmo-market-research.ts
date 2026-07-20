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
  /** VC investment in H1 2024 (AU$) */
  vcInvestmentH1: number;
  /** Number of startups in Australia */
  numberOfStartups: number;
  /** Percentage of startups using valuation tools (0‑1) */
  percentageUsingValuationTools: number;
  /** Average valuation of Australian startups (AU$) */
  averageValuation: number;
  /** Adoption rate of navigation tools (0-1) */
  navigationToolAdoptionRate: number;
}

/** Content Marketing Benchmarks based on 2023 Research */
export interface ContentBenchmarks {
  /** Average content marketing budget as % of total budget */
  budgetPercentage: number;
  /** ROI ratio (e.g., 12 for 12:1) */
  roiRatio: number;
  /** Effectiveness of channels (0-1) */
  channelEffectiveness: {
    blog: number;
    socialMedia: number;
    email: number;
  };
  /** Average daily time spent on content creation (hours) */
  avgDailyTimeSpent: number;
}

/** SEO Performance Metrics based on Helpful Content Update */
export interface SEOBenchmarks {
  /** Weight of page experience signals (0-1) */
  pageExperienceWeight: number;
  /** Avg ranking boost for high E-E-A-T scores (positions) */
  eeatRankingBoost: number;
  /** Percentage of sites impacted by Helpful Content Update (0-1) */
  hcuImpactRate: number;
}

/** AU Market Constant Data based on latest reports */
export const AU_MARKET_DATA = {
  TOTAL_FUNDING: 1400000000,
  STARTUP_COUNT: 2500,
  TOP_INVESTMENT_SECTOR: 'Artificial intelligence',
  DOMESTIC_FOCUS_RATE: 0.71,
  NAV_MARKET_CAGR: 0.346,
  NAV_ADOPTION_RATE: 0.56,
  VALUATION_TOOL_IMPORTANCE: 0.71,
};

export const CONTENT_MARKETING_BENCHMARKS: ContentBenchmarks = {
  budgetPercentage: 0.26,
  roiRatio: 12,
  channelEffectiveness: {
    blog: 0.83,
    socialMedia: 0.81,
    email: 0.78,
  },
  avgDailyTimeSpent: 2,
};

export const SEO_BENCHMARKS: SEOBenchmarks = {
  pageExperienceWeight: 0.17,
  eeatRankingBoost: 12.5,
  hcuImpactRate: 0.25,
};

/**
 * Calculates the projected market size for the 'Startup Navigation' niche
 * @param currentMarket AU$
 * @param years Number of years to project
 * @returns Projected AU$
 */
export function calculateNavMarketProjection(currentMarket: number, years: number): number {
  return currentMarket * Math.pow(1 + AU_MARKET_DATA.NAV_MARKET_CAGR, years);
}

/**
 * Evaluates the positioning priority between Navigation and Valuation tools
 * @param userStartupStage 'seed' | 'seriesA' | 'growth'
 * @returns Priority score where > 1 favors Valuation tools
 */
export function calculatePositioningPriority(userStartupStage: string): number {
  const navImportance = AU_MARKET_DATA.NAV_ADOPTION_RATE;
  const valuationImportance = AU_MARKET_DATA.VALUATION_TOOL_IMPORTANCE;
  
  if (userStartupStage === 'seriesA' || userStartupStage === 'growth') {
    return valuationImportance / navImportance;
  }
  return navImportance / valuationImportance;
}

/**
 * Calculates estimated content budget for a given total marketing budget
 * @param totalBudget AU$
 * @returns Estimated content budget AU$
 */
export function estimateContentBudget(totalBudget: number): number {
  return totalBudget * CONTENT_MARKETING_BENCHMARKS.budgetPercentage;
}

/**
 * Estimates the potential reach within the AU ecosystem for a specific sector
 * @param sectorSector The sector name (e.g., 'Artificial intelligence')
 * @param marketFocus 'domestic' | 'global'
 * @returns Estimated number of targetable startups
 */
export function estimateAUSectorReach(sectorSector: string, marketFocus: 'domestic' | 'global'): number {
  const baseCount = AU_MARKET_DATA.STARTUP_COUNT;
  const sectorMultiplier = sectorSector === AU_MARKET_DATA.TOP_INVESTMENT_SECTOR ? 1.5 : 1.0;
  const reach = baseCount * sectorMultiplier;
  
  return marketFocus === 'domestic' 
    ? reach * AU_MARKET_DATA.DOMESTIC_FOCUS_RATE 
    : reach * (1 - AU_MARKET_DATA.DOMESTIC_FOCUS_RATE);
}
