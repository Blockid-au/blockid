/**
 * src/lib/agents/cmo-market-research.ts
 * BlockID.au CMO Domain Module – Updated with 2024-2026 Australian market research
 * Focus: Positioning 'Startup Navigation System' vs Financial Utilities
 */

import { callAI } from "@/lib/ai-client";

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
  /** Whether the tool is positioned as a 'Navigation/Roadmap' system vs a 'Utility' (Strategic Multiple Impact) */
  isPositionedAsStrategicNavigation?: boolean;
  /** Denormalised AU market size for the sector this competitor plays in (A$) */
  marketSize?: number;
  /** Sector CAGR (0-1) — sourced from AU_MARKET_BENCHMARKS */
  growthRate?: number;

  // ─── Tech Intelligence enrichment fields ─────────────────────────────────
  /** Canonical website URL used for tech analysis (may differ from display website) */
  websiteUrl?: string;
  /** Tech stack detected from website (e.g. ["Next.js", "Vercel", "Stripe"]) */
  techStack?: string[];
  /** Website quality score 0-100 computed by computeWebsiteScore() */
  websiteScore?: number;
  /** Whether analytics (GA4/GTM/Segment etc.) were detected */
  hasAnalytics?: boolean;
  /** Whether a pricing page/section was detected */
  hasPricing?: boolean;
  /** Human-readable tech signal chips, max 5 (e.g. "SSL ✓", "Fast load (<1s)") */
  techSignals?: string[];
}

/**
 * Customer segment definition
 */
export interface CustomerSegment {
  /** Segment name */
  name: string;
  /** Segment size (number of companies) */
  size: number;
  /** Willingness to pay */
  willingness: 'high' | 'medium' | 'low';
  /** Primary focus: 'domestic' | 'global' */
  marketFocus: 'domestic' | 'global';
  /** Percentage of this segment prioritizing AI adoption (0‑1) */
  aiPrioritizationRate: number;
  /** Average dilution rate observed in this segment (0‑1) */
  averageDilutionRate: number;
  /** Preference for roadmap/dilution planning over simple valuation (0-1) */
  roadmapPreferenceRate: number;
  /** Target Burn Multiple for this segment (Benchmark: < 1.5x) */
  targetBurnMultiple: number;
}

/**
 * Australian Market Benchmarks 2024-2026
 */
export const AU_MARKET_BENCHMARKS = {
  VALUATIONS: {
    /** Average Seed Stage Valuation (AU) - Range A$3M to A$7M */
    SEED_AVG_MIN: 3000000,
    SEED_AVG_MAX: 7000000,
    /** Typical discount rate applied to AU pre-revenue startups vs US counterpart (0.10 - 0.15) */
    AU_US_DISCOUNT_RATE: 0.125,
    /** Median Revenue Multiple for B2B SaaS AU (4x - 8x) */
    B2B_SAAS_MEDIAN_MULTIPLE_MIN: 4,
    B2B_SAAS_MEDIAN_MULTIPLE_MAX: 8,
    /** Strategic/Growth Tool Multiples (8x - 12x) */
    STRATEGIC_MULTIPLE_MIN: 8,
    STRATEGIC_MULTIPLE_MAX: 12,
    /** Financial Utility Multiples (4x - 6x) */
    UTILITY_MULTIPLE_MIN: 4,
    UTILITY_MULTIPLE_MAX: 6,
    /** Seed-stage AI startups Global/AU Multiples (15x - 25x) */
    AI_SEED_MULTIPLE_MIN: 15,
    AI_SEED_MULTIPLE_MAX: 25,
  },
  MARKETING: {
    /** Average B2B Content Marketing Conversion Rate (2.3% - 5.2%) */
    B2B_CONTENT_CONV_MIN: 0.023,
    B2B_CONTENT_CONV_MAX: 0.052,
    /** Organic CTR for Top 3 Search Results (Declining due to AI Overviews: 10% - 30%) */
    ORGANIC_CTR_MIN: 0.10,
    ORGANIC_CTR_MAX: 0.30,
    /** CPA reduction via Content vs Paid over 12 months (62% lower) */
    CONTENT_CPA_REDUCTION: 0.62,
    /** SGE/AI Overview Click-Through Rate Reduction (18% - 30%) */
    SGE_CTR_IMPACT_MIN: 0.18,
    SGE_CTR_IMPACT_MAX: 0.30,
    /** Gen Z preference for Social Discovery over Google (40%) */
    GENZ_SOCIAL_DISCOVERY_RATE: 0.40,
    /** Traffic Volatility Post-Core Update (15% - 25%) */
    CORE_UPDATE_VOLATILITY_MIN: 0.15,
    CORE_UPDATE_VOLATILITY_MAX: 0.25,
  },
  ECOSYSTEM: {
    /** VC Funding Volume Trend YoY (-20% to -30%) */
    VC_FUNDING_TREND_MIN: -0.30,
    VC_FUNDING_TREND_MAX: -0.20,
    /** Adoption rate of AI-assisted valuation tools among VCs (35% increase YoY) */
    VC_AI_TOOL_ADOPTION_INCREASE: 0.35,
  }
};

/**
 * Calculates the estimated valuation based on positioning (Strategic vs Utility)
 * Incorporates the finding that 'Navigation' tools command higher multiples.
 */
export function calculatePositioningValuation(arr: number, isStrategic: boolean, isAI: boolean = false): number {
  if (isAI) {
    return arr * ((AU_MARKET_BENCHMARKS.VALUATIONS.AI_SEED_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.AI_SEED_MULTIPLE_MAX) / 2);
  }
  
  const multiple = isStrategic 
    ? (AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MAX) / 2
    : (AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MIN + AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MAX) / 2;
    
  return arr * multiple;
}

/**
 * Forecasts the impact of SGE (Search Generative Experience) on top-of-funnel traffic
 */
export function forecastSGETrafficImpact(currentMonthlyClicks: number): { expectedClicks: number; potentialLoss: number } {
  const avgLoss = (AU_MARKET_BENCHMARKS.MARKETING.SGE_CTR_IMPACT_MIN + AU_MARKET_BENCHMARKS.MARKETING.SGE_CTR_IMPACT_MAX) / 2;
  const potentialLoss = currentMonthlyClicks * avgLoss;
  return {
    expectedClicks: currentMonthlyClicks - potentialLoss,
    potentialLoss: potentialLoss
  };
}

/**
 * Evaluates if a startup is within the healthy burn multiple range for AU B2B SaaS
 */
export function evaluateBurnHealth(netBurn: number, netNewARR: number): { isHealthy: boolean; burnMultiple: number } {
  const burnMultiple = netNewARR === 0 ? Infinity : netBurn / netNewARR;
  return {
    isHealthy: burnMultiple < 1.5,
    burnMultiple: burnMultiple
  };
}

/**
 * Calculates the content marketing ROI advantage over paid channels
 */
export function calculateContentCPASavings(paidCPA: number): number {
  return paidCPA * AU_MARKET_BENCHMARKS.MARKETING.CONTENT_CPA_REDUCTION;
}

// ─── Public API consumed by cmo-market-research.test.ts (authoritative) ──
// Kept separate from the AU_MARKET_BENCHMARKS block above so intent stays
// clear: these anchors are pinned by the colocated test suite; edits must
// update the test in the same tick or the test-gate will revert them.

/** 2024–2026 Australian startup-ecosystem anchor set. Pinned by test suite. */
export const AU_MARKET_DATA = {
  ACTIVE_STARTUPS: 7800,
  TOTAL_VC_FUNDING_H1_2026: 2_400_000_000,
  UNICORN_COUNT: 14,
  // A$150M/month of seed capital flows into AU startups (2024–2026 avg).
  // Used as the denominator for calculateAUFundingVelocity.
  SEED_MONTHLY_FUNDING_INTENSITY: 150_000_000,
  TOTAL_STARTUP_EMPLOYMENT_FTE: 87_000,
  GLOBAL_SAAS_MARKET_SIZE_2024: 317_000_000_000,
  NAVIGATION_TOOL_CAGR: 0.147,
} as const;

/**
 * SEO / content-marketing benchmarks. Mutable so tests can force clamp edges.
 */
export const CONTENT_BENCHMARKS = {
  targetB2BBlogLength: 1900,
  aiContentTrafficLift: 0.45,
  linkedinOrganicCTR: 0.055,
  eeatCTRBoost: 0.12,
  coreUpdateRiskDrop: 0.123,
};

/** Compound the AU navigation-tool CAGR (14.7%) over `years`. */
export function calculateMarketProjection(currentVal: number, years: number): number {
  return currentVal * Math.pow(1 + AU_MARKET_DATA.NAVIGATION_TOOL_CAGR, years);
}

/** A page is competitive only when it clears BOTH the length and E-E-A-T gates. */
export function isContentCompetitive(wordCount: number, hasEEAT: boolean): boolean {
  return wordCount >= CONTENT_BENCHMARKS.targetB2BBlogLength && hasEEAT;
}

/**
 * Cohort funding velocity = per-startup raise / national monthly seed intensity.
 * Empty cohort surfaces as Infinity (div-by-zero); zero raise → 0.
 */
export function calculateAUFundingVelocity(totalRaised: number, cohortSize: number): number {
  const avgPerStartup = totalRaised / cohortSize;
  return avgPerStartup / AU_MARKET_DATA.SEED_MONTHLY_FUNDING_INTENSITY;
}

/**
 * Estimated post-core-update SEO risk in [0, 1].
 * Baseline = CONTENT_BENCHMARKS.coreUpdateRiskDrop. E-E-A-T > 0.8 shaves 0.05;
 * content older than 6 months (30-day months) adds 0.05. Result is clamped.
 */
export function calculateSEOUpdateRisk(eeat: number, lastUpdate: Date): number {
  let risk = CONTENT_BENCHMARKS.coreUpdateRiskDrop;
  if (eeat > 0.8) risk -= 0.05;
  const monthsSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24 * 30);
  if (monthsSinceUpdate > 6) risk += 0.05;
  return Math.max(0, Math.min(1, risk));
}

// ─── LLM-backed generators ───────────────────────────────────────────────
// Route through callAI() so the free provider chain
// (Cerebras → Groq → SambaNova → Claude OAuth → OpenRouter) is used, with
// health tracking, cooldowns and cost accounting. NEVER call fetch directly.
// On any parse/LLM failure, fall back to the deterministic sector templates
// so the endpoint never surfaces a hard error to the founder UI.

const CMO_SYSTEM_PROMPT =
  "You are an Australian market research analyst. Respond with valid JSON only, no markdown code fences.";

/** Sector → default competitor archetypes (deterministic fallback). */
const COMPETITOR_TEMPLATES: Record<string, CompetitorProfile[]> = {
  saas: [
    {
      name: "Atlassian",
      website: "https://atlassian.com",
      category: "indirect",
      region: "AU",
      positioning: "Enterprise team collaboration and project management platform",
      pricing: "A$10–$42/user/month",
      strengths: ["Brand recognition", "Deep integrations", "Large enterprise customer base"],
      weaknesses: ["Complex setup", "Expensive at scale", "Not startup-focused"],
      ourEdge: "Purpose-built for AU startups with SVI scoring and investor readiness",
      threatLevel: "low",
    },
    {
      name: "Employment Hero",
      website: "https://employmenthero.com",
      category: "indirect",
      region: "AU",
      positioning: "AU HR, payroll and employee benefits platform",
      pricing: "A$8–$20/employee/month",
      strengths: ["Strong AU market presence", "Compliance-ready", "VC-backed"],
      weaknesses: ["HR-only focus", "No cap table or fundraising tools"],
      ourEdge: "Broader founder intelligence: cap table, SVI, investor matching",
      threatLevel: "low",
    },
    {
      name: "Visible.vc",
      website: "https://visible.vc",
      category: "direct",
      region: "US",
      positioning: "Startup investor updates and portfolio reporting",
      pricing: "US$79–$499/month",
      strengths: ["Clean UI", "Global investor network", "KPI dashboards"],
      weaknesses: ["US-centric", "No AU compliance", "Limited SVI-style scoring"],
      ourEdge: "AU-native benchmarks, SVI scoring, Startup Index™ positioning",
      threatLevel: "high",
    },
  ],
  fintech: [
    {
      name: "Xero",
      website: "https://xero.com",
      category: "indirect",
      region: "AU",
      positioning: "SME accounting and bookkeeping for AU/NZ businesses",
      pricing: "A$32–$115/month",
      strengths: ["Market leader in AU", "Strong integrations", "Trusted brand"],
      weaknesses: ["Accounting-only", "No investor readiness or cap table tools"],
      ourEdge: "End-to-end founder navigation: valuation, SVI, investor matching",
      threatLevel: "low",
    },
    {
      name: "Carta",
      website: "https://carta.com",
      category: "direct",
      region: "US",
      positioning: "US-based cap table and equity management platform",
      pricing: "US$2,000–$20,000+/year",
      strengths: ["Gold standard for cap tables", "Large US investor network"],
      weaknesses: ["Expensive", "US-centric", "AU compliance gaps", "No SVI scoring"],
      ourEdge: "AU-native with Division 83A ESOP, SVI, and local VC benchmarks",
      threatLevel: "high",
    },
  ],
  default: [
    {
      name: "AngelList",
      website: "https://angellist.com",
      category: "indirect",
      region: "US",
      positioning: "US startup fundraising and talent platform",
      pricing: "Free–variable (carry-based for funds)",
      strengths: ["Massive US investor network", "Strong brand", "Free to join"],
      weaknesses: ["US-focused", "No AU compliance", "Limited local benchmarks"],
      ourEdge: "AU-specific SVI scoring, local investor matching, ESOP compliance",
      threatLevel: "medium",
    },
    {
      name: "Founderpath",
      website: "https://founderpath.com",
      category: "substitute",
      region: "US",
      positioning: "Revenue-based financing for SaaS founders",
      pricing: "6–12% of funding amount (fee)",
      strengths: ["Non-dilutive capital", "Fast approval", "SaaS-friendly"],
      weaknesses: ["Finance-only", "No strategic navigation or SVI intelligence"],
      ourEdge: "Full founder navigation: SVI, cap table, roadmap, team planning",
      threatLevel: "low",
    },
    {
      name: "Notion / Linear (combo)",
      website: "https://notion.so",
      category: "substitute",
      region: "Global",
      positioning: "General-purpose project planning and documentation tools",
      pricing: "A$15–$25/user/month",
      strengths: ["Flexible", "Popular", "Low cost", "Large ecosystem"],
      weaknesses: ["No startup-specific intelligence", "No SVI scoring", "No investor tools"],
      ourEdge: "Purpose-built founder intelligence with AU market benchmarks",
      threatLevel: "low",
    },
  ],
};

function sectorFallback(sector: string): CompetitorProfile[] {
  const key = sector.toLowerCase();
  return (
    COMPETITOR_TEMPLATES[key] ??
    COMPETITOR_TEMPLATES[key.split(" ")[0]] ??
    COMPETITOR_TEMPLATES.default
  );
}

/** Best-effort AU sector benchmarks; used to enrich LLM output. */
function sectorMarketAnchors(sector: string): { marketSize?: number; growthRate?: number } {
  const key = sector.toLowerCase();
  if (key.includes("saas")) {
    return {
      marketSize: AU_MARKET_DATA.GLOBAL_SAAS_MARKET_SIZE_2024,
      growthRate: AU_MARKET_DATA.NAVIGATION_TOOL_CAGR,
    };
  }
  if (key.includes("fintech")) {
    return {
      marketSize: 4_200_000_000, // AU fintech revenue proxy 2024
      growthRate: AU_MARKET_DATA.NAVIGATION_TOOL_CAGR,
    };
  }
  return {
    marketSize: AU_MARKET_DATA.TOTAL_VC_FUNDING_H1_2026,
    growthRate: AU_MARKET_DATA.NAVIGATION_TOOL_CAGR,
  };
}

function enrichCompetitors(
  competitors: CompetitorProfile[],
  sector: string,
  region: string,
): CompetitorProfile[] {
  const anchors = sectorMarketAnchors(sector);
  return competitors.map((c) => ({
    ...c,
    region: c.region ?? region,
    strengths: Array.isArray(c.strengths) ? c.strengths : [],
    weaknesses: Array.isArray(c.weaknesses) ? c.weaknesses : [],
    marketSize: c.marketSize ?? anchors.marketSize,
    growthRate: c.growthRate ?? anchors.growthRate,
  }));
}

function tryParseJSON<T>(raw: string): T | null {
  if (!raw) return null;
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Sometimes the model wraps the JSON in commentary — try to extract the
    // first top-level object/array.
    const match = stripped.match(/[\[{][\s\S]*[\]}]/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

export interface GenerateCompetitorInput {
  startupName: string;
  sector: string;
  stage: number;
  description?: string;
  region?: string;
}

// ─── Tech signal helpers ──────────────────────────────────────────────────

/**
 * Build human-readable tech signal chips from website signals.
 * Returns at most 5 chips.
 */
function buildTechSignalChips(signals: {
  hasSSL: boolean;
  hasAnalytics: boolean;
  hasPricing: boolean;
  techStack: string[];
  loadTimeMs: number;
}): string[] {
  const chips: string[] = [];

  // SSL
  chips.push(signals.hasSSL ? "SSL ✓" : "SSL ✗");

  // Analytics
  if (signals.hasAnalytics) chips.push("Analytics tracked");

  // Pricing
  if (signals.hasPricing) chips.push("Pricing page found");

  // Tech stack — pick most recognisable framework
  const knownFrameworks = ["Next.js", "React", "WordPress", "Shopify", "Webflow", "Wix", "Squarespace"];
  const detectedFramework = signals.techStack.find((t) => knownFrameworks.includes(t));
  if (detectedFramework) chips.push(`Built on ${detectedFramework}`);

  // Load time
  if (chips.length < 5) {
    if (signals.loadTimeMs > 0 && signals.loadTimeMs < 1000) chips.push("Fast load (<1s)");
    else if (signals.loadTimeMs >= 3000) chips.push("Slow (>3s)");
  }

  return chips.slice(0, 5);
}

/**
 * Wrap analyseWebsite() in an 8-second timeout via Promise.race().
 * On timeout or error, returns null so the caller can skip enrichment gracefully.
 */
async function analyseWebsiteWithTimeout(
  url: string,
  timeoutMs = 8000,
): Promise<import("./tech-intelligence").WebsiteSignals | null> {
  try {
    const { analyseWebsite, computeWebsiteScore: _unused } = await import("./tech-intelligence");
    void _unused; // imported for side-effect free bundling check
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const analysis = analyseWebsite(url);
    return await Promise.race([analysis, timeout]);
  } catch {
    return null;
  }
}

/**
 * LLM-backed competitor generator. Uses `callAI` (free provider chain), asks
 * for JSON, parses defensively, and falls back to the deterministic sector
 * template on any error. Enriches with AU market-size + CAGR anchors.
 * After LLM generation, enriches the top 3 competitors with live website
 * tech signals via analyseWebsite().
 */
export async function generateCompetitorAnalysis(
  input: GenerateCompetitorInput,
): Promise<CompetitorProfile[]> {
  const region = input.region ?? "AU";
  const user =
    `Startup: ${input.startupName}\n` +
    `Sector: ${input.sector}\n` +
    `Lifecycle stage (0-5): ${input.stage}\n` +
    (input.description ? `Description: ${input.description}\n` : "") +
    `Region focus: ${region}\n\n` +
    `Return 3-5 credible competitors for this startup as a JSON array. ` +
    `Each item must be an object with keys: ` +
    `name (string), website (string, canonical URL e.g. "https://example.com"), ` +
    `websiteUrl (string, same canonical URL), ` +
    `category ("direct"|"indirect"|"substitute"), ` +
    `region (string), positioning (short string), pricing (short string), ` +
    `strengths (string[]), weaknesses (string[]), ourEdge (short string), ` +
    `threatLevel ("low"|"medium"|"high"). ` +
    `Prioritise real, well-known Australian competitors where possible, ` +
    `and include one international benchmark if relevant. ` +
    `Always include a valid websiteUrl for each competitor. JSON only.`;

  let baseCompetitors: CompetitorProfile[];
  try {
    const result = await callAI({
      system: CMO_SYSTEM_PROMPT,
      user,
      maxTokens: 1800,
      temperature: 0.4,
    });

    const parsed = tryParseJSON<CompetitorProfile[]>(result.text);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      baseCompetitors = enrichCompetitors(sectorFallback(input.sector), input.sector, region);
    } else {
      baseCompetitors = enrichCompetitors(parsed, input.sector, region);
    }
  } catch {
    baseCompetitors = enrichCompetitors(sectorFallback(input.sector), input.sector, region);
  }

  // ── Enrich top 3 with live website tech signals ───────────────────────────
  const toEnrich = baseCompetitors.slice(0, 3);
  const rest = baseCompetitors.slice(3);

  const enriched = await Promise.allSettled(
    toEnrich.map(async (comp) => {
      // Prefer websiteUrl, fall back to website field
      const targetUrl = comp.websiteUrl ?? comp.website;
      if (!targetUrl) return comp;

      const signals = await analyseWebsiteWithTimeout(targetUrl);
      if (!signals) return comp; // graceful fallback

      const { computeWebsiteScore } = await import("./tech-intelligence");
      return {
        ...comp,
        websiteUrl: targetUrl,
        techStack: signals.techStack,
        websiteScore: computeWebsiteScore(signals),
        hasAnalytics: signals.hasAnalytics,
        hasPricing: signals.hasPricing,
        techSignals: buildTechSignalChips(signals),
      };
    }),
  );

  const enrichedCompetitors = enriched.map((result, i) =>
    result.status === "fulfilled" ? result.value : toEnrich[i],
  );

  return [...enrichedCompetitors, ...rest];
}

export interface GenerateGtmInput {
  startupName: string;
  sector: string;
  stage: number;
  description?: string;
  targetCustomer?: string;
}

export interface GtmChannel {
  name: string;
  priority: "high" | "medium" | "low";
  rationale: string;
}

export interface GtmStrategyOutput {
  positioning: string;
  channels: GtmChannel[];
  first90Days: string[];
  keyMetrics: string[];
  /** AU sector anchor enrichments */
  marketSize?: number;
  growthRate?: number;
}

/** Deterministic fallback used when the LLM call/parse fails. */
function gtmFallback(input: GenerateGtmInput): GtmStrategyOutput {
  const sector = input.sector.toLowerCase();
  const stage = input.stage;
  const stratMin = AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MIN;
  const stratMax = AU_MARKET_BENCHMARKS.VALUATIONS.STRATEGIC_MULTIPLE_MAX;

  const channels: GtmChannel[] =
    stage <= 1
      ? [
          { name: "founder-led-outbound", priority: "high", rationale: "Fastest signal loop pre-PMF." },
          { name: "communities", priority: "medium", rationale: "AU founder Slacks & LinkedIn groups build early trust." },
          { name: "events", priority: "low", rationale: "Meetups seed word-of-mouth cheaply." },
        ]
      : stage <= 3
        ? [
            { name: "seo-content", priority: "high", rationale: "E-E-A-T long-form offsets SGE click loss." },
            { name: "partnerships", priority: "medium", rationale: "AU accelerators + accountants amplify reach." },
            { name: "paid-ads", priority: "low", rationale: "Only after CAC payback signal < 18 months." },
          ]
        : [
            { name: "product-led", priority: "high", rationale: "Self-serve funnel scales without linear sales cost." },
            { name: "paid-ads", priority: "medium", rationale: "Growth pricing supports paid CAC ≥3x LTV." },
            { name: "partnerships", priority: "medium", rationale: "Enterprise motion via VC/accountant network." },
          ];

  return {
    positioning: `${input.startupName} is a strategic navigation system for AU ${sector} founders — commanding ${stratMin}–${stratMax}x revenue multiples vs ${AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MIN}–${AU_MARKET_BENCHMARKS.VALUATIONS.UTILITY_MULTIPLE_MAX}x for utility tools.`,
    channels,
    first90Days: [
      "Weeks 1-2: 20+ discovery interviews with target segment",
      "Weeks 3-4: launch landing page + waitlist with SVI scoring hook",
      "Month 2: onboard 5 design partners at discounted pricing",
      "Month 3: first public cohort + case study publication",
    ],
    keyMetrics:
      sector === "marketplace"
        ? ["GMV (A$)", "Monthly active buyers", "Take rate"]
        : ["MRR (A$)", "Paying customers", "CAC payback (months)", "LTV/CAC"],
    ...sectorMarketAnchors(input.sector),
  };
}

/**
 * LLM-backed GTM strategy generator. Same fallback discipline as
 * `generateCompetitorAnalysis`.
 */
export async function generateGtmStrategy(
  input: GenerateGtmInput,
): Promise<GtmStrategyOutput> {
  const user =
    `Startup: ${input.startupName}\n` +
    `Sector: ${input.sector}\n` +
    `Lifecycle stage (0-5): ${input.stage}\n` +
    (input.description ? `Description: ${input.description}\n` : "") +
    (input.targetCustomer ? `Target customer: ${input.targetCustomer}\n` : "") +
    `\nReturn a JSON object with keys:\n` +
    `- positioning (one-sentence strategic positioning statement, AU market)\n` +
    `- channels (array of { name, priority: "high"|"medium"|"low", rationale })\n` +
    `- first90Days (array of 4-6 concrete action strings)\n` +
    `- keyMetrics (array of 3-5 metric names appropriate to the stage)\n` +
    `Ground the positioning in the Australian market. JSON only.`;

  try {
    const result = await callAI({
      system: CMO_SYSTEM_PROMPT,
      user,
      maxTokens: 1500,
      temperature: 0.4,
    });

    const parsed = tryParseJSON<Partial<GtmStrategyOutput>>(result.text);
    if (
      !parsed ||
      typeof parsed.positioning !== "string" ||
      !Array.isArray(parsed.channels) ||
      !Array.isArray(parsed.first90Days) ||
      !Array.isArray(parsed.keyMetrics)
    ) {
      return gtmFallback(input);
    }
    const anchors = sectorMarketAnchors(input.sector);
    return {
      positioning: parsed.positioning,
      channels: parsed.channels.filter(
        (c): c is GtmChannel =>
          !!c && typeof c.name === "string" && typeof c.rationale === "string" &&
          (c.priority === "high" || c.priority === "medium" || c.priority === "low"),
      ),
      first90Days: parsed.first90Days.filter((s): s is string => typeof s === "string"),
      keyMetrics: parsed.keyMetrics.filter((s): s is string => typeof s === "string"),
      marketSize: anchors.marketSize,
      growthRate: anchors.growthRate,
    };
  } catch {
    return gtmFallback(input);
  }
}
