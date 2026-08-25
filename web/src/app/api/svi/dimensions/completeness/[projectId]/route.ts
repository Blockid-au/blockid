// GET /api/svi/dimensions/completeness/[projectId]
//
// Returns per-dimension completeness (all 8 dims) plus an overall roll-up.
// Add ?includeMissing=true to include the missing evidence list per dim.

import { NextRequest, NextResponse } from "next/server";
import {
  requireProjectOwner,
  loadDimensionResults,
} from "../../_helpers";

export const dynamic = "force-dynamic";

interface DimensionPayload {
  completeness: number;
  present: number;
  total: number;
  avgConfidencePercent: number;
  missing?: Array<{
    code: string;
    label: string;
    estimatedSviImpact: number;
    confidenceLevel: string;
  }>;
}

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

  const includeMissing =
    new URL(request.url).searchParams.get("includeMissing") === "true";

  try {
    const { results } = await loadDimensionResults(
      auth.ctx.supabase,
      auth.ctx.projectId,
    );

    const dimensions: Record<string, DimensionPayload> = {};
    let sum = 0;
    for (const r of results) {
      const payload: DimensionPayload = {
        completeness: r.completenessPercent,
        present: r.totalPresent,
        total: r.totalPossible,
        avgConfidencePercent: r.avgConfidencePercent,
      };
      if (includeMissing) {
        payload.missing = r.missingEvidence.map((e) => ({
          code: e.code,
          label: e.label,
          estimatedSviImpact: e.estimatedSviImpact,
          confidenceLevel: e.confidenceLevel,
        }));
      }
      dimensions[r.dimension] = payload;
      sum += r.completenessPercent;
    }
    const overallCompleteness =
      results.length > 0 ? Math.round(sum / results.length) : 0;

    return NextResponse.json({
      ok: true,
      projectId,
      dimensions,
      overallCompleteness,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[blockid:svi-dimensions] completeness GET failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
