// CRO conversion engine — benchmark registries + pure helper functions.
// Data sources: PitchBook 2024, OpenView Q2 2024, Mixpanel Q2 2024,
//               NielsenIQ 2026, Journal of Consumer Psychology 2026,
//               McKinsey 2026, PwC 2024.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FundingReadinessBenchmark {
  metric: string;
  value?: number;
  weight?: number;
  source: string;
}

export interface SaaSConversionBenchmark {
  metric: string;
  value: number;
  stage: "early" | "growth" | "enterprise";
  source: string;
}

export interface RetentionBenchmark {
  metric: string;
  value: number;
  segment: "B2B" | "B2C";
  source: string;
}

export interface CapitalReadinessInput {
  team: number;
  product: number;
  market: number;
  traction: number;
  financials: number;
}

export interface NBARecommendation {
  targetLayer: string;
  action: string;
  expectedTimeReductionPct: number;
  expectedRevenueLiftPct: number;
  confidence: number;
}

export interface PricingUpliftResult {
  method: "charm" | "decoy" | "dynamic";
  upliftPct: number;
  originalPrice: number;
  charmPrice: number;
}

// ---------------------------------------------------------------------------
// Benchmark registries
// ---------------------------------------------------------------------------

// 7 entries: 5 weight rows (sum = 1.0) + 2 anchor values.
export const FUNDING_READINESS_BENCHMARKS: FundingReadinessBenchmark[] = [
  { metric: "Team Weight",        weight: 0.3, source: "PitchBook 2024" },
  { metric: "Product Weight",     weight: 0.2, source: "PitchBook 2024" },
  { metric: "Market Weight",      weight: 0.2, source: "PitchBook 2024" },
  { metric: "Traction Weight",    weight: 0.2, source: "PitchBook 2024" },
  { metric: "Financials Weight",  weight: 0.1, source: "PitchBook 2024" },
  { metric: "Avg Capital Readiness Score (AU seed, /100)", value: 73,      source: "PitchBook 2024-Q3" },
  { metric: "Median ARR for AU Seed round",                 value: 150_000, source: "PitchBook 2024-Q3" },
];

// 4 entries — values in (0, 1).
export const SAAS_CONVERSION_BENCHMARKS: SaaSConversionBenchmark[] = [
  { metric: "Free-Trial to Paid (Early Stage)",      value: 0.128, stage: "early",      source: "OpenView Q2 2024" },
  { metric: "Free-Trial to Paid (Growth Stage)",     value: 0.184, stage: "growth",     source: "OpenView Q2 2024" },
  { metric: "Demo to Close (Growth Stage)",           value: 0.22,  stage: "growth",     source: "OpenView Q2 2024" },
  { metric: "PLG Free-to-Paid (Enterprise Stage)",   value: 0.05,  stage: "enterprise", source: "OpenView Q2 2024" },
];

// 4 entries — D1/D7/D30 B2C mobile, Month-1 B2B SaaS.
export const RETENTION_BENCHMARKS: RetentionBenchmark[] = [
  { metric: "Day-1 Mobile App Retention (B2C)",   value: 0.30, segment: "B2C", source: "Mixpanel Q2 2024" },
  { metric: "Day-7 Mobile App Retention (B2C)",   value: 0.12, segment: "B2C", source: "Mixpanel Q2 2024" },
  { metric: "Day-30 Mobile App Retention (B2C)",  value: 0.04, segment: "B2C", source: "Mixpanel Q2 2024" },
  { metric: "Month-1 SaaS Retention (B2B)",       value: 0.45, segment: "B2B", source: "Mixpanel Q2 2024" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Weights: team 30%, product/market/traction 20% each, financials 10%.
export function calculateCapitalReadinessScore(
  input: CapitalReadinessInput,
): number {
  return (
    input.team * 0.3 +
    input.product * 0.2 +
    input.market * 0.2 +
    input.traction * 0.2 +
    input.financials * 0.1
  );
}

const NBA_ACTIONS: Record<string, string> = {
  Team:       "Recruit a technical lead with domain expertise and advisory board backing",
  Product:    "Accelerate prototyping with weekly sprint demos and beta user feedback",
  Market:     "Run 20+ customer discovery interviews to validate ICP and willingness-to-pay",
  Traction:   "Launch a referral loop and outbound sequences targeting your top 3 ICP segments",
  Financials: "Model 18-month burn rate projections with three scenario sensitivities",
};

// PwC 2024 / PitchBook 2024-07 constants — fixed across all layers.
const NBA_TIME_REDUCTION = 0.15;
const NBA_REVENUE_LIFT   = 0.22;
const NBA_CONFIDENCE     = 0.87;

export function getNextBestAction(
  scores: Record<string, number>,
  _stage: string,
): NBARecommendation {
  const knownLayers = Object.keys(NBA_ACTIONS);
  const knownScores = Object.entries(scores).filter(([k]) =>
    knownLayers.includes(k),
  );

  let targetLayer = "Product";
  if (knownScores.length > 0) {
    const [weakest] = knownScores.sort(([, a], [, b]) => a - b);
    targetLayer = weakest![0];
  }

  return {
    targetLayer,
    action: NBA_ACTIONS[targetLayer] ?? NBA_ACTIONS["Product"]!,
    expectedTimeReductionPct: NBA_TIME_REDUCTION,
    expectedRevenueLiftPct:   NBA_REVENUE_LIFT,
    confidence:               NBA_CONFIDENCE,
  };
}

// Pricing psychology uplift (NielsenIQ 2026, JCP 2026, McKinsey 2026).
export function applyPricingPsychology(
  price: number,
  strategy: "charm" | "decoy" | "dynamic",
): PricingUpliftResult {
  if (strategy === "charm") {
    const candidate = Math.floor(price) * 10 + 9.99;
    const charmPrice = candidate > price ? candidate : price - 0.01;
    return { method: "charm", upliftPct: 0.048, originalPrice: price, charmPrice };
  }
  if (strategy === "decoy") {
    return { method: "decoy", upliftPct: 0.27, originalPrice: price, charmPrice: price };
  }
  // dynamic — 15% price multiplier (McKinsey 2026).
  return { method: "dynamic", upliftPct: 0.15, originalPrice: price, charmPrice: price * 1.15 };
}

// Burn efficiency: McKinsey 2026 — milestone achievement reduces effective
// burn by up to 12%, scaling linearly with milestoneProgress ∈ [0, 1].
export function calculateBurnEfficiency(
  burnPerMonth: number,
  milestoneProgress: number,
): number {
  return burnPerMonth * (1 - 0.12 * milestoneProgress);
}
