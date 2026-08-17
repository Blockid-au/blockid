/**
 * GET /api/evidence/completeness?projectId=X
 *
 * Returns the evidence completeness result for the given project.
 * Auth: requires a valid session. Users may only query their own projects.
 *
 * Query params:
 *   projectId (required) — UUID of the project to assess
 *   fresh=true           — recompute instead of serving cached snapshot
 *
 * Response:
 *   200 { overall_pct, dimensions, missing, priority }
 *   400 missing projectId
 *   401 unauthenticated
 *   403 project does not belong to the caller
 *   500 internal error
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  assessEvidenceQuality,
  getEvidenceCompletenessSnapshot,
} from "@/lib/computeEvidenceCompleteness";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const fresh = searchParams.get("fresh") === "true";

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId query parameter is required" },
        { status: 400 }
      );
    }

    // Verify project ownership — always scope by project_id AND owner
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const { data: project, error } = await supabase
        .from("projects")
        .select("id, owner_id")
        .eq("id", projectId)
        .maybeSingle();

      if (error || !project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      if ((project.owner_id as string) !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const result = fresh
      ? await assessEvidenceQuality(projectId)
      : await getEvidenceCompletenessSnapshot(projectId);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[blockid:evidence:completeness] GET failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
