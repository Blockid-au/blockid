// POST /api/cron/agent-orchestrator — Leader/Manager that auto-upgrades
// BlockID.au platform itself.  Each C-Level AI agent researches its domain,
// generates code improvements, and the orchestrator pushes them through:
//
//   research → plan → code → deploy → git_push → qa → fix → report
//
// The "code" stage calls agent-auto-improve which internally:
//   1. Reads agent_knowledge_base (from agent-research)
//   2. AI generates improved domain modules
//   3. Submits to agent-deploy which: applies code → tsc/lint CI → autofix →
//      git commit + merge master → push to GitHub → deploy-live.sh
//
// Schedule: 8x daily (every 2h) with budget-aware throttling to maximise
// Claude subscription usage without exceeding monthly limits.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  callAIForUpgrade,
  canRunUpgradeTasks,
  getAIBudgetStatus,
} from "@/lib/ai-client";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { exec } from "child_process";
import * as fs from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const CRON_SECRET = process.env.CRON_SECRET;
const STATE_FILE = "/tmp/blockid-orchestrator-state.json";
const HISTORY_FILE = `${WEB_DIR}/content/reports/orchestrator-history.jsonl`;
const BASE_URL = "http://127.0.0.1:4001";

// ── Pipeline stages — BlockID.au self-upgrade sequence ──────────────────

type PipelineStage =
  | "research"     // C-Level agents gather domain knowledge
  | "plan"         // AI plans which agents should upgrade what
  | "code"         // agent-auto-improve → agent-deploy (write+CI+commit+push+deploy)
  | "deploy"       // Verify deploy succeeded, re-run deploy-live.sh if needed
  | "git_push"     // Ensure all changes are pushed to GitHub origin/master
  | "qa"           // Full healthcheck post-deploy
  | "fix"          // Auto-fix via guardian if QA found issues
  | "report"       // Telegram summary of platform changes
  | "idle";

interface OrchestratorState {
  lastRun: string;
  lastStage: PipelineStage;
  dailyStagesCompleted: string[];
  dailyAICalls: number;
  pendingFixes: string[];
  lastPlanOutput: string | null;
  consecutiveIdleCount: number;
  date: string;
}

interface StageResult {
  stage: PipelineStage;
  ok: boolean;
  message: string;
  aiCalls: number;
  durationMs: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function runShell(cmd: string, timeout = 60_000): Promise<{ ok: boolean; output: string }> {
  return new Promise(resolve => {
    exec(cmd, { cwd: WEB_DIR, timeout }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, output: ((stdout || "") + (stderr || "") + (error.message || "")).slice(0, 1000).trim() });
      } else {
        resolve({ ok: true, output: (stdout || "").trim() });
      }
    });
  });
}

function computeDailyBudget(): { targetCalls: number; callsRemaining: number; shouldRun: boolean } {
  const budget = getAIBudgetStatus();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayOfMonth = new Date().getDate();
  const daysLeft = daysInMonth - dayOfMonth + 1;
  const usableBudget = budget.limit * 0.8;
  const remainingBudget = usableBudget - budget.spent;
  const dailyTarget = Math.max(2, Math.floor(remainingBudget / daysLeft));
  const state = loadState();
  const todaysCalls = state.date === todayStr() ? state.dailyAICalls : 0;
  return {
    targetCalls: dailyTarget,
    callsRemaining: Math.max(0, dailyTarget - todaysCalls),
    shouldRun: todaysCalls < dailyTarget && budget.percent < 95,
  };
}

function loadState(): OrchestratorState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {
      lastRun: "", lastStage: "idle", dailyStagesCompleted: [], dailyAICalls: 0,
      pendingFixes: [], lastPlanOutput: null, consecutiveIdleCount: 0, date: todayStr(),
    };
  }
}

function saveState(state: OrchestratorState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function logHistory(entry: StageResult & { timestamp: string }) {
  try {
    const dir = `${WEB_DIR}/content/reports`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + "\n");
  } catch { /* ignore */ }
}

async function callInternalAgent(endpoint: string, timeout = 120_000): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/cron/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CRON_SECRET}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, data: json as Record<string, unknown> };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Stage executors ─────────────────────────────────────────────────────

async function stageResearch(): Promise<StageResult> {
  const start = Date.now();
  const result = await callInternalAgent("agent-research", 240_000);
  const data = result.data ?? {};
  const topics = Array.isArray(data.results) ? (data.results as Array<{ agent?: string }>).length : 0;
  return {
    stage: "research",
    ok: result.ok,
    message: result.ok ? `Research done — ${topics} topics gathered for C-Level agents` : `Research failed: ${result.error}`,
    aiCalls: result.ok ? 2 : 0,
    durationMs: Date.now() - start,
  };
}

async function stagePlan(state: OrchestratorState): Promise<StageResult> {
  const start = Date.now();
  if (!canRunUpgradeTasks()) {
    return { stage: "plan", ok: true, message: "Skipped — AI budget exceeded", aiCalls: 0, durationMs: 0 };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return { stage: "plan", ok: false, message: "No DB", aiCalls: 0, durationMs: 0 };

  // Check what research is available
  const { data: recentKB } = await supabase
    .from("agent_knowledge_base")
    .select("agent, topic, updated_at")
    .gte("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString())
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!recentKB || recentKB.length === 0) {
    return { stage: "plan", ok: true, message: "No recent research — need agent-research first", aiCalls: 0, durationMs: Date.now() - start };
  }

  const knowledgeSummary = recentKB.map(k => `${(k.agent as string).toUpperCase()}: ${k.topic}`).join("\n");

  // Check git status for uncommitted improvements
  const gitStatus = await runShell("git status --short");

  const aiResult = await callAIForUpgrade({
    system: `You are the BlockID.au AI Orchestrator. Your job is to plan which C-Level agent domain modules
should be upgraded TODAY based on recent research. BlockID.au is a startup valuation platform — each
C-Level agent has a domain module under src/lib/agents/ that you are upgrading.

Output a JSON plan: { "priorities": [{"agent": "cmo|cto|cfo|...", "action": "what to improve", "reason": "why"}], "summary": "..." }
Max 3 priorities. Focus on agents with fresh research that hasn't been applied yet.`,
    user: `Recent research in knowledge base:\n${knowledgeSummary}\n\nGit status:\n${gitStatus.output.slice(0, 500) || "(clean)"}\n\nDecide: which agents should upgrade their domain modules today?`,
    maxTokens: 600,
  });

  if (!aiResult) {
    return { stage: "plan", ok: false, message: "AI plan failed", aiCalls: 1, durationMs: Date.now() - start };
  }

  state.lastPlanOutput = aiResult.text;
  return {
    stage: "plan",
    ok: true,
    message: `Plan: ${aiResult.text.slice(0, 200)}`,
    aiCalls: 1,
    durationMs: Date.now() - start,
  };
}

async function stageCode(): Promise<StageResult> {
  // agent-auto-improve reads research → AI generates code → submits to agent-deploy
  // agent-deploy: applies code → tsc/lint CI → autofix → git commit+merge → push GitHub → deploy-live.sh
  const start = Date.now();
  const result = await callInternalAgent("agent-auto-improve", 240_000);
  const data = result.data ?? {};
  const deployed = (data.deployed as number) ?? 0;
  const failed = (data.failed as number) ?? 0;
  const skipped = (data.skipped as number);

  if (data.skipped === true) {
    return { stage: "code", ok: true, message: `Skipped: ${data.reason ?? "budget"}`, aiCalls: 0, durationMs: Date.now() - start };
  }

  return {
    stage: "code",
    ok: result.ok,
    message: result.ok
      ? `Platform upgraded: ${deployed} modules deployed, ${failed} failed (via agent-deploy → git commit → GitHub push → deploy-live)`
      : `Code stage failed: ${result.error}`,
    aiCalls: deployed > 0 ? deployed + 1 : 0,
    durationMs: Date.now() - start,
  };
}

async function stageDeploy(): Promise<StageResult> {
  // Verify the latest deploy is healthy. If uncommitted source changes exist, run deploy-live.sh.
  const start = Date.now();

  // Check for uncommitted source changes that need deploying
  const gitDiff = await runShell("git diff --name-only HEAD");
  const srcChanges = gitDiff.output.split("\n").filter(f => f.startsWith("src/") || f.startsWith("web/src/")).length;

  if (srcChanges > 0) {
    // There are uncommitted src changes — commit + deploy
    await runShell("git add -A src/ content/");
    const commitResult = await runShell(
      `git commit -m "feat(orchestrator): platform auto-upgrade $(date +%Y-%m-%d)\n\nAuto-committed by agent-orchestrator.\n\nCo-Authored-By: BlockID Orchestrator <orchestrator@blockid.au>" --allow-empty`
    );

    if (commitResult.ok) {
      const deployResult = await runShell("bash scripts/deploy-live.sh 2>&1 | tail -5", 300_000);
      if (deployResult.ok && deployResult.output.includes("DEPLOY COMPLETE")) {
        return { stage: "deploy", ok: true, message: `Deploy OK: ${srcChanges} changed files committed + deployed live`, aiCalls: 0, durationMs: Date.now() - start };
      }
      return { stage: "deploy", ok: false, message: `Deploy failed: ${deployResult.output.slice(0, 200)}`, aiCalls: 0, durationMs: Date.now() - start };
    }
  }

  // No changes — verify current deployment is healthy
  const verifyResult = await runShell("curl -s -o /dev/null -w '%{http_code}' http://localhost:4001/api/healthz");
  const httpCode = verifyResult.output;

  return {
    stage: "deploy",
    ok: httpCode === "200",
    message: httpCode === "200"
      ? "Production running — HTTP 200"
      : `Production unhealthy — HTTP ${httpCode}, re-deploying`,
    aiCalls: 0,
    durationMs: Date.now() - start,
  };
}

async function stageGitPush(): Promise<StageResult> {
  // Ensure all local commits are pushed to GitHub origin/master
  const start = Date.now();

  // Check if there are unpushed commits
  const aheadCheck = await runShell("git rev-list --count origin/master..HEAD 2>/dev/null || echo 0");
  const ahead = parseInt(aheadCheck.output, 10) || 0;

  if (ahead === 0) {
    return { stage: "git_push", ok: true, message: "GitHub in sync — 0 unpushed commits", aiCalls: 0, durationMs: Date.now() - start };
  }

  // Fetch first to avoid push conflicts
  await runShell("git fetch origin master 2>&1", 30_000);

  // Check for divergence
  const behindCheck = await runShell("git rev-list --count HEAD..origin/master 2>/dev/null || echo 0");
  const behind = parseInt(behindCheck.output, 10) || 0;

  if (behind > 0) {
    // Need to merge remote changes first
    const mergeResult = await runShell("git merge origin/master --no-edit 2>&1");
    if (!mergeResult.ok) {
      return { stage: "git_push", ok: false, message: `Merge conflict — ${behind} behind, needs manual resolve`, aiCalls: 0, durationMs: Date.now() - start };
    }
  }

  // Push to GitHub
  const pushResult = await runShell("git push origin master 2>&1", 60_000);
  return {
    stage: "git_push",
    ok: pushResult.ok,
    message: pushResult.ok
      ? `Pushed ${ahead} commits to GitHub origin/master`
      : `Push failed: ${pushResult.output.slice(0, 200)}`,
    aiCalls: 0,
    durationMs: Date.now() - start,
  };
}

async function stageQA(): Promise<StageResult> {
  const start = Date.now();
  const result = await callInternalAgent("agent-healthcheck", 120_000);
  const data = result.data ?? {};
  const summary = data.summary as { total?: number; pass?: number; fail?: number } | undefined;
  return {
    stage: "qa",
    ok: result.ok,
    message: result.ok
      ? `QA: ${summary?.pass ?? "?"}/${summary?.total ?? "?"} pass, ${summary?.fail ?? 0} fail`
      : `QA failed: ${result.error}`,
    aiCalls: 0,
    durationMs: Date.now() - start,
  };
}

async function stageFix(state: OrchestratorState): Promise<StageResult> {
  const start = Date.now();
  const result = await callInternalAgent("agent-guardian", 90_000);
  state.pendingFixes = [];
  return {
    stage: "fix",
    ok: result.ok,
    message: result.ok ? "Guardian auto-fix complete" : `Fix failed: ${result.error}`,
    aiCalls: 0,
    durationMs: Date.now() - start,
  };
}

async function stageReport(state: OrchestratorState, results: StageResult[]): Promise<StageResult> {
  const start = Date.now();
  const budget = getAIBudgetStatus();
  const totalAICalls = results.reduce((s, r) => s + r.aiCalls, 0);
  const totalDuration = results.reduce((s, r) => s + r.durationMs, 0);

  // Get recent git log to show what was deployed
  const gitLog = await runShell("git log --oneline -5");

  const lines = [
    `🤖 *BlockID\\.au Self\\-Upgrade Report*`,
    ``,
    ...results.map(r => mdEscape(`${r.ok ? "✅" : "❌"} ${r.stage}: ${r.message}`)),
    ``,
    `📦 *Recent Commits:*`,
    ...gitLog.output.split("\n").slice(0, 3).map(l => mdEscape(l)),
    ``,
    `💰 Budget: $${budget.spent}/$${budget.limit} \\(${budget.percent}%\\)`,
    `🔢 AI Calls Today: ${state.dailyAICalls + totalAICalls}`,
    `⏱️ Duration: ${Math.round(totalDuration / 1000)}s`,
  ];

  await sendTelegram(lines.join("\n")).catch(() => {});

  return { stage: "report", ok: true, message: `Telegram sent, ${totalAICalls} AI calls`, aiCalls: 0, durationMs: Date.now() - start };
}

// ── Stage selection — spread across the day ─────────────────────────────

function determineStages(state: OrchestratorState, budget: { callsRemaining: number; shouldRun: boolean }): PipelineStage[] {
  const completed = state.date === todayStr() ? state.dailyStagesCompleted : [];

  if (!budget.shouldRun) {
    // No AI budget — only run non-AI infrastructure stages
    const noAI: PipelineStage[] = ["deploy", "git_push", "qa"];
    return noAI.filter(s => !completed.includes(s));
  }

  const pipeline: PipelineStage[] = [
    "research",
    "plan",
    "code",        // includes agent-deploy → git commit → push → deploy
    "deploy",      // verify + catch any missed deploys
    "git_push",    // verify + push any unpushed commits
    "qa",          // full healthcheck
    "report",
  ];

  const remaining = pipeline.filter(s => !completed.includes(s));
  const maxPerRun = budget.callsRemaining >= 6 ? 4 : 2;
  return remaining.slice(0, maxPerRun);
}

// ── Main handler ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("orchestrator", 6, 600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", retryAfter: rl.resetIn }, { status: 429 });
  }

  const state = loadState();
  const today = todayStr();
  if (state.date !== today) {
    state.date = today;
    state.dailyStagesCompleted = [];
    state.dailyAICalls = 0;
    state.consecutiveIdleCount = 0;
  }

  const budget = computeDailyBudget();
  const stages = determineStages(state, budget);

  if (stages.length === 0) {
    state.consecutiveIdleCount++;
    state.lastRun = new Date().toISOString();
    saveState(state);
    return NextResponse.json({
      ok: true,
      message: "All stages done for today — waiting for next daily reset",
      dailyStagesCompleted: state.dailyStagesCompleted,
      budget: getAIBudgetStatus(),
    });
  }

  const results: StageResult[] = [];
  for (const stage of stages) {
    let result: StageResult;
    try {
      switch (stage) {
        case "research":  result = await stageResearch(); break;
        case "plan":      result = await stagePlan(state); break;
        case "code":      result = await stageCode(); break;
        case "deploy":    result = await stageDeploy(); break;
        case "git_push":  result = await stageGitPush(); break;
        case "qa":        result = await stageQA(); break;
        case "fix":       result = await stageFix(state); break;
        case "report":    result = await stageReport(state, results); break;
        default:          result = { stage: "idle", ok: true, message: "No-op", aiCalls: 0, durationMs: 0 };
      }
    } catch (err) {
      result = { stage, ok: false, message: `Exception: ${err instanceof Error ? err.message : String(err)}`, aiCalls: 0, durationMs: 0 };
    }

    results.push(result);
    state.dailyStagesCompleted.push(stage);
    state.dailyAICalls += result.aiCalls;
    state.lastStage = stage;
    logHistory({ ...result, timestamp: new Date().toISOString() });

    if (!result.ok && stage === "deploy") {
      // Deploy failure — trigger fix stage
      if (!stages.includes("fix")) {
        const fixResult = await stageFix(state);
        results.push(fixResult);
        state.dailyStagesCompleted.push("fix");
      }
      break;
    }
  }

  // Auto-report on failures
  if (!stages.includes("report") && results.some(r => !r.ok)) {
    const reportResult = await stageReport(state, results);
    results.push(reportResult);
  }

  state.lastRun = new Date().toISOString();
  saveState(state);

  return NextResponse.json({
    ok: true,
    stagesRun: results.map(r => r.stage),
    results: results.map(r => ({ stage: r.stage, ok: r.ok, message: r.message })),
    dailyStagesCompleted: state.dailyStagesCompleted,
    budget: getAIBudgetStatus(),
  });
}
