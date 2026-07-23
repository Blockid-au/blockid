// Portfolio row derivation helpers.
//
// Pure derivation helpers PLUS a server-only aggregator that turns raw
// project / SVI / usage-log data into the row shape rendered by the
// /dashboard/portfolio surface and returned by /api/projects/portfolio.
//
// The pure helpers (`deriveCanonicalStage`, `deriveNextAction`) stay
// import-safe from vitest so we can exercise the stage/next-action ladder
// without spinning up Supabase. `getPortfolioRows` lazy-imports the
// server modules so importing this file from a test never pulls Supabase.
//
// Anchors:
//   - Canonical 8-stage bucket → `sviStageToCanonical` (web/src/lib/journey-vocabulary.ts)
//   - Legacy SVI stage index → `analysis_json.stage` on svi_analyses
//   - Next-action copy mirrors the single-project dashboard's
//     `computeNextAction` (web/src/app/dashboard/page.tsx).

import { sviStageToCanonical, type StageKey } from "./journey-vocabulary";

/**
 * Derive the canonical 8-stage bucket for a project row.
 *
 * Precedence:
 *   1. `sviStage` (0-7) from the latest analysis_json.stage — highest
 *      fidelity because it reflects the AI's classification of the
 *      startup's current phase.
 *   2. Fall back to SVI score bands when we only have `totalSvi`.
 *   3. Default to `"idea"` when neither is available.
 */
export function deriveCanonicalStage(
  sviStage: number | null | undefined,
  totalSvi: number | null | undefined,
): StageKey {
  if (typeof sviStage === "number" && Number.isFinite(sviStage)) {
    return sviStageToCanonical(sviStage);
  }
  if (typeof totalSvi === "number" && Number.isFinite(totalSvi)) {
    if (totalSvi < 30) return "idea";
    if (totalSvi <= 50) return "validation";
    if (totalSvi <= 70) return "mvp_early_revenue";
    if (totalSvi <= 85) return "seed";
    if (totalSvi <= 120) return "series_a";
    if (totalSvi <= 160) return "series_b_c";
    if (totalSvi <= 200) return "late_stage";
    return "public_exit";
  }
  return "idea";
}

/**
 * Phase-aware next-action copy for a portfolio row.
 *
 * Mirrors the single-project dashboard's step ladder so both surfaces
 * suggest the same "do this next" prompt for the same SVI score.
 */
export function deriveNextAction(
  totalSvi: number | null | undefined,
): { label: string; url: string } {
  if (typeof totalSvi !== "number" || !Number.isFinite(totalSvi)) {
    return { label: "Get your first SVI score", url: "/" };
  }
  if (totalSvi < 30) return { label: "Refine your idea", url: "/" };
  if (totalSvi <= 50) return { label: "Strengthen your profile", url: "/workspace/evidence" };
  if (totalSvi <= 70) return { label: "Set up equity", url: "/workspace/equity-setup" };
  if (totalSvi <= 85) return { label: "Build data room", url: "/workspace/data-room" };
  return { label: "Start fundraising", url: "/workspace/fundraise" };
}

export interface PortfolioRow {
  id: string;
  slug: string;
  name: string;
  current_svi_score: number | null;
  canonical_stage: StageKey;
  credits_used_mtd: number;
  last_activity_at: string | null;
  next_action: { label: string; url: string };
}

/** ISO timestamp for the first of the current UTC month. */
export function startOfMonthIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Aggregate all non-archived projects for a user into portfolio rows.
 *
 * One query for the project list, then per-project the latest SVI analysis
 * + this-month usage-log aggregation run in parallel via Promise.all.
 * Returns `[]` when Supabase is unavailable — the caller renders the empty
 * state and the user still sees the page.
 *
 * Lazy imports the server-only modules so tests that only exercise the
 * pure derivation helpers above never load Supabase.
 */
export async function getPortfolioRows(
  user: { id: string; email: string },
): Promise<PortfolioRow[]> {
  const { getUserProjects } = await import("./projects");
  const { getSupabaseAdmin } = await import("./supabase");

  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const projects = await getUserProjects(user.id);
  if (projects.length === 0) return [];

  const monthStart = startOfMonthIso();

  return Promise.all(
    projects.map(async (project): Promise<PortfolioRow> => {
      const [analysisResult, usageResult] = await Promise.all([
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

      return {
        id: project.id,
        slug: project.slug,
        name: project.name,
        current_svi_score: totalSvi,
        canonical_stage: deriveCanonicalStage(sviStage, totalSvi),
        credits_used_mtd: creditsUsedMtd,
        last_activity_at: lastActivityAt,
        next_action: deriveNextAction(totalSvi),
      };
    }),
  );
}
