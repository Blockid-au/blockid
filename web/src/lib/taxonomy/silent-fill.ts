// Silent fill (server-only) — the one entry point the request paths call.
//
// Wraps suggestTaxonomy() + upsertSuggestedTaxonomy() in a try/catch so that
// classification can never fail a project create/update or an SVI analysis
// (spec §B.6 step 1–2, sprint S-T1 "silent fill, no UI"). Hook sites:
//   • lib/projects.ts             createProject / updateProject
//   • lib/evaluations.ts          createEvaluation (evaluator-owned project)
//   • app/api/svi/route.ts        after the svi_analyses insert
//   • lib/report-pipeline/run-for-project.ts  insertAnalysisRow
//
// Always awaited by callers (one select + one insert/update — a few ms) so
// the row exists by the time the next page loads; never throws.

import "server-only";

import { suggestTaxonomy, type SuggestTaxonomyInput } from "./suggest";
import { upsertSuggestedTaxonomy, type UpsertTaxonomyResult } from "./store";

export interface SilentFillOptions {
  /** Where the call came from — logged with failures only. */
  reason: "project_create" | "project_update" | "evaluation_create" | "svi_analysis" | "report_pipeline" | "backfill";
}

export async function silentFillTaxonomy(
  projectId: string | null | undefined,
  input: SuggestTaxonomyInput,
  opts: SilentFillOptions,
): Promise<UpsertTaxonomyResult | null> {
  if (!projectId) return null;
  try {
    const suggestion = suggestTaxonomy(input);
    const res = await upsertSuggestedTaxonomy(projectId, suggestion);
    if (!res.ok && res.error) {
      console.warn(`[blockid:taxonomy] silent fill (${opts.reason}) skipped for ${projectId}: ${res.error}`);
    }
    return res;
  } catch (err) {
    console.warn(`[blockid:taxonomy] silent fill (${opts.reason}) threw for ${projectId}`, err);
    return null;
  }
}
