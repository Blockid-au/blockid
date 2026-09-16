// Client-safe half of the founder nav-phase resolver (S7-A). Pure functions +
// types only — NO dynamic imports: webpack still bundles `import()` targets,
// and `@/lib/supabase` is `server-only`, which broke the production build
// (Gate 7, 2026-09-11) when `founder-nav-context.tsx` ("use client")
// imported the loader module. The loader lives in ./founder-phase.ts.

import { GROWTH_PHASE_IDS, isGrowthPhaseId, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";

// ─── The 0..5 nav band ───────────────────────────────────────────────────────
//
// G13-W1-IA1 (D4): the canonical phase scale is the 12 `GrowthPhaseId`s in
// `lib/growth/phase-taxonomy.ts`. This 0..5 band is a DERIVED, INTERNAL
// number used only to collapse sidebar groups (`NavGroup.minPhase` /
// `NavLeaf.minPhase`). It is never displayed as a number and never
// persisted. The former `lib/nav/workflow-steps.ts` (ideate · validate ·
// build · fundraise · grow · exit) is folded in here.

/** The 0..5 sidebar band. Index == band. */
export type NavPhase = 0 | 1 | 2 | 3 | 4 | 5;


export const NAV_PHASES: readonly NavPhase[] = Object.freeze([0, 1, 2, 3, 4, 5]);

export function isNavPhase(v: unknown): v is NavPhase {
  return typeof v === "number" && (NAV_PHASES as readonly number[]).includes(v);
}

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
export function navPhaseFromSvi(svi: number | null | undefined): NavPhase {
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
 * 12-phase growth id → 0..5 nav band. The bucketing:
 *
 *   1..2 → 1 (validation) · 3..5 → 2 (equity) · 6..8 → 3 (fundraise)
 *   · 9..11 → 4 (traction) · 12 → 5 (growth)
 *
 * The docs matrix (`scripts/docs/unlock-matrix.mts`) reads this same table
 * so Table 1 in menu-walkthrough.md is derived from the sidebar's real
 * bridge; `founder-phase.test.ts` pins it against `GROWTH_PHASE_ORDER`.
 */
export const GROWTH_PHASE_TO_NAV_PHASE: Readonly<Record<GrowthPhaseId, NavPhase>> = Object.freeze({
  vision: 1,
  customer_dev: 1,
  revenue_model: 2,
  pitch: 2,
  mentor_review: 2,
  legal_equity: 3,
  go_to_market: 3,
  product_dev: 3,
  investor_review: 4,
  team: 4,
  growth: 4,
  funding: 5,
});

/**
 * `projects.growth_phase_current` → nav phase 0..5. Unknown / null ids → 0
 * (the founder has not declared a phase; the SVI band alone decides).
 */
export function navPhaseFromGrowthPhase(growthPhaseId: string | null | undefined): NavPhase {
  if (!isGrowthPhaseId(growthPhaseId)) return 0;
  return GROWTH_PHASE_TO_NAV_PHASE[growthPhaseId];
}

/**
 * Map an arbitrary numeric phase (0..5 band, or a legacy 1..12 growth-phase
 * ordinal) onto the 0..5 band. Ordinals above 5 are bucketed like
 * `GROWTH_PHASE_TO_NAV_PHASE`: 6..8 → 3, 9..11 → 4, 12 → 5.
 */
export function clampNavPhase(phase: number | null | undefined): NavPhase {
  if (phase == null || Number.isNaN(phase)) return 0;
  const p = Math.round(phase);
  if (p <= 0) return 0;
  if (p <= 5) return p as NavPhase;
  if (p <= 8) return 3;
  if (p <= 11) return 4;
  return 5;
}

// ─── The resolver ────────────────────────────────────────────────────────────

export interface FounderNavPhaseInput {
  /** Latest SVI total for the active project (null when no analysis yet). */
  svi?: number | null;
  /** `projects.growth_phase_current` for the active project. */
  growthPhaseId?: string | null;
}

/** max(SVI band, growth phase) — see the module header for why max. */
export function resolveFounderNavPhase(input: FounderNavPhaseInput): NavPhase {
  const fromSvi = navPhaseFromSvi(input.svi);
  const fromGrowth = navPhaseFromGrowthPhase(input.growthPhaseId);
  return (fromSvi >= fromGrowth ? fromSvi : fromGrowth) as NavPhase;
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
  navPhase: NavPhase;
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
