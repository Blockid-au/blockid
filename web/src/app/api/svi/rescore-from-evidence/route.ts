import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { extractSignals, computeSVI } from "@/lib/svi-analysis";

// POST /api/svi/rescore-from-evidence
// Re-computes SVI using the original analysis text + all evidence items.
// Requires authentication.

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "Service unavailable" }, { status: 503 });
  }

  const supabase = getSupabaseAdmin()!;

  // 1. Get SVI account
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id, current_svi")
    .eq("email", user.email)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ ok: false, reason: "No SVI account" }, { status: 404 });
  }

  // 2. Get the latest analysis (for the original raw text)
  const { data: latestAnalysis } = await supabase
    .from("svi_analyses")
    .select("raw_input, analysis_json")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const rawInput = (latestAnalysis?.raw_input as string) ?? "";

  // 3. Get all evidence items
  const { data: evidence } = await supabase
    .from("svi_evidence")
    .select("evidence_type, confidence_level, dimension, label")
    .eq("account_id", account.id);

  // 4. Re-extract signals with evidence overlay
  const signals = extractSignals({ rawText: rawInput }, undefined, evidence ?? []);

  // 5. Re-compute SVI
  const newAnalysis = computeSVI(signals);

  const previousSVI = (account.current_svi as number) ?? 100;
  const delta = newAnalysis.totalSVI - previousSVI;

  // 6. Update account
  await supabase
    .from("svi_accounts")
    .update({
      current_svi: newAnalysis.totalSVI,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  // 7. Save snapshot if delta is significant
  if (Math.abs(delta) >= 2) {
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
    evidenceCount: evidence?.length ?? 0,
  });
}

export const dynamic = "force-dynamic";
