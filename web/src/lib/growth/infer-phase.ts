// inferPhase — THE one growth-phase rule (G19-S44, decision D5).
//
// Before S44 three surfaces decided "what phase is this startup in" three
// ways: the SVI engine's 0–7 stage (`detectStage`), the TBR adapter's
// `inferPhase` walk over the 12 phase gates, and the dashboard's
// `growthPhaseFromNavPhase(navPhaseFromSvi(svi))` band bridge. They
// disagreed on real founders (a Seed-labelled company shown as "Vision" on
// the dashboard and "Investor review" on the report). This module is the
// single function every surface calls:
//
//   • an explicit, valid `projects.growth_phase_current` wins — the founder
//     declared it, the gate is evaluated *for that phase*;
//   • otherwise the phase is the FIRST of the 12 whose exit gate is not yet
//     cleared by the stored criteria quality + dimension scores (the last
//     phase when every gate clears).
//
// The SVI stage 0–7 stays internal (benchmark bands only) and the 0..5 nav
// band in `lib/nav/founder-phase-shared.ts` only collapses the sidebar —
// neither is ever shown beside the 12-phase label again.
//
// Pure and client-safe (no I/O). Colocated test: infer-phase.test.ts pins
// that the dashboard, the adapter and the pipeline agree on three fixtures.

import { computePhaseGate, type PhaseGateCriterionRow, type PhaseGateResult, type SviDimension } from "@/lib/growth/phase-gate";
import { GROWTH_PHASE_IDS, isGrowthPhaseId, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";

export type PhaseDims = Partial<Record<SviDimension, number>>;

/**
 * Current growth phase = the explicit phase when declared, else the first
 * phase whose exit gate is not cleared by the criteria quality + dimension
 * scores (deterministic, no LLM). Always returns a full gate result so the
 * caller has blockers / completion for the same phase it will display.
 */
export function inferPhase(explicit: string | null | undefined, criteriaQuality: readonly PhaseGateCriterionRow[], dims: PhaseDims | null | undefined): PhaseGateResult {
  const dimensions = dims ?? {};
  if (isGrowthPhaseId(explicit)) {
    return computePhaseGate({ currentPhase: explicit, criteria: criteriaQuality, dimensions });
  }
  let last: PhaseGateResult | null = null;
  for (const phase of GROWTH_PHASE_IDS) {
    const r = computePhaseGate({ currentPhase: phase, criteria: criteriaQuality, dimensions });
    last = r;
    if (r.blockers.length > 0 || r.nextPhase === null) return r;
  }
  return last ?? computePhaseGate({ currentPhase: "vision", criteria: criteriaQuality, dimensions });
}

/** The 7 dimension keys the phase gate floors can name (`SviDimension`; SVM has no floor). */
const PHASE_DIM_KEYS: readonly SviDimension[] = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco"] as const;

/**
 * `SVIAnalysis.subs` (+ optional `dimensionScores` map) → the dimension map
 * the gate wants. The map wins when both carry a value; non-finite values
 * are dropped so an unscored dimension counts as absent, never as 0 from NaN.
 */
export function phaseDimsFromAnalysis(
  subs: ReadonlyArray<{ key: string; value?: number }> | null | undefined,
  dimensionScores?: Record<string, number> | null,
): PhaseDims {
  const out: PhaseDims = {};
  for (const sub of subs ?? []) {
    if (!sub?.key || !PHASE_DIM_KEYS.includes(sub.key as SviDimension)) continue;
    if (typeof sub.value === "number" && Number.isFinite(sub.value)) out[sub.key as SviDimension] = sub.value;
  }
  for (const k of PHASE_DIM_KEYS) {
    const v = dimensionScores?.[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * What every surface displays: `inferPhase(...).currentPhase`, or null when
 * nothing at all is known (no declared phase, no criteria, no scored
 * dimension) — the dashboard's "start here" state. A founder with any
 * score gets a real phase, the same one the report cover shows.
 */
export function displayPhaseFor(input: { declared?: string | null; criteria?: readonly PhaseGateCriterionRow[] | null; dims?: PhaseDims | null }): GrowthPhaseId | null {
  const criteria = input.criteria ?? [];
  const dims = input.dims ?? {};
  if (!isGrowthPhaseId(input.declared) && criteria.length === 0 && Object.keys(dims).length === 0) return null;
  return inferPhase(input.declared ?? null, criteria, dims).currentPhase;
}
