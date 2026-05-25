// GET /api/svi/report-sections?analysisId=xxx
//
// Loads all saved report sections for a given analysis.
// If no analysisId is provided, loads sections for the user's latest analysis.
//
// Response: { ok, analysisId, sections: [{ section_id, depth, content, word_count, credits_cost, created_at }] }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
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

  // ── 2. Resolve analysis ID ───────────────────────────────────────────
  if (!analysisId) {
    // Find the latest analysis for this user, scoped by project
    const projectId = await getProjectIdFromRequest();
    const query = supabase
      .from("svi_analyses")
      .select("id")
      .eq("email", user.email)
      .order("created_at", { ascending: false })
      .limit(1);

    if (projectId) {
      query.eq("project_id", projectId);
    }

    const { data: latest } = await query.maybeSingle();
    if (!latest) {
      return NextResponse.json({ ok: true, analysisId: null, sections: [] });
    }
    analysisId = latest.id as string;
  } else {
    // Verify the analysis belongs to the requesting user
    const { data: analysis } = await supabase
      .from("svi_analyses")
      .select("id, email")
      .eq("id", analysisId)
      .maybeSingle();

    if (!analysis) {
      return NextResponse.json(
        { ok: false, error: "Analysis not found" },
        { status: 404 },
      );
    }
    if (analysis.email?.toLowerCase() !== user.email?.toLowerCase()) {
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
