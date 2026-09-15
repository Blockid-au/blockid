// Dollar Valuation Engine for BlockID SVI
//
// Three methods blended into a single AUD valuation range:
//   1. Berkus Method (adapted for AUD, mapped to SVI dimensions)
//   2. Scorecard Method (stage-based with SVI adjustments)
//   3. Revenue Multiple (when revenue exists)

import type { ComparablesBenchmark } from "./data/au-comparables";
import { buildComparablesBenchmark } from "./data/au-comparables";

// ─── Types ───────────────────────────────────────────────────────────────────

export type { ComparablesBenchmark };

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
  /** AU comparable companies benchmark for the startup's industry and stage. */
  comparablesBenchmark?: ComparablesBenchmark;
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
  // Berkus pillars: A$750K per pillar (AUD-adjusted from US$500K)
  // Source: Berkus Method adapted for Australian market 2025
  const CAP = 750_000;
  const factors: Record<string, number> = {
    "Sound idea (MPC)": roundAud((dim(input, "mpc") / 100) * CAP),
    "Prototype (PTD)": roundAud((dim(input, "ptd") / 100) * CAP),
    "Quality team (FTV)": roundAud((dim(input, "ftv") / 100) * CAP),
    "Strategic relationships (IRI+SVM)": roundAud(
      ((dim(input, "iri") + dim(input, "svm")) / 2 / 100) * CAP,
    ),
    "Product rollout (TRE)": roundAud((dim(input, "tre") / 100) * CAP),
  };

  const value = Object.values(factors).reduce((sum, v) => sum + v, 0);
  return { value, factors };
}

// ─── Scorecard Method ────────────────────────────────────────────────────────
// Base valuation by stage, adjusted ±% using SVI dimension scores.

// AU regional median pre-money by stage (Cut Through Venture + AVCAL 2025)
const STAGE_BASE_AUD: Record<string, number> = {
  idea: 300_000,        // Concept
  validation: 750_000,  // Validated idea
  mvp: 3_000_000,       // Pre-seed median
  growth: 7_500_000,    // Seed median
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

/** How the indicative range compares with a figure the founder stated. */
export interface CapCrossCheck {
  /** The founder's number, AUD, exactly as read. */
  statedAud: number;
  kind: "cap" | "pre_money" | "post_money" | "valuation";
  /** Indicative mid ÷ stated. */
  ratio: number;
  /** `consistent` within 0.5×–2×; otherwise which side the indicative sits. */
  verdict: "consistent" | "indicative_above" | "indicative_below";
  /** One founder-facing line, e.g. "Your stated cap A$6M · indicative A$4–9M → consistent". */
  note: string;
}

export interface ValuationEstimate {
  low: number;
  mid: number;
  high: number;
  method: string;
  confidence: number;
  currency: "AUD";
  /** AU comparable companies benchmark for the startup's industry and stage. */
  comparablesBenchmark?: ComparablesBenchmark;
  /**
   * Set when the ARR sanity clamp lowered the mid: a business with under
   * A$250k ARR cannot be priced above max(pre-seed high, 40 × ARR).
   */
  arrClamp?: { arrAud: number; capAud: number; unclampedMidAud: number };
  /** Present when the founder stated a cap / pre-money; never overrides the range. */
  capCrossCheck?: CapCrossCheck;
}

// ─── Calibration (2026-09-15) ────────────────────────────────────────────────
//
// Every number here is a CALIBRATION ASSUMPTION with its source; none is a
// measured fact about the startup being valued. Previous baselines were
// fitted to 14 announced AU raises (survivorship bias — announced rounds
// skew to the winners) and priced a two-pilot agri-robotics pre-seed at
// A$29.7M–55.1M. These replace them with the medians of the whole market.
//
// AU pre-money medians by stage, AUD (Cut Through Venture, "State of
// Australian Startup Funding" 2024 and 2025 reports; Carta AU data on SAFE
// caps at pre-seed/seed):
//   pre-seed ≈ A$4–6M, seed ≈ A$8–12M, Series A ≈ A$25–35M.
// Stages 5–7 (Growth / Scale / Corporation) are left where they were.
//
// Berkus method (Dave Berkus, "The Berkus Method: Valuing an Early Stage
// Investment"): five pillars, up to US$500k each, ≤ US$2.5M pre-money for a
// pre-revenue company. Applied here as A$500k per pillar with no FX uplift —
// the AU calibration assumption is that the AUD figure is the conservative
// end of an AU pre-seed, which the CTV medians above bear out.
//
// Sanity clamp: with a known ARR below A$250k the mid cannot exceed
// max(stage-2 high, 40 × ARR). 40× is above every public SaaS multiple
// (Bessemer Cloud Index medians run single digits to low teens) and exists
// only to stop a small revenue figure being priced as a Series A.

/** AU pre-money baselines by SVI stage, AUD — see calibration note above. */
export const VALUATION_BASELINES_AUD: Readonly<Record<number, { low: number; mid: number; high: number }>> = {
  0: { low:     250_000, mid:   1_000_000, high:   2_000_000 }, // Concept — Berkus pre-revenue territory (≤ A$2.5M)
  1: { low:   1_000_000, mid:   2_500_000, high:   4_000_000 }, // Validated idea — Berkus max A$2.5M as the mid
  2: { low:   3_000_000, mid:   5_000_000, high:   8_000_000 }, // MVP / pre-seed — CTV 2024/25 pre-seed median ≈ A$4–6M
  3: { low:   6_000_000, mid:  10_000_000, high:  15_000_000 }, // Traction / seed — CTV 2024/25 seed median ≈ A$8–12M
  4: { low:  15_000_000, mid:  30_000_000, high:  45_000_000 }, // Revenue / Series A — CTV 2024/25 Series A median ≈ A$25–35M
  5: { low:  50_000_000, mid: 100_000_000, high: 200_000_000 }, // Growth (unchanged)
  6: { low: 100_000_000, mid: 250_000_000, high: 500_000_000 }, // Scale (unchanged)
  7: { low: 300_000_000, mid: 750_000_000, high: 2_000_000_000 }, // Corporation (unchanged)
};

/** Berkus pillar cap, AUD — US$500k per pillar applied as A$500k (see note). */
export const BERKUS_PILLAR_CAP_AUD = 500_000;
/** ARR below this triggers the sanity clamp. */
export const ARR_CLAMP_THRESHOLD_AUD = 250_000;
/** Multiple of ARR the clamped mid may not exceed. */
export const ARR_CLAMP_MULTIPLE = 40;

export interface ValuationMetrics {
  mrr?: number;
  arr?: number;
  users?: number;
  sector?: string;
  growthPctYoY?: number;
  churnPct?: number;
  isAINative?: boolean;
  /** A founder-stated SAFE cap / pre-money / post-money, AUD. Reported, never applied. */
  statedCapAud?: number;
  statedCapKind?: CapCrossCheck["kind"];
}

/**
 * Compare the indicative range with the founder's own cap / pre-money.
 * The founder's number is reported alongside and flagged when the
 * indicative mid is more than 2× or less than 0.5× of it — never overridden.
 */
export function crossCheckStatedCap(
  est: { low: number; mid: number; high: number },
  statedAud: number,
  kind: CapCrossCheck["kind"] = "cap",
): CapCrossCheck | undefined {
  if (!Number.isFinite(statedAud) || statedAud <= 0) return undefined;
  const ratio = est.mid / statedAud;
  const verdict: CapCrossCheck["verdict"] =
    ratio > 2 ? "indicative_above" : ratio < 0.5 ? "indicative_below" : "consistent";
  const label =
    kind === "pre_money" ? "pre-money" : kind === "post_money" ? "post-money" : kind === "valuation" ? "valuation" : "cap";
  const range = `${formatAUD(est.low)}–${formatAUD(est.high)}`;
  const tail =
    verdict === "consistent"
      ? "consistent"
      : verdict === "indicative_above"
        ? `indicative mid is ${ratio.toFixed(1)}× your number — check the assumptions before quoting either`
        : `indicative mid is ${(ratio * 100).toFixed(0)}% of your number — investors will ask what supports the gap`;
  return {
    statedAud,
    kind,
    ratio: Math.round(ratio * 100) / 100,
    verdict,
    note: `Your stated ${label} ${formatAUD(statedAud)} · indicative ${range} → ${tail}`,
  };
}

/**
 * Evidence-based startup valuation V3 (recalibrated 2026-09-15).
 *
 * Blends 3 methods with stage-dependent weights:
 *   - Berkus Method (A$500k per pillar, 5 pillars = A$2.5M cap)
 *   - Scorecard Method (Bill Payne weights against the AU stage median)
 *   - Revenue Multiple (sector-specific, with growth/AI/churn adjustments)
 *
 * Stage baselines: Cut Through Venture "State of Australian Startup
 * Funding" 2024 / 2025 medians (see VALUATION_BASELINES_AUD). A known ARR
 * under A$250k clamps the mid; a founder-stated cap is cross-checked and
 * reported, never applied.
 */
export function estimateValuation(
  svi: number,
  stage: number,
  metrics?: ValuationMetrics,
  dimensions?: Record<string, number>,
): ValuationEstimate {
  const s = clamp(stage, 0, 7);

  const BASELINES = VALUATION_BASELINES_AUD;
  const PILLAR_CAP = BERKUS_PILLAR_CAP_AUD;

  const SCORECARD_WEIGHTS: Record<string, number> = {
    ftv: 0.30, mpc: 0.25, ptd: 0.15, svm: 0.10, tre: 0.10, iri: 0.05, lco: 0.025, cgh: 0.025,
  };

  // Revenue multiples by sector — calibrated to 2024-2025 AU market
  // SaaS raised: Operata ~52x ARR, Splose ~10-15x ARR at growth stage
  const MULTIPLES: Record<string, { low: number; mid: number; high: number }> = {
    saas: { low: 10, mid: 20, high: 40 },     // Raised from 5-15x (market shows 20-50x for hot SaaS)
    fintech: { low: 8, mid: 15, high: 30 },    // Block Earner, WeMoney at high multiples
    marketplace: { low: 3, mid: 6, high: 12 },
    healthtech: { low: 8, mid: 15, high: 25 }, // Splose A$46M Series A
    deeptech: { low: 5, mid: 12, high: 25 },   // Breaker defence A$9M seed at A$36M+
    ecommerce: { low: 2, mid: 4, high: 8 },
    other: { low: 5, mid: 10, high: 20 },
  };

  const regionalMedian = BASELINES[s]!.mid;

  // Helper: get dimension score or derive from SVI
  const getDim = (key: string): number => {
    if (dimensions?.[key] != null) return clamp(dimensions[key], 0, 100);
    return clamp(Math.round((svi / 200) * 100), 10, 90);
  };

  // ── Berkus Method ──────────────────────────────────────────────────────
  const berkusPillars = {
    "Sound Idea": getDim("mpc") / 100 * PILLAR_CAP,
    "Prototype": getDim("ptd") / 100 * PILLAR_CAP,
    "Quality Team": getDim("ftv") / 100 * PILLAR_CAP,
    "Strategic Relations": ((getDim("iri") + getDim("svm")) / 2) / 100 * PILLAR_CAP,
    "Product Rollout": getDim("tre") / 100 * PILLAR_CAP,
  };
  const berkusTotal = Object.values(berkusPillars).reduce((a, b) => a + b, 0);

  // ── Scorecard Method ───────────────────────────────────────────────────
  let scorecardMult = 0;
  for (const [key, weight] of Object.entries(SCORECARD_WEIGHTS)) {
    scorecardMult += weight * (0.50 + getDim(key) / 100); // 0.5-1.5 range
  }
  scorecardMult = clamp(scorecardMult, 0.4, 1.8);
  // AI-native premium: +50% on scorecard (market data shows 2-3x for AI startups)
  if (metrics?.isAINative) scorecardMult *= 1.5;
  const scorecardTotal = Math.round(regionalMedian * scorecardMult);

  // ── Revenue Multiple ───────────────────────────────────────────────────
  const hasRevenue = (metrics?.mrr ?? 0) > 0;
  let revTotal = 0;
  let revMultiple = 0;
  if (hasRevenue) {
    const arr = metrics!.arr ?? metrics!.mrr! * 12;
    const sector = metrics?.sector ?? "other";
    const mults = MULTIPLES[sector] ?? MULTIPLES.other;
    revMultiple = mults.mid;
    if ((metrics?.growthPctYoY ?? 0) > 50) revMultiple += Math.floor(((metrics?.growthPctYoY ?? 0) - 50) / 25);
    if (metrics?.isAINative) revMultiple = Math.round(revMultiple * 1.8); // AI startups: 2-3x premium (Carta 2025)
    if ((metrics?.churnPct ?? 0) > 3) revMultiple -= Math.floor(((metrics?.churnPct ?? 0) - 3) / 5);
    revMultiple = clamp(revMultiple, mults.low, mults.high + 5);
    revTotal = Math.round(arr * revMultiple);
  }

  // ── Blend (First Chicago-style) ────────────────────────────────────────
  let midAud: number;
  let method: string;
  if (s <= 2 && !hasRevenue) {
    midAud = Math.round(berkusTotal * 0.50 + scorecardTotal * 0.50);
    method = "Berkus (50%) + Scorecard (50%)";
  } else if (s <= 3 && !hasRevenue) {
    midAud = Math.round(berkusTotal * 0.30 + scorecardTotal * 0.70);
    method = "Berkus (30%) + Scorecard (70%)";
  } else if (hasRevenue && s >= 5) {
    midAud = Math.round(berkusTotal * 0.05 + scorecardTotal * 0.20 + revTotal * 0.75);
    method = `Revenue ${revMultiple}x (75%) + Scorecard (20%)`;
  } else if (hasRevenue) {
    midAud = Math.round(berkusTotal * 0.15 + scorecardTotal * 0.35 + revTotal * 0.50);
    method = `Revenue ${revMultiple}x (50%) + Scorecard (35%) + Berkus (15%)`;
  } else {
    midAud = Math.round(berkusTotal * 0.30 + scorecardTotal * 0.70);
    method = "Scorecard (70%) + Berkus (30%)";
  }

  // ── ARR sanity clamp ───────────────────────────────────────────────────
  // A known ARR under A$250k is a small business whatever the stage label
  // says: the mid may not exceed max(pre-seed high, 40 × ARR).
  let arrClamp: ValuationEstimate["arrClamp"];
  if (hasRevenue) {
    const arr = metrics!.arr ?? metrics!.mrr! * 12;
    if (arr < ARR_CLAMP_THRESHOLD_AUD) {
      const capAud = Math.max(BASELINES[2]!.high, Math.round(arr * ARR_CLAMP_MULTIPLE));
      if (midAud > capAud) {
        arrClamp = { arrAud: arr, capAud, unclampedMidAud: midAud };
        midAud = capAud;
        method = `${method} · ARR-clamped`;
      }
    }
  }

  // ── Band width (uncertainty by stage) ──────────────────────────────────
  const band = s <= 1 ? 0.50 : s <= 3 ? 0.40 : s <= 5 ? 0.30 : 0.25;
  const base = BASELINES[s]!;
  // The stage floor only applies when the mid itself sits at or above it —
  // a revenue-anchored or ARR-clamped mid under the stage's baseline low
  // keeps its full band rather than collapsing low onto mid.
  const rawLow = Math.round(midAud * (1 - band));
  const lowAud = midAud >= base.low ? Math.max(rawLow, base.low) : rawLow;
  const highAud = Math.max(
    Math.min(Math.round(midAud * (1 + band)), (BASELINES[Math.min(s + 1, 7)]?.high ?? base.high) * 1.2),
    midAud,
  );

  // ── Confidence ─────────────────────────────────────────────────────────
  let confidence = 10;
  if (dimensions) confidence += Object.values(dimensions).filter(v => v != null).length * 5;
  if (hasRevenue) confidence += 15;
  if (metrics?.growthPctYoY != null) confidence += 5;
  if (metrics?.sector) confidence += 5;
  confidence = clamp(confidence, 5, 95);

  const comparablesBenchmark = buildComparablesBenchmark(metrics?.sector, stage);

  // ── Founder-stated cap / pre-money: reported alongside, never applied ──
  const capCrossCheck =
    metrics?.statedCapAud != null
      ? crossCheckStatedCap({ low: lowAud, mid: midAud, high: highAud }, metrics.statedCapAud, metrics.statedCapKind ?? "cap")
      : undefined;

  return {
    low: lowAud,
    mid: midAud,
    high: highAud,
    method,
    confidence,
    currency: "AUD",
    comparablesBenchmark,
    ...(arrClamp ? { arrClamp } : {}),
    ...(capCrossCheck ? { capCrossCheck } : {}),
  };
}

/**
 * The metrics `estimateValuation` should see for a set of extracted signals:
 * the founder's own revenue figure and stated cap, plus the sector. One
 * place, so the stored row, the free summary, the hero widget and the first
 * analysis all price the same numbers.
 */
export function valuationMetricsFromSignals(
  signals:
    | {
        sector?: string;
        mrrAud?: number;
        arrAud?: number;
        statedCapAud?: number;
        statedCapKind?: CapCrossCheck["kind"];
      }
    | null
    | undefined,
  sectorOverride?: string,
): ValuationMetrics {
  const out: ValuationMetrics = {};
  const sector = sectorOverride ?? signals?.sector;
  if (sector) out.sector = sector;
  if (signals?.mrrAud != null && signals.mrrAud > 0) out.mrr = signals.mrrAud;
  if (signals?.arrAud != null && signals.arrAud > 0) out.arr = signals.arrAud;
  if (out.arr != null && out.mrr == null) out.mrr = out.arr / 12;
  if (signals?.statedCapAud != null && signals.statedCapAud > 0) {
    out.statedCapAud = signals.statedCapAud;
    if (signals.statedCapKind) out.statedCapKind = signals.statedCapKind;
  }
  return out;
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

  const comparablesBenchmark = buildComparablesBenchmark(input.sector, input.stage);

  return {
    lowAud,
    midAud,
    highAud,
    method,
    breakdown,
    confidence,
    comparablesBenchmark,
  };
}
