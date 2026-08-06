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
 * Flat AU market anchors — the stable public surface of this module.
 *
 * Derived from MARKET_BENCHMARKS above so there is exactly one source of truth
 * for every research figure. The CMO agent loop periodically restructures the
 * nested MARKET_BENCHMARKS shape; this flat view is the contract consumers and
 * `cmo-market-research.test.ts` pin against, so keep the seven keys stable and
 * only refresh their values from new research.
 */
export const AU_MARKET_DATA = {
  ACTIVE_STARTUPS: MARKET_BENCHMARKS.AUSTRALIA.ACTIVE_STARTUPS_Q2_2024,
  TOTAL_VC_FUNDING_H1_2026: MARKET_BENCHMARKS.AUSTRALIA.TOTAL_VC_FUNDING_H1_2026,
  UNICORN_COUNT: MARKET_BENCHMARKS.AUSTRALIA.UNICORN_COUNT_2026,
  SEED_MONTHLY_FUNDING_INTENSITY: MARKET_BENCHMARKS.AUSTRALIA.SEED_MONTHLY_FUNDING_INTENSITY,
  TOTAL_STARTUP_EMPLOYMENT_FTE: MARKET_BENCHMARKS.AUSTRALIA.STARTUP_EMPLOYMENT_FTE_Q2_2026,
  GLOBAL_SAAS_MARKET_SIZE_2024: MARKET_BENCHMARKS.GLOBAL.ECOSYSTEM_SAAS_MARKET_SIZE,
  NAVIGATION_TOOL_CAGR: MARKET_BENCHMARKS.GLOBAL.NAVIGATION_TOOLS_CAGR,
};

/** Content / SEO benchmarks used by the content-planning helpers below. */
export interface ContentBenchmarks {
  /** Target length for B2B SEO dominance (words). */
  targetB2BBlogLength: number;
  /** Expected organic traffic lift for AI-assisted long-form content (ratio). */
  aiContentTrafficLift: number;
  /** Average LinkedIn organic CTR (ratio). */
  linkedinOrganicCTR: number;
  /** Impact of high E-E-A-T scores on CTR (ratio). */
  eeatCTRBoost: number;
  /** Average organic traffic drop for high-risk sites after a Core Update (ratio). */
  coreUpdateRiskDrop: number;
}

/** Flat content/SEO view over MARKET_BENCHMARKS.CONTENT_SEO. */
export const CONTENT_BENCHMARKS: ContentBenchmarks = {
  targetB2BBlogLength: MARKET_BENCHMARKS.CONTENT_SEO.B2B_TOP_RANKING_AVG_LENGTH,
  aiContentTrafficLift: MARKET_BENCHMARKS.CONTENT_SEO.AI_LONGFORM_TRAFFIC_LIFT,
  linkedinOrganicCTR: MARKET_BENCHMARKS.CONTENT_SEO.LINKEDIN_ORGANIC_CTR,
  eeatCTRBoost: MARKET_BENCHMARKS.CONTENT_SEO.EEAT_CTR_IMPROVEMENT,
  coreUpdateRiskDrop: MARKET_BENCHMARKS.CONTENT_SEO.AVG_CORE_UPDATE_TRAFFIC_DROP,
};

/**
 * Projects the startup-navigation-tool market forward at the published CAGR.
 *
 * @param currentVal Current estimated market value.
 * @param years Projection horizon in years (fractional years supported).
 * @returns Projected market value.
 */
export function calculateMarketProjection(currentVal: number, years: number): number {
  return currentVal * Math.pow(1 + AU_MARKET_DATA.NAVIGATION_TOOL_CAGR, years);
}

/**
 * Whether a draft meets the current B2B SEO "power page" bar — both the length
 * threshold and the E-E-A-T signal are required.
 *
 * @param wordCount Length of the content.
 * @param hasEEATSignals Whether the content carries expert citations / authoritative data.
 */
export function isContentCompetitive(wordCount: number, hasEEATSignals: boolean): boolean {
  return wordCount >= CONTENT_BENCHMARKS.targetB2BBlogLength && hasEEATSignals;
}

/**
 * AU seed-stage "funding velocity": average raise per startup expressed as a
 * fraction of the national monthly seed-funding intensity.
 *
 * @param totalRaised Total raised by the cohort (AUD).
 * @param cohortSize Number of startups in the cohort.
 */
export function calculateAUFundingVelocity(totalRaised: number, cohortSize: number): number {
  const avgPerStartup = totalRaised / cohortSize;
  return avgPerStartup / AU_MARKET_DATA.SEED_MONTHLY_FUNDING_INTENSITY;
}

/**
 * Core-update risk for a domain, from its E-E-A-T score and content freshness.
 *
 * @param eeatScore Normalised E-E-A-T score (0-1).
 * @param lastUpdateDate Date of the last major content overhaul.
 * @returns Risk in the [0, 1] band.
 */
export function calculateSEOUpdateRisk(eeatScore: number, lastUpdateDate: Date): number {
  const now = new Date();
  const monthsSinceUpdate = (now.getTime() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24 * 30);

  let risk = CONTENT_BENCHMARKS.coreUpdateRiskDrop;
  if (eeatScore > 0.8) risk -= 0.05;
  if (monthsSinceUpdate > 6) risk += 0.05;

  return Math.max(0, Math.min(1, risk));
}

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
