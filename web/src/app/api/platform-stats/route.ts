import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats: Record<string, any> = {
    companyName: "BlockID.au",
    legalName: "Auschain PTY LTD",
    tagline: "The agentic AI valuation platform for business growth from day one",
    website: "https://blockid.au",
    founded: 2023,
    location: "Sydney, NSW, Australia",
    industry: ["SaaS", "AI/ML", "FinTech", "Startup Tools"],
    stage: "Pre-seed / Validation",
    teamSize: "1 founder + AI agent team",
    founder: "Do Van Long — CEO & Founder",
    // Live metrics (pulled from DB)
    founders: 0,
    analyses: 0,
    articles: 31,
    freeTools: 10,
    monthlyVisitors: 0,
    valuationsTracked: "A$0",
  };

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin()!;

    // Count unique emails in svi_analyses
    const { count: analysisCount } = await supabase
      .from("svi_analyses")
      .select("*", { count: "exact", head: true });
    stats.analyses = analysisCount ?? 0;

    // Count unique users
    const { count: userCount } = await supabase
      .from("app_users")
      .select("*", { count: "exact", head: true });
    stats.founders = userCount ?? 0;

    // Count SVI accounts
    const { count: accountCount } = await supabase
      .from("svi_accounts")
      .select("*", { count: "exact", head: true });
    stats.activeAccounts = accountCount ?? 0;

    // Estimate total valuations tracked
    const { data: valuations } = await supabase
      .from("svi_analyses")
      .select("analysis_json")
      .limit(100);

    if (valuations && valuations.length > 0) {
      let totalVal = 0;
      for (const v of valuations) {
        const svi = (v.analysis_json as any)?.totalSVI ?? 100;
        // Rough estimate based on average stage
        totalVal += svi * 15000; // ~$1.5M average per analysis at 100 SVI
      }
      if (totalVal >= 1_000_000) {
        stats.valuationsTracked = `A$${(totalVal / 1_000_000).toFixed(1)}M+`;
      } else {
        stats.valuationsTracked = `A$${Math.round(totalVal / 1000)}K+`;
      }
    }
  }

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
