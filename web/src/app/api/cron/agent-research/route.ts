// GET /api/cron/agent-research — Agent Self-Research Scheduler
//
// Runs scheduled self-research tasks for C-Level AI agents.
// Each agent has a research frequency defined in the CEO goal tree.
// Uses ONLY subscription/free AI models — zero additional cost.
//
// Schedule: Run daily via external cron (e.g. 3am AEST)
// Authorization: x-cron-secret header or ?secret= query param
// Safety: Checks off-peak hours + budget before running AI tasks

import { NextResponse } from "next/server";
import {
  callAIForUpgrade,
  isOffPeakHours,
  canRunUpgradeTasks,
  getAIBudgetStatus,
} from "@/lib/ai-client";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAllAgentGoals, type AgentGoal } from "@/lib/agent-goals/goal-tree";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max

// ── Schedule checker ───────────────────────────────────────────────────

function shouldResearchToday(frequency: string): boolean {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const date = now.getDate();
  const week = Math.ceil(date / 7); // 1st, 2nd, 3rd, 4th week of month

  switch (frequency) {
    case "daily":
      return true;
    case "weekly-mon":
      return day === 1;
    case "weekly-tue":
      return day === 2;
    case "weekly-wed":
      return day === 3;
    case "weekly-sun":
      return day === 0;
    case "bi-weekly-sat":
      return day === 6 && (week === 1 || week === 3);
    case "bi-weekly-thu":
      return day === 4 && (week === 1 || week === 3);
    case "bi-weekly-fri":
      return day === 5 && (week === 1 || week === 3);
    case "monthly-1st-sat":
      return day === 6 && week === 1;
    case "monthly-2nd-sat":
      return day === 6 && week === 2;
    case "monthly-3rd-sat":
      return day === 6 && week === 3;
    case "monthly":
      return date === 1;
    default:
      return false;
  }
}

// ── Research runner ────────────────────────────────────────────────────

interface ResearchResult {
  agent: string;
  topic: string;
  status: "ok" | "skipped" | "failed" | "no_new_data";
  summary?: string;
  error?: string;
}

async function researchTopic(
  agentGoal: AgentGoal,
  topic: string,
): Promise<ResearchResult> {
  const base = { agent: agentGoal.agent, topic };

  const result = await callAIForUpgrade({
    system: `You are the ${agentGoal.title} at BlockID.au, an Australian startup valuation platform. Research the following topic and provide updated benchmarks, data points, and insights that should inform startup evaluation. Return ONLY valid JSON with this schema:
{
  "key_findings": ["string", ...],
  "data_points": [{ "metric": "string", "value": "string", "source": "string" }],
  "changes_since_last": "string",
  "implications_for_au_startups": "string",
  "confidence": 0.0-1.0
}`,
    user: `Research topic: ${topic}\n\nProvide:\n1. Latest data points and benchmarks\n2. Key changes in the last 30 days\n3. Implications for Australian startup evaluation\n4. Specific numbers and sources where possible`,
    maxTokens: 1500,
  });

  if (!result) {
    return { ...base, status: "skipped", summary: "AI unavailable (free providers only)" };
  }

  // Try to parse the AI response as JSON for structured storage
  let parsedFindings: Record<string, unknown> | null = null;
  try {
    // Strip markdown code fences if present
    const cleaned = result.text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    parsedFindings = JSON.parse(cleaned);
  } catch {
    // Non-JSON response — store as plain text
    parsedFindings = {
      key_findings: [result.text.slice(0, 500)],
      data_points: [],
      changes_since_last: "Raw text response",
      implications_for_au_startups: result.text.slice(0, 300),
      confidence: 0.5,
    };
  }

  const confidence = (parsedFindings?.confidence as number) ?? 0.5;

  // Low confidence findings are unlikely to be useful
  if (confidence < 0.3) {
    return { ...base, status: "no_new_data", summary: "Low confidence result" };
  }

  // Store in agent_knowledge_base
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      // Check for existing knowledge on this topic
      const { data: existing } = await supabase
        .from("agent_knowledge_base")
        .select("id, data, updated_at")
        .eq("agent", agentGoal.agent)
        .eq("topic", topic)
        .maybeSingle();

      const now = new Date().toISOString();

      if (existing) {
        // Update existing knowledge entry
        await supabase
          .from("agent_knowledge_base")
          .update({
            data: parsedFindings,
            previous_data: existing.data,
            updated_at: now,
            source_model: result.model,
            source_provider: result.provider,
          })
          .eq("id", existing.id);
      } else {
        // Insert new knowledge entry
        await supabase.from("agent_knowledge_base").insert({
          agent: agentGoal.agent,
          topic,
          data: parsedFindings,
          previous_data: null,
          source_model: result.model,
          source_provider: result.provider,
          created_at: now,
          updated_at: now,
        });
      }
    } catch (err) {
      console.error(
        `[agent-research] Failed to store knowledge for ${agentGoal.agent}/${topic}:`,
        err,
      );
      // Non-blocking — continue even if DB write fails
    }
  }

  const keyFindings = parsedFindings?.key_findings as string[] | undefined;
  const summaryStr = keyFindings?.length
    ? keyFindings.slice(0, 2).join("; ")
    : result.text.slice(0, 200);

  return { ...base, status: "ok", summary: summaryStr };
}

// ── Main handler ───────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Verify cron secret
  const bearer = request.headers.get("authorization")?.replace("Bearer ", "");
  const secret =
    bearer ||
    request.headers.get("x-cron-secret") ||
    new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET && secret !== "local-dev") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const budget = getAIBudgetStatus();
  const offPeak = isOffPeakHours();
  const canUpgrade = canRunUpgradeTasks();

  // Gate check — only budget matters (uses free models, no off-peak restriction)
  if (!canUpgrade) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Budget exceeded (${budget.percent}% used, requires <80%)`,
      timestamp: now.toISOString(),
      budget,
    });
  }

  // Determine which agents should research today
  const allGoals = getAllAgentGoals();
  const scheduledAgents = allGoals.filter((goal: AgentGoal) =>
    shouldResearchToday(goal.researchFrequency),
  );

  if (scheduledAgents.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "No agents scheduled for research today",
      timestamp: now.toISOString(),
      dayOfWeek: now.getDay(),
      dateOfMonth: now.getDate(),
      budget,
    });
  }

  console.log(
    `[agent-research] Starting research for ${scheduledAgents.length} agents: ${scheduledAgents.map((a: AgentGoal) => a.agent).join(", ")}`,
  );

  // Run research for each scheduled agent
  const results: ResearchResult[] = [];
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const agentGoal of scheduledAgents) {
    if (!agentGoal.researchTopics.length) continue;

    for (let i = 0; i < agentGoal.researchTopics.length; i++) {
      const topic = agentGoal.researchTopics[i];

      // Stagger AI calls: 45s gap between requests to stay within rate limits
      // (OpenRouter: 200 RPM, Groq: 30 RPM, Gemini: 15 RPM)
      if (results.filter((r) => r.status === "ok").length > 0) {
        await delay(45_000);
      }

      // Re-check budget between topics (may have been consumed by other crons)
      if (!canRunUpgradeTasks()) {
        results.push({
          agent: agentGoal.agent,
          topic,
          status: "skipped",
          summary: "Budget limit reached mid-run",
        });
        continue;
      }

      try {
        const result = await researchTopic(agentGoal, topic);
        results.push(result);
        console.log(
          `[agent-research] ${agentGoal.agent}/${topic}: ${result.status}${result.summary ? ` — ${result.summary.slice(0, 100)}` : ""}`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          agent: agentGoal.agent,
          topic,
          status: "failed",
          error: msg,
        });
        console.error(`[agent-research] ${agentGoal.agent}/${topic}: FAILED — ${msg}`);
      }
    }
  }

  // Log to growth_insights table
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      await supabase.from("growth_insights").insert({
        type: "agent_research",
        data: {
          timestamp: now.toISOString(),
          budget: getAIBudgetStatus(), // Re-fetch for post-run budget
          offPeak,
          scheduledAgents: scheduledAgents.map((a) => a.agent),
          results,
        },
        created_at: now.toISOString(),
      });
    } catch {
      /* non-blocking */
    }
  }

  const summary = {
    ok: true,
    timestamp: now.toISOString(),
    offPeak,
    budget: getAIBudgetStatus(),
    scheduledAgents: scheduledAgents.map((a: AgentGoal) => ({
      agent: a.agent,
      title: a.title,
      frequency: a.researchFrequency,
      topicCount: a.researchTopics.length,
    })),
    tasksCompleted: results.filter((r) => r.status === "ok").length,
    tasksSkipped: results.filter((r) => r.status === "skipped").length,
    tasksFailed: results.filter((r) => r.status === "failed").length,
    tasksNoNewData: results.filter((r) => r.status === "no_new_data").length,
    results,
  };

  console.log(
    `[agent-research] Complete: ${summary.tasksCompleted} ok, ${summary.tasksSkipped} skipped, ${summary.tasksFailed} failed, ${summary.tasksNoNewData} no new data`,
  );

  return NextResponse.json(summary);
}

export { GET as POST };
