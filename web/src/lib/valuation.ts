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

export interface ValuationEstimate {
  low: number;
  mid: number;
  high: number;
  method: string;
  confidence: number;
  currency: "AUD";
}

/**
 * Evidence-based startup valuation V2.
 *
 * Blends 3 methods with stage-dependent weights:
 *   - Berkus Method (A$750K per pillar, 5 pillars = A$3.75M cap)
 *   - Scorecard Method (Bill Payne weights against AU regional median)
 *   - Revenue Multiple (sector-specific, with growth/AI/churn adjustments)
 *
 * Stage baselines derived from:
 *   - Cut Through Venture 2024-2025 (AU startup funding data)
 *   - Carta global benchmarks with AU discount (0.55-0.70x)
 *   - AU SAFE cap data (Blackbird, AirTree, Square Peg)
 *   - AVCAL / ScaleSuite funding reports
 */
export function estimateValuation(
  svi: number,
  stage: number,
  metrics?: { mrr?: number; arr?: number; users?: number; sector?: string; growthPctYoY?: number; churnPct?: number; isAINative?: boolean },
  dimensions?: Record<string, number>,
): ValuationEstimate {
  const s = clamp(stage, 0, 7);

  // AU market baselines (pre-money, AUD) — calibrated against 14 real AU raises 2024-2025
  // Sources: Cut Through Venture, ScaleSuite, NUVC, SmartCompany, Capital Brief
  // Validated: avg delta was -80% with V2.0 baselines → raised 3-4x to match market
  const BASELINES: Record<number, { low: number; mid: number; high: number }> = {
    0: { low:   500_000, mid:  1_500_000, high:   3_000_000 }, // Concept (Bazaa A$2.6M, validated)
    1: { low: 1_500_000, mid:  4_000_000, high:   8_000_000 }, // Validated (Parachute A$8.5M, Cor A$8M)
    2: { low: 5_000_000, mid: 10_000_000, high:  16_000_000 }, // MVP/Seed (Aigentsphere A$20M, Hachiko A$10-12M)
    3: { low: 10_000_000, mid: 20_000_000, high:  40_000_000 }, // Traction (Breaker A$36-45M)
    4: { low: 25_000_000, mid: 50_000_000, high:  90_000_000 }, // Revenue/Series A (Operata A$89M, Block Earner A$67M)
    5: { low: 50_000_000, mid: 100_000_000, high: 200_000_000 }, // Growth (Splose >A$100M)
    6: { low: 100_000_000, mid: 250_000_000, high: 500_000_000 }, // Scale
    7: { low: 300_000_000, mid: 750_000_000, high: 2_000_000_000 }, // Corporation (Airwallex A$9.6B)
  };

  const PILLAR_CAP = 2_000_000; // AUD per Berkus pillar (raised from A$750K to match market)

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

  // ── Band width (uncertainty by stage) ──────────────────────────────────
  const band = s <= 1 ? 0.50 : s <= 3 ? 0.40 : s <= 5 ? 0.30 : 0.25;
  const base = BASELINES[s]!;
  const lowAud = Math.max(Math.round(midAud * (1 - band)), base.low);
  const highAud = Math.min(Math.round(midAud * (1 + band)), (BASELINES[Math.min(s + 1, 7)]?.high ?? base.high) * 1.2);

  // ── Confidence ─────────────────────────────────────────────────────────
  let confidence = 10;
  if (dimensions) confidence += Object.values(dimensions).filter(v => v != null).length * 5;
  if (hasRevenue) confidence += 15;
  if (metrics?.growthPctYoY != null) confidence += 5;
  if (metrics?.sector) confidence += 5;
  confidence = clamp(confidence, 5, 95);

  return {
    low: lowAud,
    mid: midAud,
    high: highAud,
    method,
    confidence,
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
