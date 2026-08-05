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
  /** Percentage of features utilizing AI-assisted automation (Research Trend: ~65%) */
  aiIntegrationRate?: number;
  /** Rate of predictive revenue feature adoption (Research Trend: 42% increase) */
  predictiveRevenueAdoptionRate?: number;
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
  /** Percentage of this segment preferring integrated guidance over standalone tools (Research: ~65%) */
  integratedGuidancePreference: number;
}

/** Australian Market Valuation Benchmarks 2024-2026 */
export const AU_MARKET_BENCHMARKS = {
  valuations: {
    preSeedAvg: { min: 1000000, max: 3000000, currency: 'AUD' },
    seedAvg: { min: 3000000, max: 7000000, currency: 'AUD' },
    seedDilution: { min: 0.15, max: 0.25 },
  },
  multiples: {
    b2bSaaSMedian: { min: 4, max: 7, metric: 'ARR' },
    saasCompression: { oldMin: 10, oldMax: 20, newMin: 4, newMax: 8 },
    aiPremiumMultiplier: { min: 1.5, max: 2.5 },
    seedStageSaaS: { min: 6, max: 10, metric: 'ARR' },
  },
  healthMetrics: {
    maxHealthyBurnMultiple: 1.5,
  },
};

/** Content Marketing Performance Benchmarks */
export const CONTENT_BENCHMARKS = {
  conversionRates: {
    b2bAverage: { min: 0.021, max: 0.054 },
  },
  engagement: {
    shortFormVideo: { min: 0.03, max: 0.07 },
    staticImageMultiplier: 0.33,
  },
  productionCosts: {
    genAiDraftingReduction: { min: 0.3, max: 0.5 },
    genAiEditingIncrease: 0.2,
  },
  seo: {
    aiOverviewCtrDrop: { min: -0.15, max: -0.25 },
    inpThresholdMs: 200,
    aiContentDecayRate: { min: 0.3, max: 0.5 },
  },
};

/**
 * Calculates the adjusted valuation of an AU Startup based on current market multiples
 * and AI premium multipliers.
 * @param arr Annual Recurring Revenue
 * @param isAiEnabled Whether the startup utilizes significant AI integration
 * @param stage 'pre-seed' | 'seed' | 'growth'
 */
export function calculateMarketValuation(
  arr: number,
  isAiEnabled: boolean,
  stage: 'pre-seed' | 'seed' | 'growth'
): number {
  let baseMultiple = AU_MARKET_BENCHMARKS.multiples.b2bSaaSMedian.max;

  if (stage === 'seed') {
    baseMultiple = (AU_MARKET_BENCHMARKS.multiples.seedStageSaaS.min + AU_MARKET_BENCHMARKS.multiples.seedStageSaaS.max) / 2;
  }

  const aiMultiplier = isAiEnabled 
    ? (AU_MARKET_BENCHMARKS.multiples.aiPremiumMultiplier.min + AU_MARKET_BENCHMARKS.multiples.aiPremiumMultiplier.max) / 2 
    : 1;

  return arr * baseMultiple * aiMultiplier;
}
