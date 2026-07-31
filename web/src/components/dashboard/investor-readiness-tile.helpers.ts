// Pure helpers for <InvestorReadinessTile /> — extracted so they can be
// unit-tested under vitest without a DOM (the tile itself is "use client"
// and uses React hooks). No I/O, no imports beyond types.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P5_investor_readiness_score (blended sub-scores — legacy view)
//   §P5a per-phase readiness (readiness_by_phase[currentPhase] — new view)

import {
  GROWTH_PHASE_IDS,
  type GrowthPhaseId,
} from "@/lib/growth/phase-taxonomy";

export type ReadinessBand = "not-ready" | "warming-up" | "investor-ready";

// G8-P0: phase slugs are the canonical growth-phase ids, matching
// NudgeResult.current_phase.slug and the readiness_by_phase keys.
export type PhaseSlug = GrowthPhaseId;

export const ALL_PHASE_SLUGS: readonly PhaseSlug[] = GROWTH_PHASE_IDS;

export interface PhaseMissingItem {
  category: string;
  title: string;
  phase_slug: string;
  why_it_matters: string;
  raise_blocker: boolean;
  cta_url: string;
}

export interface PhaseReadinessLike {
  score: number;
  band: ReadinessBand;
  missing_top3?: readonly PhaseMissingItem[];
  criteria_used?: readonly string[];
}

export interface PhaseSeriesPoint {
  slug: PhaseSlug;
  score: number;
  band: ReadinessBand;
  isCurrent: boolean;
}

/** Tailwind class pack per phase-readiness band (matches tile UX contract). */
export const PHASE_BAND_CLASS: Record<ReadinessBand, string> = {
  "investor-ready":
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "warming-up":
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  "not-ready":
    "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

/**
 * Pick the per-phase readiness entry for the caller's current phase.
 * Returns null when the slug is missing or the map is empty — callers
 * fall back to the blended readiness_score in that case.
 */
export function pickPhaseEntry(
  byPhase: Record<string, PhaseReadinessLike> | undefined | null,
  currentPhaseSlug: string | undefined | null,
): PhaseReadinessLike | null {
  if (!byPhase || !currentPhaseSlug) return null;
  const entry = byPhase[currentPhaseSlug];
  if (!entry || typeof entry.score !== "number") return null;
  return entry;
}

/**
 * Project the readiness_by_phase map into a stable 12-point series (ordered
 * vision→funding) for the
 * inline SVG mini-chart. Missing phase entries render as score=0 / not-ready
 * so the chart never shows a hole.
 */
export function buildPhaseSeries(
  byPhase: Record<string, PhaseReadinessLike> | undefined | null,
  currentPhaseSlug: string | undefined | null,
): PhaseSeriesPoint[] {
  return ALL_PHASE_SLUGS.map((slug) => {
    const entry = byPhase?.[slug];
    const score = entry && typeof entry.score === "number"
      ? safeScore(entry.score)
      : 0;
    const band: ReadinessBand = entry?.band ?? "not-ready";
    return {
      slug,
      score,
      band,
      isCurrent: currentPhaseSlug === slug,
    };
  });
}

export type SubScoreKey =
  | "market"
  | "team"
  | "tech"
  | "financial"
  | "compliance";

export const SUB_SCORE_ORDER: readonly SubScoreKey[] = [
  "market",
  "team",
  "tech",
  "financial",
  "compliance",
] as const;

export const SUB_SCORE_LABELS: Record<SubScoreKey, string> = {
  market: "Market",
  team: "Team",
  tech: "Tech",
  financial: "Financial",
  compliance: "Compliance",
};

export interface ReadinessLike {
  overall: number;
  sub_scores: Record<SubScoreKey, number>;
}

export interface Band {
  label: "investor-ready" | "warming up" | "not ready";
  klass: string;
}

/** Discrete band for the overall readiness score (§P5 UX contract). */
export function bandOf(score: number): Band {
  if (score >= 75) {
    return {
      label: "investor-ready",
      klass:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
    };
  }
  if (score >= 50) {
    return {
      label: "warming up",
      klass:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    };
  }
  return {
    label: "not ready",
    klass:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  };
}

/** Colour hex for a sub-score bar segment (matches band thresholds). */
export function colourFor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}

/**
 * Deterministic lowest-scoring sub-score. Ties resolve to the earliest key
 * in SUB_SCORE_ORDER so the "how to improve" hint never flickers between
 * dimensions on identical scores.
 */
export function pickWeakest(
  sub: Partial<Record<SubScoreKey, number>>,
): SubScoreKey {
  let weakest: SubScoreKey = SUB_SCORE_ORDER[0];
  let min = Number.POSITIVE_INFINITY;
  for (const key of SUB_SCORE_ORDER) {
    const v = sub[key];
    if (typeof v === "number" && v < min) {
      min = v;
      weakest = key;
    }
  }
  return weakest;
}

/**
 * Clamp + round a raw score into a 0..100 integer safe for width attributes
 * and label rendering. Guards against NaN / Infinity from upstream drift.
 */
export function safeScore(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}
