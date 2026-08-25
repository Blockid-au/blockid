// GET /api/svi/dimensions/roadmap/[projectId]/forecast
//
// SVI uplift projection based on the current fix roadmap. Add
// ?scenarios=true to include pessimistic / realistic / optimistic scenarios.

import { NextRequest, NextResponse } from "next/server";
import {
  requireProjectOwner,
  loadDimensionResults,
  loadCurrentSvi,
  computeRoadmapAndForecast,
} from "../../../_helpers";

export const dynamic = "force-dynamic";

const SCENARIO_RATES = {
  pessimistic: 0.3,
  realistic: 0.6,
  optimistic: 0.9,
} as const;

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

  const wantScenarios =
    new URL(request.url).searchParams.get("scenarios") === "true";

  try {
    const [{ results }, currentSvi] = await Promise.all([
      loadDimensionResults(auth.ctx.supabase, auth.ctx.projectId),
      loadCurrentSvi(auth.ctx.supabase, auth.ctx.projectId),
    ]);

    const { forecast } = computeRoadmapAndForecast(results, currentSvi);

    const body: Record<string, unknown> = {
      ok: true,
      projectId,
      currentSvi: forecast.currentSvi,
      projectedSvi: forecast.projectedSvi,
      potentialSviGain: forecast.potentialSviGain,
      completionRateAssumption: forecast.completionRateAssumption,
    };

    if (wantScenarios) {
      const scenarios: Record<
        string,
        { completionRate: number; projectedSvi: number }
      > = {};
      for (const [name, rate] of Object.entries(SCENARIO_RATES)) {
        const projected =
          currentSvi + Math.round(forecast.potentialSviGain * rate);
        scenarios[name] = {
          completionRate: Math.round(rate * 100),
          projectedSvi: projected,
        };
      }
      body.scenarios = scenarios;
    }

    return NextResponse.json(body);
  } catch (err) {
    console.error("[blockid:svi-dimensions] forecast GET failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
