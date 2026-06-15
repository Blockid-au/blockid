import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { computeNextBestActions } from "@/lib/agents/cto-next-best-action";
import type { DimensionScore } from "@/lib/agents/cto-next-best-action";

export const dynamic = "force-dynamic";

// GET /api/next-best-action?startup_id=<id>
// Returns personalised next-best-action list for the authenticated user's startup.
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const startupId = request.nextUrl.searchParams.get("startup_id");

  // Fetch latest SVI analysis for this user (optionally scoped to a startup)
  let query = supabase
    .from("svi_accounts")
    .select("score, analysis, startup_id, created_at")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (startupId) {
    query = query.eq("startup_id", startupId);
  }

  const { data: sviRow, error } = await query.maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to fetch SVI data" }, { status: 500 });
  }

  if (!sviRow?.analysis) {
    return NextResponse.json({
      ok: false,
      error: "No SVI analysis found. Run an SVI analysis first.",
      hint: "/api/svi",
    }, { status: 404 });
  }

  const analysis = sviRow.analysis as Record<string, unknown>;
  const currentSvi = (sviRow.score as number) ?? (analysis.totalSVI as number) ?? 0;
  const stage = (analysis.stage as number) ?? 0;

  // Extract dimension scores from analysis subs
  const subs = (analysis.subs as Array<{
    code: string;
    label: string;
    rawScore: number;
    weight: number;
    gaps: string[];
  }>) ?? [];

  const dimensions: DimensionScore[] = subs.map(s => ({
    code: s.code as DimensionScore["code"],
    label: s.label,
    score: Math.round(s.rawScore ?? 50),
    weight: s.weight ?? 1,
    gaps: s.gaps ?? [],
  }));

  // Fallback: if no subs (old analysis format), use conservative defaults
  if (dimensions.length === 0) {
    const defaultCodes: DimensionScore["code"][] = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"];
    const normalized = currentSvi / 2;  // SVI ~0-200, dimension ~0-100
    defaultCodes.forEach(code => {
      dimensions.push({ code, label: code.toUpperCase(), score: Math.round(normalized), weight: 1, gaps: [] });
    });
  }

  const result = computeNextBestActions({ currentSvi, stage, dimensions });

  return NextResponse.json({ ok: true, ...result });
}
