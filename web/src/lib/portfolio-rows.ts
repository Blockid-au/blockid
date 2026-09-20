// Server-side portfolio aggregator — split out of ./portfolio (G20-sweep).
//
// Static imports only. The previous `await import(/* webpackIgnore: true */
// "./projects")` in the shared file was never rewritten by webpack, so the
// standalone server chunk asked Node for a sibling `./projects` that does not
// exist and /workspace/projects/compare hit its error boundary on every
// render. `lib/portfolio.test.ts` pins that neither file has a dynamic import().

import "server-only";
import { getUserProjects } from "./projects";
import { getSupabaseAdmin } from "./supabase";
import { deriveCanonicalStage, deriveNextAction, reduceSviHistory, startOfMonthIso, type PortfolioRow } from "./portfolio";

/**
 * Aggregate all non-archived projects for a user into portfolio rows.
 *
 * One query for the project list, then per-project the latest SVI analysis
 * + this-month usage-log aggregation run in parallel via Promise.all.
 * Returns `[]` when Supabase is unavailable — the caller renders the empty
 * state and the user still sees the page.
 *
 * Server-only on purpose: the pure helpers it composes live in `./portfolio`
 * so the client comparison chart never drags Supabase into its bundle.
 */
export async function getPortfolioRows(
  user: { id: string; email: string },
): Promise<PortfolioRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const projects = await getUserProjects(user.id);
  if (projects.length === 0) return [];

  const monthStart = startOfMonthIso();
  const historyStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  return Promise.all(
    projects.map(async (project): Promise<PortfolioRow> => {
      const [analysisResult, usageResult, historyResult] = await Promise.all([
        supabase
          .from("svi_analyses")
          .select("total_svi, analysis_json, created_at")
          .eq("project_id", project.id)
          .eq("email", user.email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("usage_logs")
          .select("credits_used, created_at")
          .eq("user_id", user.id)
          .eq("project_id", project.id)
          .gte("created_at", monthStart),
        supabase
          .from("svi_analyses")
          .select("total_svi, created_at")
          .eq("project_id", project.id)
          .eq("email", user.email)
          .gte("created_at", historyStart)
          .order("created_at", { ascending: true }),
      ]);

      const analysis = analysisResult.data;
      const analysisJson = (analysis?.analysis_json as { stage?: number } | null) ?? null;
      const totalSvi = (analysis?.total_svi as number | null) ?? null;
      const sviStage = analysisJson?.stage ?? null;
      const analysisAt = (analysis?.created_at as string | null) ?? null;

      const usageRows = usageResult.data ?? [];
      const creditsUsedMtd = usageRows.reduce(
        (sum, r) => sum + Number((r as { credits_used?: number }).credits_used ?? 0),
        0,
      );
      const lastUsageAt = usageRows.reduce<string | null>((latest, r) => {
        const at = (r as { created_at?: string }).created_at ?? null;
        if (!at) return latest;
        if (!latest || at > latest) return at;
        return latest;
      }, null);

      const lastActivityAt = (() => {
        if (analysisAt && lastUsageAt) return analysisAt > lastUsageAt ? analysisAt : lastUsageAt;
        return analysisAt ?? lastUsageAt ?? project.updatedAt ?? project.createdAt;
      })();

      const historyRows = (historyResult.data ?? []) as Array<{
        total_svi: number | null;
        created_at: string | null;
      }>;
      const sviHistory = reduceSviHistory(historyRows);

      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        current_svi_score: totalSvi,
        canonical_stage: deriveCanonicalStage(sviStage, totalSvi),
        credits_used_mtd: creditsUsedMtd,
        last_activity_at: lastActivityAt,
        next_action: deriveNextAction(totalSvi),
        svi_history: sviHistory,
      };
    }),
  );
}
