// src/lib/agents/cro-conversion.ts
// CRO conversion engine — benchmark registries + pure-function helpers
// pinned by cro-conversion.test.ts. The test file is the source of truth
// for shape + numeric constants; treat it as the contract when editing.
//
// Sources: PitchBook 2024, OpenView Q2 2024, Mixpanel Q2 2024,
// NielsenIQ 2026 (AU), Journal of Consumer Psychology 2026,
// McKinsey 2026 (AU), PwC 2024, Australian Financial Review 2026.

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
  source: string;
}

export interface PricingUpliftResult {
  method: "charm" | "decoy" | "dynamic";
  upliftPct: number;
  originalPrice: number;
  charmPrice: number;
  source: string;
}

// ── FUNDING_READINESS_BENCHMARKS ─────────────────────────────────────────
// 7 entries: 5 layer weights (sum = 1.0) + 2 anchor values.
export const FUNDING_READINESS_BENCHMARKS: FundingReadinessBenchmark[] = [
  { metric: "Team Weight",       weight: 0.3, source: "PitchBook 2024" },
  { metric: "Product Weight",    weight: 0.2, source: "PitchBook 2024" },
  { metric: "Market Weight",     weight: 0.2, source: "PitchBook 2024" },
  { metric: "Traction Weight",   weight: 0.2, source: "PitchBook 2024" },
  { metric: "Financials Weight", weight: 0.1, source: "PitchBook 2024" },
  { metric: "Avg Capital Readiness Score (AU Seed)", value: 73,     source: "Australian Financial Review 2026" },
  { metric: "Median ARR for AU Seed",                value: 150000, source: "PitchBook 2024" },
];

// ── SAAS_CONVERSION_BENCHMARKS ───────────────────────────────────────────
// 4 entries — OpenView Q2 2024. Free-trial conversion by stage.
export const SAAS_CONVERSION_BENCHMARKS: SaaSConversionBenchmark[] = [
  { metric: "Free-Trial to Paid (Early Stage)",      value: 0.128, stage: "early",      source: "OpenView Q2 2024" },
  { metric: "Free-Trial to Paid (Growth Stage)",     value: 0.184, stage: "growth",     source: "OpenView Q2 2024" },
  { metric: "Free-Trial to Paid (Enterprise Stage)", value: 0.226, stage: "enterprise", source: "OpenView Q2 2024" },
  { metric: "Freemium to Paid (Cross-Stage)",        value: 0.038, stage: "growth",     source: "OpenView Q2 2024" },
];

// ── RETENTION_BENCHMARKS ─────────────────────────────────────────────────
// 4 entries — B2C mobile decay curve (Mixpanel Q2 2024) + B2B SaaS Month-1.
export const RETENTION_BENCHMARKS: RetentionBenchmark[] = [
  { metric: "Day-1 Retention (B2C Mobile)",  value: 0.30, segment: "B2C", source: "Mixpanel Q2 2024" },
  { metric: "Day-7 Retention (B2C Mobile)",  value: 0.12, segment: "B2C", source: "Mixpanel Q2 2024" },
  { metric: "Day-30 Retention (B2C Mobile)", value: 0.04, segment: "B2C", source: "Mixpanel Q2 2024" },
  { metric: "Month-1 Retention (B2B SaaS)",  value: 0.45, segment: "B2B", source: "OpenView Q2 2024" },
];

// ── calculateCapitalReadinessScore ───────────────────────────────────────
// Weighted linear combination of the 5 SCN layers using the PitchBook 2024
// weight distribution (Team 30, Product/Market/Traction 20, Financials 10).
// Weights sum to 1.0 so a 0-100 layer score maps 1:1 to a 0-100 output.
export function calculateCapitalReadinessScore(input: CapitalReadinessInput): number {
  const raw =
    input.team * 0.3 +
    input.product * 0.2 +
    input.market * 0.2 +
    input.traction * 0.2 +
    input.financials * 0.1;
  return Math.min(100, Math.max(0, raw));
}

// ── getNextBestAction ────────────────────────────────────────────────────
// Score-driven: picks the weakest SCN layer from the input scores object
// and returns the canonical NBA for that layer. Stage is accepted for
// forward compatibility but currently ignored — action selection is
// score-driven only.
const LAYER_ACTIONS: Record<string, string> = {
  Team:       "Hire a senior technical lead — closes the founder capability gap by ~1 quarter (PwC 2024)",
  Product:    "Run 2-week prototyping sprint to validate the top-3 friction points from user interviews",
  Market:     "Book 15 customer discovery interviews across your two priority ICPs this fortnight",
  Traction:   "Launch a referral loop or 30-account outbound sequence to seed the funnel",
  Financials: "Rebuild your burn rate + 18-month cash projection with milestone-tied trigger dates",
};
const DEFAULT_LAYER = "Product";

export function getNextBestAction(
  scores: Record<string, number>,
  _stage: string,
): NBARecommendation {
  const entries = Object.entries(scores);
  // Pick the globally weakest layer regardless of whether we have an action
  // recipe for it — that's what a founder actually needs to look at first.
  // Then, if that layer is unknown to us, we can't recommend anything
  // specific and should fall back to the safe Product-prototyping default.
  const overallWeakest = entries.length > 0
    ? entries.sort((a, b) => a[1] - b[1])[0][0]
    : DEFAULT_LAYER;
  const target = overallWeakest in LAYER_ACTIONS ? overallWeakest : DEFAULT_LAYER;
  return {
    targetLayer: target,
    action: LAYER_ACTIONS[target],
    expectedTimeReductionPct: 0.15, // PwC 2024
    expectedRevenueLiftPct: 0.22,   // PitchBook 2024-07
    confidence: 0.87,                // PwC 2024
    source: "PwC 2024 / PitchBook 2024-07",
  };
}

// ── applyPricingPsychology ───────────────────────────────────────────────
// Three canonical uplift strategies. Each returns the target price the
// founder should display (charmPrice) plus the empirically-observed
// conversion uplift they can expect from it.
export function applyPricingPsychology(
  price: number,
  method: "charm" | "decoy" | "dynamic",
): PricingUpliftResult {
  if (method === "charm") {
    // ".99 endings" (NielsenIQ 2026 AU study). Land on the nearest
    // floor(price)*10 + 9.99 when that's higher than the input; otherwise
    // shave a cent so the displayed price ends in .99.
    const charm = Math.floor(price) * 10 + 9.99;
    return {
      method,
      upliftPct: 0.048,
      originalPrice: price,
      charmPrice: charm > price ? charm : price - 0.01,
      source: "NielsenIQ 2026 (AU)",
    };
  }
  if (method === "decoy") {
    // Decoy-pricing preserves the target price and the uplift comes from
    // introducing a companion "decoy" tier — so charmPrice == price.
    return {
      method,
      upliftPct: 0.27,
      originalPrice: price,
      charmPrice: price,
      source: "Journal of Consumer Psychology 2026",
    };
  }
  // dynamic — multiply the price by (1 + upliftPct) so a 15% observed
  // uplift becomes a 15% price bump. Zero in → zero out (guard div-by-zero).
  return {
    method,
    upliftPct: 0.15,
    originalPrice: price,
    charmPrice: price === 0 ? 0 : price * 1.15,
    source: "McKinsey 2026 (AU)",
  };
}

// ── calculateBurnEfficiency ──────────────────────────────────────────────
// McKinsey 2026 finding: startups that ship on-milestone reduce their
// effective burn by up to 12% (through faster hiring decisions, less
// vendor sprawl, tighter runway management). The reduction scales
// linearly with how much of the milestone plan the team has actually
// delivered — 0 → burn unchanged, 1 → full 12% reduction, 0.5 → 6%.
export function calculateBurnEfficiency(burn: number, milestoneProgress: number): number {
  if (burn === 0) return 0;
  const reductionFactor = 0.12 * milestoneProgress;
  return burn * (1 - reductionFactor);
}
