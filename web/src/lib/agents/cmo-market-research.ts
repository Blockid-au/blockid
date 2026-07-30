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
  /** Average dilution rate observed in this segment per round (0-1) */
  avgDilutionRate: number;
}

/** Market Benchmarks based on 2024-2026 Research */
export const MARKET_BENCHMARKS = {
  GLOBAL: {
    ECOSYSTEM_SAAS_MARKET_SIZE: 4200000000, // $4.2 Billion (Statista 2024)
    NAVIGATION_TOOLS_CAGR: 0.147, // 14.7% (CB Insights 2024)
  },
  AUSTRALIA: {
    ACTIVE_STARTUPS_Q2_2024: 7800, // Gov Report 2024
    TOTAL_VC_FUNDING_H1_2026: 5200000000, // AU$5.2 Billion (AVCA 2026)
    UNICORN_COUNT_2026: 14, // Startup Genome 2026
    SEED_MONTHLY_FUNDING_INTENSITY: 150000000, // AU$150 Million (AusSeed 2026)
    STARTUP_EMPLOYMENT_FTE_Q2_2026: 210000, // Australian Bureau 2026
  },
  CONTENT_SEO: {
    AI_LONGFORM_TRAFFIC_LIFT: 0.15, // 15% lift for >=1500 words (CMI 2025)
    B2B_TOP_RANKING_AVG_LENGTH: 1900, // Words (SEMrush 2025)
    LINKEDIN_ORGANIC_CTR: 0.012, // 1.2% (HubSpot 2025)
    CORE_UPDATE_FREQ_PER_YEAR: 2, // Google Search Central 2024
    AVG_CORE_UPDATE_TRAFFIC_DROP: 0.123, // 12.3% for high-risk sites (Moz 2024)
    EEAT_CTR_IMPROVEMENT: 0.22, // 22% higher CTR (Ahrefs 2024)
  }
};

/** Positioning strategies for 'Startup Navigation System' */
export type PositioningAngle = 'NAVIGATION_MAP' | 'EQUITY_VALUATION_TOOL' | 'HYBRID_GROWTH_OS';

/** 
 * Calculates the potential Addressable Market Value for the AU region 
 * based on active startups and tool adoption projections.
 */
export function calculateAUMarketPotential(
  adoptionRate: number, 
  avgAnnualContractValue: number
): number {
  return MARKET_BENCHMARKS.AUSTRALIA.ACTIVE_STARTUPS_Q2_2024 * adoptionRate * avgAnnualContractValue;
}

/**
 * Predicts organic traffic impact based on content length and AI utilization
 * incorporating 2025 CMI and SEMrush data.
 */
export function predictContentPerformance(
  wordCount: number, 
  isAiGenerated: boolean, 
  hasHighEEAT: boolean
): { expectedTrafficMultiplier: number; riskScore: number } {
  let multiplier = 1.0;
  let risk = 0.1;

  if (wordCount >= 1500 && isAiGenerated) {
    multiplier += MARKET_BENCHMARKS.CONTENT_SEO.AI_LONGFORM_TRAFFIC_LIFT;
  }

  if (wordCount >= MARKET_BENCHMARKS.CONTENT_SEO.B2B_TOP_RANKING_AVG_LENGTH) {
    multiplier += 0.1;
  }

  if (hasHighEEAT) {
    multiplier += MARKET_BENCHMARKS.CONTENT_SEO.EEAT_CTR_IMPROVEMENT;
    risk -= 0.05;
  } else {
    risk += 0.15;
  }

  return {
    expectedTrafficMultiplier: parseFloat(multiplier.toFixed(2)),
    riskScore: parseFloat(risk.toFixed(2))
  };
}

/**
 * Evaluates competitor capital module adoption based on historical benchmarks 
 * (e.g., Carta's ~8% early adopter rate).
 */
export function evaluateFeatureAdoptionRisk(
  currentAdoptionRate: number, 
  competitorBenchmarkRate: number = 0.08
): 'UNDERPERFORMING' | 'ON_TRACK' | 'OUTPERFORMING' {
  if (currentAdoptionRate < competitorBenchmarkRate * 0.8) return 'UNDERPERFORMING';
  if (currentAdoptionRate > competitorBenchmarkRate * 1.2) return 'OUTPERFORMING';
  return 'ON_TRACK';
}

/**
 * Estimates the impact of a Google Core Update on the current traffic base
 */
export function estimateCoreUpdateImpact(currentMonthlyTraffic: number, isHighRiskSite: boolean): number {
  const dropRate = isHighRiskSite ? MARKET_BENCHMARKS.CONTENT_SEO.AVG_CORE_UPDATE_TRAFFIC_DROP : 0.03;
  return currentMonthlyTraffic * (1 - dropRate);
}
