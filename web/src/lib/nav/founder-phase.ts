// S7-A (G8 follow-up) — ONE founder nav-phase resolver for the workspace
// sidebar.
//
// The sidebar (`components/workspace/workspace-layout.tsx`) gates nav groups
// on a coarse 0..5 `currentPhase` — the workflow-step index in
// `lib/nav/workflow-steps.ts` (ideate · validate · build · fundraise · grow ·
// exit). Before this module two pages computed that number two different
// ways and the other ~130 workspace pages passed nothing (→ 0), so the menu
// changed shape from page to page:
//
//   • /dashboard          SVI band table (`computePhase()`, formerly local)
//   • /workspace/funding  `projects.stage`
//   • everything else     0 → Build / Fundraise / Scale & Exit hidden
//
// Meanwhile the Next-unlock card reads the 12-phase
// `projects.growth_phase_current` (`lib/growth/phase-taxonomy.ts`), so two
// phase notions coexisted. This module is the bridge:
//
//   resolveFounderNavPhase = max(navPhaseFromSvi(svi), navPhaseFromGrowthPhase(id))
//
// The max rule is deliberate: a founder never loses menu by having a lower
// SVI than their declared growth phase, and never loses menu by declaring a
// lower growth phase than their SVI band earns.
//
// `(app)/(founder)/layout.tsx` loads the context once per request with
// `getFounderNavContext()` and hands it to the sidebar through
// `FounderNavContextProvider`; a page that already has the numbers in hand
// may still pass `currentPhase` explicitly (prop wins — see
// `pickNavPhase()`).
//
// The pure half of this module has NO static server imports so it can be
// imported from client components and from the docs matrix builder
// (`scripts/docs/unlock-matrix.mts`). The loader pulls its server deps in
// through dynamic `import()` — the same pattern as
// `getCurrentProjectIsSandbox()` in `lib/projects.ts`.

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
export interface FounderNavProjectLike {
  id: string;
  growth_phase_current: string | null;
}

/**
 * Read the active project's latest SVI + `growth_phase_current` and resolve
 * the nav phase. Non-fatal: any failure (no DB, no session scope, query
 * error) yields phase 0 so a founder page never 500s because of the menu.
 *
 * Project resolution honours the `blockid_project` cookie the same way
 * `getProjectIdFromRequest()` does; pass `opts.project` when the caller has
 * already loaded it to skip that query. The SVI read mirrors `/dashboard`:
 * latest `svi_analyses` row for (email, project_id), `analysis_json.totalSVI`
 * first, `total_svi` column as the fallback. Read-only — unlike
 * `findLatestAnalysisWithFallback()` it never migrates legacy rows.
 */
export async function getFounderNavContext(
  user: { id: string; email: string } | null | undefined,
  opts: { project?: FounderNavProjectLike | null } = {},
): Promise<FounderNavContextValue> {
  if (!user?.id) return EMPTY_FOUNDER_NAV_CONTEXT;
  try {
    let project: FounderNavProjectLike | null | undefined = opts.project;
    if (project === undefined) {
      const [{ cookies }, { getActiveProject }] = await Promise.all([
        import("next/headers"),
        import("@/lib/projects"),
      ]);
      let slug: string | undefined;
      try {
        const store = await cookies();
        slug = store.get("blockid_project")?.value;
      } catch {
        slug = undefined;
      }
      project = await getActiveProject(user.id, slug);
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    let svi: number | null = null;
    if (supabase && user.email) {
      const q = supabase
        .from("svi_analyses")
        .select("total_svi, analysis_json")
        .eq("email", user.email);
      if (project?.id) q.eq("project_id", project.id);
      else q.is("project_id", null);
      const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      svi = sviTotalFromRow(data);
    }

    const rawGrowth = project?.growth_phase_current ?? null;
    const growthPhaseId = isGrowthPhaseId(rawGrowth) ? rawGrowth : null;
    return {
      navPhase: resolveFounderNavPhase({ svi, growthPhaseId }),
      svi,
      growthPhaseId,
    };
  } catch {
    return EMPTY_FOUNDER_NAV_CONTEXT;
  }
}

/** `analysis_json.totalSVI` first (what /dashboard renders), else `total_svi`. */
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
