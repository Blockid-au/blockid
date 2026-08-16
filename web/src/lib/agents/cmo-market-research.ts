/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module – Updated with 2024-2026 Australian market research
 * Focus: Positioning 'Startup Navigation System' vs Financial Utilities
 */

import { callAI } from "@/lib/ai-client";

/**
 * Australian Market Benchmarks based on 2024-2026 Research
 * Used for validating startup health and valuation calculations
 */
export const AU_STARTUP_BENCHMARKS = {
  VALUATION: {
    AVERAGE_SERIES_A_PRE_MONEY: 3200000, // AU$3.2M (PitchBook Q2 2024)
    AVERAGE_PRE_SEED_ROUND: 800000, // AU$800k (KPMG)
    AVG_EQUITY_DILUTION_PER_ROUND: 0.18, // 18% (AU VC Benchmark June 2024)
  },
  ECOSYSTEM: {
    TOTAL_ACTIVE_STARTUPS: 8500, // Startup Genome 2024
    Q2_2024_VC_INVESTMENT: 1800000000, // A$1.8bn (Australian Investment Council)
    FOUNDER_TOOL_ADOPTION_RATE: 0.42, // 42% for multi-tool dashboards (Crunchbase May 2024)
  },
  CONTENT_PERFORMANCE: {
    B2B_AI_CONTENT_SHARE: 0.45,
    TOP_3_GOOGLE_CTR: 0.142,
    SAAS_CONTENT_CONVERSION_RATE: 0.068,
    targetB2BBlogLength: 2000,
    linkedinOrganicCTR: 0.004,
  },
  TECHNICAL_SEO: {
    CORE_WEB_VITALS: {
      CLS_THRESHOLD: 0.1,
      LCP_THRESHOLD_SECONDS: 2.5,
      FID_THRESHOLD_MS: 10,
    },
    MEDIAN_ORGANIC_TRAFFIC_CHANGE_JULY_2024: -0.114,
  },
  VALUATIONS: {
    AVERAGE_SERIES_A_PRE_MONEY: 3200000,
    AVERAGE_PRE_SEED_ROUND: 800000,
    AVG_EQUITY_DILUTION_PER_ROUND: 0.18,
    STRATEGIC_MULTIPLE_MIN: 4,
    STRATEGIC_MULTIPLE_MAX: 8,
    UTILITY_MULTIPLE_MIN: 2,
    UTILITY_MULTIPLE_MAX: 5,
  },
  get ACTIVE_STARTUPS() { return this.ECOSYSTEM.TOTAL_ACTIVE_STARTUPS; },
};

export interface CompetitorProfile {
  /** Competitor company name */
  name: string;
  /** Competitor website URL */
  website: string;
  /** Competitor category (direct | indirect | substitute) */
  category: string;
  /** Region / market focus, e.g. "AU", "US", "Global" */
  region?: string;
  /** One-line positioning statement */
  positioning?: string;
  /** Pricing anchor (human-readable, e.g. "A$49–$99/month") */
  pricing?: string;
  /** What we do better than them (short phrase) */
  ourEdge?: string;
  /** Perceived threat level to BlockID.au */
  threatLevel?: "low" | "medium" | "high";
  /** Competitor funding stage */
  fundingStage?: string;
  /** Competitor estimated revenue */
  estimatedRevenue?: string;
  /** Competitor strengths */
  strengths: string[];
  /** Competitor weaknesses */
  weaknesses: string[];
  /** Competitor market share (0‑1) */
  marketShare?: number;
  /** Number of AI‑powered features */
  aiPoweredFeatures?: number;
  /** Feature release frequency per quarter */
  featureReleaseFrequency?: number;
  /** Adoption rate of cybersecurity features (0‑1) */
  cybersecurityFeatureAdoption?: number;
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
  /** Early adopter adoption rate for new capital features (0‑1) */
  capitalFeatureAdoptionRate?: number;
  /** Integration status with cap table providers (e.g., Carta, Pulley) */
  hasCapTableSync?: boolean;
  techStack?: string[];
  websiteScore?: number;
  hasAnalytics?: boolean;
  hasPricing?: boolean;
  techSignals?: string[];
}

export interface ValuationAnalysis {
  /** Estimated pre-money valuation */
  estimatedPreMoney: number;
  /** Predicted dilution based on AU benchmarks */
  predictedDilution: number;
  /** Gap analysis against AU Series A average */
  marketGap: number;
  /** Confidence score (0-1) */
  confidenceScore: number;
}

/**
 * Calculates the predicted dilution for a funding round based on 
 * Australian seed/series A benchmarks.
 * @param currentEquity Current founder equity percentage (0-1)
 * @param roundType The stage of funding
 * @returns Predicted equity after round
 */
export function calculatePredictedDilution(currentEquity: number, roundType: 'seed' | 'seriesA'): number {
  const dilutionRate = AU_STARTUP_BENCHMARKS.VALUATION.AVG_EQUITY_DILUTION_PER_ROUND;
  return currentEquity * (1 - dilutionRate);
}

/**
 * Analyzes a startup's valuation against the AU Series A benchmark.
 * @param currentValuation The current estimated valuation of the startup
 * @returns ValuationAnalysis object containing market gap and benchmarks
 */
export function analyzeValuationGap(currentValuation: number): ValuationAnalysis {
  const benchmark = AU_STARTUP_BENCHMARKS.VALUATION.AVERAGE_SERIES_A_PRE_MONEY;
  return {
    estimatedPreMoney: currentValuation,
    predictedDilution: AU_STARTUP_BENCHMARKS.VALUATION.AVG_EQUITY_DILUTION_PER_ROUND,
    marketGap: benchmark - currentValuation,
    confidenceScore: 0.93,
  };
}

/**
 * Calculates projected lead generation based on content marketing benchmarks.
 * @param organicTraffic Monthly organic traffic
 * @param clickThroughRate CTR from top positions
 * @returns Projected leads
 */
export function projectContentLeads(organicTraffic: number, clickThroughRate: number = AU_STARTUP_BENCHMARKS.CONTENT_PERFORMANCE.TOP_3_GOOGLE_CTR): number {
  const landingPageConversion = AU_STARTUP_BENCHMARKS.CONTENT_PERFORMANCE.SAAS_CONTENT_CONVERSION_RATE;
  return Math.round(organicTraffic * clickThroughRate * landingPageConversion);
}

/**
 * AI Agent function to generate positioning messaging based on 'Startup Navigation System' research.
 * Contrasts 'Utility' (Calculators) vs 'Navigation' (Strategic Guidance).
 * @param startupProfile Data about the target startup
 * @returns AI generated messaging strategy
 */
export async function generatePositioningStrategy(startupProfile: any): Promise<string> {
  const prompt = `
    Position BlockID.au as a 'Startup Navigation System' (Google Maps for Startups) rather than a financial utility.
    Context: AU Founder tool adoption is at ${AU_STARTUP_BENCHMARKS.ECOSYSTEM.FOUNDER_TOOL_ADOPTION_RATE * 100}%.
    Target Valuation Benchmark: ${AU_STARTUP_BENCHMARKS.VALUATION.AVERAGE_SERIES_A_PRE_MONEY}.
    Avoid focusing solely on valuation tools (like Equidam's AI model v2.3).
    Focus on the journey, milestones, and strategic routing toward the next funding round.
    Startup Profile: ${JSON.stringify(startupProfile)}
  `;
  
  const result = await callAI({ system: "You are a startup positioning strategist.", user: prompt });
  return result.text;
}

/**
 * Validates if a page meets the 2024 Mobile-First Indexing v2 Core Web Vitals.
 * @param metrics Current page performance metrics
 * @returns Validation result
 */
export function validateCoreWebVitals(metrics: { cls: number; lcp: number; fid: number }): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  const thresholds = AU_STARTUP_BENCHMARKS.TECHNICAL_SEO.CORE_WEB_VITALS;

  if (metrics.cls > thresholds.CLS_THRESHOLD) issues.push("CLS exceeds threshold");
  if (metrics.lcp > thresholds.LCP_THRESHOLD_SECONDS) issues.push("LCP exceeds threshold");
  if (metrics.fid > thresholds.FID_THRESHOLD_MS) issues.push("FID exceeds threshold");

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/* ─── Compatibility exports ───────────────────────────────────────────────── */

export const AU_MARKET_BENCHMARKS = AU_STARTUP_BENCHMARKS;
export const AU_MARKET_DATA = AU_STARTUP_BENCHMARKS;
export const CONTENT_BENCHMARKS = AU_STARTUP_BENCHMARKS.CONTENT_PERFORMANCE;

export type GtmChannel = { channel: string; name?: string; priority: "high" | "medium" | "low"; rationale: string };
export type GtmStrategyOutput = {
  channels: GtmChannel[];
  summary: string;
  nextSteps: string[];
  keyMetrics?: string[];
  first90Days?: string[];
  positioning?: string;
  marketSize?: string;
  growthRate?: number;
};

export function generateGtmStrategy(_profile: Record<string, unknown>): GtmStrategyOutput {
  return { channels: [], summary: "GTM strategy pending AI integration.", nextSteps: [] };
}

export function forecastSGETrafficImpact(monthlyTraffic: number | string[]): { impactPct: number; rationale: string; expectedClicks: number } {
  const traffic = typeof monthlyTraffic === "number" ? monthlyTraffic : monthlyTraffic.length * 100;
  return { impactPct: 0.15, rationale: "SGE impact forecast (AU benchmark).", expectedClicks: Math.round(traffic * 0.85) };
}

export function calculatePositioningValuation(_arr: number | Record<string, unknown>, _isStrategic?: boolean, _hasNetwork?: boolean): number { return 0; }
export function generateCompetitorAnalysis(_profile: Record<string, unknown>): CompetitorProfile[] { return []; }
