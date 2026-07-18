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
  /** Adoption rate of navigation tools (0‑1) */
  adoptionRate: number;
  /** Importance of valuation & equity tools (0‑1) */
  valuationToolImportance: number;
}

/** Content marketing benchmark data */
export interface ContentMarketingBenchmarks {
  /** Share of total marketing budget (0‑1) */
  budgetShare: number;
  /** Effectiveness ranking of channels (ordered) */
  effectiveChannels: ('Blog' | 'Social' | 'Email')[];
  /** ROI ratio (e.g., 12:1 => 12) */
  roiRatio: number;
  /** Average daily time spent on content marketing (hours) */
  dailyHoursSpent: number;
}

/** Australian startup ecosystem snapshot */
export interface AUStartupEcosystem {
  /** Total startup funding in AU$ */
  totalFunding: number;
  /** Number of startups */
  startupCount: number;
  /** Top investment sector */
  topSector: string;
  /** Percentage focused on domestic market (0‑1) */
  domesticFocus: number;
}

/** SEO algorithm update impact */
export interface SEOUpdate {
  /** Percentage of sites affected (0‑1) */
  affectedSites: number;
  /** Average ranking improvement positions */
  avgRankingImprovement: number;
  /** Weight of page experience signals (0‑1) */
  pageExperienceWeight: number;
}

/** Competitor feature release statistics */
export interface CompetitorFeatureStats {
  /** Average features released per quarter */
  avgFeaturesPerQuarter: number;
  /** Percentage of startups prioritising AI adoption (0‑1) */
  aiAdoptionRate: number;
  /** YoY growth rate of cybersecurity feature adoption (0‑1) */
  cyberGrowthRate: number;
}

/* ==========================
   Data constants (research)
   ========================== */

export const startupNavigationMetrics: StartupNavigationMetrics = {
  /** CAGR 34.6% => 0.346 */
  cagr: 0.346,
  /** Adoption 56% => 0.56 */
  adoptionRate: 0.56,
  /** Importance 71% => 0.71 */
  valuationToolImportance: 0.71,
};

export const contentMarketingBenchmarks: ContentMarketingBenchmarks = {
  /** 26% of overall budget => 0.26 */
  budgetShare: 0.26,
  effectiveChannels: ['Blog', 'Social', 'Email'],
  /** 12:1 ROI => 12 */
  roiRatio: 12,
  /** 33% of marketers spend 1‑3 hours per day => average 2 hours */
  dailyHoursSpent: 2,
};

export const auStartupEcosystem: AUStartupEcosystem = {
  /** $1.4 billion */
  totalFunding: 1_400_000_000,
  /** over 2,500 startups => 2500 */
  startupCount: 2500,
  topSector: 'Artificial intelligence',
  /** 71% => 0.71 */
  domesticFocus: 0.71,
};

export const seoUpdate: SEOUpdate = {
  /** 20‑30% affected => use midpoint 0.25 */
  affectedSites: 0.25,
  /** 10‑15 positions improvement => midpoint 12.5 */
  avgRankingImprovement: 12.5,
  /** 17% weight => 0.17 */
  pageExperienceWeight: 0.17,
};

export const competitorFeatureStats: CompetitorFeatureStats = {
  /** 5‑7 features per quarter => midpoint 6 */
  avgFeaturesPerQuarter: 6,
  /** 71% AI adoption => 0.71 */
  aiAdoptionRate: 0.71,
  /** 25% YoY growth => 0.25 */
  cyberGrowthRate: 0.25,
};

/* ==========================
   Utility functions
   ========================== */

/**
 * Calculates the compound annual growth rate (CAGR) given start and end values.
 * @param startValue - Value at the beginning of the period.
 * @param endValue - Value at the end of the period.
 * @param years - Number of years between start and end.
 * @returns CAGR expressed as a decimal (e.g., 0.10 for 10%).
 */
export function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number,
): number {
  if (startValue <= 0 || years <= 0) return 0;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}

/**
 * Projects market size after a given number of years using CAGR.
 * @param currentSize - Current market size (AU$).
 * @param cagr - Annual growth rate as a decimal.
 * @param years - Number of years to project.
 * @returns Projected market size (AU$).
 */
export function projectMarketSize(
  currentSize: number,
  cagr: number,
  years: number,
): number {
  return currentSize * Math.pow(1 + cagr, years);
}

/**
 * Computes expected ROI in monetary terms given budget share and ROI ratio.
 * @param totalMarketingBudget - Total marketing budget (AU$).
 * @param budgetShare - Portion allocated to content marketing (0‑1).
 * @param roiRatio - Return on investment multiplier.
 * @returns Expected return (AU$).
 */
export function computeContentMarketingROI(
  totalMarketingBudget: number,
  budgetShare: number,
  roiRatio: number,
): number {
  const allocated = totalMarketingBudget * budgetShare;
  return allocated * roiRatio;
}

/**
 * Estimates the average ranking lift for a site after applying high E‑E‑A‑T scores.
 * @param currentRank - Current search rank (1 = top).
 * @param avgImprovement - Average improvement positions.
 * @returns New estimated rank (rounded to nearest integer, minimum 1).
 */
export function estimateSEOImprovement(
  currentRank: number,
  avgImprovement: number,
): number {
  const newRank = Math.max(1, Math.round(currentRank - avgImprovement));
  return newRank;
}

/**
 * Projects the number of AI‑powered features a competitor will release over a future quarter.
 * @param currentFeatures - Current count of AI‑powered features.
 * @param releaseFrequency - Average features released per quarter.
 * @param quartersAhead - Number of quarters to project.
 * @returns Projected total count of AI‑powered features.
 */
export function projectAIFeatureCount(
  currentFeatures: number,
  releaseFrequency: number,
  quartersAhead: number,
): number {
  return currentFeatures + releaseFrequency * quartersAhead;
}

/**
 * Generates a benchmark summary string for quick reporting.
 * @param research - MarketResearch object.
 * @returns Formatted summary.
 */
export function generateBenchmarkSummary(research: MarketResearch): string {
  const { tam, sam, som, growthRate, numberOfStartups, percentageUsingValuationTools } = research;
  return `TAM: AU$${tam.toLocaleString()}, SAM: AU$${sam.toLocaleString()}, SOM: AU$${som.toLocaleString()}. Growth: ${(growthRate * 100).toFixed(1)}%. Startups: ${numberOfStartups}. Valuation‑tool usage: ${(percentageUsingValuationTools * 100).toFixed(0)}%.`;
}

/* ==========================
   Example data (placeholder)
   ========================== */

export const exampleMarketResearch: MarketResearch = {
  tam: 5_000_000_000,
  sam: 2_000_000_000,
  som: 500_000_000,
  tamSource: 'Internal forecast 2026',
  industry: 'Startup navigation & valuation',
  region: 'Australia',
  growthRate: startupNavigationMetrics.cagr,
  competitors: [],
  marketTrends: [
    'AI‑driven navigation features',
    'Increased demand for equity tooling',
    'Higher SEO focus on E‑E‑A‑T',
  ],
  customerSegments: [
    { name: 'Early‑stage founders', size: 1500, willingness: 'high' },
    { name: 'Scale‑ups', size: 800, willingness: 'medium' },
    { name: 'Enterprise incubators', size: 200, willingness: 'low' },
  ],
  averageSeriesAFunding: 2_500_000,
  australianUnicorns: 12,
  vcInvestmentH1: 850_000_000,
  numberOfStartups: auStartupEcosystem.startupCount,
  percentageUsingValuationTools: startupNavigationMetrics.valuationToolImportance,
  averageValuation: 15_000_000,
};
