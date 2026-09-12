// S25-A — Connected revenue → SVI (TRE) contribution table.
//
// Until S25-A `api/svi/rescore-from-evidence` added a flat +15 to a dimension
// for every `connected_source` evidence row, so a Stripe account with A$40
// MRR scored the same traction credit as one with A$400k. This module is the
// ONE deterministic table both the rescore route and the S17-B valuation
// bridge (`lib/valuation-mrr-bridge.ts`) read, so "what did connecting
// Stripe/Xero do to my score?" has a single answer.
//
//   points = clamp0( round( (tier + growth + churn) × decay ) )
//
//   tier    MRR (AUD)      0 | <1k | 1–10k | 10–50k | 50–200k | >200k
//           points         0 |  5  |  10   |   15   |   20    |  25
//           The 5 / 10 / 15 rungs are `computeMetricsBonus()` in
//           lib/svi-analysis.ts (mrr > 0 → 5, > 1k → 10, > 10k → 15); the two
//           upper rungs extend that ladder in the same +5 step.
//   growth  MRR now vs the connector snapshot ~90 days ago
//           ≥ +30 % → +5 · ≥ +10 % → +3 · within ±10 % → 0 · ≥ −25 % → −2 · below → −5
//           (no prior snapshot → 0: growth is never inferred).
//   churn   90-day subscription churn (Stripe only; Xero has none)
//           < 3 % → 0 · < 5 % → −2 · < 10 % → −4 · ≥ 10 % → −6
//   decay   evidence age ≤ 90 d → 1 · ≤ 180 d → 0.5 · > 180 d → 0
//           (the S17-B bridge ignores > 90 d for the VALUATION range; the
//           score keeps a half-weight tail so a founder who stops syncing
//           slides rather than falls off a cliff, then reaches 0 at 180 d).
//
// Pure: no I/O, no Date.now() unless `now` is omitted.

export const MRR_TIERS = [
  { key: "none", label: "no recurring revenue", maxExclusiveAud: 0, points: 0 },
  { key: "lt_1k", label: "under A$1k MRR", maxExclusiveAud: 1_000, points: 5 },
  { key: "1k_10k", label: "A$1k–10k MRR", maxExclusiveAud: 10_000, points: 10 },
  { key: "10k_50k", label: "A$10k–50k MRR", maxExclusiveAud: 50_000, points: 15 },
  { key: "50k_200k", label: "A$50k–200k MRR", maxExclusiveAud: 200_000, points: 20 },
  { key: "gt_200k", label: "over A$200k MRR", maxExclusiveAud: Number.POSITIVE_INFINITY, points: 25 },
] as const;

export type MrrTierKey = (typeof MRR_TIERS)[number]["key"];

export const GROWTH_RULES = [
  { minPct: 30, points: 5 },
  { minPct: 10, points: 3 },
  { minPct: -10, points: 0 },
  { minPct: -25, points: -2 },
  { minPct: Number.NEGATIVE_INFINITY, points: -5 },
] as const;

export const CHURN_RULES = [
  { maxExclusivePct: 3, points: 0 },
  { maxExclusivePct: 5, points: -2 },
  { maxExclusivePct: 10, points: -4 },
  { maxExclusivePct: Number.POSITIVE_INFINITY, points: -6 },
] as const;

export const FRESHNESS_FULL_DAYS = 90;
export const FRESHNESS_HALF_DAYS = 180;

/** Dimension the contribution lands on — traction. */
export const CONNECTED_REVENUE_DIMENSION = "tre" as const;

export interface ConnectedRevenueScoreInput {
  /** Latest MRR from the connector, AUD. Non-finite / negative → treated as 0. */
  mrrAud: number;
  /** ISO timestamp the figure was captured (evidence freshness). */
  capturedAt: string;
  /** MRR from the snapshot taken ~90 days before `capturedAt`, if any. */
  priorMrrAud?: number | null;
  /** 90-day subscription churn in percent (Stripe); null/undefined when unknown. */
  churnRate90dPct?: number | null;
  /** Clock for the freshness decay; defaults to `new Date()`. */
  now?: Date;
}

export interface ConnectedRevenueScore {
  /** Final TRE points after growth, churn and decay (never negative). */
  points: number;
  tier: MrrTierKey;
  tierLabel: string;
  tierPoints: number;
  /** Percent change vs the prior snapshot; null when no prior. */
  growthPct: number | null;
  growthPoints: number;
  churnRate90dPct: number | null;
  churnPoints: number;
  /** 1, 0.5 or 0. */
  decay: number;
  /** Age of the evidence in whole days; null when `capturedAt` is unparsable (→ decay 0). */
  ageDays: number | null;
  /** One line for the score breakdown. */
  breakdown: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function mrrTier(mrrAud: number): (typeof MRR_TIERS)[number] {
  const v = Number.isFinite(mrrAud) && mrrAud > 0 ? mrrAud : 0;
  if (v === 0) return MRR_TIERS[0];
  for (const t of MRR_TIERS) {
    if (t.maxExclusiveAud > 0 && v < t.maxExclusiveAud) return t;
  }
  return MRR_TIERS[MRR_TIERS.length - 1];
}

export function growthPoints(pct: number | null): number {
  if (pct === null || !Number.isFinite(pct)) return 0;
  for (const r of GROWTH_RULES) if (pct >= r.minPct) return r.points;
  return 0;
}

export function churnPoints(churnPct: number | null | undefined): number {
  if (churnPct === null || churnPct === undefined || !Number.isFinite(churnPct)) return 0;
  const v = Math.max(0, churnPct);
  for (const r of CHURN_RULES) if (v < r.maxExclusivePct) return r.points;
  return CHURN_RULES[CHURN_RULES.length - 1].points;
}

/** Evidence freshness weight: 1 within 90 d, 0.5 to 180 d, 0 after (or when unparsable). */
export function freshnessDecay(capturedAt: string, now: Date = new Date()): { decay: number; ageDays: number | null } {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return { decay: 0, ageDays: null };
  const ageDays = Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
  if (ageDays <= FRESHNESS_FULL_DAYS) return { decay: 1, ageDays };
  if (ageDays <= FRESHNESS_HALF_DAYS) return { decay: 0.5, ageDays };
  return { decay: 0, ageDays };
}

/** Percent change (one decimal) vs a prior MRR; null when there is no usable prior. */
export function growthPct(mrrAud: number, priorMrrAud: number | null | undefined): number | null {
  if (priorMrrAud === null || priorMrrAud === undefined || !Number.isFinite(priorMrrAud) || priorMrrAud <= 0) return null;
  if (!Number.isFinite(mrrAud)) return null;
  return Math.round(((mrrAud - priorMrrAud) / priorMrrAud) * 1000) / 10;
}

function fmtAud(v: number): string {
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(1)}m`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(1)}k`;
  return `A$${Math.round(v)}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Deterministic TRE contribution for one connected-revenue figure. Pure.
 */
export function scoreConnectedRevenue(input: ConnectedRevenueScoreInput): ConnectedRevenueScore {
  const mrr = Number.isFinite(input.mrrAud) && input.mrrAud > 0 ? input.mrrAud : 0;
  const tier = mrrTier(mrr);
  const g = growthPct(mrr, input.priorMrrAud);
  const gPts = growthPoints(g);
  const churn =
    input.churnRate90dPct === null || input.churnRate90dPct === undefined || !Number.isFinite(input.churnRate90dPct)
      ? null
      : Math.max(0, input.churnRate90dPct);
  const cPts = churnPoints(churn);
  const { decay, ageDays } = freshnessDecay(input.capturedAt, input.now ?? new Date());

  const raw = (tier.points + gPts + cPts) * decay;
  const points = Math.max(0, Math.round(raw));

  const parts = [`${fmtAud(mrr)} MRR (${tier.label}: ${signed(tier.points)})`];
  parts.push(g === null ? "no 90-day baseline (0)" : `${signed(g)}% growth (${signed(gPts)})`);
  parts.push(churn === null ? "churn unknown (0)" : `${churn.toFixed(1)}% churn (${signed(cPts)})`);
  parts.push(
    decay === 1 ? "fresh ×1" : decay === 0.5 ? `${ageDays} d old ×0.5` : ageDays === null ? "undated ×0" : `${ageDays} d old ×0`,
  );

  return {
    points,
    tier: tier.key,
    tierLabel: tier.label,
    tierPoints: tier.points,
    growthPct: g,
    growthPoints: gPts,
    churnRate90dPct: churn,
    churnPoints: cPts,
    decay,
    ageDays,
    breakdown: `${parts.join(", ")} → ${signed(points)} TRE`,
  };
}
