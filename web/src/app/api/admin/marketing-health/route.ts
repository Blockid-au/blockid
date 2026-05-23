import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/marketing-health
 * Returns marketing health metrics for the platform.
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
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Total users
    const { count: totalUsers } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true });

    // New users this week
    const { count: newUsersThisWeek } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // Total SVI analyses this week
    const { count: analysesThisWeek } = await supabase
      .from("svi_analyses")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    // Total insights articles (count files in content/insights/)
    let totalInsightsArticles = 0;
    try {
      const insightsDir = path.join(process.cwd(), "content", "insights");
      if (fs.existsSync(insightsDir)) {
        const files = fs.readdirSync(insightsDir).filter(
          (f) => f.endsWith(".md") || f.endsWith(".mdx"),
        );
        totalInsightsArticles = files.length;
      }
    } catch {
      // Silently handle — directory may not exist in all environments
    }

    // Email send count this week (from svi_notifications)
    const { count: emailsSentThisWeek } = await supabase
      .from("svi_notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo);

    return NextResponse.json({
      ok: true,
      metrics: {
        totalUsers: totalUsers ?? 0,
        newUsersThisWeek: newUsersThisWeek ?? 0,
        analysesThisWeek: analysesThisWeek ?? 0,
        totalInsightsArticles,
        emailsSentThisWeek: emailsSentThisWeek ?? 0,
      },
      ts: now.toISOString(),
    });
  } catch (err) {
    console.error("[blockid:marketing-health] failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
