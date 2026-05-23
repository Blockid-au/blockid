// POST /api/cron/agent-upgrade — AI Agent Self-Upgrade Scheduler
//
// Runs scheduled self-improvement tasks for C-Level AI agents.
// Uses ONLY subscription/free AI models — zero additional cost.
// Authorization: Bearer {CRON_SECRET}
//
// Schedule: Run daily via external cron at 2am AEST
// Safety: Checks off-peak hours + budget before running AI tasks

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  callAIForUpgrade,
  isOffPeakHours,
  canRunUpgradeTasks,
  getAIBudgetStatus,
} from "@/lib/ai-client";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAllArticles } from "@/lib/insights";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

interface UpgradeTask {
  id: string;
  agent: string;
  task: string;
  schedule: "daily" | "weekly" | "biweekly";
  dayOfWeek?: number; // 0=Sun, 1=Mon, ...
  needsAI: boolean;
  run: () => Promise<{ ok: boolean; result?: string; error?: string }>;
}

// ── Task definitions ──────────────────────────────────────────────────

const UPGRADE_TASKS: UpgradeTask[] = [
  {
    id: "cfo-cost-tracking",
    agent: "CFO",
    task: "AI cost tracking & budget report",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const budget = getAIBudgetStatus();
      return {
        ok: true,
        result: `AI Budget: $${budget.spent}/$${budget.limit} (${budget.percent}%) | ${budget.calls} calls this month`,
      };
    },
  },
  {
    id: "ciso-security-check",
    agent: "CISO",
    task: "Security headers verification",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      try {
        const res = await fetch("https://blockid.au/api/auth/me", { signal: AbortSignal.timeout(10000) });
        const headers = {
          hsts: !!res.headers.get("strict-transport-security"),
          csp: !!res.headers.get("content-security-policy"),
          xfo: !!res.headers.get("x-frame-options"),
          xcto: !!res.headers.get("x-content-type-options"),
        };
        const score = Object.values(headers).filter(Boolean).length;
        return { ok: true, result: `Security headers: ${score}/4 present (HSTS: ${headers.hsts}, CSP: ${headers.csp})` };
      } catch (err) {
        return { ok: false, error: `Security check failed: ${err}` };
      }
    },
  },
  {
    id: "cdo-analytics-health",
    agent: "CDO",
    task: "Analytics event coverage check",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };
      const { count } = await supabase.from("svi_analyses").select("*", { count: "exact", head: true });
      const { count: userCount } = await supabase.from("app_users").select("*", { count: "exact", head: true });
      return {
        ok: true,
        result: `Data health: ${count ?? 0} total analyses, ${userCount ?? 0} total users`,
      };
    },
  },
  {
    id: "coo-system-health",
    agent: "COO",
    task: "System health check",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const checks = [];
      // Check main site
      try {
        const start = Date.now();
        const res = await fetch("https://blockid.au/", { signal: AbortSignal.timeout(10000) });
        const time = Date.now() - start;
        checks.push(`Homepage: ${res.status} (${time}ms)`);
      } catch { checks.push("Homepage: FAILED"); }

      // Check API
      try {
        const start = Date.now();
        const res = await fetch("https://blockid.au/api/auth/me", { signal: AbortSignal.timeout(10000) });
        const time = Date.now() - start;
        checks.push(`API: ${res.status} (${time}ms)`);
      } catch { checks.push("API: FAILED"); }

      return { ok: true, result: checks.join(" | ") };
    },
  },
  {
    id: "coo-report-quality-sample",
    agent: "COO",
    task: "Sample report quality check (AI-powered)",
    schedule: "weekly",
    dayOfWeek: 3, // Wednesday
    needsAI: true,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };

      // Get a random recent report
      const { data: report } = await supabase
        .from("svi_analyses")
        .select("id, total_svi, analysis_json, rnd_report_json")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!report?.rnd_report_json) return { ok: true, result: "No reports to sample" };

      const rnd = report.rnd_report_json as Record<string, unknown>;
      const pages = (rnd.pages ?? []) as Array<{ content?: string; pageId?: string }>;
      const firstPage = pages[0]?.content ?? "";

      if (firstPage.length < 50) return { ok: true, result: "Report too short to evaluate" };

      // Use free AI to evaluate report quality
      const result = await callAIForUpgrade({
        system: "You are a quality auditor. Rate this startup report excerpt on a scale of 1-10 for: clarity, actionability, and professionalism. Respond with JSON: { clarity: X, actionability: X, professionalism: X, overall: X, suggestion: 'one improvement' }",
        user: `Report excerpt (first page):\n\n${firstPage.slice(0, 2000)}`,
        maxTokens: 200,
      });

      if (!result) return { ok: true, result: "AI unavailable for quality check (free providers only)" };
      return { ok: true, result: `Quality sample: ${result.text.slice(0, 300)}` };
    },
  },
  {
    id: "cro-user-analytics",
    agent: "CRO",
    task: "User conversion & retention analysis",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };

      const now = new Date();
      const day7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const day1 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

      // Users signed up in last 7 days
      const { count: newUsers7d } = await supabase.from("app_users").select("*", { count: "exact", head: true }).gte("created_at", day7);
      // Users signed up in last 24h
      const { count: newUsers1d } = await supabase.from("app_users").select("*", { count: "exact", head: true }).gte("created_at", day1);
      // Analyses in last 24h
      const { count: analyses1d } = await supabase.from("svi_analyses").select("*", { count: "exact", head: true }).gte("created_at", day1);
      // Credit transactions in last 7 days
      const { count: creditTx7d } = await supabase.from("credit_transactions").select("*", { count: "exact", head: true }).gte("created_at", day7).lt("amount", 0);
      // Total users
      const { count: totalUsers } = await supabase.from("app_users").select("*", { count: "exact", head: true });

      return {
        ok: true,
        result: `Users: ${totalUsers} total, +${newUsers7d ?? 0} (7d), +${newUsers1d ?? 0} (24h) | Analyses: ${analyses1d ?? 0} (24h) | Credit spends: ${creditTx7d ?? 0} (7d)`,
      };
    },
  },
  {
    id: "cfo-credit-economy",
    agent: "CFO",
    task: "Credit economy health check",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };

      // Total credits earned vs spent
      const { data: balances } = await supabase.from("credit_balances").select("balance, lifetime_earned, lifetime_spent");
      const totalBalance = (balances ?? []).reduce((s, b) => s + (Number(b.balance) || 0), 0);
      const totalEarned = (balances ?? []).reduce((s, b) => s + (Number(b.lifetime_earned) || 0), 0);
      const totalSpent = (balances ?? []).reduce((s, b) => s + (Number(b.lifetime_spent) || 0), 0);
      const utilization = totalEarned > 0 ? Math.round((totalSpent / totalEarned) * 100) : 0;

      return {
        ok: true,
        result: `Credits: ${totalBalance.toFixed(1)} outstanding | Earned: ${totalEarned.toFixed(1)} | Spent: ${totalSpent.toFixed(1)} | Utilization: ${utilization}%`,
      };
    },
  },
  {
    id: "cdo-metrics-auto-import",
    agent: "CDO",
    task: "Auto-import metrics from connected OAuth sources",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };

      // Find users with GitHub OAuth connections
      const { data: connections } = await supabase
        .from("oauth_connections")
        .select("user_email, provider, metadata")
        .eq("provider", "github");

      if (!connections?.length)
        return { ok: true, result: "No OAuth connections to import" };

      let imported = 0;
      const month = new Date().toISOString().slice(0, 7); // "2026-05"

      for (const conn of connections) {
        const meta = conn.metadata as Record<string, unknown> | null;
        if (!meta) continue;

        // Extract developer velocity metrics from stored OAuth metadata
        const commitActivity = meta.commit_activity as
          | { recent_weekly_avg?: number }
          | undefined;
        const weeklyCommits = commitActivity?.recent_weekly_avg ?? 0;
        const repos = (meta.public_repos as number) ?? 0;

        // Look up user_id from app_users
        const { data: user } = await supabase
          .from("app_users")
          .select("id")
          .eq("email", conn.user_email)
          .maybeSingle();

        if (!user) continue;

        // Upsert into startup_metrics with developer velocity data
        await supabase.from("startup_metrics").upsert(
          {
            user_id: user.id,
            email: conn.user_email,
            metric_date: `${month}-01`,
            notes: `Auto-imported: ${repos} repos, ${weeklyCommits.toFixed(1)} commits/week (GitHub)`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email,metric_date" },
        );

        imported++;
      }

      return {
        ok: true,
        result: `Auto-imported metrics for ${imported} users from GitHub`,
      };
    },
  },
  {
    id: "cmo-first-report-quality",
    agent: "CMO",
    task: "First-time user report quality analysis (AI-powered)",
    schedule: "weekly",
    dayOfWeek: 1, // Monday
    needsAI: true,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };

      // Get 3 recent first-time analyses (users with only 1 analysis)
      let firstTimers: unknown[] | null = null;
      try { const r = await supabase.rpc("get_first_time_analyses", {} as Record<string, never>); firstTimers = r.data; } catch { /* RPC may not exist */ }

      // Fallback: just get recent analyses
      if (!firstTimers) {
        const { data: recent } = await supabase
          .from("svi_analyses")
          .select("total_svi, rnd_report_json")
          .order("created_at", { ascending: false })
          .limit(3);

        if (!recent?.length) return { ok: true, result: "No recent analyses to review" };

        const pages = recent.map(r => {
          const rnd = r.rnd_report_json as Record<string, unknown>;
          const p = (rnd?.pages ?? []) as Array<{ content?: string }>;
          return p[0]?.content?.slice(0, 500) ?? "";
        }).filter(Boolean);

        if (pages.length === 0) return { ok: true, result: "No report content to evaluate" };

        const result = await callAIForUpgrade({
          system: "You are a startup report quality analyst. Evaluate these first-page excerpts from startup reports. Rate 1-10 for: engagement (does it hook the reader?), specificity (real data/names?), actionability (clear next steps?). Respond with JSON: { avgEngagement: X, avgSpecificity: X, avgActionability: X, topImprovement: 'one sentence' }",
          user: `3 recent report first-page excerpts:\n\n${pages.join("\n\n---\n\n")}`,
          maxTokens: 200,
        });

        if (!result) return { ok: true, result: "AI unavailable for quality analysis" };
        return { ok: true, result: `First report quality: ${result.text.slice(0, 300)}` };
      }

      return { ok: true, result: "First-timer analysis complete" };
    },
  },
  {
    id: "cro-conversion-funnel",
    agent: "CRO",
    task: "Conversion funnel analysis",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Analyses today
      const { count: analysesToday } = await supabase
        .from("svi_analyses")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart);

      // Analyses this week
      const { count: analysesWeek } = await supabase
        .from("svi_analyses")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekAgo);

      // Unique emails this week
      const { data: weekEmails } = await supabase
        .from("svi_analyses")
        .select("email")
        .gte("created_at", weekAgo);

      const uniqueEmails = new Set((weekEmails ?? []).map(r => r.email).filter(Boolean));

      // Check which of those emails are also in app_users (returning)
      const { data: existingUsers } = await supabase
        .from("app_users")
        .select("email")
        .in("email", Array.from(uniqueEmails));

      const returningCount = existingUsers?.length ?? 0;
      const newCount = uniqueEmails.size - returningCount;

      // Signups created same day as their first analysis (conversion)
      const { count: signupsToday } = await supabase
        .from("app_users")
        .select("*", { count: "exact", head: true })
        .gte("created_at", todayStart);

      // Credit spend total this week (negative amounts = spends)
      const { data: creditSpends } = await supabase
        .from("credit_transactions")
        .select("amount")
        .gte("created_at", weekAgo)
        .lt("amount", 0);

      const totalSpend = (creditSpends ?? []).reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

      const conversionRate = (analysesToday ?? 0) > 0 && (signupsToday ?? 0) > 0
        ? Math.round(((signupsToday ?? 0) / (analysesToday ?? 0)) * 100)
        : 0;

      return {
        ok: true,
        result: `Funnel: ${analysesToday ?? 0} analyses today, ${analysesWeek ?? 0} this week | Emails: ${uniqueEmails.size} unique (${newCount} new, ${returningCount} returning) | Conversion: ${conversionRate}% (${signupsToday ?? 0} signups today) | Credit spend: ${totalSpend.toFixed(1)} this week`,
      };
    },
  },
  {
    id: "cmo-content-performance",
    agent: "CMO",
    task: "Content pipeline status",
    schedule: "weekly",
    dayOfWeek: 5, // Friday
    needsAI: false,
    run: async () => {
      try {
        const articles = getAllArticles();
        const totalArticles = articles.length;

        // Articles published in last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const recentArticles = articles.filter(
          a => new Date(a.publishedAt) >= thirtyDaysAgo,
        );

        // Category breakdown
        const categories: Record<string, number> = {};
        for (const a of articles) {
          categories[a.category] = (categories[a.category] || 0) + 1;
        }
        const categoryStr = Object.entries(categories)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, count]) => `${cat}:${count}`)
          .join(", ");

        return {
          ok: true,
          result: `Content: ${totalArticles} published articles, ${recentArticles.length} in last 30d | Categories: ${categoryStr}`,
        };
      } catch (err) {
        return { ok: false, error: `Content check failed: ${err}` };
      }
    },
  },
  {
    id: "cto-system-performance",
    agent: "CTO",
    task: "System performance benchmarks",
    schedule: "daily",
    needsAI: false,
    run: async () => {
      const endpoints = [
        { name: "Homepage", url: "https://blockid.au/" },
        { name: "Auth API", url: "https://blockid.au/api/auth/me" },
        { name: "Health", url: "https://blockid.au/api/healthz?verbose=true" },
      ];

      const timings: Array<{ name: string; ms: number; status: number }> = [];
      const flags: string[] = [];

      for (const ep of endpoints) {
        try {
          const start = Date.now();
          const res = await fetch(ep.url, { signal: AbortSignal.timeout(15000) });
          const ms = Date.now() - start;
          timings.push({ name: ep.name, ms, status: res.status });
          if (ms > 500) flags.push(`${ep.name}: ${ms}ms (>500ms)`);
        } catch {
          timings.push({ name: ep.name, ms: -1, status: 0 });
          flags.push(`${ep.name}: TIMEOUT/ERROR`);
        }
      }

      const validTimings = timings.filter(t => t.ms > 0);
      const avgMs = validTimings.length > 0
        ? Math.round(validTimings.reduce((s, t) => s + t.ms, 0) / validTimings.length)
        : 0;

      const timingStr = timings
        .map(t => `${t.name}: ${t.ms > 0 ? `${t.ms}ms (${t.status})` : "FAILED"}`)
        .join(" | ");

      return {
        ok: true,
        result: `Perf: avg ${avgMs}ms | ${timingStr}${flags.length > 0 ? ` | SLOW: ${flags.join(", ")}` : ""}`,
      };
    },
  },
  {
    id: "customer-care-insights",
    agent: "Customer Care",
    task: "Generate personalized startup insights for active users",
    schedule: "weekly",
    dayOfWeek: 6, // Saturday
    needsAI: true,
    run: async () => {
      const supabase = getSupabaseAdmin();
      if (!supabase) return { ok: false, error: "Supabase not configured" };

      // Find active users (last login <30 days, has at least 1 analysis)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: activeUsers } = await supabase
        .from("app_users")
        .select("id, email, display_name")
        .gte("last_login_at", thirtyDaysAgo)
        .limit(10); // Max 10 per run

      if (!activeUsers?.length) return { ok: true, result: "No active users to process" };

      let generated = 0;
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      for (const user of activeUsers) {
        // Get their latest analysis for context
        const { data: analysis } = await supabase
          .from("svi_analyses")
          .select("raw_input, total_svi, analysis_json")
          .eq("email", user.email)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!analysis?.raw_input) continue;

        // Check if we already generated insights this week
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: recentInsights } = await supabase
          .from("user_insights")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("created_at", weekAgo);

        if ((recentInsights ?? 0) >= 2) continue; // Already has insights this week

        // AI: Generate insight based on user's startup idea
        await delay(30000); // 30s between AI calls
        const result = await callAIForUpgrade({
          system: "You are a startup market intelligence analyst. Given a startup idea, research ONE relevant market update, competitor move, or business opportunity. Return JSON: { title: string, summary: string (2-3 sentences), detail: string (1 paragraph), type: 'market_trend'|'competitor_update'|'new_business'|'opportunity', relevance: number (0.0-1.0), source: string }. Only return relevance >0.70 if truly relevant.",
          user: `Startup idea: ${analysis.raw_input.slice(0, 500)}\n\nCurrent SVI: ${analysis.total_svi}\n\nFind ONE relevant market update or opportunity for this startup in the Australian market.`,
          maxTokens: 500,
        });

        if (!result) continue;

        try {
          const insight = JSON.parse(result.text);
          if (insight.relevance >= 0.70) {
            await supabase.from("user_insights").insert({
              user_id: user.id,
              insight_type: insight.type || "market_trend",
              title: insight.title,
              summary: insight.summary,
              detail: insight.detail,
              relevance_score: insight.relevance,
              source: insight.source || "AI Research",
            });
            generated++;
          }
        } catch { /* skip malformed AI response */ }
      }

      return { ok: true, result: `Generated ${generated} insights for ${activeUsers.length} active users` };
    },
  },
  {
    id: "rnd-competitor-research",
    agent: "RnD",
    task: "Competitor research & feature gap analysis (AI-powered)",
    schedule: "weekly",
    dayOfWeek: 6, // Saturday
    needsAI: true,
    run: async () => {
      const result = await callAIForUpgrade({
        system: "You are a startup intelligence analyst specializing in equity management and startup valuation platforms. Provide actionable competitive intelligence.",
        user: "Research the latest updates from Carta, Pulley, and Equidam. What new features have they launched? How does BlockID compare? Suggest 3 features BlockID should build next. Return JSON: { competitors: [{name, updates, threat}], suggestions: [{feature, impact, effort}] }",
        maxTokens: 500,
      });

      if (!result) return { ok: true, result: "AI unavailable for competitor research (free providers only)" };
      return { ok: true, result: `Competitor research: ${result.text.slice(0, 500)}` };
    },
  },
];

// ── Weekly Growth Report Email ────────────────────────────────────────

async function sendWeeklyGrowthReport(
  results: Array<{
    id: string;
    agent: string;
    task: string;
    status: "ok" | "skipped" | "failed";
    result?: string;
    error?: string;
  }>,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Current week metrics
  const { count: totalUsers } = await supabase
    .from("app_users")
    .select("*", { count: "exact", head: true });
  const { count: newUsersThisWeek } = await supabase
    .from("app_users")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo);
  const { count: newUsersPrevWeek } = await supabase
    .from("app_users")
    .select("*", { count: "exact", head: true })
    .gte("created_at", twoWeeksAgo)
    .lt("created_at", weekAgo);

  const { count: totalAnalyses } = await supabase
    .from("svi_analyses")
    .select("*", { count: "exact", head: true });
  const { count: analysesThisWeek } = await supabase
    .from("svi_analyses")
    .select("*", { count: "exact", head: true })
    .gte("created_at", weekAgo);
  const { count: analysesPrevWeek } = await supabase
    .from("svi_analyses")
    .select("*", { count: "exact", head: true })
    .gte("created_at", twoWeeksAgo)
    .lt("created_at", weekAgo);

  // Credit spend
  const { data: creditsThisWeek } = await supabase
    .from("credit_transactions")
    .select("amount")
    .gte("created_at", weekAgo)
    .lt("amount", 0);
  const spendThisWeek = (creditsThisWeek ?? []).reduce(
    (s, t) => s + Math.abs(Number(t.amount) || 0), 0,
  );
  const { data: creditsPrevWeek } = await supabase
    .from("credit_transactions")
    .select("amount")
    .gte("created_at", twoWeeksAgo)
    .lt("created_at", weekAgo)
    .lt("amount", 0);
  const spendPrevWeek = (creditsPrevWeek ?? []).reduce(
    (s, t) => s + Math.abs(Number(t.amount) || 0), 0,
  );

  // AI budget
  const budget = getAIBudgetStatus();

  // Build delta strings
  const delta = (curr: number, prev: number) => {
    const diff = curr - prev;
    if (diff === 0) return "0";
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  // System health from task results
  const perfResult = results.find(r => r.id === "cto-system-performance");
  const funnelResult = results.find(r => r.id === "cro-conversion-funnel");

  const dateStr = now.toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
  <div style="background: linear-gradient(135deg, #6c5ce7, #a29bfe); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #fff; margin: 0; font-size: 22px;">BlockID Weekly Growth Report</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${dateStr}</p>
  </div>

  <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef; border-top: none;">
    <h2 style="font-size: 16px; color: #6c5ce7; margin: 0 0 12px;">Users</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0;">Total users</td><td style="text-align: right; font-weight: 600;">${totalUsers ?? 0}</td></tr>
      <tr><td style="padding: 6px 0;">New this week</td><td style="text-align: right; font-weight: 600;">${newUsersThisWeek ?? 0} (${delta(newUsersThisWeek ?? 0, newUsersPrevWeek ?? 0)} vs prev week)</td></tr>
    </table>

    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 16px 0;">

    <h2 style="font-size: 16px; color: #6c5ce7; margin: 0 0 12px;">Analyses</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0;">Total analyses</td><td style="text-align: right; font-weight: 600;">${totalAnalyses ?? 0}</td></tr>
      <tr><td style="padding: 6px 0;">This week</td><td style="text-align: right; font-weight: 600;">${analysesThisWeek ?? 0} (${delta(analysesThisWeek ?? 0, analysesPrevWeek ?? 0)} vs prev week)</td></tr>
    </table>

    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 16px 0;">

    <h2 style="font-size: 16px; color: #6c5ce7; margin: 0 0 12px;">Credit Economy</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0;">Credits spent this week</td><td style="text-align: right; font-weight: 600;">${spendThisWeek.toFixed(1)} (${delta(spendThisWeek, spendPrevWeek)} vs prev week)</td></tr>
    </table>

    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 16px 0;">

    <h2 style="font-size: 16px; color: #6c5ce7; margin: 0 0 12px;">AI Budget</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 6px 0;">Usage</td><td style="text-align: right; font-weight: 600;">$${budget.spent}/$${budget.limit} (${budget.percent}%)</td></tr>
      <tr><td style="padding: 6px 0;">API calls this month</td><td style="text-align: right; font-weight: 600;">${budget.calls}</td></tr>
    </table>

    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 16px 0;">

    <h2 style="font-size: 16px; color: #6c5ce7; margin: 0 0 12px;">System Health</h2>
    <p style="font-size: 13px; color: #495057; margin: 0;">${perfResult?.result ?? "No performance data available"}</p>

    <hr style="border: none; border-top: 1px solid #dee2e6; margin: 16px 0;">

    <h2 style="font-size: 16px; color: #6c5ce7; margin: 0 0 12px;">Conversion Funnel</h2>
    <p style="font-size: 13px; color: #495057; margin: 0;">${funnelResult?.result ?? "No funnel data available"}</p>
  </div>

  <div style="background: #1a1a2e; padding: 16px; border-radius: 0 0 12px 12px; text-align: center;">
    <p style="color: rgba(255,255,255,0.6); font-size: 12px; margin: 0;">BlockID.au Agent Upgrade System | Auto-generated report</p>
  </div>
</body>
</html>`;

  try {
    await sendEmail({
      to: "admin@blockid.au",
      subject: `BlockID Weekly Growth Report — ${dateStr}`,
      html,
    });
    console.log("[agent-upgrade] Weekly growth report sent to admin@blockid.au");
  } catch (err) {
    console.error("[agent-upgrade] Failed to send weekly growth report", err);
  }
}

// ── Main handler ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Verify cron secret
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: max 1 run per 30 minutes
  const rl = checkRateLimit("cron:agent-upgrade", 2, 30 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", resetIn: rl.resetIn }, { status: 429 });
  }

  const now = new Date();
  const dayOfWeek = now.getDay();
  const budget = getAIBudgetStatus();
  const offPeak = isOffPeakHours();
  const canUpgrade = canRunUpgradeTasks();

  const results: Array<{
    id: string;
    agent: string;
    task: string;
    status: "ok" | "skipped" | "failed";
    result?: string;
    error?: string;
  }> = [];

  // Delay helper — stagger AI tasks to avoid rate limits
  // Claude CLI: ~50 req/hr, Gemini: 15 RPM, Groq: 30 RPM
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let aiTaskCount = 0;

  for (const task of UPGRADE_TASKS) {
    // Skip weekly/biweekly tasks on wrong day
    if (task.schedule === "weekly" && task.dayOfWeek !== undefined && dayOfWeek !== task.dayOfWeek) {
      continue;
    }

    // Skip AI tasks if not off-peak or budget exceeded
    if (task.needsAI && (!offPeak || !canUpgrade)) {
      results.push({
        id: task.id,
        agent: task.agent,
        task: task.task,
        status: "skipped",
        result: `Skipped: offPeak=${offPeak}, budgetOK=${canUpgrade}`,
      });
      continue;
    }

    // Stagger AI tasks: wait 60s between AI calls to stay well within rate limits
    // Non-AI tasks run immediately (DB queries only, no external API calls)
    if (task.needsAI && aiTaskCount > 0) {
      await delay(60_000); // 60s gap between AI requests
    }

    try {
      const outcome = await task.run();
      results.push({
        id: task.id,
        agent: task.agent,
        task: task.task,
        status: outcome.ok ? "ok" : "failed",
        result: outcome.result,
        error: outcome.error,
      });
      if (task.needsAI) aiTaskCount++;
    } catch (err) {
      results.push({
        id: task.id,
        agent: task.agent,
        task: task.task,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      if (task.needsAI) aiTaskCount++;
    }
  }

  // Send weekly growth report email on Monday
  if (dayOfWeek === 1) {
    try {
      await sendWeeklyGrowthReport(results);
    } catch { /* non-blocking */ }
  }

  // Log to growth_insights table
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase.from("growth_insights").insert({
        type: "agent_upgrade",
        data: {
          timestamp: now.toISOString(),
          budget,
          offPeak,
          results,
        },
        created_at: now.toISOString(),
      });
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({
    ok: true,
    timestamp: now.toISOString(),
    offPeak,
    budget,
    tasksRun: results.filter(r => r.status === "ok").length,
    tasksSkipped: results.filter(r => r.status === "skipped").length,
    tasksFailed: results.filter(r => r.status === "failed").length,
    results,
  });
}
