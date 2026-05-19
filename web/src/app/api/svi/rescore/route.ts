import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// POST /api/svi/rescore
// Re-calculates SVI based on accumulated evidence and actions.
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

  // 1. Get user's SVI account
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("*")
    .eq("email", user.email)
    .maybeSingle();

  if (!account) {
    return NextResponse.json({ ok: false, reason: "No SVI account found" }, { status: 404 });
  }

  // 2. Get all evidence items
  const { data: evidence } = await supabase
    .from("svi_evidence")
    .select("*")
    .eq("account_id", account.id);

  // 3. Get all completed actions
  const { data: actions } = await supabase
    .from("user_actions")
    .select("*")
    .eq("account_id", account.id);

  // 4. Get the latest analysis
  const { data: latestAnalysis } = await supabase
    .from("svi_analyses")
    .select("analysis_json, total_svi")
    .eq("email", user.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 5. Calculate evidence boost
  const evidenceBoost = (evidence ?? []).reduce((sum: number, e: Record<string, unknown>) => sum + ((e.svi_impact as number) ?? 0), 0);
  const actionBoost = (actions ?? []).reduce((sum: number, a: Record<string, unknown>) => sum + ((a.svi_impact_estimate as number) ?? 0), 0);

  const baseSVI = (latestAnalysis?.total_svi as number) ?? account.current_svi ?? 100;
  const newSVI = Math.min(300, Math.max(30, baseSVI + evidenceBoost + actionBoost));

  // 6. Update account SVI
  const { error: updateErr } = await supabase
    .from("svi_accounts")
    .update({
      current_svi: newSVI,
      last_active_at: new Date().toISOString(),
    })
    .eq("id", account.id);

  if (updateErr) {
    console.error("[blockid:svi:rescore] update failed", updateErr);
    return NextResponse.json({ ok: false, reason: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    previousSVI: baseSVI,
    newSVI,
    evidenceCount: evidence?.length ?? 0,
    actionCount: actions?.length ?? 0,
    evidenceBoost,
    actionBoost,
  });
}

export const dynamic = "force-dynamic";
