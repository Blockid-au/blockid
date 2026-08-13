/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module – Updated with 2026 Research Data
 * Focus: Positioning 'Startup Navigation System' vs Financial Utilities & AU Market Benchmarks
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
  /** Adoption rate of cybersecurity features (0‑1) */
  cybersecurityFeatureAdoption: number;
  /** Data refresh latency in minutes */
  dataRefreshLatencyMinutes?: number;
  /** AI valuation accuracy percentage */
  aiValuationAccuracy?: number;
  /** Time to generate valuation report in minutes */
  reportGenerationTimeMinutes?: number;
  /** Support for dynamic equity tracking */
  hasDynamicEquityTracking?: boolean;
  /** Date of latest major capital/equity module release */
  latestCapitalModuleReleaseDate?: string;
  /** Early adopter adoption rate for new capital features (0‑1) */
  capitalFeatureAdoptionRate?: number;
  /** Whether the tool is positioned as a 'Navigation/Roadmap' system vs a 'Utility' */
  isPositionedAsStrategicNavigation: boolean;
  /** Integration status with cap-table providers (e.g., Carta, Pulley) */
  hasRealTimeCapTableSync: boolean;
}

export interface CustomerSegment {
  /** Segment name */
  name: string;
  /** Segment size (number of companies) */
  size: number;
  /** Willingness to pay */
  willingness: 'high' | 'medium' | 'low';
  /** Primary focus: 'domestic' or 'global' */
  marketFocus: 'domestic' | 'global';
  /** Average pre-money valuation for this segment (AU$) */
  avgPreMoneyValuation: number;
  /** Average round size (AU$) */
  avgRoundSize: number;
  /** Typical equity dilution per round (0-1) */
  avgEquityDilution: number;
}

/**
 * AU Market Benchmarks based on 2024-2026 Research
 */
export const AU_MARKET_BENCHMARKS = {
  STARTUP_ECOSYSTEM: {
    ACTIVE_STARTUPS: 8500,
    Q2_2024_VC_INVESTMENT: 1800000000,
    AVG_PRE_SEED_ROUND: 800000,
    AVG_SERIES_A_PRE_MONEY: 3200000,
    AVG_EQUITY_DILUTION: 0.18,
    MULTI_TOOL_DASHBOARD_ADOPTION: 0.42,
  },
  CONTENT_MARKETING: {
    B2B_AI_CONTENT_SHARE: 0.45,
    ORGANIC_CTR_TOP_3: 0.142,
    SAAS_LANDING_PAGE_CONVERSION: 0.068,
  },
  SEO_PERFORMANCE: {
    CORE_WEB_VITALS: {
      CLS_MAX: 0.1,
      LCP_MAX: 2.5,
      FID_MAX: 10,
    },
    JULY_2024_CORE_UPDATE_MEDIAN_TRAFFIC_CHANGE: -0.114,
  },
};

/**
 * Calculates the potential valuation impact of positioning a tool as a 'Navigation System' 
 * rather than a 'Financial Utility'.
 * @param currentValuation The current valuation of the startup
 * @param strategicMultiplier The multiplier applied when using strategic navigation tools
 * @returns The adjusted valuation
 */
export function calculateStrategicValuationImpact(
  currentValuation: number,
  strategicMultiplier: number = 1.25
): number {
  return currentValuation * strategicMultiplier;
}

/**
 * Estimates the organic lead volume based on current AU B2B SaaS benchmarks.
 * @param monthlyOrganicTraffic Estimated monthly organic traffic
 * @param ctr Click-through rate (Default: AU Benchmark 14.2%)
 * @param conversionRate Content-to-lead conversion rate (Default: AU Benchmark 6.8%)
 * @returns Estimated number of leads
 */
export function estimateContentLeads(
  monthlyOrganicTraffic: number,
  ctr: number = AU_MARKET_BENCHMARKS.CONTENT_MARKETING.ORGANIC_CTR_TOP_3,
  conversionRate: number = AU_MARKET_BENCHMARKS.CONTENT_MARKETING.SAAS_LANDING_PAGE_CONVERSION
): number {
  return Math.round(monthlyOrganicTraffic * ctr * conversionRate);
}

/**
 * Evaluates if a landing page meets the 2024/2026 Google Core Web Vitals threshold.
 * @param cls Cumulative Layout Shift
 * @param lcp Largest Contentful Paint in seconds
 * @param fid First Input Delay in milliseconds
 * @returns Boolean indicating if the page is optimized for Mobile-First Indexing v2
 */
export function validateCoreWebVitals(
  cls: number,
  lcp: number,
  fid: number
): boolean {
  const { CLS_MAX, LCP_MAX, FID_MAX } = AU_MARKET_BENCHMARKS.SEO_PERFORMANCE.CORE_WEB_VITALS;
  return cls <= CLS_MAX && lcp <= LCP_MAX && fid <= FID_MAX;
}

/**
 * Calculates the projected dilution for an AU startup based on current VC benchmarks.
 * @param currentEquity Percentage of equity held by founders (0-1)
 * @param rounds Number of funding rounds planned
 * @returns Projected equity remaining after rounds
 */
export function projectFounderEquity(
  currentEquity: number,
  rounds: number
): number {
  const dilutionPerRound = AU_MARKET_BENCHMARKS.STARTUP_ECOSYSTEM.AVG_EQUITY_DILUTION;
  return currentEquity * Math.pow((1 - dilutionPerRound), rounds);
}

/**
 * Generates a positioning score comparing 'Utility' vs 'Navigation' messaging.
 * @param featureSet Array of features provided by the platform
 * @param hasRoadmapFeatures Whether the platform provides long-term strategic guidance
 * @returns Score from 0-100
 */
export function calculatePositioningScore(
  featureSet: string[],
  hasRoadmapFeatures: boolean
): number {
  let score = featureSet.length * 5;
  if (hasRoadmapFeatures) {
    score += 40;
  }
  return Math.min(score, 100);
}
