// GET /api/projects/portfolio — portfolio dashboard row feed.
//
// Returns one row per non-archived project the current user owns, with
// the fields the /dashboard/portfolio surface renders side-by-side:
//
//   { id, slug, name, current_svi_score, canonical_stage,
//     credits_used_mtd, last_activity_at, next_action }
//
// Query shape:
//   1. Fetch projects.WHERE user_id = auth.uid() AND archived_at IS NULL
//      (via getUserProjects — which already filters and orders).
//   2. Fan-out — for each project, in parallel:
//        a. Latest svi_analyses row for total_svi + analysis_json.stage
//           + created_at (for last_activity_at).
//        b. Sum of usage_logs.credits_used for this project, current month.
//   3. Derive canonical_stage + next_action via pure helpers in
//      web/src/lib/portfolio.ts so the vitest can exercise them without
//      touching Supabase.
//
// See docs/goals/feature-upgrade-roadmap-v2.md — Q4 Multi-project #1
// ("Portfolio dashboard — all startups side-by-side").

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getUserProjects } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  deriveCanonicalStage,
  deriveNextAction,
  type PortfolioRow,
} from "@/lib/portfolio";

export const dynamic = "force-dynamic";

function startOfMonthIso(now: Date = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Service unavailable" },
      { status: 503 },
    );
  }

  // 1. Projects — already filters archived_at IS NULL + user_id
  const projects = await getUserProjects(user.id);
  if (projects.length === 0) {
    return NextResponse.json({ ok: true, rows: [] satisfies PortfolioRow[] });
  }

  const monthStart = startOfMonthIso();

  // 2. Fan-out derivations in parallel
  const rows: PortfolioRow[] = await Promise.all(
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

      // Last activity is the more recent of latest analysis vs latest usage log
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

  return NextResponse.json({ ok: true, rows });
}
