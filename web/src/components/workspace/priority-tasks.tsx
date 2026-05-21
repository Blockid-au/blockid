"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Clock, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriorityTask {
  id: string;
  priority: "P0" | "P1" | "P2";
  title: string;
  why: string;
  time: string;
  href: string;
  ctaLabel: string;
  completed: boolean;
}

// Generate tasks from SVI analysis gaps
export function generatePriorityTasks(analysis: any, stage: number): PriorityTask[] {
  const tasks: PriorityTask[] = [];

  // Always start with the most impactful evidence gaps
  const gaps = analysis?.evidenceGaps ?? [];
  const p0Gaps = gaps.filter((g: any) => g.priority === "P0");
  const p1Gaps = gaps.filter((g: any) => g.priority === "P1");

  // Map gaps to actionable tasks with links
  const gapToTask = (gap: any, idx: number): PriorityTask => ({
    id: `gap-${idx}`,
    priority: gap.priority,
    title: gap.label,
    why: gap.action,
    time: gap.priority === "P0" ? "< 30 min" : "1-2 hours",
    href: "/workspace/evidence",
    ctaLabel: "Add Evidence",
    completed: false,
  });

  // P0 tasks first
  p0Gaps.slice(0, 2).forEach((g: any, i: number) => tasks.push(gapToTask(g, i)));

  // Stage-specific tasks
  if (stage <= 1) {
    tasks.push({
      id: "stage-pitch",
      priority: "P1",
      title: "Create your pitch deck",
      why: "Investors expect a 12-slide deck even at pre-seed",
      time: "2-3 hours",
      href: "/workspace/data-room",
      ctaLabel: "Use Template",
      completed: false,
    });
  }

  if (stage <= 2 && !analysis?.signals?.hasCapTable) {
    tasks.push({
      id: "stage-captable",
      priority: "P1",
      title: "Set up your cap table",
      why: "Document who owns what before your first investor meeting",
      time: "30 min",
      href: "/workspace/cap-table",
      ctaLabel: "Build Cap Table",
      completed: false,
    });
  }

  if (!analysis?.signals?.hasWebsite) {
    tasks.push({
      id: "stage-website",
      priority: "P1",
      title: "Add your website URL",
      why: "A public website proves market presence and boosts your PTD score",
      time: "5 min",
      href: "/workspace/evidence",
      ctaLabel: "Add URL",
      completed: false,
    });
  }

  // P1 gaps
  p1Gaps.slice(0, 2).forEach((g: any, i: number) => tasks.push(gapToTask(g, i + 10)));

  return tasks.slice(0, 5);
}

interface Props {
  tasks: PriorityTask[];
  className?: string;
}

export function PriorityTasks({ tasks, className }: Props) {
  const [completed, setCompleted] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const progress = tasks.length > 0 ? Math.round((completed.size / tasks.length) * 100) : 0;

  if (tasks.length === 0) return null;

  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden", className)}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-900">Your Priority Tasks</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 rounded-full bg-surface-200 overflow-hidden">
            <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-ink-500">{completed.size}/{tasks.length}</span>
        </div>
      </div>

      {/* Task list */}
      <div className="divide-y divide-surface-100">
        {tasks.map(task => {
          const isDone = completed.has(task.id);
          return (
            <div key={task.id} className={cn("px-5 py-3.5 flex items-start gap-3 transition-colors", isDone && "bg-surface-50")}>
              <button type="button" onClick={() => toggle(task.id)} className="mt-0.5 shrink-0 cursor-pointer">
                {isDone
                  ? <CheckCircle2 strokeWidth={1.75} className="h-5 w-5 text-emerald-500" />
                  : <Circle strokeWidth={1.75} className="h-5 w-5 text-surface-300 hover:text-brand-400 transition-colors" />
                }
              </button>
              <div className={cn("flex-1 min-w-0", isDone && "opacity-50")}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                    task.priority === "P0" ? "bg-red-50 text-red-600" :
                    task.priority === "P1" ? "bg-amber-50 text-amber-600" :
                    "bg-surface-100 text-ink-500"
                  )}>{task.priority}</span>
                  <span className={cn("text-sm font-medium text-ink-800", isDone && "line-through")}>{task.title}</span>
                </div>
                <p className="text-xs text-ink-500 mt-0.5">{task.why}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-ink-400">
                    <Clock strokeWidth={1.75} className="h-3 w-3" /> {task.time}
                  </span>
                  {!isDone && (
                    <Link href={task.href} className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors">
                      {task.ctaLabel} <ArrowRight strokeWidth={2} className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
