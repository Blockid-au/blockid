import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getCompetitivePositioningContext,
  computeMpcBoostFromCompetitiveAnalysis,
  computeSvmBoostFromCompetitiveDifferentiation,
} from "@/lib/competitive-positioning";
import { projectScopeOrDenyFor } from "@/lib/project-members/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  // S18-A review P2-2 — viewer+ read. An explicit `?projectId=` is verified
  // (404 non-member) rather than trusted; the rows are keyed on the project
  // OWNER's user id so a member reads the same matrix as the owner.
  const { searchParams } = new URL(request.url);
  const { scope, denied } = await projectScopeOrDenyFor(user, searchParams.get("projectId"), "viewer");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const dataUser = scope ? { ...user, id: scope.ownerUserId } : user;

  if (!projectId) {
    return NextResponse.json({
      ok: true,
      context: {
        competitors_analyzed: 0,
        total_features_extracted: 0,
        avg_parity_score: 0,
        avg_differentiation_score: 0,
        positioning_statement_generated: false,
        confidence_score: null,
      },
      mpcBoost: 0,
      svmBoost: 0,
      totalSviLift: 0,
    });
  }

  try {
    const context = await getCompetitivePositioningContext(dataUser, projectId);

    const mpcBoost = computeMpcBoostFromCompetitiveAnalysis(
      context.competitors_analyzed,
      context.total_features_extracted,
      context.positioning_statement_generated,
    );

    // founderUniqueFeatures estimated from differentiation score and total features
    const founderUniqueFeatures = Math.round(
      (context.avg_differentiation_score / 100) * context.total_features_extracted,
    );

    const svmBoost = computeSvmBoostFromCompetitiveDifferentiation(
      founderUniqueFeatures,
      context.avg_differentiation_score,
    );

    const totalSviLift = mpcBoost + svmBoost;

    return NextResponse.json({ ok: true, context, mpcBoost, svmBoost, totalSviLift });
  } catch (err) {
    console.error("[competitive-positioning/matrix GET]", err);
    return NextResponse.json({ ok: false, error: "Failed to compute matrix" }, { status: 500 });
  }
}
