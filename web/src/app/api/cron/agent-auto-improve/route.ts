// POST /api/cron/agent-auto-improve — Daily autonomous improvement pipeline
//
// Reads recent research from agent_knowledge_base, asks AI to generate
// code improvements for each C-Level agent's domain, then submits to
// agent-deploy for CI/CD + go live.
//
// Daily Pipeline:
//   3am  agent-upgrade    → health checks, metrics, reports
//   6am  agent-research   → gather fresh knowledge per agent
//   7am  agent-auto-improve (THIS) → generate improvements → deploy
//   9:30am telegram-report → summary of everything
//
// Safety: max 3 improvements per day, only touches src/lib/agents/ and content/

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { callAIForUpgrade, canRunUpgradeTasks, getAIBudgetStatus } from "@/lib/ai-client";
import { getAllAgentGoals, type AgentGoal } from "@/lib/agent-goals/goal-tree";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import * as fs from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const CRON_SECRET = process.env.CRON_SECRET;
const MAX_IMPROVEMENTS_PER_RUN = 3;
const DEPLOY_URL = "http://127.0.0.1:4001/api/cron/agent-deploy";

interface ImprovementResult {
  agent: string;
  type: "knowledge_update" | "code_improvement" | "skipped";
  description: string;
  deployed: boolean;
  error?: string;
}

// Map agent to their domain module file
const AGENT_DOMAIN_FILES: Record<string, string> = {
  cmo: "src/lib/agents/cmo-market-research.ts",
  cto: "src/lib/agents/cto-cost-modeling.ts",
  cro: "src/lib/agents/cro-conversion.ts",
  clo: "src/lib/agents/clo-compliance.ts",
  chro: "src/lib/agents/chro-team.ts",
  ciso: "src/lib/agents/ciso-security.ts",
  cdo: "src/lib/agents/cdo-data-quality.ts",
};

async function getRecentResearch(supabase: ReturnType<typeof getSupabaseAdmin>, agent: string) {
  if (!supabase) return [];
  const { data } = await supabase
    .from("agent_knowledge_base")
    .select("topic, data, updated_at")
    .eq("agent", agent)
    .order("updated_at", { ascending: false })
    .limit(5);
  return data ?? [];
}

function readDomainModule(agent: string): string | null {
  const filePath = AGENT_DOMAIN_FILES[agent];
  if (!filePath) return null;
  try {
    return fs.readFileSync(`${WEB_DIR}/${filePath}`, "utf8");
  } catch {
    return null;
  }
}

async function generateImprovement(
  agent: string,
  agentGoal: AgentGoal,
  research: Array<{ topic: string; data: unknown; updated_at: string }>,
  currentModule: string | null,
): Promise<{ description: string; filePath: string; content: string } | null> {
  const researchSummary = research
    .map((r) => `Topic: ${r.topic}\nData: ${JSON.stringify(r.data).slice(0, 500)}\nUpdated: ${r.updated_at}`)
    .join("\n\n");

  const moduleSnippet = currentModule
    ? `\nCurrent module (${AGENT_DOMAIN_FILES[agent]}):\n${currentModule.slice(0, 2000)}...\n`
    : "\nNo domain module exists yet.\n";

  const result = await callAIForUpgrade({
    system: `You are the ${agentGoal.title} at BlockID.au. Your job is to improve the platform's ${agent.toUpperCase()} domain module based on recent research findings.

Rules:
- Output ONLY valid TypeScript code (a complete module file)
- The module must export useful functions, interfaces, and data constants
- Incorporate the latest research data into benchmarks, templates, or calculations
- Keep existing functions and add new ones based on research findings
- Add detailed Australian market data where applicable
- Include JSDoc-style type annotations but NO multi-line comments
- The code must compile with strict TypeScript
- If the current module is good and research doesn't warrant changes, respond with exactly: NO_CHANGES_NEEDED`,
    user: `Recent research findings:\n${researchSummary}\n${moduleSnippet}\n\nBased on this research, generate an improved version of the domain module. Focus on adding new data, benchmarks, or calculations that the research reveals.`,
    maxTokens: 3000,
  });

  if (!result || !result.text || result.text.includes("NO_CHANGES_NEEDED")) {
    return null;
  }

  // Extract the code (strip markdown fences if present)
  let code = result.text;
  const fenceMatch = code.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) code = fenceMatch[1];

  // Validate it looks like TypeScript
  if (!code.includes("export") || code.length < 100) return null;

  const filePath = AGENT_DOMAIN_FILES[agent] ?? `src/lib/agents/${agent}-domain.ts`;

  return {
    description: `Update ${agent.toUpperCase()} domain module with latest research findings`,
    filePath,
    content: code.trim() + "\n",
  };
}

async function submitToDeploy(
  agent: string,
  description: string,
  filePath: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(DEPLOY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CRON_SECRET}`,
      },
      body: JSON.stringify({
        agent,
        description,
        files: [{ path: filePath, content, action: "write" }],
      }),
    });
    const data = await res.json();
    return { ok: data.ok === true, error: data.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Deploy request failed" };
  }
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: max 1 run per hour
  const rl = checkRateLimit("cron:agent-auto-improve", 1, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", resetIn: rl.resetIn }, { status: 429 });
  }

  const budget = getAIBudgetStatus();
  if (!canRunUpgradeTasks()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `Budget exceeded (${budget.percent}%)`,
      budget,
    });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const results: ImprovementResult[] = [];
  let deploymentsToday = 0;

  // Get agents that have recent research (updated in last 7 days)
  const allGoals = getAllAgentGoals();
  const agentGoals = allGoals.filter((g) => g.agent !== "ceo" && AGENT_DOMAIN_FILES[g.agent]);

  for (const goal of agentGoals) {
    if (deploymentsToday >= MAX_IMPROVEMENTS_PER_RUN) {
      results.push({ agent: goal.agent, type: "skipped", description: "Daily limit reached", deployed: false });
      continue;
    }

    if (!canRunUpgradeTasks()) {
      results.push({ agent: goal.agent, type: "skipped", description: "Budget limit", deployed: false });
      continue;
    }

    const research = await getRecentResearch(supabase, goal.agent);
    if (research.length === 0) {
      results.push({ agent: goal.agent, type: "skipped", description: "No recent research", deployed: false });
      continue;
    }

    // Check if research is fresh (updated within last 7 days)
    const hasRecentResearch = research.some((r) => {
      const daysAgo = (Date.now() - new Date(r.updated_at).getTime()) / (86400 * 1000);
      return daysAgo <= 7;
    });

    if (!hasRecentResearch) {
      results.push({ agent: goal.agent, type: "skipped", description: "Research not recent enough", deployed: false });
      continue;
    }

    try {
      const currentModule = readDomainModule(goal.agent);
      const improvement = await generateImprovement(goal.agent, goal, research, currentModule);

      if (!improvement) {
        results.push({ agent: goal.agent, type: "skipped", description: "No improvements needed", deployed: false });
        continue;
      }

      // Submit to agent-deploy for CI/CD + go live
      const deployResult = await submitToDeploy(goal.agent, improvement.description, improvement.filePath, improvement.content);

      if (deployResult.ok) {
        deploymentsToday++;
        results.push({
          agent: goal.agent,
          type: "code_improvement",
          description: improvement.description,
          deployed: true,
        });
      } else {
        results.push({
          agent: goal.agent,
          type: "code_improvement",
          description: improvement.description,
          deployed: false,
          error: deployResult.error,
        });
      }

      // Stagger AI calls — wait 30s between agents
      if (deploymentsToday < MAX_IMPROVEMENTS_PER_RUN) {
        await new Promise((r) => setTimeout(r, 30_000));
      }
    } catch (err) {
      results.push({
        agent: goal.agent,
        type: "skipped",
        description: "Error generating improvement",
        deployed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Log improvements to growth_insights
  if (supabase) {
    try {
      await supabase.from("growth_insights").insert({
        type: "agent_auto_improve",
        data: { date: today, budget: getAIBudgetStatus(), results },
        created_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }
  }

  // Send summary to Telegram
  const deployed = results.filter((r) => r.deployed);
  const failed = results.filter((r) => r.type === "code_improvement" && !r.deployed);
  const skipped = results.filter((r) => r.type === "skipped");

  if (deployed.length > 0 || failed.length > 0) {
    await sendTelegram(
      `🤖 *Agent Auto-Improve — ${today}*\n\n` +
      `✅ Deployed: ${deployed.length}\n` +
      (deployed.length > 0 ? deployed.map((d) => `  • ${mdEscape(d.agent.toUpperCase())}: ${mdEscape(d.description)}`).join("\n") + "\n" : "") +
      (failed.length > 0 ? `❌ Failed: ${failed.length}\n` + failed.map((f) => `  • ${mdEscape(f.agent.toUpperCase())}: ${mdEscape(f.error?.slice(0, 80) ?? "unknown")}`).join("\n") + "\n" : "") +
      `⏭️ Skipped: ${skipped.length}\n` +
      `💰 Budget: $${budget.spent}/$${budget.limit} (${budget.percent}%)`,
    ).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    date: today,
    budget: getAIBudgetStatus(),
    deployed: deployed.length,
    failed: failed.length,
    skipped: skipped.length,
    results,
  });
}
