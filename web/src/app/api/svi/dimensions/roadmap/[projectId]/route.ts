// GET /api/svi/dimensions/roadmap/[projectId]
//
// Returns the fix roadmap grouped by week (weeks 1..4). Add
// ?includeForecast=true to include an SVI uplift projection.

import { NextRequest, NextResponse } from "next/server";
import {
  requireProjectOwner,
  loadDimensionResults,
  loadCurrentSvi,
  loadCompletedEvidenceTypes,
  computeRoadmapAndForecast,
  groupRoadmapByWeek,
} from "../../_helpers";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await requireProjectOwner(projectId);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  }

  const includeForecast =
    new URL(request.url).searchParams.get("includeForecast") === "true";

  try {
    const [{ results }, currentSvi, completedSet] = await Promise.all([
      loadDimensionResults(auth.ctx.supabase, auth.ctx.projectId),
      loadCurrentSvi(auth.ctx.supabase, auth.ctx.projectId),
      loadCompletedEvidenceTypes(auth.ctx.supabase, auth.ctx.projectId),
    ]);

    const { roadmap, forecast } = computeRoadmapAndForecast(
      results,
      currentSvi,
    );

    const grouped = groupRoadmapByWeek(roadmap).map((wk) => ({
      week: wk.week,
      items: wk.items.map((it) => ({
        ...it,
        completed: completedSet.has(it.code),
      })),
    }));

    // Rough per-week uplift (assumes even completion rate across weeks).
    const weeklyUplift = grouped.map((wk) =>
      Math.round(
        wk.items.reduce((s, i) => s + i.impactSvi, 0) *
          forecast.completionRateAssumption,
      ),
    );

    const body: Record<string, unknown> = {
      ok: true,
      projectId,
      roadmap: grouped,
    };
    if (includeForecast) {
      body.forecast = {
        currentSvi: forecast.currentSvi,
        projectedSvi: forecast.projectedSvi,
        potentialSviGain: forecast.potentialSviGain,
        completionRateAssumption: forecast.completionRateAssumption,
        weeklyUplift,
      };
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error("[blockid:svi-dimensions] roadmap GET failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
