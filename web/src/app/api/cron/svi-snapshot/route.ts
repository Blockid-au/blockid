import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { computeSVIIndex } from "@/lib/svi-index";

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
    // Get all accounts with recent svi_analyses (each row is a unique email+project pair)
    const { data: accounts, error } = await supabase
      .from("svi_accounts")
      .select("id, email, current_svi, current_stage, project_id, index_base_date, index_base_svi");

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];
    let processed = 0;

    for (const account of accounts ?? []) {
      // Get the most recent analysis for THIS account's project (not all projects!)
      const analysisQuery = supabase
        .from("svi_analyses")
        .select("total_svi, analysis_json")
        .eq("email", account.email);
      if (account.project_id) analysisQuery.eq("project_id", account.project_id);
      else analysisQuery.is("project_id", null);

      const { data: analysis } = await analysisQuery
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

      // Compute SVI Index (Nikkei/Dow Jones style, unbounded)
      const acctRaw = account as Record<string, unknown>;
      const baseSVI = typeof acctRaw.index_base_svi === "number" ? acctRaw.index_base_svi : null;
      const baseDate = typeof acctRaw.index_base_date === "string" ? acctRaw.index_base_date : null;

      // Count evidence items and connected sources for data richness
      const { count: evidenceCount } = await supabase
        .from("svi_evidence")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id);

      // Count months of metrics data
      const { data: metricsData } = await supabase
        .from("startup_metrics")
        .select("period")
        .eq("account_id", account.id);
      const metricsMonths = new Set((metricsData ?? []).map((m: { period: string }) => m.period?.slice(0, 7))).size;

      // Detect connected sources from evidence types
      const { data: evidenceTypes } = await supabase
        .from("svi_evidence")
        .select("evidence_type")
        .eq("account_id", account.id)
        .eq("confidence_level", "connected_source");
      const connectedSources = [...new Set((evidenceTypes ?? []).map((e: { evidence_type: string }) => e.evidence_type))];

      // Get first snapshot date for history depth
      const { data: firstSnapshot } = await supabase
        .from("svi_snapshots")
        .select("snapshot_date")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      const sviIndex = computeSVIIndex({
        rawSVI: analysis.total_svi,
        basePeriodSVI: baseSVI as number | null,
        basePeriodDate: baseDate as string | null,
        evidenceCount: evidenceCount ?? 0,
        metricsMonths,
        connectedSources,
        firstSnapshotDate: firstSnapshot?.snapshot_date ?? null,
      });

      // If no base period set yet, establish it now
      if (!baseSVI) {
        await supabase.from("svi_accounts").update({
          index_base_date: today,
          index_base_svi: analysis.total_svi,
        }).eq("id", account.id);
      }

      // Insert snapshot (upsert in case cron runs twice)
      await supabase.from("svi_snapshots").upsert({
        account_id: account.id,
        svi_total: analysis.total_svi,
        stage: account.current_stage,
        analysis_json: analysis.analysis_json,
        snapshot_date: today,
        delta,
        dimension_scores: dimensionScores,
        index_value: sviIndex.indexValue,
        data_richness: sviIndex.dataRichnessFactor,
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

export { GET as POST };
