// GET /api/svi/report-sections/[id]
//
// Loads all saved report sections for a specific analysis, plus the analysis
// data itself (SVI score, raw input, etc.). Security: the analysis must belong
// to the authenticated user (email match).
//
// Response: {
//   ok, analysis: { id, total_svi, raw_input, analysis_json, created_at },
//   sections: [{ section_id, depth, content, word_count, credits_cost }],
//   unlockedIds: ["executive", "market", ...],
//   availableToUnlock: ["competitive", "roadmap", ...]
// }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { REPORT_SECTIONS } from "@/lib/report-sections";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      { ok: false, error: "Database unavailable" },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin()!;
  const { id: analysisId } = await params;

  if (!analysisId) {
    return NextResponse.json(
      { ok: false, error: "Missing analysis ID" },
      { status: 400 },
    );
  }

  // ── 2. Load the analysis and verify ownership ────────────────────────
  const { data: analysis, error: analysisError } = await supabase
    .from("svi_analyses")
    .select("id, email, total_svi, raw_input, analysis_json, created_at")
    .eq("id", analysisId)
    .maybeSingle();

  if (analysisError) {
    console.error("[blockid:report-sections/id] analysis fetch failed", analysisError);
    return NextResponse.json(
      { ok: false, error: "Failed to load analysis" },
      { status: 500 },
    );
  }

  if (!analysis) {
    return NextResponse.json(
      { ok: false, error: "Analysis not found" },
      { status: 404 },
    );
  }

  // Security: verify ownership via email match
  if (analysis.email?.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json(
      { ok: false, error: "Access denied" },
      { status: 403 },
    );
  }

  // ── 3. Load saved sections ───────────────────────────────────────────
  const { data: sections, error: sectionsError } = await supabase
    .from("report_sections")
    .select("section_id, depth, content, word_count, credits_cost, created_at")
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: true });

  if (sectionsError) {
    console.error("[blockid:report-sections/id] sections fetch failed", sectionsError);
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
    analysis: {
      id: analysis.id,
      total_svi: analysis.total_svi,
      raw_input: analysis.raw_input,
      analysis_json: analysis.analysis_json,
      created_at: analysis.created_at,
    },
    sections: sections ?? [],
    unlockedIds,
    availableToUnlock,
  });
}
