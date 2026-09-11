// Client-safe half of the founder nav-phase resolver (S7-A). Pure functions +
// types only — NO dynamic imports: webpack still bundles `import()` targets,
// and `@/lib/supabase` is `server-only`, which broke the production build
// (Gate 7, 2026-09-11) when `founder-nav-context.tsx` ("use client")
// imported the loader module. The loader lives in ./founder-phase.ts.

import { STEP_TO_PHASE, type GrowthPhase, type WorkflowStep } from "@/lib/nav/workflow-steps";
import { GROWTH_PHASE_IDS, isGrowthPhaseId, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";

// ─── SVI band → nav phase ────────────────────────────────────────────────────

/** Display name per nav phase (0..5). Index == phase. */
export const NAV_PHASE_NAMES: readonly string[] = Object.freeze([
  "Idea",
  "Validation",
  "Equity",
  "Fundraise",
  "Traction",
  "Growth",
]);

/**
 * SVI total → nav phase 0..5. `null` / non-finite → 0 (no score yet).
 * Band table moved verbatim from the dashboard page's `computePhase()`:
 * <30 → 0, ≤50 → 1, ≤70 → 2, ≤85 → 3, ≤120 → 4, else 5.
 */
export function navPhaseFromSvi(svi: number | null | undefined): GrowthPhase {
  if (svi == null || typeof svi !== "number" || !Number.isFinite(svi)) return 0;
  if (svi < 30) return 0;
  if (svi <= 50) return 1;
  if (svi <= 70) return 2;
  if (svi <= 85) return 3;
  if (svi <= 120) return 4;
  return 5;
}

// ─── 12 growth phases → nav phase ────────────────────────────────────────────

/**
 * 12-phase growth id → workflow step. This is the bucketing declared in the
 * doc comment on `currentPhaseToStep()` (`lib/nav/workflow-steps.ts`):
 *
 *   1..2 → validate · 3..5 → build · 6..8 → fundraise · 9..11 → grow · 12 → exit
 *
 * It is restated as data because the function's 1..5 branch is shadowed by
 * its 0..5 fast path (a raw ordinal 3 would come back "fundraise", not
 * "build"), so the low ordinals cannot be routed through the function.
 * `founder-phase.test.ts` pins this table against `currentPhaseToStep()` for
 * ordinals 6..12 where the function is reachable, and against the documented
 * table for 1..5. The docs matrix (`scripts/docs/unlock-matrix.mts`) reads
 * this same table so Table 1 in menu-walkthrough.md is derived from the
 * sidebar's real bridge.
 */
export const GROWTH_PHASE_TO_WORKFLOW_STEP: Readonly<Record<GrowthPhaseId, WorkflowStep>> = Object.freeze({
  vision: "validate",
  customer_dev: "validate",
  revenue_model: "build",
  pitch: "build",
  mentor_review: "build",
  legal_equity: "fundraise",
  go_to_market: "fundraise",
  product_dev: "fundraise",
  investor_review: "grow",
  team: "grow",
  growth: "grow",
  funding: "exit",
});

/**
 * `projects.growth_phase_current` → nav phase 0..5. Unknown / null ids → 0
 * (the founder has not declared a phase; the SVI band alone decides).
 */
export function navPhaseFromGrowthPhase(growthPhaseId: string | null | undefined): GrowthPhase {
  if (!isGrowthPhaseId(growthPhaseId)) return 0;
  return STEP_TO_PHASE[GROWTH_PHASE_TO_WORKFLOW_STEP[growthPhaseId]];
}

// ─── The resolver ────────────────────────────────────────────────────────────

export interface FounderNavPhaseInput {
  /** Latest SVI total for the active project (null when no analysis yet). */
  svi?: number | null;
  /** `projects.growth_phase_current` for the active project. */
  growthPhaseId?: string | null;
}

/** max(SVI band, growth phase) — see the module header for why max. */
export function resolveFounderNavPhase(input: FounderNavPhaseInput): GrowthPhase {
  const fromSvi = navPhaseFromSvi(input.svi);
  const fromGrowth = navPhaseFromGrowthPhase(input.growthPhaseId);
  return (fromSvi >= fromGrowth ? fromSvi : fromGrowth) as GrowthPhase;
}

/**
 * Fallback order for the sidebar: explicit `currentPhase` prop > founder
 * layout context > 0. A prop of `undefined` (page did not pass one) defers
 * to the context; a non-finite prop is treated as absent.
 */
export function pickNavPhase(prop: number | null | undefined, contextPhase: number | null | undefined): number {
  if (typeof prop === "number" && Number.isFinite(prop)) return prop;
  if (typeof contextPhase === "number" && Number.isFinite(contextPhase)) return contextPhase;
  return 0;
}

// ─── Loader (server) ─────────────────────────────────────────────────────────

export interface FounderNavContextValue {
  /** Resolved 0..5 nav phase — what the sidebar gates on. */
  navPhase: GrowthPhase;
  /** Inputs, kept so pages can show "why" without re-querying. */
  svi: number | null;
  growthPhaseId: GrowthPhaseId | null;
}

export const EMPTY_FOUNDER_NAV_CONTEXT: FounderNavContextValue = Object.freeze({
  navPhase: 0,
  svi: null,
  growthPhaseId: null,
});

/** Minimal project shape the loader needs (matches `lib/projects` Project). */

export function sviTotalFromRow(
  row: { total_svi?: unknown; analysis_json?: unknown } | null | undefined,
): number | null {
  if (!row) return null;
  const json = row.analysis_json as { totalSVI?: unknown } | null | undefined;
  const fromJson = toFinite(json?.totalSVI);
  if (fromJson !== null) return fromJson;
  return toFinite(row.total_svi);
}

function toFinite(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** All 12 ids in order — re-exported for callers that iterate the bridge. */
export { GROWTH_PHASE_IDS };
