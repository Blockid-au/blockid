// Pure helpers for <InvestorReadinessTile /> — extracted so they can be
// unit-tested under vitest without a DOM (the tile itself is "use client"
// and uses React hooks). No I/O, no imports beyond types.
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P5_investor_readiness_score.

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
