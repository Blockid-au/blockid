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

export * from "./founder-phase-shared";
import {
  EMPTY_FOUNDER_NAV_CONTEXT,
  resolveFounderNavPhase,
  sviTotalFromRow,
  type FounderNavContextValue,
} from "./founder-phase-shared";
import { isGrowthPhaseId } from "@/lib/growth/phase-taxonomy";

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