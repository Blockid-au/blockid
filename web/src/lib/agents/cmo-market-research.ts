// src/lib/agents/cmo-market-research.ts

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
}

/** Customer segment definition */
export interface CustomerSegment {
  /** Segment name */
  name: string;
  /** Segment size (number of companies) */
  size: number;
  /** Willingness to pay */
  willingness: 'high' | 'medium' | 'low';
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
}

/** Startup navigation market metrics */
export interface StartupNavigationMetrics {
  /** CAGR from 2020 to 2025 (0‑1) */
  cagr: number;
  /** Adoption rate in 2024 (0‑1) */
  adoptionRate: number;
  /** Importance of valuation/equity tools (0‑1) */
  valuationImportance: number;
}

/** Content marketing benchmark data */
export interface ContentMarketingBenchmarks {
  /** Share of overall marketing budget (0‑1) */
  budgetShare: number;
  /** Effectiveness scores per channel (0‑1) */
  channelEffectiveness: Record<string, number>;
  /** ROI ratio (e.g., 12 means 12:1) */
  roiRatio: number;
  /** Average daily time spent on content marketing (hours) */
  avgHoursPerDay: number;
}

/** Australian startup ecosystem snapshot */
export interface AustralianEcosystemSnapshot {
  /** Total startup funding in AU$ */
  totalFunding: number;
  /** Number of startups */
  startupCount: number;
  /** Top investment sector */
  topSector: string;
  /** Percentage focused on domestic market (0‑1) */
  domesticFocusPct: number;
}

/** SEO algorithm update impact */
export interface SEOUpdateImpact {
  /** Percentage of sites affected (0‑1) */
  affectedPct: number;
  /** Average ranking improvement (positions) */
  avgRankingImprovement: number;
  /** Page experience signal weight (0‑1) */
  pageExperienceWeight: number;
}

/** Competitor feature release statistics */
export interface CompetitorFeatureStats {
  /** Average number of features released per quarter */
  avgFeaturesPerQuarter: number;
  /** Percentage of startups prioritizing AI adoption (0‑1) */
  aiAdoptionPct: number;
  /** YoY growth rate of cybersecurity feature adoption (0‑1) */
  cybersecurityGrowthYoY: number;
}

/** Fixed research data constants */
export const startupNavigationData: StartupNavigationMetrics = {
  cagr: 0.346,
  adoptionRate: 0.56,
  valuationImportance: 0.71,
};

export const contentMarketingData: ContentMarketingBenchmarks = {
  budgetShare: 0.26,
  channelEffectiveness: {
    blog: 0.83,
    social: 0.81,
    email: 0.78,
  },
  roiRatio: 12,
  avgHoursPerDay: 2,
};

export const australianEcosystemData: AustralianEcosystemSnapshot = {
  totalFunding: 1_400_000_000,
  startupCount: 2500,
  topSector: 'Artificial intelligence',
  domesticFocusPct: 0.71,
};

export const seoUpdateData: SEOUpdateImpact = {
  affectedPct: 0.25,
  avgRankingImprovement: 12.5,
  pageExperienceWeight: 0.17,
};

export const competitorFeatureData: CompetitorFeatureStats = {
  avgFeaturesPerQuarter: 6,
  aiAdoptionPct: 0.71,
  cybersecurityGrowthYoY: 0.25,
};

/**
 * Projects market size using CAGR.
 * @param currentTam Current TAM in AU$.
 * @param years Number of years to project.
 * @param cagr Annual growth rate (0‑1).
 * @returns Projected TAM after the given number of years.
 */
export function calculateProjectedTam(currentTam: number, years: number, cagr: number): number {
  if (years < 0) throw new Error('Years cannot be negative');
  if (cagr < 0) throw new Error('CAGR cannot be negative');
  return Number((currentTam * Math.pow(1 + cagr, years)).toFixed(0));
}

/**
 * Returns a summary of the startup navigation market based on latest research.
 */
export function getStartupNavigationSummary(): StartupNavigationMetrics {
  return { ...startupNavigationData };
}

/**
 * Returns content marketing benchmarks for the Australian market.
 */
export function getContentMarketingSummary(): ContentMarketingBenchmarks {
  return { ...contentMarketingData };
}

/**
 * Returns a snapshot of the Australian startup ecosystem.
 */
export function getAustralianEcosystemSummary(): AustralianEcosystemSnapshot {
  return { ...australianEcosystemData };
}

/**
 * Returns the impact metrics of the latest Google Helpful Content update.
 */
export function getSEOUpdateSummary(): SEOUpdateImpact {
  return { ...seoUpdateData };
}

/**
 * Returns aggregated competitor feature statistics.
 */
export function getCompetitorFeatureSummary(): CompetitorFeatureStats {
  return { ...competitorFeatureData };
}

/**
 * Calculates the percentage of startups that would benefit from a valuation tool
 * given a target adoption rate.
 * @param targetAdoption Desired adoption rate (0‑1).
 * @returns Estimated number of startups that would adopt the tool.
 */
export function estimateValuationToolAdopters(targetAdoption: number): number {
  if (targetAdoption < 0 || targetAdoption > 1) throw new Error('Target adoption must be between 0 and 1');
  return Math.round(australianEcosystemData.startupCount * targetAdoption);
}

/**
 * Generates a market research object populated with the latest benchmarks.
 * @param baseResearch Base market research data.
 * @returns Enriched MarketResearch instance.
 */
export function enrichMarketResearch(baseResearch: MarketResearch): MarketResearch {
  const enriched: MarketResearch = {
    ...baseResearch,
    growthRate: startupNavigationData.cagr,
    marketTrends: [
      'AI‑powered navigation tools',
      'Increased valuation tool adoption',
      'SEO focus on E‑E‑A‑T',
    ],
    customerSegments: baseResearch.customerSegments.map((segment) => ({
      ...segment,
      willingness:
        segment.name.toLowerCase().includes('tech') ? 'high' : segment.willingness,
    })),
    averageSeriesAFunding: 1_200_000,
    australianUnicorns: 12,
    vcInvestmentH1: 850_000_000,
    numberOfStartups: australianEcosystemData.startupCount,
    percentageUsingValuationTools: startupNavigationData.valuationImportance,
    averageValuation: 5_000_000,
  };
  return enriched;
}
