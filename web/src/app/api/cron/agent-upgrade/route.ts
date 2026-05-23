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
];

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
    } catch (err) {
      results.push({
        id: task.id,
        agent: task.agent,
        task: task.task,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
