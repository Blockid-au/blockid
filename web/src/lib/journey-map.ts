// Journey map — H.21 mechanical bridge between the fine-grained internal
// 12-phase Growth taxonomy (stored on DataRoom rows, reseller ticks, etc.) and
// the canonical 8-stage VC vocabulary that founders and investors read.
//
// The DB continues to store the 12-phase key (1..12) — this module is a pure
// lookup table so consumers can *display* the canonical bucket. See
// docs/plans/plan-delta-2026-07-23.md:96 (H.21) and
// docs/plans/real-world-workflow-parity-audit-2026-07-23.md §4 row 2.
//
// Source of the 12-phase labels: web/src/lib/showcase/gallery.ts (PHASE_LABELS).
// Source of the 8-stage labels: web/src/lib/journey-vocabulary.ts
// (CANONICAL_STAGES, CANONICAL_STAGE_LABELS).

import {
  CANONICAL_STAGES,
  CANONICAL_STAGE_LABELS,
  type StageKey,
} from "./journey-vocabulary";
import { PHASE_COUNT, PHASE_LABELS, type PhaseLabel } from "./showcase/gallery";

/**
 * The 12-phase Growth taxonomy is keyed by ordinal (1..12) in
 * {@link PHASE_LABELS}. We alias the numeric literal so callers stay
 * type-safe without importing the whole enum.
 */
export type PhaseKey = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Stable ordering of canonical 8 stages (earliest → latest). */
export const STAGE_ORDER: readonly StageKey[] = CANONICAL_STAGES;

/**
 * H.21 bucket-map: every 12-phase key → its canonical 8-stage bucket.
 *
 * Rationale for each row (drawn from PHASE_LABELS semantics in
 * `showcase/gallery.ts:17-30` and STAGE_ENTRY_CRITERIA in
 * `journey-vocabulary.ts:76-116`):
 *
 * |  # | 12-phase label            | 8-stage bucket    | Why                                             |
 * | -- | ------------------------- | ----------------- | ----------------------------------------------- |
 * |  1 | Vision / Day-0 Idea       | idea              | Founder-only, no artefact yet                    |
 * |  2 | Idea Validation           | validation        | ICP + discovery interviews start                 |
 * |  3 | Market Research           | validation        | Still pre-MVP, sizing TAM/SAM/SOM                |
 * |  4 | MVP / Product Discovery   | mvp_early_revenue | Buildable MVP scope agreed                       |
 * |  5 | PMF / Early Traction      | mvp_early_revenue | First paying users, PMF signal not yet locked-in |
 * |  6 | Revenue / Business Model  | seed              | Repeatable sales motion emerging                 |
 * |  7 | Growth / Analytics        | seed              | Retention proven, dashboards in place            |
 * |  8 | Team & Culture            | series_a          | 5-15 hires, founding leadership team             |
 * |  9 | Funding-Ready             | series_a          | Dataroom + metrics ready to raise A              |
 * | 10 | Fundraise / Term Sheet    | series_b_c        | Scale round with named VC lead                   |
 * | 11 | Post-Funding / Scale      | late_stage        | Pre-IPO scaling, audited financials              |
 * | 12 | Exit / Beyond             | public_exit       | IPO or acquisition                               |
 *
 * The mapping is deliberately many-to-one: the DB keeps the 12-phase key for
 * fidelity, the UI collapses to the canonical 8 whenever `bucketToCanonical`
 * is set. Every canonical stage receives at least one 12-phase phase — no
 * orphaned stages, which the unit tests enforce.
 */
export const PHASE_TO_STAGE: Record<PhaseKey, StageKey> = {
  1: "idea",
  2: "validation",
  3: "validation",
  4: "mvp_early_revenue",
  5: "mvp_early_revenue",
  6: "seed",
  7: "seed",
  8: "series_a",
  9: "series_a",
  10: "series_b_c",
  11: "late_stage",
  12: "public_exit",
};

/** All valid PhaseKey ordinals (1..12) in a stable, iterable tuple. */
export const ALL_PHASE_KEYS: readonly PhaseKey[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
];

/**
 * Return the canonical 8-stage bucket for a 12-phase key. Accepts a raw
 * `number` for ergonomic use with DB rows (`phase_at_generation` is a
 * nullable smallint); values outside 1..12 fall back to `"idea"`, the safe
 * earliest bucket — matching {@link import("./journey-vocabulary").sviStageToCanonical}.
 */
export function phaseToStage(phase: number | null | undefined): StageKey {
  if (phase == null) return "idea";
  const key = phase as PhaseKey;
  return PHASE_TO_STAGE[key] ?? "idea";
}

/**
 * Reverse lookup — every 12-phase phase that lands in a canonical bucket.
 * Deterministic: iterates {@link ALL_PHASE_KEYS} in ascending order so the
 * output is always the same for the same input.
 */
export function stageToPhases(stage: StageKey): PhaseKey[] {
  const out: PhaseKey[] = [];
  for (const key of ALL_PHASE_KEYS) {
    if (PHASE_TO_STAGE[key] === stage) out.push(key);
  }
  return out;
}

/**
 * Canonical-stage display copy for the current phase. Returns null when the
 * phase is outside 1..12 so callers can skip the badge instead of showing a
 * misleading "Idea" fallback in the UI (server-side callers that need a
 * definite string can use {@link phaseToStage} instead).
 */
export function phaseToStageLabel(
  phase: number | null | undefined,
): { stage: StageKey; label_en: string; label_vi: string } | null {
  if (phase == null) return null;
  const key = phase as PhaseKey;
  const stage = PHASE_TO_STAGE[key];
  if (!stage) return null;
  const labels = CANONICAL_STAGE_LABELS[stage];
  return { stage, label_en: labels.label_en, label_vi: labels.label_vi };
}

// Re-export the 12-phase constants so consumers can import both taxonomies
// from a single module when rendering side-by-side.
export { PHASE_COUNT, PHASE_LABELS };
export type { PhaseLabel, StageKey };
