// POST /api/cron/clevel-daily-reports — Fan-out daily report generator.
//
// Generates a daily brief for EVERY C-Level agent (14 total) — guarantees no
// agent is missing from the daily summary. Each report ties back to the CEO's
// 30-day KPI/OKR scoreboard, lists the CEO-assigned tasks from project-state.json
// (real implementing-plan queue), shows last-24h activity, and surfaces today's
// action items.
//
// Deterministic and cheap (no AI calls): reads from
//   - content/reports/clevel-kpi-matrix.json   (KPI + daily-routine map)
//   - content/reports/project-state.json       (CEO-assigned tasks per agent)
//   - git log --since='24 hours ago'           (activity per agent's file globs)
//
// Output: content/reports/<agent>-daily-YYYY-MM-DD.md (overwrites today's file).
// Schedule: 23:45 UTC daily (09:45 AEST), just before ceo-daily-summary at 00:00 UTC.

import { NextResponse } from "next/server";
import * as fs from "fs";
import { exec } from "child_process";
import { loadProjectState, type PlanTask } from "@/lib/project-state";
import { sendTelegram, mdEscape } from "@/lib/telegram";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET;
const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const REPORTS_DIR = `${WEB_DIR}/content/reports`;
const MATRIX_FILE = `${REPORTS_DIR}/clevel-kpi-matrix.json`;

interface AgentKPI {
  title: string;
  domain: string;
  kpis30Day: string[];
  dailyRoutine: string[];
  ceoAlignment: string;
  filePatterns: string[];
  reportsTo: string;
}

interface KpiMatrix {
  _meta: {
    northStar: string;
    ceoTargets30Day: Record<string, unknown>;
    ceoFilter: string[];
    updatedAt: string;
  };
  agents: Record<string, AgentKPI>;
}

function loadMatrix(): KpiMatrix {
  return JSON.parse(fs.readFileSync(MATRIX_FILE, "utf8")) as KpiMatrix;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function runShell(cmd: string, timeout = 30_000): Promise<string> {
  return new Promise(resolve => {
    exec(cmd, { cwd: WEB_DIR, timeout, maxBuffer: 2_000_000 }, (_e, stdout) => resolve((stdout || "").trim()));
  });
}

// Compile a single regex from an array of file globs (very small subset: ** and *).
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLE_STAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLE_STAR::/g, ".*");
  return new RegExp(`^${escaped}$`);
}

interface GitActivity {
  commits: string[];
  filesChanged: number;
}

async function getAgentActivity(patterns: string[]): Promise<GitActivity> {
  const log = await runShell("git log --since='24 hours ago' --pretty=format:'%h|%s' --name-only");
  if (!log) return { commits: [], filesChanged: 0 };

  const regexes = patterns.map(globToRegex);
  const blocks = log.split(/\n(?=[0-9a-f]{7,}\|)/);
  const commits = new Set<string>();
  let filesChanged = 0;

  for (const block of blocks) {
    const lines = block.split("\n");
    const header = lines[0];
    const m = header.match(/^([0-9a-f]{7,})\|(.+)$/);
    if (!m) continue;
    const sha = m[1];
    const subject = m[2];
    const files = lines.slice(1).filter(Boolean);
    let matched = false;
    for (const f of files) {
      // git log shows file paths relative to repo root. Patterns assume web/ root,
      // so the actual git path is "web/<pattern>". Match against both.
      const rel = f.startsWith("web/") ? f.slice(4) : f;
      if (regexes.some(r => r.test(rel) || r.test(f))) {
        matched = true;
        filesChanged++;
      }
    }
    if (matched) commits.add(`${sha} — ${subject}`);
  }
  return { commits: [...commits], filesChanged };
}

interface AgentReport {
  agent: string;
  status: "GREEN" | "YELLOW" | "RED";
  markdown: string;
  pendingCount: number;
  inProgressCount: number;
  shippedToday: number;
  activeTasks: PlanTask[];
}

function tasksFor(agent: string, all: PlanTask[]): { pending: PlanTask[]; inProgress: PlanTask[]; doneRecent: PlanTask[] } {
  const a = agent.toLowerCase();
  const mine = all.filter(t => t.agent?.toLowerCase() === a);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return {
    pending: mine.filter(t => t.status === "pending"),
    inProgress: mine.filter(t => t.status === "in_progress"),
    doneRecent: mine.filter(t => t.status === "done" && t.completedAt && Date.parse(t.completedAt) >= cutoff),
  };
}

function deriveStatus(
  pending: PlanTask[],
  inProgress: PlanTask[],
  doneRecent: PlanTask[],
  activity: GitActivity,
): "GREEN" | "YELLOW" | "RED" {
  // RED: pending task > 7 days old (CEO assignment stalled)
  const oldestPendingAge = pending.reduce((acc, t) => Math.max(acc, Date.now() - Date.parse(t.createdAt)), 0);
  if (oldestPendingAge > 7 * 24 * 60 * 60 * 1000 && activity.commits.length === 0) return "RED";

  // GREEN: shipped something this week OR active in-progress with recent commits
  if (doneRecent.length > 0 || (inProgress.length > 0 && activity.commits.length > 0)) return "GREEN";
  if (activity.commits.length > 0) return "GREEN";

  // YELLOW: has pending/in-progress, no recent activity yet
  return "YELLOW";
}

function deriveTodayActions(
  agent: string,
  kpi: AgentKPI,
  pending: PlanTask[],
  inProgress: PlanTask[],
): string[] {
  const actions: string[] = [];

  if (inProgress.length > 0) {
    for (const t of inProgress.slice(0, 2)) {
      actions.push(`Continue \`${t.id}\` — ${t.title}`);
    }
  }
  // Ensure at least one CEO-assigned task is surfaced; otherwise fall back to first pending
  for (const t of pending.slice(0, 3 - actions.length)) {
    actions.push(`Start \`${t.id}\` — ${t.title}`);
  }
  // Always inject at least 2 standing-routine actions to guarantee non-empty list
  for (const r of kpi.dailyRoutine) {
    if (actions.length >= 5) break;
    actions.push(r);
  }
  return actions;
}

function renderAgentReport(opts: {
  agent: string;
  kpi: AgentKPI;
  pending: PlanTask[];
  inProgress: PlanTask[];
  doneRecent: PlanTask[];
  activity: GitActivity;
  status: "GREEN" | "YELLOW" | "RED";
  date: string;
  ceoNorthStar: string;
  ceoFilter: string[];
}): string {
  const { agent, kpi, pending, inProgress, doneRecent, activity, status, date, ceoNorthStar, ceoFilter } = opts;
  const todayActions = deriveTodayActions(agent, kpi, pending, inProgress);

  const lines: string[] = [
    `# ${kpi.title} — Daily Brief (${date})`,
    ``,
    `**Agent:** ${agent.toUpperCase()}  ·  **Status:** ${status}  ·  **Domain:** ${kpi.domain}  ·  **Reports to:** ${kpi.reportsTo.toUpperCase()}`,
    ``,
    `> CEO North Star: **${ceoNorthStar}**`,
    `> CEO alignment for this role: ${kpi.ceoAlignment}`,
    ``,
    `## 1. 30-Day KPI Ownership (from CEO scoreboard)`,
    ...kpi.kpis30Day.map(k => `- ${k}`),
    ``,
    `## 2. CEO-Assigned Tasks (project-state.json)`,
    `**In progress:** ${inProgress.length}  ·  **Pending:** ${pending.length}  ·  **Shipped (last 7d):** ${doneRecent.length}`,
    ``,
    inProgress.length > 0 ? `### 🔄 In progress` : "",
    ...inProgress.map(t => `- \`${t.id}\` ${t.title}\n  · _impact:_ ${t.versionImpact}  ·  _rationale:_ ${(t.rationale || "—").slice(0, 200)}`),
    pending.length > 0 ? `\n### ⬜ Pending` : "",
    ...pending.map(t => `- \`${t.id}\` ${t.title}\n  · _impact:_ ${t.versionImpact}  ·  _created:_ ${t.createdAt.slice(0, 10)}`),
    doneRecent.length > 0 ? `\n### ✅ Shipped (last 7d)` : "",
    ...doneRecent.slice(-5).map(t => `- \`${t.id}\` ${t.title}${t.commit ? ` (\`${t.commit}\`)` : ""}`),
    ``,
    `## 3. Today's Action Items (CEO-aligned)`,
    ...todayActions.map((a, i) => `${i + 1}. ${a}`),
    ``,
    `## 4. Last 24h Activity (git, this agent's domain)`,
    activity.commits.length > 0
      ? `**${activity.commits.length} commit(s), ${activity.filesChanged} file change(s):**\n${activity.commits.slice(0, 8).map(c => `- ${c}`).join("\n")}`
      : `_No commits in this agent's file domains in the last 24h._`,
    ``,
    `## 5. Daily Routine Checklist`,
    ...kpi.dailyRoutine.map(r => `- [ ] ${r}`),
    ``,
    `## 6. CEO Filter (every action must support at least one)`,
    ...ceoFilter.map(f => `- ${f}`),
    ``,
    `## 7. Blockers / Escalations`,
    pending.filter(t => Date.now() - Date.parse(t.createdAt) > 7 * 24 * 60 * 60 * 1000).length > 0
      ? `⚠️ ${pending.filter(t => Date.now() - Date.parse(t.createdAt) > 7 * 24 * 60 * 60 * 1000).length} task(s) pending > 7 days — needs CEO re-prioritisation or de-scope.`
      : `_None._`,
    ``,
    `## 8. EOD Definition of Done`,
    `- At least one of the items in §3 closed or measurably progressed`,
    `- Status update logged in next cycle (file overwritten 23:45 UTC daily)`,
    `- Any blocker > 48h escalated to CEO via COO`,
    ``,
    `---`,
    `_Generated by /api/cron/clevel-daily-reports — every C-Level reports daily; no agent left silent._`,
  ];

  return lines.filter(l => l !== "").map(l => l).join("\n");
}

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit("clevel-daily-reports", 4, 600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited", retryAfter: rl.resetIn }, { status: 429 });
  }

  const matrix = loadMatrix();
  const ps = loadProjectState();
  const date = todayStr();
  const reports: AgentReport[] = [];

  for (const [agent, kpi] of Object.entries(matrix.agents)) {
    const { pending, inProgress, doneRecent } = tasksFor(agent, ps.plan.tasks);
    const activity = await getAgentActivity(kpi.filePatterns);
    const status = deriveStatus(pending, inProgress, doneRecent, activity);
    const md = renderAgentReport({
      agent,
      kpi,
      pending,
      inProgress,
      doneRecent,
      activity,
      status,
      date,
      ceoNorthStar: matrix._meta.northStar,
      ceoFilter: matrix._meta.ceoFilter,
    });

    const path = `${REPORTS_DIR}/${agent}-daily-${date}.md`;
    fs.writeFileSync(path, md);
    reports.push({
      agent,
      status,
      markdown: md,
      pendingCount: pending.length,
      inProgressCount: inProgress.length,
      shippedToday: doneRecent.filter(t => t.completedAt?.startsWith(date)).length,
      activeTasks: [...inProgress, ...pending],
    });
  }

  // Telegram summary — one message, all 14 agents, status + load
  const summary = [
    `📋 *C\\-Level Daily Brief ${mdEscape(date)}*`,
    ``,
    ...reports.map(r => {
      const icon = r.status === "GREEN" ? "🟢" : r.status === "YELLOW" ? "🟡" : "🔴";
      const load = `${r.inProgressCount}🔄 ${r.pendingCount}⬜`;
      return mdEscape(`${icon} ${r.agent.toUpperCase()} — ${load}`);
    }),
    ``,
    `🎯 _30\\-day North Star:_ 10 paying customers · AUD $1k MRR · 100 profiles`,
    `📊 Total open: ${reports.reduce((s, r) => s + r.inProgressCount + r.pendingCount, 0)} tasks across ${reports.length} agents`,
  ].join("\n");

  await sendTelegram(summary).catch(() => { /* best-effort */ });

  return NextResponse.json({
    ok: true,
    date,
    agentsReported: reports.length,
    statusBreakdown: {
      green: reports.filter(r => r.status === "GREEN").length,
      yellow: reports.filter(r => r.status === "YELLOW").length,
      red: reports.filter(r => r.status === "RED").length,
    },
    reports: reports.map(r => ({
      agent: r.agent,
      status: r.status,
      pending: r.pendingCount,
      inProgress: r.inProgressCount,
      shippedToday: r.shippedToday,
    })),
  });
}
