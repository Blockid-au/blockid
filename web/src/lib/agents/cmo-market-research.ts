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
  /** Data refresh latency in minutes (Benchmark: 4.2m) */
  dataRefreshLatencyMinutes?: number;
  /** AI valuation accuracy percentage (Benchmark: 92%) */
  aiValuationAccuracy?: number;
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
}

/** AU Market Specific Benchmarks 2024/2025 */
export const AU_STARTUP_BENCHMARKS = {
  valuation: {
    seedPostMoneyAvg: 5500000, // Midpoint of A$4M - A$7M
    revenueMultipleMin: 4,
    revenueMultipleMax: 8,
    aiPremiumMultiplier: 1.3,
  },
  operational: {
    avgRunwayRequirementMonths: 21, // Midpoint of 18-24
    newCompanyGrowthRateMonthly: 5200, // Based on Apr-May 2024 data
  },
  marketing: {
    b2bBlogConversionRate: 0.023, // Midpoint 2.1% - 2.5%
    shortFormVideoEngagement: 0.0425, // Midpoint 3.5% - 5.0%
    aiContentBudgetAllocation: 0.20, // Midpoint 15% - 25%
    avgCPLAU: 82.5, // Midpoint A$45 - A$120
  },
  seo: {
    aiOverviewCtrReduction: 0.215, // Midpoint 18-25%
    organicVolatilityIndex: 0.40, // Midpoint 30-50%
  }
};

/** Positioning Constants for 'Startup Navigation System' */
export const STRATEGIC_POSITIONING = {
  PRODUCT_CATEGORY: 'Startup Navigation System',
  VALUE_PROPOSITION: 'Holistic road-mapping, market intelligence, and equity modelling',
  METRIC_IMPROVEMENT: {
    dilutionReduction: 0.03, // 12% down to 9%
    sectorGrowthYoY: 0.22, // 22% vs 13% for valuation-only
    marketProjection2028Billion: 4.1,
  }
};

/**
 * Calculates the estimated valuation for an AU SaaS startup based on current research.
 * @param arr Annual Recurring Revenue
 * @param isAiPowered Whether the startup leverages AI to apply the premium multiplier
 */
export function calculateAUValuation(arr: number, isAiPowered: boolean): number {
  const medianMultiple = (AU_STARTUP_BENCHMARKS.valuation.revenueMultipleMin + AU_STARTUP_BENCHMARKS.valuation.revenueMultipleMax) / 2;
  let valuation = arr * medianMultiple;
  if (isAiPowered) {
    valuation *= AU_STARTUP_BENCHMARKS.valuation.aiPremiumMultiplier;
  }
  return valuation;
}

/**
 * Estimates potential lead acquisition based on content spend and AU CPL benchmarks.
 * @param budget Total marketing budget for content
 * @param aiToolAllocation Percentage of budget allocated to AI tools (default 20%)
 */
export function estimateLeadGen(budget: number, aiToolAllocation: number = AU_STARTUP_BENCHMARKS.marketing.aiContentBudgetAllocation): {
  totalLeads: number;
  aiToolSpend: number;
  contentSpend: number;
} {
  const aiToolSpend = budget * aiToolAllocation;
  const contentSpend = budget - aiToolSpend;
  const totalLeads = contentSpend / AU_STARTUP_BENCHMARKS.marketing.avgCPLAU;
  return {
    totalLeads: Math.floor(totalLeads),
    aiToolSpend,
    contentSpend
  };
}

/**
 * Evaluates the effectiveness of a 'Navigation' approach vs a 'Valuation' approach.
 * @param currentDilution The current estimated dilution percentage (e.g., 0.12)
 */
export function projectDilutionSaving(currentDilution: number): number {
  return currentDilution - (currentDilution - STRATEGIC_POSITIONING.METRIC_IMPROVEMENT.dilutionReduction);
}

/**
 * Analyzes SEO risk based on current AI Overview trends.
 * @param currentTraffic Current organic traffic volume
 * @param isAiContentHeavy Whether the site relies heavily on AI-generated content
 */
export function analyzeSeoRisk(currentTraffic: number, isAiContentHeavy: boolean): {
  projectedTrafficLoss: number;
  volatilityRisk: 'Low' | 'Medium' | 'High';
} {
  const loss = currentTraffic * AU_STARTUP_BENCHMARKS.seo.aiOverviewCtrReduction;
  const volatilityRisk = isAiContentHeavy ? 'High' : 'Medium';
  return {
    projectedTrafficLoss: Math.floor(loss),
    volatilityRisk
  };
}
