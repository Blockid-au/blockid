// Project State — single source of truth for the CEO-led self-upgrade loop.
//
// The C-Level agents research their domains (agent-research → agent_knowledge_base),
// the CEO agent turns that research into an IMPLEMENTING PLAN, the platform ships
// the plan via agent-deploy, and the results are recorded back here as:
//   • plan         — prioritised tasks decided by the CEO
//   • milestones    — shipped batches, each tied to a version
//   • architecture  — a living summary + dated change notes
//   • version       — semantic version of the project
//
// This file lives under content/ so writing it NEVER triggers a rebuild/restart
// (agent-deploy only rebuilds on src/ changes) — safe to update 24/7.

import * as fs from "fs";

const WEB_DIR = process.env.BLOCKID_WEB_DIR ?? "/home/dovanlong/blockid.au/web";
const REPORTS_DIR = `${WEB_DIR}/content/reports`;

export const PROJECT_STATE_FILE = `${REPORTS_DIR}/project-state.json`;
export const PLAN_MD_FILE = `${REPORTS_DIR}/implementing-plan.md`;
export const ARCHITECTURE_MD_FILE = `${REPORTS_DIR}/architecture.md`;
export const PACKAGE_JSON_FILE = `${WEB_DIR}/package.json`;

export type VersionImpact = "patch" | "minor" | "major";
export type TaskStatus = "pending" | "in_progress" | "done" | "failed";

export interface PlanTask {
  id: string;
  agent: string;
  title: string;
  rationale: string;
  versionImpact: VersionImpact;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string;
  commit?: string;
}

export interface Milestone {
  id: string;
  title: string;
  version: string;
  completedAt: string;
  taskIds: string[];
}

export interface ProjectState {
  version: string;
  updatedAt: string;
  architecture: { summary: string; lastReviewedAt: string; notes: string[] };
  plan: { decidedAt: string; decidedBy: string; tasks: PlanTask[] };
  milestones: Milestone[];
  history: { ts: string; action: string; version: string; note: string }[];
}

// ── Version ─────────────────────────────────────────────────────────────

export function bumpVersion(version: string, impact: VersionImpact): string {
  const [maj, min, pat] = version.split(".").map(n => parseInt(n, 10) || 0);
  if (impact === "major") return `${maj + 1}.0.0`;
  if (impact === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

const IMPACT_RANK: Record<VersionImpact, number> = { patch: 0, minor: 1, major: 2 };

export function maxImpact(impacts: VersionImpact[]): VersionImpact {
  return impacts.reduce<VersionImpact>((acc, i) => (IMPACT_RANK[i] > IMPACT_RANK[acc] ? i : acc), "patch");
}

function packageVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(PACKAGE_JSON_FILE, "utf8")).version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

/** Sync the bumped version back into package.json (a src-level change → deploys off-peak). */
export function syncPackageVersion(version: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_FILE, "utf8"));
    if (pkg.version === version) return false;
    pkg.version = version;
    fs.writeFileSync(PACKAGE_JSON_FILE, JSON.stringify(pkg, null, 2) + "\n");
    return true;
  } catch {
    return false;
  }
}

// ── Load / Save ─────────────────────────────────────────────────────────

export function loadProjectState(): ProjectState {
  try {
    const s = JSON.parse(fs.readFileSync(PROJECT_STATE_FILE, "utf8")) as ProjectState;
    s.plan ??= { decidedAt: "", decidedBy: "ceo", tasks: [] };
    s.milestones ??= [];
    s.history ??= [];
    s.architecture ??= { summary: "", lastReviewedAt: "", notes: [] };
    s.version ??= packageVersion();
    return s;
  } catch {
    return {
      version: packageVersion(),
      updatedAt: new Date().toISOString(),
      architecture: { summary: "BlockID.au — Startup Navigation System (SCN). Next.js standalone, Supabase, zero-downtime deploys.", lastReviewedAt: "", notes: [] },
      plan: { decidedAt: "", decidedBy: "ceo", tasks: [] },
      milestones: [],
      history: [],
    };
  }
}

export function saveProjectState(state: ProjectState): void {
  state.updatedAt = new Date().toISOString();
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(PROJECT_STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  fs.writeFileSync(PLAN_MD_FILE, renderPlanMarkdown(state));
  fs.writeFileSync(ARCHITECTURE_MD_FILE, renderArchitectureMarkdown(state));
}

// ── Task ids (deterministic — no Math.random in this runtime) ────────────

export function nextTaskId(state: ProjectState): string {
  const n = state.plan.tasks.length + state.milestones.reduce((s, m) => s + m.taskIds.length, 0) + 1;
  return `T${String(n).padStart(4, "0")}`;
}

export function nextMilestoneId(state: ProjectState): string {
  return `M${String(state.milestones.length + 1).padStart(3, "0")}`;
}

// ── Rendering (human-readable mirrors) ───────────────────────────────────

const STATUS_ICON: Record<TaskStatus, string> = { pending: "⬜", in_progress: "🔄", done: "✅", failed: "❌" };

export function renderPlanMarkdown(s: ProjectState): string {
  const active = s.plan.tasks.filter(t => t.status === "pending" || t.status === "in_progress");
  const recent = s.plan.tasks.filter(t => t.status === "done" || t.status === "failed").slice(-10).reverse();
  const lines: string[] = [
    `# Implementing Plan — BlockID.au`,
    ``,
    `**Version:** v${s.version}  ·  **Updated:** ${s.updatedAt}  ·  **Decided by:** ${s.plan.decidedBy} (${s.plan.decidedAt || "—"})`,
    ``,
    `> CEO-led self-upgrade loop: C-Level research → CEO decision → implementation → version/milestone/architecture update. Heavy/deploy work runs off-peak (AEST 22:00–06:00) to keep blockid.au available 24/7.`,
    ``,
    `## Active tasks`,
    active.length ? `| ID | Agent | Task | Impact | Status |\n|----|-------|------|--------|--------|` : `_None — awaiting next CEO decision._`,
    ...active.map(t => `| ${t.id} | ${t.agent.toUpperCase()} | ${t.title} | ${t.versionImpact} | ${STATUS_ICON[t.status]} ${t.status} |`),
    ``,
    `## Recently shipped`,
    recent.length ? recent.map(t => `- ${STATUS_ICON[t.status]} \`${t.id}\` **${t.agent.toUpperCase()}** — ${t.title}${t.commit ? ` (\`${t.commit}\`)` : ""}`).join("\n") : `_Nothing shipped yet._`,
    ``,
    `## Milestones`,
    s.milestones.length ? s.milestones.slice(-12).reverse().map(m => `- **${m.id}** v${m.version} — ${m.title} (${m.completedAt.slice(0, 10)}, ${m.taskIds.length} tasks)`).join("\n") : `_No milestones yet._`,
    ``,
  ];
  return lines.join("\n");
}

export function renderArchitectureMarkdown(s: ProjectState): string {
  return [
    `# Architecture — BlockID.au (living)`,
    ``,
    `**Version:** v${s.version}  ·  **Last reviewed:** ${s.architecture.lastReviewedAt || "—"}`,
    ``,
    `## Summary`,
    s.architecture.summary || "_Not yet summarised._",
    ``,
    `## Change notes`,
    s.architecture.notes.length ? s.architecture.notes.slice(-20).reverse().map(n => `- ${n}`).join("\n") : `_No architecture changes recorded._`,
    ``,
  ].join("\n");
}
