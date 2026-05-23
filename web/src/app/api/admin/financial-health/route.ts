import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAIBudgetStatus } from "@/lib/ai-client";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/financial-health
 * Returns financial health metrics for the platform.
 * Admin-only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    // Total users
    const { count: totalUsers } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true });

    // Total credit balance across all users
    const { data: balanceRows } = await supabase
      .from("credit_balances")
      .select("balance, lifetime_earned, lifetime_spent");

    let totalCreditBalance = 0;
    let totalCreditsEarned = 0;
    let totalCreditsSpent = 0;
    for (const row of balanceRows ?? []) {
      totalCreditBalance += row.balance ?? 0;
      totalCreditsEarned += row.lifetime_earned ?? 0;
      totalCreditsSpent += row.lifetime_spent ?? 0;
    }

    // Total analyses
    const { count: totalAnalyses } = await supabase
      .from("svi_analyses")
      .select("id", { count: "exact", head: true });

    // AI budget usage
    const budget = getAIBudgetStatus();

    // Revenue estimate: credits spent * A$1 per credit
    const revenueEstimate = Math.round(totalCreditsSpent * 100) / 100;

    return NextResponse.json({
      ok: true,
      metrics: {
        totalUsers: totalUsers ?? 0,
        totalCreditBalance: Math.round(totalCreditBalance * 100) / 100,
        totalCreditsEarned: Math.round(totalCreditsEarned * 100) / 100,
        totalCreditsSpent: Math.round(totalCreditsSpent * 100) / 100,
        totalAnalyses: totalAnalyses ?? 0,
        aiBudget: budget,
        revenueEstimateAUD: revenueEstimate,
      },
      ts: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[blockid:financial-health] failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
