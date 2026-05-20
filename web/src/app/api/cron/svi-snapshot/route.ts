import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SVIAnalysis } from "@/lib/svi-analysis";

export const dynamic = "force-dynamic";

/**
 * Extract per-dimension scores from an SVIAnalysis.
 * Returns a record like { ftv: 62, mpc: 45, ptd: 70, ... } from the subs array.
 */
function extractDimensionScores(
  analysisJson: unknown,
): Record<string, number> | null {
  try {
    const parsed = analysisJson as SVIAnalysis;
    if (!parsed?.subs || !Array.isArray(parsed.subs)) return null;
    const scores: Record<string, number> = {};
    for (const sub of parsed.subs) {
      if (sub.key && typeof sub.value === "number") {
        scores[sub.key] = sub.value;
      }
    }
    return Object.keys(scores).length > 0 ? scores : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Get all accounts with recent svi_analyses
    const { data: accounts, error } = await supabase
      .from("svi_accounts")
      .select("id, email, current_svi, current_stage");

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];
    let processed = 0;

    for (const account of accounts ?? []) {
      // Get the most recent analysis for this account
      const { data: analysis } = await supabase
        .from("svi_analyses")
        .select("total_svi, analysis_json")
        .eq("email", account.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!analysis) continue;

      // Get prior snapshot for delta
      const { data: prior } = await supabase
        .from("svi_snapshots")
        .select("svi_total")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single();

      const delta = prior ? analysis.total_svi - prior.svi_total : null;

      // Extract per-dimension scores from the analysis
      const dimensionScores = extractDimensionScores(analysis.analysis_json);

      // Insert snapshot (upsert in case cron runs twice)
      await supabase.from("svi_snapshots").upsert({
        account_id: account.id,
        svi_total: analysis.total_svi,
        stage: account.current_stage,
        analysis_json: analysis.analysis_json,
        snapshot_date: today,
        delta,
        dimension_scores: dimensionScores,
      }, { onConflict: "account_id,snapshot_date" });

      // Update account current SVI
      await supabase.from("svi_accounts").update({
        current_svi: analysis.total_svi,
        last_active_at: new Date().toISOString(),
      }).eq("id", account.id);

      processed++;
    }

    return NextResponse.json({ ok: true, processed, date: today });
  } catch (err) {
    console.error("[blockid:svi-snapshot] snapshot cron failed", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
