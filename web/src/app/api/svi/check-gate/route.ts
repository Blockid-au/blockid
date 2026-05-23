import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// GET /api/svi/check-gate?email=x
// Returns whether this email can run a free analysis.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email")?.toLowerCase().trim();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, reason: "Email required" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    // If no DB, allow (graceful degradation)
    return NextResponse.json({ ok: true, canAnalyze: true, reason: "free" });
  }

  const supabase = getSupabaseAdmin()!;

  // Check paid plan
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("plan")
    .eq("email", email)
    .maybeSingle();

  if (account?.plan && account.plan !== "free") {
    return NextResponse.json({ ok: true, canAnalyze: true, reason: "paid_plan", plan: account.plan });
  }

  // Check if a free analysis was used in the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentAnalyses } = await supabase
    .from("svi_analyses")
    .select("id")
    .eq("email", email)
    .gte("created_at", oneDayAgo)
    .limit(1);

  if (!recentAnalyses || recentAnalyses.length === 0) {
    return NextResponse.json({ ok: true, canAnalyze: true, reason: "free_available" });
  }

  // Check if user has purchased credits
  const { data: usage } = await supabase
    .from("svi_analysis_usage")
    .select("credits_remaining")
    .eq("email", email)
    .maybeSingle();

  if (usage && usage.credits_remaining > 0) {
    return NextResponse.json({ ok: true, canAnalyze: true, reason: "credits", credits: usage.credits_remaining });
  }

  return NextResponse.json({
    ok: true,
    canAnalyze: false,
    reason: "daily_limit_reached",
  });
}

export const dynamic = "force-dynamic";
