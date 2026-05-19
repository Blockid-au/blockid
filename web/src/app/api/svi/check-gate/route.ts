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

  // Check usage
  const { data: usage } = await supabase
    .from("svi_analysis_usage")
    .select("free_used, credits_remaining, total_analyses")
    .eq("email", email)
    .maybeSingle();

  if (!usage || !usage.free_used) {
    return NextResponse.json({ ok: true, canAnalyze: true, reason: "free_available" });
  }

  if (usage.credits_remaining > 0) {
    return NextResponse.json({ ok: true, canAnalyze: true, reason: "credits", credits: usage.credits_remaining });
  }

  return NextResponse.json({
    ok: true,
    canAnalyze: false,
    reason: "limit_reached",
    totalAnalyses: usage.total_analyses,
  });
}

export const dynamic = "force-dynamic";
