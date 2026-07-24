// Per-phase Investor Readiness — closes the P5a follow-up in
// docs/plans/atlassian-standard-mapping-goal.md §P5.
//
// The existing `computeReadinessScore` in `fundraise-checklist.ts` produces
// one blended number across every stage; a Chapter-1 founder gets the same
// score as a Chapter-10 founder, which is exactly the calibration mistake
// P5's exit criteria calls out ("readiness_by_phase(input) returning
// Record<PhaseKey, {score, band, missing_top3}> — reuse CRITERIA weights
// from evaluation-criteria.ts for the SVI subset per phase").
//
// Pure. No I/O, no imports besides types + the CRITERIA fixture + the
// PhaseKey / ALL_PHASE_KEYS tuple from journey-map. Consumers (dashboard
// tile, weekly digest, /api/nudge/next-steps) pass a criterionScores
// snapshot they already have; the helper returns one envelope per phase
// so the founder can see readiness climb as they move from Chapter 1
// through Chapter 12.

import { CRITERIA, type CriterionKey } from "@/lib/evaluation-criteria";
import { ALL_PHASE_KEYS, type PhaseKey } from "@/lib/journey-map";

/**
 * Which of the 13 SVI CRITERIA gate readiness at each 12-phase phase.
 *
 * Sourced from the phase gap matrix in
 * docs/plans/atlassian-standard-mapping-goal.md §1 — every criterion listed
 * for a phase is one an investor at that phase would actually look at.
 *
 * The mapping is deliberately overlapping (revenue matters from phase 5
 * onwards, dataroom from phase 9 onwards) — later phases stack more
 * criteria because the readiness bar rises as the raise gets bigger.
 */
export const PHASE_CRITERIA: Record<PhaseKey, readonly CriterionKey[]> = {
  1: ["idea", "founder_profile"],
  2: ["idea", "market", "customer_size"],
  3: ["market", "customer_size", "gtm_strategy"],
  4: ["code_git", "website", "roadmap"],
  5: ["customer_size", "revenue", "gtm_strategy", "code_git"],
  6: ["revenue", "gtm_strategy", "documents", "code_git"],
  7: ["revenue", "gtm_strategy", "team_structure", "customer_size"],
  8: ["team", "team_structure", "founder_profile", "documents"],
  9: ["documents", "dataroom", "team", "revenue", "founder_profile"],
  10: ["dataroom", "documents", "revenue", "team"],
  11: ["revenue", "team_structure", "dataroom", "documents"],
  12: ["dataroom", "documents", "revenue", "team"],
};

export type ReadinessBand = "not-ready" | "nearly-ready" | "ready";

export interface PhaseReadiness {
  phase: PhaseKey;
  /** 0-100 weighted score for this phase only. */
  score: number;
  band: ReadinessBand;
  /**
   * Top-3 criteria dragging the phase score down, ordered by
   * lost-weight descending. Uses the CRITERIA `title` field (English) so
   * the surface can render without a second lookup.
   */
  missing_top3: MissingCriterion[];
  /** Criteria that fed the score, for auditability. */
  criteria_used: readonly CriterionKey[];
}

export interface MissingCriterion {
  key: CriterionKey;
  title: string;
  /** Founder's current score for this criterion (0-100). */
  score: number;
  /** Weight this criterion carried inside the phase (0-100). */
  weight_in_phase: number;
}

export interface ReadinessByPhaseInput {
  /**
   * Founder's current per-criterion score (0..100). Missing keys treated
   * as 0 so a founder who has never touched Chapter 6 doesn't accidentally
   * pass a Chapter-9 readiness gate.
   */
  criterionScores: Partial<Record<CriterionKey, number>>;
}

export const READINESS_BAND_THRESHOLDS = {
  /** ≥ 75 = ready to send the deck / pack. */
  ready: 75,
  /** ≥ 45 = show it to a trusted advisor first. */
  nearly_ready: 45,
} as const;

/**
 * "A criterion counts as a gap if the founder is under 60/100 on it."
 * Same threshold `fundraise-checklist.ts::statusFromScore` uses for the
 * dataRoom check (`60/25`) — keeps the two readiness surfaces in sync.
 */
export const MISSING_CRITERION_SCORE_FLOOR = 60;

/**
 * Compute a per-phase readiness envelope for every 12-phase phase in one
 * pass. Deterministic — iterates {@link ALL_PHASE_KEYS} in ascending order
 * so the output is stable across calls, which the tests pin.
 */
export function computeReadinessByPhase(
  input: ReadinessByPhaseInput,
): Record<PhaseKey, PhaseReadiness> {
  const scores = input.criterionScores ?? {};
  const out = {} as Record<PhaseKey, PhaseReadiness>;
  for (const phase of ALL_PHASE_KEYS) {
    out[phase] = computeOnePhase(phase, scores);
  }
  return out;
}

function computeOnePhase(
  phase: PhaseKey,
  scores: Partial<Record<CriterionKey, number>>,
): PhaseReadiness {
  const criteria = PHASE_CRITERIA[phase];
  const defs = criteria.map((key) => CRITERIA.find((c) => c.key === key)!);
  const totalWeight = defs.reduce((sum, def) => sum + def.weight, 0);
  if (totalWeight === 0) {
    return {
      phase,
      score: 0,
      band: "not-ready",
      missing_top3: [],
      criteria_used: criteria,
    };
  }

  let weightedScore = 0;
  const gapScored: MissingCriterion[] = [];
  for (const def of defs) {
    const raw = safeScore(scores[def.key]);
    const weightPct = Math.round((def.weight / totalWeight) * 100);
    weightedScore += raw * (def.weight / totalWeight);
    if (raw < MISSING_CRITERION_SCORE_FLOOR) {
      gapScored.push({
        key: def.key,
        title: def.title,
        score: raw,
        weight_in_phase: weightPct,
      });
    }
  }

  const score = Math.round(weightedScore);
  const band = bandOf(score);
  const missing_top3 = gapScored
    .sort((a, b) => {
      const lostA = a.weight_in_phase * (1 - a.score / 100);
      const lostB = b.weight_in_phase * (1 - b.score / 100);
      if (lostA !== lostB) return lostB - lostA;
      // Tiebreak on the CRITERIA declaration order so the output is stable.
      return criteria.indexOf(a.key) - criteria.indexOf(b.key);
    })
    .slice(0, 3);

  return { phase, score, band, missing_top3, criteria_used: criteria };
}

/** Clamp to [0,100]; NaN / non-finite / negative → 0. */
export function safeScore(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return raw;
}

export function bandOf(score: number): ReadinessBand {
  if (score >= READINESS_BAND_THRESHOLDS.ready) return "ready";
  if (score >= READINESS_BAND_THRESHOLDS.nearly_ready) return "nearly-ready";
  return "not-ready";
}
