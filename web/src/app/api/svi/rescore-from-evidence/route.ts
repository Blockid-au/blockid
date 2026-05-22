import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  extractSignals,
  computeSVI,
  type SVIAnalysis,
  type SVISubScore,
} from "@/lib/svi-analysis";
import { checkAndAwardBadges, type BadgeContext } from "@/lib/badges";
import { getProjectIdFromRequest } from "@/lib/projects";

// POST /api/svi/rescore-from-evidence
// Re-computes SVI using the original analysis text + all evidence items.
// Each evidence item adds bonus points to its dimension based on confidence_level.
// Scoped by active project_id to prevent cross-startup data leaks.

// Evidence bonus points per confidence level
const EVIDENCE_BONUS: Record<string, number> = {
  self_declared: 3,
  public_url: 6,
  document_uploaded: 10,
  connected_source: 15,
};

// SVI dimension keys
const VALID_DIMENSIONS = new Set([
  "ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm",
]);

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

  // 1. Get SVI account — scoped by project_id
  const accountQuery = supabase
    .from("svi_accounts")
    .select("id, current_svi")
    .eq("email", user.email);

  if (projectId) {
    accountQuery.eq("project_id", projectId);
  } else {
    accountQuery.is("project_id", null);
  }

  const { data: account } = await accountQuery.maybeSingle();

  if (!account) {
    return NextResponse.json({ ok: false, reason: "No SVI account for this project" }, { status: 404 });
  }

  // 2. Get the latest analysis — scoped by project_id
  const analysisQuery = supabase
    .from("svi_analyses")
    .select("id, raw_input, analysis_json")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1);

  if (projectId) {
    analysisQuery.eq("project_id", projectId);
  }

  const { data: latestAnalysis } = await analysisQuery.maybeSingle();

  const rawInput = (latestAnalysis?.raw_input as string) ?? "";

  // 3. Get all evidence items
  const { data: evidence } = await supabase
    .from("svi_evidence")
    .select("evidence_type, confidence_level, dimension, label")
    .eq("account_id", account.id);

  // 4. Re-extract signals with evidence overlay
  const signals = extractSignals({ rawText: rawInput }, undefined, evidence ?? []);

  // 5. Re-compute SVI (deterministic — no AI)
  const newAnalysis = computeSVI(signals);

  // 6. Apply per-item evidence bonuses to dimension sub-scores
  //    Each evidence item adds points to its target dimension based on confidence_level
  const dimensionBonuses: Record<string, number> = {};
  for (const ev of evidence ?? []) {
    const dim = ev.dimension as string;
    if (!VALID_DIMENSIONS.has(dim)) continue;
    const bonus = EVIDENCE_BONUS[ev.confidence_level as string] ?? EVIDENCE_BONUS.self_declared;
    dimensionBonuses[dim] = (dimensionBonuses[dim] ?? 0) + bonus;
  }

  // Apply bonuses to sub-score values (capped at 100) and recalculate adjustments
  let totalEvidenceBonus = 0;
  for (const sub of newAnalysis.subs as SVISubScore[]) {
    const bonus = dimensionBonuses[sub.key] ?? 0;
    if (bonus > 0) {
      const oldValue = sub.value;
      sub.value = Math.min(100, sub.value + bonus);
      const addedPoints = sub.value - oldValue;
      // Recalculate adjustment based on boosted value
      // Weight map matches computeSVI dimension weights
      const weights: Record<string, number> = {
        ftv: 0.15, mpc: 0.18, ptd: 0.12, tre: 0.20,
        cgh: 0.12, iri: 0.10, lco: 0.08, svm: 0.05,
      };
      const weight = weights[sub.key] ?? 0.10;
      const adjBonus = Math.round(addedPoints * weight * newAnalysis.confidenceMultiplier);
      sub.adjustment += adjBonus;
      totalEvidenceBonus += adjBonus;
      if (bonus > 0) {
        sub.evidence.push(`Evidence vault: +${bonus} pts from ${dimensionBonuses[sub.key] ? "uploaded evidence" : "evidence items"}`);
      }
    }
  }

  // Recalculate totalSVI with evidence bonuses
  newAnalysis.totalSVI = Math.round(Math.max(0, newAnalysis.totalSVI + totalEvidenceBonus));
  newAnalysis.netAdjustment += totalEvidenceBonus;

  const previousSVI = (account.current_svi as number) ?? 100;
  const delta = newAnalysis.totalSVI - previousSVI;

  // 7. Update svi_accounts with new score
  await supabase
    .from("svi_accounts")
    .update({
      current_svi: newAnalysis.totalSVI,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  // 8. Update svi_analyses with rescored analysis_json + total
  if (latestAnalysis?.id) {
    await supabase
      .from("svi_analyses")
      .update({
        total_svi: newAnalysis.totalSVI,
        net_adjustment: newAnalysis.netAdjustment,
        confidence_multiplier: newAnalysis.confidenceMultiplier,
        analysis_json: newAnalysis as unknown as Record<string, unknown>,
      })
      .eq("id", latestAnalysis.id);
  }

  // 9. Save snapshot if delta is significant
  if (Math.abs(delta) >= 2) {
    await supabase.from("svi_snapshots").insert({
      account_id: account.id,
      svi_total: newAnalysis.totalSVI,
      stage: newAnalysis.stage,
      delta,
      snapshot_date: new Date().toISOString().split("T")[0],
    });
  }

  // 10. Check and award milestone badges
  // Count analyses for this account
  const { count: analysisCount } = await supabase
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", user.email);

  // Get connected sources from evidence types
  const evidenceTypes = (evidence ?? []).map(
    (e) => (e.evidence_type as string) ?? "",
  );

  // Compute days active from account creation
  const { data: accountFull } = await supabase
    .from("svi_accounts")
    .select("created_at, plan")
    .eq("id", account.id)
    .maybeSingle();

  const createdAt = accountFull?.created_at
    ? new Date(accountFull.created_at as string)
    : new Date();
  const daysActive = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  const badgeCtx: BadgeContext = {
    totalAnalyses: analysisCount ?? 0,
    currentSVI: newAnalysis.totalSVI,
    evidenceCount: evidence?.length ?? 0,
    plan: (accountFull?.plan as string) ?? "free",
    hasGithub: evidenceTypes.includes("github"),
    hasStripe: evidenceTypes.includes("stripe"),
    hasAnalytics: evidenceTypes.includes("analytics"),
    daysActive,
  };

  let newBadges: string[] = [];
  try {
    newBadges = await checkAndAwardBadges(account.id, badgeCtx);
  } catch (err) {
    console.error("[blockid:svi:rescore-from-evidence] badge check failed", err);
  }

  return NextResponse.json({
    ok: true,
    previousSVI,
    newSVI: newAnalysis.totalSVI,
    delta,
    evidenceCount: evidence?.length ?? 0,
    evidenceBonusApplied: totalEvidenceBonus,
    newBadges,
  });
}

export const dynamic = "force-dynamic";
