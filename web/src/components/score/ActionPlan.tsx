"use client";

// Wave 28C — Personalised 30-Day Action Plan.
//
// Mounted below the SVI result on `/score` and `/workspace/business-report`.
// On mount, if `initialTasks` is not supplied, POSTs to
// /api/svi/action-plan/generate to fetch (or generate) the plan. Each task is
// individually checkable; toggling calls /api/svi/action-plan/[id]/toggle and
// updates the completion percentage bar at the top.

import * as React from "react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type SviDim = "ftv" | "mpc" | "ptd" | "tre" | "cgh" | "iri" | "lco" | "svm";

export interface ActionTaskDto {
  id: number;
  title: string;
  detail: string;
  criterion: string;
  dim: SviDim | string;
  target_delta_points: number;
  order_index: number;
  completed_at: string | null;
  evidence_url: string | null;
}

export interface ActionPlanDto {
  id: number;
  svi_run_id: string;
  startup_id: string | null;
  created_at: string;
  meta?: Record<string, unknown>;
}

interface Props {
  /** Set to null / undefined to render nothing (spec: gated behind sviRunId != null). */
  sviRunId: string | null | undefined;
  initialPlan?: ActionPlanDto | null;
  initialTasks?: ActionTaskDto[] | null;
  className?: string;
}

// ── Dim label + colour tokens ───────────────────────────────────────────────

const DIM_LABEL: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision",
};

const DIM_BADGE: Record<string, string> = {
  ftv: "bg-indigo-50 text-indigo-700 border-indigo-200",
  mpc: "bg-emerald-50 text-emerald-700 border-emerald-200",
  ptd: "bg-sky-50 text-sky-700 border-sky-200",
  tre: "bg-amber-50 text-amber-700 border-amber-200",
  cgh: "bg-violet-50 text-violet-700 border-violet-200",
  iri: "bg-rose-50 text-rose-700 border-rose-200",
  lco: "bg-slate-100 text-slate-700 border-slate-200",
  svm: "bg-teal-50 text-teal-700 border-teal-200",
};

// ── Component ───────────────────────────────────────────────────────────────

export function ActionPlan({ sviRunId, initialPlan, initialTasks, className }: Props) {
  const [plan, setPlan] = React.useState<ActionPlanDto | null>(initialPlan ?? null);
  const [tasks, setTasks] = React.useState<ActionTaskDto[]>(initialTasks ?? []);
  const [loading, setLoading] = React.useState<boolean>(!initialTasks || initialTasks.length === 0);
  const [error, setError] = React.useState<string | null>(null);
  const [pendingIds, setPendingIds] = React.useState<Set<number>>(new Set());
  const requestedRef = React.useRef(false);

  React.useEffect(() => {
    if (initialTasks && initialTasks.length > 0) return;
    if (!sviRunId || requestedRef.current) return;
    const runId: string = sviRunId;
    requestedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/svi/action-plan/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ sviRunId: runId }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          plan?: ActionPlanDto;
          tasks?: ActionTaskDto[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok || !data.plan || !data.tasks) {
          setError(data.error ?? "Could not generate your action plan.");
          setLoading(false);
          return;
        }
        setPlan(data.plan);
        setTasks(data.tasks);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setError("Network error — try again in a moment.");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sviRunId, initialTasks]);

  const total = tasks.length;
  const done = tasks.filter((t) => !!t.completed_at).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const totalTargetDelta = tasks.reduce((sum, t) => sum + (Number(t.target_delta_points) || 0), 0);

  const onToggle = React.useCallback(
    async (task: ActionTaskDto) => {
      if (!plan) return;
      if (pendingIds.has(task.id)) return;
      const nextCompleted = !task.completed_at;
      setPendingIds((prev) => {
        const s = new Set(prev);
        s.add(task.id);
        return s;
      });
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? { ...t, completed_at: nextCompleted ? new Date().toISOString() : null }
            : t,
        ),
      );
      try {
        const res = await fetch(`/api/svi/action-plan/${plan.id}/toggle`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ taskId: task.id, completed: nextCompleted }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          task?: ActionTaskDto;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.task) {
          // Roll back optimistic update
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id ? { ...t, completed_at: task.completed_at } : t,
            ),
          );
        } else {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...data.task! } : t)));
        }
      } catch {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, completed_at: task.completed_at } : t)),
        );
      } finally {
        setPendingIds((prev) => {
          const s = new Set(prev);
          s.delete(task.id);
          return s;
        });
      }
    },
    [plan, pendingIds],
  );

  if (!sviRunId) return null;

  return (
    <section
      className={cn(
        "mt-8 rounded-2xl border border-surface-200 bg-white p-6 md:p-8 shadow-sm",
        className,
      )}
      aria-label="Personalised 30-day action plan"
    >
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
            Next 30 days
          </p>
          <h2 className="mt-1 text-xl md:text-2xl font-semibold text-ink-800">
            Your 30-day action plan
          </h2>
          <p className="mt-1 text-sm text-ink-500 max-w-2xl">
            Five tasks matched to your two weakest dimensions. Tick them off as you
            go — on your next re-score we&apos;ll show how much of the projected
            {" "}+{totalTargetDelta.toFixed(1)} points you actually captured.
          </p>
        </div>
        {total > 0 && (
          <div className="text-right">
            <div className="text-2xl font-bold text-ink-800">
              {done}<span className="text-ink-400">/{total}</span>
            </div>
            <div className="text-xs text-ink-500">done · {pct}%</div>
          </div>
        )}
      </header>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mt-4 h-2 w-full rounded-full bg-surface-100 overflow-hidden" aria-hidden="true">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-brand-500" : "bg-brand-400",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Body */}
      <div className="mt-6">
        {loading && (
          <div className="flex items-center gap-3 text-sm text-ink-500 py-8 justify-center">
            <span
              className="inline-block h-4 w-4 rounded-full border-2 border-brand-300 border-t-transparent animate-spin"
              aria-hidden="true"
            />
            Generating your plan…
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {error}
          </div>
        )}

        {!loading && !error && tasks.length === 0 && (
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4 text-sm text-ink-500 text-center">
            No tasks generated yet. Re-run your SVI analysis to unlock the plan.
          </div>
        )}

        {!loading && !error && tasks.length > 0 && (
          <ul className="space-y-3">
            {tasks.map((task) => {
              const isDone = !!task.completed_at;
              const isPending = pendingIds.has(task.id);
              const dimKey = String(task.dim).toLowerCase();
              const dimLabel = DIM_LABEL[dimKey] ?? dimKey.toUpperCase();
              const dimBadge = DIM_BADGE[dimKey] ?? "bg-surface-100 text-ink-700 border-surface-200";
              return (
                <li
                  key={task.id}
                  className={cn(
                    "rounded-xl border p-4 md:p-5 transition-colors",
                    isDone
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-surface-200 bg-white hover:bg-surface-50/50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <label className="flex items-center cursor-pointer pt-0.5">
                      <input
                        type="checkbox"
                        checked={isDone}
                        disabled={isPending}
                        onChange={() => onToggle(task)}
                        aria-label={`Mark task complete: ${task.title}`}
                        className={cn(
                          "h-5 w-5 rounded border-surface-300 text-brand-600 focus:ring-brand-500",
                          isPending && "opacity-60",
                        )}
                      />
                    </label>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <h3
                          className={cn(
                            "text-sm md:text-base font-semibold",
                            isDone ? "text-ink-500 line-through" : "text-ink-800",
                          )}
                        >
                          {task.title}
                        </h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              dimBadge,
                            )}
                            title={`Targets: ${dimLabel}`}
                          >
                            {String(task.dim).toUpperCase()}
                          </span>
                          <span
                            className="inline-flex items-center rounded-full bg-brand-50 border border-brand-200 px-2 py-0.5 text-[10px] font-semibold text-brand-700"
                            title="Estimated SVI lift when complete"
                          >
                            +{Number(task.target_delta_points).toFixed(1)} pts
                          </span>
                        </div>
                      </div>
                      {task.detail && (
                        <p
                          className={cn(
                            "mt-1.5 text-sm leading-relaxed",
                            isDone ? "text-ink-400" : "text-ink-600",
                          )}
                        >
                          {task.detail}
                        </p>
                      )}
                      {task.criterion && (
                        <p className="mt-2 text-[11px] uppercase tracking-wide text-ink-400">
                          Criterion: <span className="text-ink-500 normal-case">{task.criterion}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
