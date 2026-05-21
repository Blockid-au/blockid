// Dollar Valuation Engine for BlockID SVI
//
// Three methods blended into a single AUD valuation range:
//   1. Berkus Method (adapted for AUD, mapped to SVI dimensions)
//   2. Scorecard Method (stage-based with SVI adjustments)
//   3. Revenue Multiple (when revenue exists)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValuationInput {
  sviScore: number; // 0-200+
  stage: string; // idea, validation, mvp, growth (mapped from numeric 0-7)
  mrrAud?: number;
  arrAud?: number;
  revenueGrowthPct?: number;
  monthlyChurnPct?: number;
  burnRateAud?: number;
  runwayMonths?: number;
  sector?: string;
  teamSize?: number;
  /** SVI dimension scores (0-100 each) */
  dimensions?: {
    ftv?: number; // Founder & Team Value
    mpc?: number; // Market & Problem Clarity
    ptd?: number; // Product & Technical Depth
    tre?: number; // Traction & Revenue Evidence
    cgh?: number; // Cap Table & Governance Health
    iri?: number; // Investor Readiness Index
    lco?: number; // Legal & Compliance
    svm?: number; // Strategic Vision & Moat
  };
}

export interface ValuationResult {
  lowAud: number;
  midAud: number;
  highAud: number;
  method: string;
  breakdown: {
    berkus: { value: number; factors: Record<string, number> };
    scorecard: { value: number; adjustments: Record<string, number> };
    revenueMultiple?: { value: number; multiple: number };
  };
  confidence: number; // 0-100
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Clamp a number between min and max. */
function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Round to nearest dollar. */
function roundAud(val: number): number {
  return Math.round(val);
}

/** Get a dimension score, defaulting to a fraction of overall SVI if missing. */
function dim(input: ValuationInput, key: string): number {
  const score = input.dimensions?.[key as keyof typeof input.dimensions];
  if (score != null) return clamp(score, 0, 100);
  // Fallback: derive from overall SVI (0-200 mapped to 0-100)
  return clamp(Math.round((input.sviScore / 200) * 100), 0, 100);
}

// ─── Berkus Method ───────────────────────────────────────────────────────────
// Maps SVI dimensions to 5 Berkus factors, each with a max AUD value.
// Factor value = (dimension_score / 100) * max_value

interface BerkusResult {
  value: number;
  factors: Record<string, number>;
}

function berkusMethod(input: ValuationInput): BerkusResult {
  const factors: Record<string, number> = {
    "Sound idea (MPC)": roundAud((dim(input, "mpc") / 100) * 250_000),
    "Prototype (PTD)": roundAud((dim(input, "ptd") / 100) * 250_000),
    "Quality team (FTV)": roundAud((dim(input, "ftv") / 100) * 500_000),
    "Strategic relationships (IRI)": roundAud(
      (dim(input, "iri") / 100) * 250_000,
    ),
    "Product rollout (TRE)": roundAud((dim(input, "tre") / 100) * 500_000),
  };

  const value = Object.values(factors).reduce((sum, v) => sum + v, 0);
  return { value, factors };
}

// ─── Scorecard Method ────────────────────────────────────────────────────────
// Base valuation by stage, adjusted ±% using SVI dimension scores.

const STAGE_BASE_AUD: Record<string, number> = {
  idea: 500_000,
  validation: 1_000_000,
  mvp: 1_500_000,
  growth: 2_500_000,
};

interface ScorecardResult {
  value: number;
  adjustments: Record<string, number>;
}

function scorecardMethod(input: ValuationInput): ScorecardResult {
  const base = STAGE_BASE_AUD[input.stage] ?? STAGE_BASE_AUD.idea!;

  // Each adjustment: (score / 100 - 0.5) * 2 * maxPct
  // This gives -maxPct to +maxPct range based on whether score is below or above 50.
  function adj(dimKey: string, maxPct: number): number {
    const score = dim(input, dimKey);
    return ((score / 100 - 0.5) * 2 * maxPct) / 100;
  }

  const adjustments: Record<string, number> = {
    "Team (FTV)": adj("ftv", 30),
    "Market (MPC)": adj("mpc", 25),
    "Product (PTD)": adj("ptd", 15),
    "Competition (SVM)": adj("svm", 10),
    "Traction (TRE)": adj("tre", 10),
  };

  const totalMultiplier =
    1 + Object.values(adjustments).reduce((sum, v) => sum + v, 0);
  const value = roundAud(base * Math.max(totalMultiplier, 0.1)); // Floor at 10% of base

  return { value, adjustments };
}

// ─── Revenue Multiple Method ─────────────────────────────────────────────────
// Only applicable when there is revenue data.

interface RevenueMultipleResult {
  value: number;
  multiple: number;
}

function revenueMultipleMethod(
  input: ValuationInput,
): RevenueMultipleResult | null {
  const mrr = input.mrrAud;
  if (mrr == null || mrr <= 0) return null; // Pre-revenue: skip

  const arr = input.arrAud ?? mrr * 12;

  // Determine base multiple range based on MRR band
  let lowMult: number;
  let highMult: number;
  if (mrr < 10_000) {
    lowMult = 3;
    highMult = 5;
  } else if (mrr < 50_000) {
    lowMult = 5;
    highMult = 10;
  } else {
    lowMult = 10;
    highMult = 20;
  }

  // Base multiple is midpoint of range
  let multiple = (lowMult + highMult) / 2;

  // Growth premium: +1x for each 20% MoM growth
  const growthPct = input.revenueGrowthPct ?? 0;
  if (growthPct > 0) {
    multiple += Math.floor(growthPct / 20);
  }

  // Cap the multiple at the high end + 5x growth bonus max
  multiple = Math.min(multiple, highMult + 5);

  const value = roundAud(arr * multiple);
  return { value, multiple };
}

// ─── Blended Valuation ──────────────────────────────────────────────────────

// ─── Quick Estimate (SVI + Stage) ───────────────────────────────────────────
// A lightweight valuation estimate driven by the SVI score and stage number.
// Used by the dashboard widget — not a substitute for computeValuation().

export interface ValuationEstimate {
  low: number;
  mid: number;
  high: number;
  method: string;
  confidence: number;
  currency: "AUD";
}

export function estimateValuation(
  svi: number,
  stage: number,
  metrics?: { mrr?: number; arr?: number; users?: number },
): ValuationEstimate {
  // Stage-based baseline valuations (AUD, pre-money)
  const stageBaselines: Record<number, { low: number; mid: number; high: number }> = {
    0: { low: 50_000, mid: 150_000, high: 500_000 },       // Idea
    1: { low: 150_000, mid: 400_000, high: 1_000_000 },    // Concept
    2: { low: 400_000, mid: 1_000_000, high: 2_500_000 },  // Building
    3: { low: 1_000_000, mid: 2_500_000, high: 5_000_000 },// Launched
    4: { low: 2_000_000, mid: 5_000_000, high: 10_000_000 },// Traction
    5: { low: 5_000_000, mid: 10_000_000, high: 25_000_000 },// Revenue
    6: { low: 10_000_000, mid: 25_000_000, high: 50_000_000 },// Scale
    7: { low: 25_000_000, mid: 50_000_000, high: 100_000_000 },// Investor-ready
  };

  const base = stageBaselines[Math.min(stage, 7)] ?? stageBaselines[0];

  // SVI multiplier: 100 = 1x, 200 = 2x, 300 = 3x (linear)
  const sviMultiplier = Math.max(0.5, svi / 100);

  // Revenue multiplier if metrics available
  let revenueMultiplier = 1;
  if (metrics?.arr && metrics.arr > 0) {
    revenueMultiplier = Math.max(1, Math.min(5, (metrics.arr * 8) / base.mid)); // ~8x ARR for SaaS
  } else if (metrics?.mrr && metrics.mrr > 0) {
    revenueMultiplier = Math.max(1, Math.min(5, (metrics.mrr * 12 * 8) / base.mid));
  }

  const finalMultiplier = sviMultiplier * 0.6 + revenueMultiplier * 0.4;

  return {
    low: Math.round(base.low * finalMultiplier),
    mid: Math.round(base.mid * finalMultiplier),
    high: Math.round(base.high * finalMultiplier),
    method: metrics?.arr ? "SVI + Revenue Multiple" : "SVI + Stage Baseline",
    confidence: Math.min(95, Math.round(svi / 3 + (metrics?.arr ? 20 : 0))),
    currency: "AUD",
  };
}

export function formatAUD(value: number): string {
  if (value >= 1_000_000) return `A$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `A$${(value / 1_000).toFixed(0)}K`;
  return `A$${value.toLocaleString()}`;
}

// ─── Blended Valuation ──────────────────────────────────────────────────────

export function computeValuation(input: ValuationInput): ValuationResult {
  const berkus = berkusMethod(input);
  const scorecard = scorecardMethod(input);
  const revMultiple = revenueMultipleMethod(input);

  let midAud: number;
  let method: string;

  if (revMultiple) {
    // Revenue exists: weighted average (berkus 20%, scorecard 30%, revenue 50%)
    midAud = roundAud(
      berkus.value * 0.2 + scorecard.value * 0.3 + revMultiple.value * 0.5,
    );
    method = "blended (berkus 20% + scorecard 30% + revenue multiple 50%)";
  } else {
    // Pre-revenue: average of berkus and scorecard
    midAud = roundAud((berkus.value + scorecard.value) / 2);
    method = "blended (berkus 50% + scorecard 50%)";
  }

  // Low/high range: ±30% for pre-revenue, ±20% for revenue-backed
  const rangePct = revMultiple ? 0.2 : 0.3;
  const lowAud = roundAud(midAud * (1 - rangePct));
  const highAud = roundAud(midAud * (1 + rangePct));

  // Confidence score (0-100) based on data completeness
  let confidence = 20; // Base confidence for having an SVI score

  if (input.dimensions) {
    // +5 for each dimension present
    const dimCount = Object.values(input.dimensions).filter(
      (v) => v != null,
    ).length;
    confidence += dimCount * 5; // max +40
  }

  if (revMultiple) confidence += 20; // Revenue data adds significant confidence
  if (input.revenueGrowthPct != null) confidence += 5;
  if (input.monthlyChurnPct != null) confidence += 5;
  if (input.burnRateAud != null) confidence += 5;
  if (input.runwayMonths != null) confidence += 5;

  confidence = clamp(confidence, 0, 100);

  const breakdown: ValuationResult["breakdown"] = {
    berkus,
    scorecard,
  };
  if (revMultiple) {
    breakdown.revenueMultiple = revMultiple;
  }

  return {
    lowAud,
    midAud,
    highAud,
    method,
    breakdown,
    confidence,
  };
}
