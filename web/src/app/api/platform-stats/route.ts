import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readdirSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count .md files in web/content/insights/ at runtime, fallback to 31. */
function countInsightArticles(): number {
  try {
    const dir = join(process.cwd(), "content", "insights");
    return readdirSync(dir).filter((f) => f.endsWith(".md")).length;
  } catch {
    return 31;
  }
}

/** Format a dollar amount as "$X.XM+" or "$X.XK+". */
function formatValuation(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${millions.toFixed(1)}M+`;
  }
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    return `$${thousands.toFixed(1)}K+`;
  }
  return `$${Math.round(amount)}+`;
}

// ---------------------------------------------------------------------------
// Default metrics when Supabase is not available
// ---------------------------------------------------------------------------

function defaultMetrics() {
  return {
    founders: 0,
    analyses: 0,
    valuationsTracked: "$0+",
    tools: 10,
    articles: countInsightArticles(),
    monthlyVisitors: 500,
    evidenceItems: 0,
    connectedSources: 0,
    averageSVI: 0,
    paidCustomers: 0,
  };
}

// ---------------------------------------------------------------------------
// GET /api/platform-stats
// Public, read-only. Returns live platform metrics for directory profiles.
// Cached for 1 hour, stale-while-revalidate for 2 hours.
// ---------------------------------------------------------------------------

export async function GET() {
  const headers = {
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
  };

  try {
    const supabase = getSupabaseAdmin();

    if (!supabase) {
      return NextResponse.json(
        {
          ok: true,
          metrics: defaultMetrics(),
          company: companyInfo(),
          updatedAt: new Date().toISOString(),
        },
        { headers },
      );
    }

    // Run all queries in parallel for speed
    const [
      foundersRes,
      analysesRes,
      sviAccountsRes,
      evidenceRes,
      connectedRes,
      paidRes,
    ] = await Promise.all([
      // 1. Unique founders (distinct emails in svi_accounts)
      supabase
        .from("svi_accounts")
        .select("email", { count: "exact", head: true }),

      // 2. Total analyses
      supabase
        .from("svi_analyses")
        .select("id", { count: "exact", head: true }),

      // 3. All current_svi values (used for both valuation sum and average)
      supabase.from("svi_accounts").select("current_svi"),

      // 4. Total evidence items
      supabase
        .from("svi_evidence")
        .select("id", { count: "exact", head: true }),

      // 5. Connected sources
      supabase
        .from("svi_evidence")
        .select("id", { count: "exact", head: true })
        .eq("confidence_level", "connected_source"),

      // 6. Paid customers (app_users where plan != 'free')
      supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .neq("plan", "free"),
    ]);

    // Compute founders count
    const founders = foundersRes.count ?? 0;

    // Compute analyses count
    const analyses = analysesRes.count ?? 0;

    // Compute valuations tracked + average SVI from the same query
    const sviRows = sviAccountsRes.data as { current_svi: number }[] | null;
    const safeSviRows = sviRows ?? [];
    const sviSum = safeSviRows.reduce(
      (acc, row) => acc + (row.current_svi ?? 0),
      0,
    );
    const valuationsTracked = formatValuation(sviSum * 10_000);
    const avgSVI =
      safeSviRows.length > 0 ? Math.round(sviSum / safeSviRows.length) : 0;

    // Evidence items
    const evidenceItems = evidenceRes.count ?? 0;

    // Connected sources
    const connectedSources = connectedRes.count ?? 0;

    // Paid customers
    const paidCustomers = paidRes.count ?? 0;

    const metrics = {
      founders,
      analyses,
      valuationsTracked,
      tools: 10,
      articles: countInsightArticles(),
      monthlyVisitors: 500,
      evidenceItems,
      connectedSources,
      averageSVI: avgSVI,
      paidCustomers,
    };

    return NextResponse.json(
      {
        ok: true,
        metrics,
        company: companyInfo(),
        updatedAt: new Date().toISOString(),
      },
      { headers },
    );
  } catch (err) {
    console.error("[blockid:platform-stats] GET error", err);

    // Graceful degradation: return defaults on failure
    return NextResponse.json(
      {
        ok: true,
        metrics: defaultMetrics(),
        company: companyInfo(),
        updatedAt: new Date().toISOString(),
        _fallback: true,
      },
      { headers },
    );
  }
}

// ---------------------------------------------------------------------------
// Static company info
// ---------------------------------------------------------------------------

function companyInfo() {
  return {
    name: "BlockID.au",
    legal: "Auschain PTY LTD",
    acn: "659 615 111",
    abn: "79 659 615 111",
    founded: 2023,
    location: "Sydney, NSW, Australia",
    industry: ["SaaS", "AI/ML", "FinTech", "Startup Tools"],
    stage: "Pre-seed",
    website: "https://blockid.au",
    tagline:
      "The agentic AI valuation platform for business growth from day one",
  };
}
