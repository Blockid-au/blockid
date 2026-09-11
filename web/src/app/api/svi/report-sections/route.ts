// GET /api/svi/report-sections?analysisId=xxx
//
// Loads all saved report sections for a given analysis.
// If no analysisId is provided, loads sections for the user's latest analysis.
//
// Response: { ok, analysisId, sections: [{ section_id, depth, content, word_count, credits_cost, created_at }] }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { findLatestAnalysisWithFallback } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { REPORT_SECTIONS } from "@/lib/report-sections";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // ── 1. Authenticate ──────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: true, analysisId: null, sections: [] },
    );
  }

  const supabase = getSupabaseAdmin()!;
  const url = new URL(request.url);
  let analysisId = url.searchParams.get("analysisId");

  // S18-A — member-aware read (viewer+): the latest analysis resolves
  // under the OWNER's email; an explicit analysisId must be the caller's
  // own OR belong to the shared project (owner email + same project_id).
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;

  // ── 2. Resolve analysis ID ───────────────────────────────────────────
  if (!analysisId) {
    // Find the latest analysis — with fallback for legacy records (project_id NULL)
    const latest = await findLatestAnalysisWithFallback(dataEmail, projectId, "id", {
      callerEmail: user.email,
    });
    if (!latest) {
      return NextResponse.json({ ok: true, analysisId: null, sections: [] });
    }
    analysisId = latest.id as string;
  } else {
    // Verify the analysis belongs to the requesting user (or their project)
    const { data: analysis } = await supabase
      .from("svi_analyses")
      .select("id, email, project_id")
      .eq("id", analysisId)
      .maybeSingle();

    if (!analysis) {
      return NextResponse.json(
        { ok: false, error: "Analysis not found" },
        { status: 404 },
      );
    }
    const analysisEmail = (analysis.email as string | null)?.toLowerCase();
    const ownsAnalysis = analysisEmail === user.email?.toLowerCase();
    const sharedAnalysis =
      Boolean(scope) &&
      !scope!.isOwner &&
      analysisEmail === dataEmail.toLowerCase() &&
      analysis.project_id === projectId;
    if (!ownsAnalysis && !sharedAnalysis) {
      return NextResponse.json(
        { ok: false, error: "Access denied" },
        { status: 403 },
      );
    }
  }

  // ── 3. Load saved sections ───────────────────────────────────────────
  const { data: sections, error } = await supabase
    .from("report_sections")
    .select("section_id, depth, content, word_count, credits_cost, created_at")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[blockid:report-sections] fetch failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load sections" },
      { status: 500 },
    );
  }

  // ── 4. Compute unlocked / available-to-unlock lists ──────────────────
  const unlockedIds = [
    ...new Set((sections ?? []).map((s) => s.section_id as string)),
  ];

  const availableToUnlock = REPORT_SECTIONS
    .filter((s) => !unlockedIds.includes(s.id))
    .map((s) => s.id);

  return NextResponse.json({
    ok: true,
    analysisId,
    sections: sections ?? [],
    unlockedIds,
    availableToUnlock,
  });
}
