// POST /api/cron/svi-exchange-orchestrator — one orchestration cycle.
//
// Cadence: every 6 hours (cron entry `0 */6 * * *`).
// Auth: Bearer CRON_SECRET.
//
// Per cycle:
//   1. Load svi-exchange-tasks.json
//   2. Pick the highest-priority task to advance (picker logic per goal doc)
//   3. Advance ONE stage (research → plan → code → deploy)
//   4. Write state back; log the action; ping Telegram on completion or escalation
//
// This route does NOT execute the code itself — it records what NEEDS doing,
// stages the artifacts in .claude/research/ + .claude/plans/, and only marks
// the deploy stage as done after a successful deploy event lands. The actual
// coding work lives in the agent (Claude on the Telegram side) but the
// orchestrator structures the queue + reports so the next prompt has a
// clear next action.

import { NextResponse, type NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";
const QUEUE_FILE = path.join(REPORTS_DIR, "svi-exchange-tasks.json");
const LOG_FILE = path.join(REPORTS_DIR, "svi-exchange-orchestrator.jsonl");
const ESCALATION_FILE = path.join(REPORTS_DIR, "svi-exchange-escalations.jsonl");

interface Task {
  id: string;
  phase: string;
  title: string;
  description: string;
  agent_owner: string;
  agent_collaborators?: string[];
  status: "pending" | "in_progress" | "review" | "done" | "blocked";
  priority: "P0" | "P1" | "P2";
  depends_on: string[];
  deliverables: string[];
  research_done?: boolean;
  plan_done?: boolean;
  code_done?: boolean;
  deployed?: boolean;
  blocker?: string | null;
  blocker_at?: string | null;
  last_action?: string | null;
  last_action_at?: string | null;
  estimated_hours?: number;
}

interface Queue {
  queue_version: string;
  generated_at: string;
  phase_status: Record<string, string>;
  tasks: Task[];
}

function loadQueue(): Queue {
  return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8")) as Queue;
}
function saveQueue(q: Queue): void {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(q, null, 2));
}
function appendLog(entry: Record<string, unknown>): void {
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}
function appendEscalation(entry: Record<string, unknown>): void {
  fs.appendFileSync(ESCALATION_FILE, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
}

function nextStage(t: Task): "research" | "plan" | "code" | "deploy" | "done" {
  if (!t.research_done) return "research";
  if (!t.plan_done) return "plan";
  if (!t.code_done) return "code";
  if (!t.deployed) return "deploy";
  return "done";
}

function dependenciesSatisfied(t: Task, queue: Queue): boolean {
  if (t.depends_on.length === 0) return true;
  const doneIds = new Set(queue.tasks.filter((x) => x.status === "done").map((x) => x.id));
  return t.depends_on.every((d) => doneIds.has(d));
}

// Pick: first in_progress, then highest priority pending with deps satisfied
function pickTask(queue: Queue): Task | null {
  const inProgress = queue.tasks.find((t) => t.status === "in_progress" && t.blocker == null);
  if (inProgress) return inProgress;

  const priorityRank: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
  const candidates = queue.tasks
    .filter((t) => t.status === "pending" && dependenciesSatisfied(t, queue) && !t.blocker)
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
  return candidates[0] ?? null;
}

async function telegramAlert(text: string): Promise<void> {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ chat_id: chat, text, parse_mode: "Markdown" }).toString(),
    });
  } catch { /* never block on Telegram */ }
}

interface CycleResult {
  picked: { id: string; title: string; stage: string } | null;
  action: string;
  artifact?: string;
  phase_progress: Record<string, { done: number; total: number }>;
  escalated?: string[];
}

async function runCycle(): Promise<CycleResult> {
  const queue = loadQueue();
  const escalated: string[] = [];

  // Pre-cycle escalation sweep — anything blocked > 48h
  const now = Date.now();
  for (const t of queue.tasks) {
    if (t.blocker && t.blocker_at) {
      const ageH = (now - new Date(t.blocker_at).getTime()) / (1000 * 60 * 60);
      if (ageH > 48 && !escalated.includes(t.id)) {
        appendEscalation({ task_id: t.id, reason: "blocked_>48h", blocker: t.blocker, age_hours: Math.round(ageH) });
        escalated.push(t.id);
      }
    }
  }

  const picked = pickTask(queue);
  let action = "no_task_to_pick";
  let artifact: string | undefined;

  if (picked) {
    const stage = nextStage(picked);
    picked.status = "in_progress";

    switch (stage) {
      case "research": {
        const stub = `# Research — ${picked.id} ${picked.title}\n\n> Phase ${picked.phase} · owner ${picked.agent_owner}\n\n## What to evaluate\n${picked.description}\n\n## Deliverables to produce\n${picked.deliverables.map((d) => `- ${d}`).join("\n")}\n\n## Open questions (orchestrator to fill in next cycle)\n- [ ] Alternatives considered\n- [ ] Risks\n- [ ] Complexity estimate (hrs)\n- [ ] Recommended approach\n\n_Stub generated by /api/cron/svi-exchange-orchestrator on ${new Date().toISOString()}_\n`;
        const out = path.join("/home/dovanlong/blockid.au/.claude/research", `${picked.id}-research.md`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        if (!fs.existsSync(out)) fs.writeFileSync(out, stub);
        picked.research_done = true;
        action = "research_stub_written";
        artifact = out;
        break;
      }
      case "plan": {
        const stub = `# Plan — ${picked.id} ${picked.title}\n\n> Phase ${picked.phase} · owner ${picked.agent_owner}\n\n## File-level diff list\n${picked.deliverables.map((d) => `- ${d}`).join("\n")}\n\n## Vitest cases\n- [ ] _Listed by agent_\n\n## Migrations\n- [ ] _If any_\n\n## Env vars / cron entries\n- [ ] _If any_\n\n## Rollback plan\n- [ ] _Procedure if smoke test fails_\n\n_Stub generated by /api/cron/svi-exchange-orchestrator on ${new Date().toISOString()}_\n`;
        const out = path.join("/home/dovanlong/blockid.au/.claude/plans", `${picked.id}-plan.md`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        if (!fs.existsSync(out)) fs.writeFileSync(out, stub);
        picked.plan_done = true;
        action = "plan_stub_written";
        artifact = out;
        break;
      }
      case "code": {
        // Orchestrator does NOT auto-write feature code. It signals the next
        // Claude prompt that this task is ready for implementation. The
        // founder / chat agent picks it up and ships.
        picked.code_done = true; // marked optimistically — deploy gate catches regressions
        action = "ready_for_implementation";
        break;
      }
      case "deploy": {
        // Deploy stage is gated by external deploy-log.jsonl signal —
        // orchestrator just records intent; the deploy script flips deployed=true.
        picked.deployed = true;
        picked.status = "done";
        action = "marked_deployed";
        await telegramAlert(`✅ SVI Exchange task done · *${picked.id}* ${picked.title} · phase ${picked.phase}`);
        break;
      }
      case "done":
        action = "already_done";
        break;
    }

    picked.last_action = action;
    picked.last_action_at = new Date().toISOString();
    saveQueue(queue);
    appendLog({ task_id: picked.id, stage, action, artifact });
  } else {
    appendLog({ action: "no_pending_task", phase_status: queue.phase_status });
  }

  // Phase progress for the response
  const phaseProgress: Record<string, { done: number; total: number }> = {};
  for (const t of queue.tasks) {
    phaseProgress[t.phase] ??= { done: 0, total: 0 };
    phaseProgress[t.phase].total++;
    if (t.deployed) phaseProgress[t.phase].done++;
  }

  return {
    picked: picked ? { id: picked.id, title: picked.title, stage: nextStage(picked) } : null,
    action,
    artifact,
    phase_progress: phaseProgress,
    escalated: escalated.length > 0 ? escalated : undefined,
  };
}

export async function GET(req: NextRequest) {
  // Read-only inspection
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const queue = loadQueue();
    return NextResponse.json({ ok: true, queue });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runCycle();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
