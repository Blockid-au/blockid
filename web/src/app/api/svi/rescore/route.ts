import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { checkAndAwardBadges, type BadgeCheckContext } from "@/lib/svi-badges";
import { extractSignals, computeSVI } from "@/lib/svi-analysis";
import { getProjectIdFromRequest, findSVIAccountWithFallback, findLatestAnalysisWithFallback } from "@/lib/projects";

// POST /api/svi/rescore
// Re-calculates SVI based on the original analysis text + accumulated evidence.
// Uses the full extractSignals → computeSVI pipeline for accurate rescoring.
// Requires authentication. Scoped to active project.

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "Service unavailable" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;
  const projectId = await getProjectIdFromRequest();

  // 1. Get user's SVI account — with fallback for legacy records (project_id NULL)
  const account = await findSVIAccountWithFallback(user.email, projectId, "*");

  if (!account) {
    return NextResponse.json({ ok: false, reason: "No SVI account found for this project" }, { status: 404 });
  }

  const accountId = account.id as string;

  // 2. Get the latest analysis — with fallback for legacy records
  const latestAnalysis = await findLatestAnalysisWithFallback(
    user.email,
    projectId,
    "raw_input, analysis_json",
  );

  const rawInput = (latestAnalysis?.raw_input as string) ?? "";

  // 3. Get all evidence items
  const { data: evidence } = await supabase
    .from("svi_evidence")
    .select("*")
    .eq("account_id", accountId);

  // 4. Get all completed actions (retain action boost for backward compat)
  const { data: actions } = await supabase
    .from("user_actions")
    .select("*")
    .eq("account_id", accountId);

  const actionBoost = (actions ?? []).reduce(
    (sum: number, a: Record<string, unknown>) => sum + ((a.svi_impact_estimate as number) ?? 0),
    0,
  );

  // 5. Re-extract signals with evidence overlay
  const signals = extractSignals({ rawText: rawInput }, undefined, evidence ?? []);

  // 6. Re-compute SVI with the full pipeline
  const newAnalysis = computeSVI(signals);

  // Apply action boost on top of the pipeline result
  const baseSVI = (account.current_svi as number) ?? 100;
  const newSVI = Math.min(300, Math.max(30, newAnalysis.totalSVI + actionBoost));
  const delta = newSVI - baseSVI;

  // 7. Update account SVI
  const { error: updateErr } = await supabase
    .from("svi_accounts")
    .update({
      current_svi: newSVI,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (updateErr) {
    console.error("[blockid:svi:rescore] update failed", updateErr);
    return NextResponse.json({ ok: false, reason: "Update failed" }, { status: 500 });
  }

  // 8. Save snapshot if delta is significant (include estimated valuation)
  // Valuation formula: maps SVI to realistic market range
  const estVal = newSVI < 30 ? newSVI * 3000
    : newSVI <= 50 ? 50_000 + (newSVI - 30) * 22_500
    : newSVI <= 70 ? 500_000 + (newSVI - 50) * 75_000
    : newSVI <= 85 ? 2_000_000 + (newSVI - 70) * 200_000
    : newSVI <= 120 ? 5_000_000 + (newSVI - 85) * 142_857
    : 10_000_000 + (newSVI - 120) * 250_000;

  if (Math.abs(delta) >= 2) {
    await supabase.from("svi_snapshots").insert({
      account_id: accountId,
      svi_total: newSVI,
      stage: newAnalysis.stage,
      delta,
      estimated_valuation: Math.round(estVal),
      snapshot_date: new Date().toISOString().split("T")[0],
    });

    // Update cap table share price to reflect new valuation
    // price_per_share = estimated_valuation / total_authorized_shares
    await supabase
      .from("share_classes")
      .update({ price_per_share: Math.round(estVal / 1_000_000 * 100) / 100 })
      .eq("account_id", accountId)
      .catch(() => {});
  }

  // 7. Check and award milestone badges
  const evidenceItems = evidence ?? [];
  const evidenceTypes = evidenceItems.map(
    (e: Record<string, unknown>) => (e.evidence_type as string) ?? "",
  );
  const connectedSources: string[] = [];
  if (evidenceTypes.includes("github")) connectedSources.push("github");
  if (evidenceTypes.includes("analytics")) connectedSources.push("analytics");
  if (evidenceTypes.includes("stripe")) connectedSources.push("stripe");

  // Count analyses for this account
  const { count: analysisCount } = await supabase
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email);

  // Check for deep-dive reports
  const { count: deepDiveCount } = await supabase
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email)
    .eq("report_type", "deep_dive");

  // Get the previous snapshot for stage comparison
  const { data: prevSnapshot } = await supabase
    .from("svi_snapshots")
    .select("svi_total, stage")
    .eq("account_id", accountId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Count weekly streak (consecutive weeks with activity)
  const { data: recentSnapshots } = await supabase
    .from("svi_snapshots")
    .select("snapshot_date")
    .eq("account_id", accountId)
    .order("snapshot_date", { ascending: false })
    .limit(8);

  let weeklyStreak = 0;
  if (recentSnapshots && recentSnapshots.length > 0) {
    weeklyStreak = 1;
    for (let i = 1; i < recentSnapshots.length; i++) {
      const curr = new Date(recentSnapshots[i - 1].snapshot_date);
      const prev = new Date(recentSnapshots[i].snapshot_date);
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays <= 10) {
        weeklyStreak++;
      } else {
        break;
      }
    }
  }

  const badgeCtx: BadgeCheckContext = {
    accountId,
    currentSVI: newSVI,
    previousSVI: prevSnapshot?.svi_total ?? baseSVI,
    currentStage: newAnalysis.stage ?? 0,
    previousStage: prevSnapshot?.stage,
    evidenceCount: evidenceItems.length,
    analysisCount: analysisCount ?? 0,
    hasDeepDive: (deepDiveCount ?? 0) > 0,
    connectedSources,
    weeklyStreak,
    evidenceTypes,
  };

  let newBadges: string[] = [];
  try {
    newBadges = await checkAndAwardBadges(badgeCtx);
  } catch (err) {
    console.error("[blockid:svi:rescore] badge check failed", err);
  }

  return NextResponse.json({
    ok: true,
    previousSVI: baseSVI,
    newSVI,
    delta,
    evidenceCount: evidence?.length ?? 0,
    actionCount: actions?.length ?? 0,
    actionBoost,
    newBadges,
  });
}

export const dynamic = "force-dynamic";
