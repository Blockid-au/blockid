import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ startup_id: string }> }
) {
  const currentUser = await getCurrentUser().catch(() => null);
  if (!currentUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { startup_id } = await params;
  const startupId = decodeURIComponent(startup_id);

  const { data, error } = await supabase
    .from("startup_score_history")
    .select(
      "id, created_at, total_score, sub_scores, svi_analysis, valuation_low_aud, valuation_high_aud, source, missing_inputs, startup_name"
    )
    .eq("user_id", currentUser.id)
    .eq("startup_id", startupId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[blockid:history] fetch single startup failed", error);
    return NextResponse.json({ ok: false, error: "Failed to fetch history" }, { status: 500 });
  }

  const entries = (data ?? []).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    total_score: row.total_score,
    sub_scores: row.sub_scores,
    svi_analysis: row.svi_analysis,
    valuation_low_aud: row.valuation_low_aud ?? null,
    valuation_high_aud: row.valuation_high_aud ?? null,
    source: row.source,
    missing_inputs: row.missing_inputs ?? [],
  }));

  const startupName = data?.[0]?.startup_name ?? null;

  return NextResponse.json({ ok: true, startup_name: startupName, entries });
}
