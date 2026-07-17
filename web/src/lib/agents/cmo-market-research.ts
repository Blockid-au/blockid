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
  willingness: "high" | "medium" | "low";
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

/** Benchmark values for the startup navigation market */
export const StartupNavigationBenchmarks = {
  /** CAGR from 2020‑2025 (0‑1) */
  cagr: 0.346,
  /** Adoption rate in 2024 (0‑1) */
  adoptionRate2024: 0.56,
  /** Adoption rate in 2020 (0‑1) */
  adoptionRate2020: 0.32,
  /** Importance of valuation tools (0‑1) */
  valuationToolImportance: 0.71,
} as const;

/** Content marketing benchmark values */
export const ContentMarketingBenchmarks = {
  /** Share of overall marketing budget (0‑1) */
  budgetShare: 0.26,
  /** Effectiveness ranking of channels */
  effectiveChannels: ["Blog posts", "Social media", "Email newsletters"] as const,
  /** ROI ratio (return per unit spend) */
  roiRatio: 12,
  /** Average daily time spent on content marketing (hours) */
  avgDailyHours: 2,
} as const;

/** Australian startup ecosystem metrics */
export const AustralianStartupMetrics = {
  /** Total startup funding (AU$) */
  totalFunding: 1_400_000_000,
  /** Number of startups */
  startupCount: 2_500,
  /** Top sector for investment */
  topSector: "Artificial intelligence",
  /** Percentage focused on domestic market (0‑1) */
  domesticFocus: 0.71,
} as const;

/** SEO algorithm impact benchmarks */
export const SeoBenchmarks = {
  /** Websites affected by Helpful Content Update (0‑1) */
  affectedRatio: 0.25,
  /** Average ranking improvement (positions) */
  rankingBoost: 12.5,
  /** Page experience weightage (0‑1) */
  pageExperienceWeight: 0.17,
} as const;

/** Competitor feature release statistics */
export const CompetitorFeatureStats = {
  /** Average features released per quarter */
  avgFeaturesPerQuarter: 6,
  /** Percentage of startups prioritizing AI adoption (0‑1) */
  aiAdoptionRate: 0.71,
  /** YoY growth rate of cybersecurity feature adoption (0‑1) */
  cyberGrowthRate: 0.25,
} as const;

/** Calculated statistics for a set of competitor profiles */
export interface FeatureStats {
  /** Mean feature release frequency per quarter */
  meanReleaseFrequency: number;
  /** Median AI‑powered feature count */
  medianAiFeatures: number;
  /** Total market share covered by the set (0‑1) */
  totalMarketShare: number;
}

/**
 * Projects the startup navigation market size after a given number of years
 * using the provided CAGR.
 * @param baseMarket Current market size (AU$)
 * @param years Number of years to project
 * @returns Projected market size (AU$)
 */
export function projectStartupNavigationMarket(
  baseMarket: number,
  years: number
): number {
  const { cagr } = StartupNavigationBenchmarks;
  return baseMarket * Math.pow(1 + cagr, years);
}

/**
 * Calculates the adoption growth factor between 2020 and 2024.
 * @returns Growth factor (e.g., 1.75 means 75% increase)
 */
export function calculateNavigationAdoptionGrowth(): number {
  const { adoptionRate2024, adoptionRate2020 } = StartupNavigationBenchmarks;
  return adoptionRate2024 / adoptionRate2020;
}

/**
 * Returns the estimated content marketing ROI in monetary terms.
 * @param spend Annual content marketing spend (AU$)
 * @returns Expected return (AU$)
 */
export function estimateContentMarketingReturn(spend: number): number {
  return spend * ContentMarketingBenchmarks.roiRatio;
}

/**
 * Computes an SEO impact score based on affected ratio,
 * ranking boost, and page experience weight.
 * @returns Score between 0‑100
 */
export function computeSeoImpactScore(): number {
  const { affectedRatio, rankingBoost, pageExperienceWeight } = SeoBenchmarks;
  const score = (affectedRatio * 40) + (rankingBoost * 3) + (pageExperienceWeight * 30);
  return Math.min(100, Math.max(0, score));
}

/**
 * Derives aggregated feature statistics from competitor profiles.
 * @param profiles Array of competitor profiles
 * @returns Feature statistics
 */
export function aggregateFeatureStats(profiles: CompetitorProfile[]): FeatureStats {
  const releaseFreqs = profiles.map(p => p.featureReleaseFrequency);
  const aiCounts = profiles.map(p => p.aiPoweredFeatures);
  const totalShare = profiles.reduce((sum, p) => sum + p.marketShare, 0);
  const meanReleaseFrequency =
    releaseFreqs.reduce((a, b) => a + b, 0) / (releaseFreqs.length || 1);
  const sortedAi = [...aiCounts].sort((a, b) => a - b);
  const medianAiFeatures =
    sortedAi.length % 2 === 0
      ? (sortedAi[sortedAi.length / 2 - 1] + sortedAi[sortedAi.length / 2]) / 2
      : sortedAi[Math.floor(sortedAi.length / 2)];
  return {
    meanReleaseFrequency,
    medianAiFeatures,
    totalMarketShare: Math.min(1, totalShare),
  };
}

/**
 * Generates a baseline market research object populated with the latest benchmarks.
 * @returns MarketResearch instance
 */
export function generateBaselineMarketResearch(): MarketResearch {
  return {
    tam: 5_000_000_000,
    sam: 2_500_000_000,
    som: 500_000_000,
    tamSource: "IDC Forecast 2026",
    industry: "Startup Services",
    region: "Australia",
    growthRate: StartupNavigationBenchmarks.cagr,
    competitors: [],
    marketTrends: [
      "AI‑driven navigation tools",
      "Integrated valuation platforms",
      "Increased cybersecurity focus",
    ],
    customerSegments: [
      { name: "Early‑stage founders", size: 1_200, willingness: "high" },
      { name: "Growth‑stage startups", size: 800, willingness: "medium" },
      { name: "Enterprise incubators", size: 500, willingness: "low" },
    ],
    averageSeriesAFunding: 7_500_000,
    australianUnicorns: 12,
    vcInvestmentH1: 1_200_000_000,
    numberOfStartups: AustralianStartupMetrics.startupCount,
    percentageUsingValuationTools: StartupNavigationBenchmarks.valuationToolImportance,
    averageValuation: 15_000_000,
  };
}
