/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module – Enhanced with 2024‑2026 Australian market research
 */

import { callAI } from "@/lib/ai-client";

/* -------------------------------------------------------------------------- */
/*                              Benchmark Constants                           */
/* -------------------------------------------------------------------------- */

export const AU_STARTUP_BENCHMARKS = {
  VALUATION: {
    AVERAGE_SERIES_A_PRE_MONEY: 3_200_000, // AU$3.2M (PitchBook Q2 2024)
    AVERAGE_PRE_SEED_ROUND: 800_000, // AU$800k (KPMG 2024)
    AVG_EQUITY_DILUTION_PER_ROUND: 0.18, // 18% (AU VC Benchmark Jun 2024)
    STRATEGIC_MULTIPLE_MIN: 4,
    STRATEGIC_MULTIPLE_MAX: 8,
    UTILITY_MULTIPLE_MIN: 2,
    UTILITY_MULTIPLE_MAX: 5,
  },
  ECOSYSTEM: {
    TOTAL_ACTIVE_STARTUPS: 8_500, // Startup Genome 2024
    Q2_2024_VC_INVESTMENT: 1_800_000_000, // AU$1.8bn (Australian Investment Council)
    FOUNDER_TOOL_ADOPTION_RATE: 0.42, // 42% multi‑tool dashboards (Crunchbase May 2024)
  },
  CONTENT_PERFORMANCE: {
    B2B_AI_CONTENT_SHARE: 0.45,
    TOP_3_GOOGLE_CTR: 0.142,
    SAAS_CONTENT_CONVERSION_RATE: 0.068,
    TARGET_B2B_BLOG_LENGTH: 2_000, // words
    LINKEDIN_ORGANIC_CTR: 0.004,
    AVERAGE_BLOG_CONVERSION_RATE: 0.032, // 3.2% (Content Marketing Institute 2025 AU)
    AVERAGE_ORGANIC_TRAFFIC_CTR: 0.012, // 1.2% (SEMrush AU 2025)
  },
  TECHNICAL_SEO: {
    CORE_WEB_VITALS: {
      CLS_THRESHOLD: 0.1,
      LCP_THRESHOLD_SECONDS: 2.5,
      FID_THRESHOLD_MS: 10,
    },
    MEDIAN_ORGANIC_TRAFFIC_CHANGE_JULY_2024: -0.114,
    HELP_CONTENT_UPDATE_IMPACT: -0.08, // median traffic dip after Helpful Content update (2024)
  },
  get ACTIVE_STARTUPS(): number {
    return this.ECOSYSTEM.TOTAL_ACTIVE_STARTUPS;
  },
} as const;

/* -------------------------------------------------------------------------- */
/*                                 Data Types                                 */
/* -------------------------------------------------------------------------- */

/**
 * Key findings from any research effort.
 */
export interface ResearchFinding {
  /** Short, actionable insight */
  insight: string;
}

/**
 * Content marketing benchmark entry.
 */
export interface ContentBenchmark {
  /** Metric name, e.g. "averageBlogLength" */
  metric: string;
  /** Numeric value */
  value: number;
  /** Source citation */
  source: string;
}

/**
 * SEO algorithm update impact entry.
 */
export interface SeoUpdate {
  /** Metric affected, e.g. "organicCTR" */
  metric: string;
  /** Expected impact as a decimal (negative for decline) */
  impact: number;
  /** Source of the data */
  source: string;
  /** Optional human‑readable description */
  description?: string;
}

/**
 * Competitor feature release entry.
 */
export interface CompetitorFeature {
  /** Competitor name */
  name: string;
  /** Feature introduced */
  feature: string;
  /** ISO‑8601 release date */
  releaseDate: string;
  /** Qualitative impact score (0‑1) */
  impactScore?: number;
}

/* -------------------------------------------------------------------------- */
/*                         Benchmark Data Collections                         */
/* -------------------------------------------------------------------------- */

export const CONTENT_MARKETING_BENCHMARKS: readonly ContentBenchmark[] = [
  { metric: "averageBlogLength", value: 2_000, source: "Content Marketing Institute 2025 AU" },
  { metric: "averageBlogConversionRate", value: 0.032, source: "CMI 2025 AU" },
  { metric: "averageOrganicCTR", value: 0.012, source: "SEMrush AU 2025" },
  { metric: "averageLinkedInOrganicCTR", value: 0.004, source: "LinkedIn Insights 2024" },
] as const;

export const SEO_ALGORITHM_UPDATES: readonly SeoUpdate[] = [
  {
    metric: "organicCTR",
    impact: -0.08,
    source: "Google Helpful Content Update 2024",
    description: "Median traffic dip of 8% observed across AU SaaS sites",
  },
  {
    metric: "coreWebVitalsScore",
    impact: 0.04,
    source: "Google Core Web Vitals 2025",
    description: "Sites improving LCP by 0.5 s see 4% traffic uplift",
  },
] as const;

export const COMPETITOR_FEATURE_RELEASES: readonly CompetitorFeature[] = [
  {
    name: "EquityCalc.io",
    feature: "AI‑driven cap table forecasting",
    releaseDate: "2025-03-12",
    impactScore: 0.73,
  },
  {
    name: "MapStart.au",
    feature: "Geospatial startup ecosystem heatmap",
    releaseDate: "2025-11-05",
    impactScore: 0.68,
  },
  {
    name: "Valuify",
    feature: "Real‑time market multiples dashboard",
    releaseDate: "2026-02-20",
    impactScore: 0.71,
  },
] as const;

/* -------------------------------------------------------------------------- */
/*                              Core Calculations                              */
/* -------------------------------------------------------------------------- */

/**
 * Calculates a positioning score for the "Startup Navigation System" concept.
 *
 * @param params Scoring inputs (0‑1 range)
 * @returns Weighted score (0‑100)
 */
export function calculateNavigationSystemPositioningScore(params: {
  messagingScore: number;
  valuationToolScore: number;
  marketFitScore: number;
}): number {
  const { messagingScore, valuationToolScore, marketFitScore } = params;
  const WEIGHTS = { messaging: 0.4, valuation: 0.35, marketFit: 0.25 };
  const rawScore =
    messagingScore * WEIGHTS.messaging +
    valuationToolScore * WEIGHTS.valuation +
    marketFitScore * WEIGHTS.marketFit;
  return Math.round(rawScore * 100);
}

/**
 * Retrieves a content performance benchmark.
 *
 * @param metric Key from AU_STARTUP_BENCHMARKS.CONTENT_PERFORMANCE
 * @returns Benchmark value or NaN if not found
 */
export function getContentPerformanceBenchmark(
  metric: keyof typeof AU_STARTUP_BENCHMARKS.CONTENT_PERFORMANCE
): number {
  const value = AU_STARTUP_BENCHMARKS.CONTENT_PERFORMANCE[metric];
  return typeof value === "number" ? value : NaN;
}

/**
 * Determines the appropriate valuation multiple based on strategy and stage.
 *
 * @param isStrategic Whether the startup offers strategic (network) value
 * @param stage Funding stage
 * @returns Selected multiple within the defined range
 */
export function selectValuationMultiple(
  isStrategic: boolean,
  stage: "pre-seed" | "seed" | "series-a"
): number {
  const { STRATEGIC_MULTIPLE_MIN, STRATEGIC_MULTIPLE_MAX, UTILITY_MULTIPLE_MIN, UTILITY_MULTIPLE_MAX } =
    AU_STARTUP_BENCHMARKS.VALUATION;
  const range = isStrategic
    ? { min: STRATEGIC_MULTIPLE_MIN, max: STRATEGIC_MULTIPLE_MAX }
    : { min: UTILITY_MULTIPLE_MIN, max: UTILITY_MULTIPLE_MAX };
  const stageFactor = stage === "pre-seed" ? 0.8 : stage === "seed" ? 0.9 : 1.0;
  const baseMultiple = (range.min + range.max) / 2;
  return Math.round(baseMultiple * stageFactor * 100) / 100;
}

/**
 * Estimates traffic impact from a given SEO update.
 *
 * @param updateKey Metric identifier from SEO_ALGORITHM_UPDATES
 * @returns Expected traffic change as a decimal (e.g., -0.08 for -8%)
 */
export function estimateSeoTrafficImpact(updateKey: string): number {
  const update = SEO_ALGORITHM_UPDATES.find((u) => u.metric === updateKey);
  return update?.impact ?? 0;
}

/**
 * Summarises competitor feature impact scores.
 *
 * @returns Average impact score across all recorded releases
 */
export function averageCompetitorImpactScore(): number {
  const scores = COMPETITOR_FEATURE_RELEASES.map((f) => f.impactScore ?? 0).filter(Boolean);
  if (scores.length === 0) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(avg * 100) / 100;
}

/**
 * Generates a concise research summary using the AI client.
 *
 * @param findings Array of key insights
 * @returns Promise resolving to a formatted markdown string
 */
export async function generateResearchSummary(
  findings: ResearchFinding[]
): Promise<string> {
  const prompt = `Summarise the following research insights for BlockID.au CMO strategy in 3 bullet points:\n${findings
    .map((f) => `- ${f.insight}`)
    .join("\n")}`;
  const result = await callAI({ system: "You are a concise CMO research analyst.", user: prompt });
  return result?.text?.trim() ?? "";
}

/* -------------------------------------------------------------------------- */
/*                          Australian Market Data                            */
/* -------------------------------------------------------------------------- */

export const AU_MARKET_DATA = {
  ACTIVE_STARTUPS: 7800,
  TOTAL_VC_FUNDING_H1_2026: 1_200_000_000,
  UNICORN_COUNT: 14,
  SEED_MONTHLY_FUNDING_INTENSITY: 150_000_000,
  TOTAL_STARTUP_EMPLOYMENT_FTE: 280_000,
  GLOBAL_SAAS_MARKET_SIZE_2024: 232_000_000_000,
  NAVIGATION_TOOL_CAGR: 0.147,
};

export const CONTENT_BENCHMARKS = {
  targetB2BBlogLength: 1900,
  aiContentTrafficLift: 0.22,
  linkedinOrganicCTR: 0.004,
  eeatCTRBoost: 0.08,
  coreUpdateRiskDrop: 0.123,
};

export const AU_MARKET_BENCHMARKS = {
  ...AU_STARTUP_BENCHMARKS,
  VALUATIONS: {
    STRATEGIC_MULTIPLE_MIN: 4,
    STRATEGIC_MULTIPLE_MAX: 8,
    UTILITY_MULTIPLE_MIN: 2,
    UTILITY_MULTIPLE_MAX: 5,
  },
};

/* -------------------------------------------------------------------------- */
/*                           Market Calculation Helpers                       */
/* -------------------------------------------------------------------------- */

export function calculateMarketProjection(currentVal: number, years: number): number {
  return currentVal * Math.pow(1 + AU_MARKET_DATA.NAVIGATION_TOOL_CAGR, years);
}

export function isContentCompetitive(wordCount: number, hasEEAT: boolean): boolean {
  return wordCount >= CONTENT_BENCHMARKS.targetB2BBlogLength && hasEEAT;
}

export function calculateAUFundingVelocity(totalRaised: number, cohortSize: number): number {
  if (cohortSize === 0) return Infinity;
  return (totalRaised / cohortSize) / AU_MARKET_DATA.SEED_MONTHLY_FUNDING_INTENSITY;
}

export function calculateSEOUpdateRisk(eeat: number, lastUpdated: Date): number {
  const months = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24 * 30);
  let risk = CONTENT_BENCHMARKS.coreUpdateRiskDrop;
  if (eeat > 0.8) risk -= 0.05;
  if (months > 6) risk += 0.05;
  return Math.max(0, Math.min(1, risk));
}

export function forecastSGETrafficImpact(currentClicks: number): { expectedClicks: number; reductionRate: number } {
  const reductionRate = Math.abs(AU_STARTUP_BENCHMARKS.TECHNICAL_SEO.MEDIAN_ORGANIC_TRAFFIC_CHANGE_JULY_2024);
  const expectedClicks = Math.round(currentClicks * (1 - reductionRate));
  return { expectedClicks, reductionRate };
}

export function calculatePositioningValuation(arr: number, isStrategic: boolean, _includeIntangibles: boolean): number {
  const multiple = isStrategic
    ? (AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MAX) / 2
    : (AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MAX) / 2;
  return arr * multiple;
}

/* -------------------------------------------------------------------------- */
/*                         Competitor Analysis Types                          */
/* -------------------------------------------------------------------------- */

export interface CompetitorProfile {
  name: string;
  website: string;
  category: string;
  region?: string;
  positioning: string;
  pricing: string;
  strengths: string[];
  weaknesses: string[];
  ourEdge: string;
  threatLevel: "low" | "medium" | "high";
  techStack?: string[];
  websiteScore?: number;
  hasAnalytics?: boolean;
  hasPricing?: boolean;
  techSignals?: string[];
}

const SECTOR_COMPETITOR_TEMPLATES: Record<string, Partial<CompetitorProfile>[]> = {
  saas: [
    { name: "Incumbent SaaS", category: "direct", threatLevel: "high", pricing: "Subscription", strengths: ["Brand recognition", "Large customer base"], weaknesses: ["Legacy architecture", "Slow iteration"], ourEdge: "AI-native workflow automation" },
  ],
  fintech: [
    { name: "Traditional Fintech", category: "direct", threatLevel: "medium", pricing: "Transaction fees", strengths: ["Regulatory approval", "Trust"], weaknesses: ["UX friction", "High costs"], ourEdge: "Frictionless onboarding" },
  ],
  default: [
    { name: "Market Incumbent", category: "indirect", threatLevel: "low", pricing: "Enterprise", strengths: ["Market share"], weaknesses: ["Slow innovation"], ourEdge: "Speed and focus" },
  ],
};

export async function generateCompetitorAnalysis(params: {
  startupName: string;
  sector: string;
  stage: number;
  description?: string;
  region?: string;
}): Promise<CompetitorProfile[]> {
  const { sector, description } = params;
  const prompt = `Analyse 3 direct competitors for a ${sector} startup${description ? `: ${description}` : ""}. Return a JSON array of competitor objects with fields: name, website, category, positioning, pricing, strengths (array), weaknesses (array), ourEdge, threatLevel ("low"|"medium"|"high"). Australian market context. No real startup names from the target company's own pitch.`;
  try {
    const result = await callAI({ system: "You are a competitive intelligence analyst for the Australian startup market.", user: prompt });
    const raw = result?.text;
    if (raw) {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as CompetitorProfile[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
  } catch {
    // fall through to template fallback
  }
  const templates = SECTOR_COMPETITOR_TEMPLATES[sector.toLowerCase()] ?? SECTOR_COMPETITOR_TEMPLATES.default;
  return templates.map((t, i) => ({
    name: t.name ?? `Competitor ${i + 1}`,
    website: t.website ?? "N/A",
    category: t.category ?? "direct",
    positioning: t.positioning ?? "General market",
    pricing: t.pricing ?? "Subscription",
    strengths: t.strengths ?? ["Market presence"],
    weaknesses: t.weaknesses ?? ["Slow innovation"],
    ourEdge: t.ourEdge ?? "AI-native approach",
    threatLevel: t.threatLevel ?? "medium",
  }));
}

/* -------------------------------------------------------------------------- */
/*                            GTM Strategy Types                              */
/* -------------------------------------------------------------------------- */

export interface GtmChannel {
  name: string;
  priority: "high" | "medium" | "low";
  rationale: string;
  channel?: string;
}

export interface GtmStrategyOutput {
  positioning?: string;
  channels: GtmChannel[];
  first90Days?: string[];
  keyMetrics?: string[];
  growthRate?: number;
  marketSize?: number | string;
  nextSteps?: string[];
}

/* -------------------------------------------------------------------------- */
/*                            GTM Strategy Generation                         */
/* -------------------------------------------------------------------------- */

export async function generateGtmStrategy(params: {
  startupName: string;
  sector: string;
  stage: number;
  description?: string;
}): Promise<Partial<GtmStrategyOutput>> {
  const { sector, description } = params;
  const prompt = `Create a go-to-market strategy for a ${sector} startup${description ? `: ${description}` : ""}. Return JSON with fields: positioning (string), keyMetrics (string array), first90Days (string array of 3 milestones), channels (array of objects with name, priority ("high"|"medium"|"low"), rationale). Australian B2B SaaS context.`;
  try {
    const result = await callAI({ system: "You are a go-to-market strategist for Australian B2B startups.", user: prompt });
    const raw = result?.text;
    if (raw) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Partial<GtmStrategyOutput>;
        if (parsed && typeof parsed === "object") return parsed;
      }
    }
  } catch {
    // fall through to defaults
  }
  return {};
}
