// /dashboard/admin/svi-exchange — orchestration cockpit.
// Shows the task queue, last cycle logs, escalations, phase progress.
// Admin-only.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import * as fs from "fs";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Circle, Clock, Rocket } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "SVI Exchange Orchestration · Admin",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const REPORTS_DIR = "/home/dovanlong/blockid.au/web/content/reports";

interface Task {
  id: string;
  phase: string;
  title: string;
  description: string;
  agent_owner: string;
  status: string;
  priority: string;
  depends_on: string[];
  deliverables: string[];
  research_done?: boolean;
  plan_done?: boolean;
  code_done?: boolean;
  deployed?: boolean;
  blocker?: string | null;
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

function loadQueue(): Queue | null {
  try {
    return JSON.parse(fs.readFileSync(`${REPORTS_DIR}/svi-exchange-tasks.json`, "utf8")) as Queue;
  } catch {
    return null;
  }
}

function loadJsonl(file: string, lastN: number): Array<Record<string, unknown>> {
  try {
    const all = fs.readFileSync(`${REPORTS_DIR}/${file}`, "utf8")
      .split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean) as Array<Record<string, unknown>>;
    return all.slice(-lastN).reverse();
  } catch { return []; }
}

const PRIORITY_BG: Record<string, string> = {
  P0: "bg-red-100 text-red-700",
  P1: "bg-amber-100 text-amber-700",
  P2: "bg-blue-100 text-blue-700",
};

const STATUS_BG: Record<string, string> = {
  pending: "bg-ink-100 text-ink-600",
  in_progress: "bg-blue-100 text-blue-700",
  review: "bg-purple-100 text-purple-700",
  done: "bg-emerald-100 text-emerald-700",
  blocked: "bg-rose-100 text-rose-700",
};

function StageBadge({ label, done }: { label: string; done?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${done ? "bg-emerald-100 text-emerald-700" : "bg-ink-50 text-ink-400"}`}>
      {done ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Circle className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

export default async function SviExchangePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/svi-exchange");
  if (user.email !== "admin@blockid.au" && user.role !== "admin") redirect("/dashboard");

  const queue = loadQueue();
  const log = loadJsonl("svi-exchange-orchestrator.jsonl", 20);
  const escalations = loadJsonl("svi-exchange-escalations.jsonl", 10);

  if (!queue) {
    return (
      <WorkspaceLayout user={user}>
        <div className="max-w-3xl mx-auto p-8 text-center">
          <p className="text-sm text-muted-foreground">Queue file not found. Seed it at content/reports/svi-exchange-tasks.json.</p>
        </div>
      </WorkspaceLayout>
    );
  }

  const phaseProgress = new Map<string, { done: number; total: number }>();
  for (const t of queue.tasks) {
    const p = phaseProgress.get(t.phase) ?? { done: 0, total: 0 };
    p.total++;
    if (t.deployed) p.done++;
    phaseProgress.set(t.phase, p);
  }
  const totalDone = queue.tasks.filter((t) => t.deployed).length;
  const totalInProgress = queue.tasks.filter((t) => t.status === "in_progress").length;
  const totalBlocked = queue.tasks.filter((t) => t.blocker).length;

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/dashboard/admin/30day" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
            <ArrowLeft className="h-3 w-3" /> Back
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2 mt-2">
            <Rocket className="h-6 w-6 text-purple-600" />
            SVI Exchange Orchestration
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ring-1 ring-amber-200">Beta</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl leading-relaxed">
            Autonomous orchestration cockpit for startupvalueindex.com. Cron <code className="bg-muted px-1 py-0.5 rounded text-[11px]">/api/cron/svi-exchange-orchestrator</code> runs every 6h and advances one task per cycle. Goal doc: <code className="bg-muted px-1 py-0.5 rounded text-[11px]">.claude/goals/svi-exchange-orchestration.md</code>.
          </p>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total tasks", value: queue.tasks.length, color: "text-foreground" },
            { label: "Deployed", value: totalDone, color: "text-emerald-700" },
            { label: "In progress", value: totalInProgress, color: "text-blue-700" },
            { label: "Blocked", value: totalBlocked, color: "text-rose-700" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Phase progress */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-3">Phase progress</h3>
          <div className="space-y-2">
            {Array.from(phaseProgress.entries()).sort().map(([phase, { done, total }]) => {
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={phase} className="flex items-center gap-3">
                  <span className="text-xs font-mono font-bold text-foreground w-12">{phase}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums w-16 text-right">{done} / {total}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Last cycle log */}
        {log.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-blue-500" /> Last 5 orchestrator cycles
            </h3>
            <ul className="space-y-1.5">
              {log.slice(0, 5).map((entry, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-3">
                  <Clock className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="font-mono text-muted-foreground shrink-0">{String(entry.ts).slice(11, 16)}</span>
                  <span className="font-mono font-bold shrink-0">{String(entry.task_id ?? "—")}</span>
                  <span className="text-muted-foreground">{String(entry.stage ?? "")}</span>
                  <span>→ {String(entry.action)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Escalations */}
        {escalations.length > 0 && (
          <div className="rounded-xl border border-rose-200 dark:border-rose-700/50 bg-rose-50/30 dark:bg-rose-950/15 p-5">
            <h3 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Escalations
            </h3>
            <ul className="space-y-1.5">
              {escalations.map((e, i) => (
                <li key={i} className="text-xs">
                  <span className="font-mono">{String(e.ts).slice(0, 16)}</span> · <strong>{String(e.task_id)}</strong> · {String(e.reason)} ({String(e.age_hours ?? "?")}h)
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Task queue */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30">
            <h3 className="text-sm font-bold uppercase tracking-wider">Task queue ({queue.tasks.length} tasks)</h3>
          </div>
          <div className="divide-y divide-border">
            {queue.tasks.map((t) => {
              const stages = (["research", "plan", "code", "deploy"] as const);
              const stageDone = stages.map((s) => Boolean(t[`${s === "research" ? "research_done" : s === "plan" ? "plan_done" : s === "code" ? "code_done" : "deployed"}` as keyof Task]));
              return (
                <div key={t.id} className="p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-foreground">{t.id}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORITY_BG[t.priority] ?? ""}`}>{t.priority}</span>
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BG[t.status] ?? ""}`}>{t.status.replace("_", " ")}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{t.phase}</span>
                        <span className="text-[10px] text-blue-700">{t.agent_owner}</span>
                      </div>
                      <p className="text-sm font-semibold mt-1.5">{t.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {stages.map((s, i) => <StageBadge key={s} label={s} done={stageDone[i]} />)}
                        {t.depends_on.length > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-2">
                            ↳ depends on: <span className="font-mono">{t.depends_on.join(", ")}</span>
                          </span>
                        )}
                        {t.estimated_hours != null && (
                          <span className="text-[10px] text-muted-foreground">~{t.estimated_hours}h</span>
                        )}
                      </div>
                      {t.last_action && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 italic">
                          Last: {t.last_action} · {t.last_action_at?.slice(0, 16) ?? ""}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Manual trigger */}
        <details className="rounded-xl border border-dashed border-border bg-muted/10 p-4">
          <summary className="text-xs font-bold text-foreground cursor-pointer">Manual trigger</summary>
          <p className="text-xs text-muted-foreground mt-2">
            POST to <code className="bg-muted px-1 py-0.5 rounded text-[11px]">/api/cron/svi-exchange-orchestrator</code> with header <code className="bg-muted px-1 py-0.5 rounded text-[11px]">Authorization: Bearer $CRON_SECRET</code> to advance one cycle right now. Cron runs every 6h automatically.
          </p>
        </details>
      </div>
    </WorkspaceLayout>
  );
}
