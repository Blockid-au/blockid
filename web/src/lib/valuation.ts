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

// ─── Quick Estimate (removed — V04a / D22, 2026-09-27) ──────────────────────
// `estimateValuation(svi, stage, metrics, dims)` priced the company off the
// SVI and its dimension scores (Berkus = dim/100 × A$500k, Scorecard against
// the stage median). Founder decision D22: the SVI is an uncapped index, not a
// dollar valuation — a figure may only come from a CFO method with qualified
// inputs (`lib/agents/cfo-valuation.ts`, `lib/valuation/cfo-*`). Surfaces
// that used the quick estimate render `valuationNotEstimable()` from
// `lib/valuation/not-estimable.ts`. The guard test
// `lib/valuation/no-svi-dollar.guard.test.ts` keeps it from coming back.

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
// Consumers today: the CFO valuation chapter's stage cross-check
// (`report-pipeline/valuation-chapter.ts`), `agents/cfo-valuation.ts` and the
// consistency gates. None of them derives a figure from the SVI.

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

export function formatAUD(value: number): string {
  if (value >= 1_000_000) return `A$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `A$${(value / 1_000).toFixed(0)}K`;
  return `A$${value.toLocaleString()}`;
}

// ─── Blended Valuation ──────────────────────────────────────────────────────

/**
 * Berkus + Scorecard (+ revenue multiple) blend whose pillars are the SVI
 * dimension scores — an SVI→dollar path. Founder decision D22 retires it;
 * the only remaining consumer is the share-price / vesting / dividend chain
 * (`lib/share-price.ts`), whose migration is D22-e and gated on V04b so that
 * already-issued figures stay reproducible. Do not add new callers — the
 * guard test `lib/valuation/no-svi-dollar.guard.test.ts` pins the list.
 */
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
