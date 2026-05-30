// GET /api/svi/enhanced-report/status?reportId=rpt-...
//
// Polls the status of an enhanced report generation.
// Returns the current phase, progress %, and partial results if available.

import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get("reportId");

  if (!reportId) {
    return NextResponse.json(
      { ok: false, error: "Missing reportId query parameter" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Database unavailable" },
      { status: 503 },
    );
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: reportRaw, error } = await supabase
    .from("assembled_reports")
    .select(
      "id, status, tier, locale, title, quality_score, total_words, sections_count, " +
      "sections_json, executive_summary, error_message, credits_cost, created_at, updated_at",
    )
    .eq("id", reportId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[blockid:enhanced-report:status] query failed", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch report status" },
      { status: 500 },
    );
  }

  if (!reportRaw) {
    return NextResponse.json(
      { ok: false, error: "Report not found" },
      { status: 404 },
    );
  }

  const report = reportRaw as any;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const status = String(report.status ?? "unknown");

  // Map status to progress percentage and phase
  let progress = 0;
  let phase = "unknown";
  switch (status) {
    case "pending":
      progress = 5;
      phase = "gathering";
      break;
    case "gathering":
      progress = 10;
      phase = "gathering";
      break;
    case "wave1":
      progress = 25;
      phase = "wave1";
      break;
    case "wave2":
      progress = 50;
      phase = "wave2";
      break;
    case "wave3":
      progress = 75;
      phase = "wave3";
      break;
    case "synthesizing":
      progress = 85;
      phase = "synthesizing";
      break;
    case "rendering":
      progress = 95;
      phase = "rendering";
      break;
    case "complete":
      progress = 100;
      phase = "complete";
      break;
    case "failed":
      progress = 0;
      phase = "failed";
      break;
    default:
      progress = 0;
      phase = status;
  }

  const response: Record<string, unknown> = {
    ok: true,
    reportId: report.id,
    status,
    phase,
    progress,
    tier: report.tier,
    title: report.title,
    createdAt: report.created_at,
    updatedAt: report.updated_at,
  };

  if (status === "complete") {
    response.qualityScore = report.quality_score;
    response.totalWords = report.total_words;
    response.sectionsCount = report.sections_count;
    response.sections = report.sections_json;
    response.executiveSummary =
      typeof report.executive_summary === "string"
        ? report.executive_summary.slice(0, 1000)
        : null;
  }

  if (status === "failed") {
    response.error = report.error_message ?? "Report generation failed";
  }

  return NextResponse.json(response);
}
