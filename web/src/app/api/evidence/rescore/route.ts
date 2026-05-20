import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  extractSignals,
  computeSVI,
  EVIDENCE_CONFIDENCE,
  type EvidenceItem,
} from "@/lib/svi-analysis";

export const dynamic = "force-dynamic";

// POST /api/evidence/rescore
// Loads all evidence for the current user, builds an enhanced rawText by
// appending evidence summaries, re-runs extractSignals + computeSVI, and
// saves the new analysis + snapshot.

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Service unavailable" },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin()!;

  // 1. Get SVI account
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, current_svi")
    .eq("email", user.email)
    .maybeSingle();

  if (!account) {
    return NextResponse.json(
      { ok: false, reason: "No SVI account found" },
      { status: 404 },
    );
  }

  // 2. Get the latest analysis (for the original raw text)
  const { data: latestAnalysis } = await supabase
    .from("svi_analyses")
    .select("id, raw_input, analysis_json")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const originalRawText = (latestAnalysis?.raw_input as string) ?? "";

  // 3. Load ALL evidence for this account
  const { data: evidenceRows } = await supabase
    .from("svi_evidence")
    .select("evidence_type, confidence_level, dimension, label, value_or_url")
    .eq("account_id", account.id);

  const evidenceItems: EvidenceItem[] = (evidenceRows ?? []).map((ev) => ({
    evidence_type: ev.evidence_type as string,
    confidence_level: ev.confidence_level as string,
    dimension: ev.dimension as string,
    label: ev.label as string,
  }));

  // 4. Build enhanced rawText by appending evidence summaries
  const evidenceLines = (evidenceRows ?? []).map((ev) => {
    const conf = EVIDENCE_CONFIDENCE[ev.confidence_level as string] ?? 0.2;
    const confPct = Math.round(conf * 100);
    const url = ev.value_or_url ? `: ${ev.value_or_url}` : "";
    return `Evidence: ${ev.label}${url} (confidence: ${confPct}%)`;
  });

  const enhancedRawText = evidenceLines.length > 0
    ? `${originalRawText}\n\n--- Evidence Vault ---\n${evidenceLines.join("\n")}`
    : originalRawText;

  // 5. Re-extract signals with evidence overlay
  const signals = extractSignals(
    { rawText: enhancedRawText },
    undefined,
    evidenceItems,
  );

  // 6. Re-compute SVI (deterministic)
  const newAnalysis = computeSVI(signals);

  const previousSVI = (account.current_svi as number) ?? 100;
  const delta = newAnalysis.totalSVI - previousSVI;

  // 7. Save new analysis to svi_analyses
  const { data: savedAnalysis } = await supabase
    .from("svi_analyses")
    .insert({
      email: user.email,
      raw_input: enhancedRawText,
      total_svi: newAnalysis.totalSVI,
      net_adjustment: newAnalysis.netAdjustment,
      confidence_multiplier: newAnalysis.confidenceMultiplier,
      analysis_json: newAnalysis as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  // 8. Update svi_accounts current_svi
  await supabase
    .from("svi_accounts")
    .update({
      current_svi: newAnalysis.totalSVI,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  // 9. Create snapshot with delta
  if (Math.abs(delta) >= 1) {
    await supabase.from("svi_snapshots").insert({
      account_id: account.id,
      svi_total: newAnalysis.totalSVI,
      stage: newAnalysis.stage,
      delta,
      snapshot_date: new Date().toISOString().split("T")[0],
    });
  }

  return NextResponse.json({
    ok: true,
    previousSVI,
    newSVI: newAnalysis.totalSVI,
    delta,
    evidenceCount: evidenceItems.length,
    analysis: newAnalysis,
    analysisId: savedAnalysis?.id ?? null,
  });
}
