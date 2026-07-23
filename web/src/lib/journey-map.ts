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

// ─── Second 12-phase taxonomy: startup-growth-phases string ids ────────────
//
// The `web/src/lib/startup-growth-phases.ts` module publishes a parallel 12-
// phase taxonomy keyed by human-readable string ids (vision, customer_dev,
// …, funding). It is consumed by the SVI report pipeline, the CEO daily
// summary cron, the SCN detector and the phase-progress API. This block
// bridges that taxonomy to the canonical 8-stage vocabulary so any surface
// can collapse fine-grained phases into VC-standard buckets when needed.
//
// The DB continues to store the string id — this map is a pure display /
// analytics-time collapse, identical in spirit to the numeric PHASE_TO_STAGE
// bridge above.
//
// Rationale table (drawn from GROWTH_PHASES semantics in
// `startup-growth-phases.ts:35-324` and STAGE_ENTRY_CRITERIA in
// `journey-vocabulary.ts:76-116`):
//
// |  # | GrowthPhaseId    | 8-stage bucket    | Why                                                     |
// | -- | ---------------- | ----------------- | ------------------------------------------------------- |
// |  1 | vision           | idea              | Day-0 founder vision, no artefact yet                    |
// |  2 | customer_dev     | validation        | Persona + discovery interviews = validation entry gate   |
// |  3 | revenue_model    | validation        | Business Model Canvas + pricing hypothesis, still pre-MVP|
// |  4 | pitch            | mvp_early_revenue | Pitch deck with early metrics/LOIs, MVP era              |
// |  5 | mentor_review    | mvp_early_revenue | Mentor panel testing MVP hypothesis, pivot/persevere     |
// |  6 | legal_equity     | seed              | Cap table + SHA + ESOP = clean seed-round legal chassis  |
// |  7 | go_to_market     | seed              | GTM + first 100 paying customers = repeatable sales      |
// |  8 | product_dev      | series_a          | Product roadmap + scalable stack = post-PMF scaling      |
// |  9 | investor_review  | series_a          | Traction dashboard + valuation basis = Series A ready    |
// | 10 | team             | series_b_c        | ESOP + org chart + culture = scale-era leadership build  |
// | 11 | growth           | late_stage        | 10x scaling engine + cohort retention = pre-IPO scale    |
// | 12 | funding          | public_exit       | Data room + DD + term sheet = IPO / exit preparation     |
//
// The mapping keeps every canonical bucket populated (no orphans) — a hard
// invariant enforced by the growth-phases-map tests. Semantic stretches
// (team → series_b_c, funding → public_exit) are called out in the table
// above and reflect that this 12-phase taxonomy front-loads validation-era
// activity and treats "funding" as a terminal fundraising milestone that
// extends into exit prep.

/**
 * Every string id declared in `startup-growth-phases.ts:GROWTH_PHASES`, in
 * declaration order. Callers should prefer the derived `GrowthPhaseId` type
 * rather than raw strings so a rename in the source module surfaces here at
 * compile time.
 */
export const GROWTH_PHASE_IDS = [
  "vision",
  "customer_dev",
  "revenue_model",
  "pitch",
  "mentor_review",
  "legal_equity",
  "go_to_market",
  "product_dev",
  "investor_review",
  "team",
  "growth",
  "funding",
] as const;

export type GrowthPhaseId = (typeof GROWTH_PHASE_IDS)[number];

/**
 * String-keyed bucket map for the startup-growth-phases 12-phase taxonomy.
 * Mirrors the numeric {@link PHASE_TO_STAGE} above — every phase gets exactly
 * one canonical stage, and every canonical stage receives at least one phase.
 */
export const GROWTH_PHASE_TO_STAGE: Record<GrowthPhaseId, StageKey> = {
  vision: "idea",
  customer_dev: "validation",
  revenue_model: "validation",
  pitch: "mvp_early_revenue",
  mentor_review: "mvp_early_revenue",
  legal_equity: "seed",
  go_to_market: "seed",
  product_dev: "series_a",
  investor_review: "series_a",
  team: "series_b_c",
  growth: "late_stage",
  funding: "public_exit",
};

/**
 * Return the canonical 8-stage bucket for a growth-phase string id. Unknown
 * ids (or `null` / `undefined`) fall back to `"idea"`, matching the safety
 * behaviour of {@link phaseToStage} and {@link
 * import("./journey-vocabulary").sviStageToCanonical}.
 */
export function growthPhaseToStage(
  id: GrowthPhaseId | string | null | undefined,
): StageKey {
  if (id == null) return "idea";
  return GROWTH_PHASE_TO_STAGE[id as GrowthPhaseId] ?? "idea";
}

/**
 * Reverse lookup — every growth-phase string id that lands in a canonical
 * bucket. Deterministic: iterates {@link GROWTH_PHASE_IDS} in declaration
 * order so the output is stable for the same input.
 */
export function stageToGrowthPhases(stage: StageKey): GrowthPhaseId[] {
  const out: GrowthPhaseId[] = [];
  for (const id of GROWTH_PHASE_IDS) {
    if (GROWTH_PHASE_TO_STAGE[id] === stage) out.push(id);
  }
  return out;
}

/**
 * Canonical-stage display copy for a growth-phase string id. Mirrors {@link
 * phaseToStageLabel} for the numeric taxonomy so a UI surface can render a
 * bucketed badge for either taxonomy with a single helper shape.
 *
 * Returns `null` for unknown ids so callers can hide the badge instead of
 * showing a misleading fallback.
 */
export function growthPhaseToStageLabel(
  id: GrowthPhaseId | string | null | undefined,
): { stage: StageKey; label_en: string; label_vi: string } | null {
  if (id == null) return null;
  const stage = GROWTH_PHASE_TO_STAGE[id as GrowthPhaseId];
  if (!stage) return null;
  const labels = CANONICAL_STAGE_LABELS[stage];
  return { stage, label_en: labels.label_en, label_vi: labels.label_vi };
}

// Re-export the 12-phase constants so consumers can import both taxonomies
// from a single module when rendering side-by-side.
export { PHASE_COUNT, PHASE_LABELS };
export type { PhaseLabel, StageKey };
