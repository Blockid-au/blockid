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

export interface PortfolioSviPoint {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  /** SVI score for that day (last-value-wins when multiple analyses run same day). */
  score: number;
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
  /**
   * Last-30-days SVI history for the cross-project comparison chart.
   * One entry per calendar day (UTC), sorted ascending. When svi_analyses
   * has no rows in-window this is `[]`. When it has exactly one row the
   * series is a single point — the chart still renders a marker.
   */
  svi_history: PortfolioSviPoint[];
}

/** Cap the comparison chart at N series so the legend stays legible. */
export const PORTFOLIO_COMPARISON_MAX_SERIES = 5;

/** UTC calendar day (`YYYY-MM-DD`) for a timestamp string. */
export function toUtcDay(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Reduce raw svi_analyses rows into last-30-day daily points, keeping the
 * latest score per calendar day (svi_analyses is ordered ascending here).
 */
export function reduceSviHistory(
  rows: Array<{ total_svi: number | null; created_at: string | null }>,
  now: Date = new Date(),
): PortfolioSviPoint[] {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const byDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.created_at || typeof r.total_svi !== "number") continue;
    const ts = new Date(r.created_at).getTime();
    if (Number.isNaN(ts) || ts < cutoff) continue;
    // Last write wins — rows come in ascending order.
    byDay.set(toUtcDay(r.created_at), Math.round(r.total_svi));
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, score]) => ({ date, score }));
}

/**
 * Prepare Recharts-friendly wide-format data for the comparison chart:
 * one row per date, one key per project. Caps series at
 * `PORTFOLIO_COMPARISON_MAX_SERIES` (highest-current-SVI wins) so the
 * legend never gets crowded. Returns `null` when no row has any history.
 */
export function deriveComparisonSeries(
  rows: Pick<PortfolioRow, "id" | "name" | "current_svi_score" | "svi_history">[],
  maxSeries: number = PORTFOLIO_COMPARISON_MAX_SERIES,
): {
  series: Array<{ id: string; name: string; last_score: number | null }>;
  data: Array<Record<string, string | number>>;
  total_projects_with_history: number;
} | null {
  const withHistory = rows.filter((r) => r.svi_history.length > 0);
  if (withHistory.length === 0) return null;

  // Rank by current SVI descending; nulls last. Stable tiebreak by name.
  const ranked = [...withHistory].sort((a, b) => {
    const aScore = a.current_svi_score ?? -1;
    const bScore = b.current_svi_score ?? -1;
    if (aScore !== bScore) return bScore - aScore;
    return a.name.localeCompare(b.name);
  });

  const kept = ranked.slice(0, Math.max(0, maxSeries));

  // Collect union of dates across kept series.
  const dateSet = new Set<string>();
  for (const r of kept) for (const p of r.svi_history) dateSet.add(p.date);
  const dates = Array.from(dateSet).sort();

  const data: Array<Record<string, string | number>> = dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const r of kept) {
      const point = r.svi_history.find((p) => p.date === date);
      if (point) row[r.id] = point.score;
    }
    return row;
  });

  const series = kept.map((r) => ({
    id: r.id,
    name: r.name,
    last_score: r.svi_history.length > 0 ? r.svi_history[r.svi_history.length - 1].score : null,
  }));

  return { series, data, total_projects_with_history: withHistory.length };
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
