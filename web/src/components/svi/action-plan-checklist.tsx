"use client";

import * as React from "react";
import { CheckCircle2, Circle, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

/**
 * ActionPlanChecklist — shows actionable items from report highlights or SVI nextActions.
 * Persists checked state to localStorage per slug (+ optional pageId).
 * Shows progress bar and SVI improvement estimate.
 *
 * Supports two call signatures:
 *   1. Simple:  actions: string[]                  (used inline per-page for highlights)
 *   2. Rich:    actions: Array<{ title, detail, impact }>  (used for analysis.nextActions)
 */

interface RichAction {
  title: string;
  detail: string;
  impact: string;
}

interface BaseProps {
  slug: string;
  sviBoost?: number;
}

interface SimpleProps extends BaseProps {
  pageId: string;
  actions: string[];
}

interface RichProps extends BaseProps {
  pageId?: string;
  actions: RichAction[];
}

export type ActionPlanProps = SimpleProps | RichProps;

function isRichActions(actions: string[] | RichAction[]): actions is RichAction[] {
  return actions.length > 0 && typeof actions[0] !== "string";
}

function storageKey(slug: string, pageId?: string) {
  return pageId ? `blockid_actions_${slug}_${pageId}` : `blockid_actions_${slug}`;
}

export function ActionPlanChecklist({ slug, pageId, actions, sviBoost }: ActionPlanProps) {
  const [checked, setChecked] = React.useState<boolean[]>(() => {
    if (typeof window === "undefined") return actions.map(() => false);
    try {
      const stored = localStorage.getItem(storageKey(slug, pageId));
      if (stored) {
        const parsed: boolean[] = JSON.parse(stored);
        // Ensure array length matches actions
        return actions.map((_, i) => parsed[i] ?? false);
      }
    } catch {
      // Ignore parse errors
    }
    return actions.map(() => false);
  });

  // Persist to localStorage whenever checked state changes
  React.useEffect(() => {
    try {
      localStorage.setItem(storageKey(slug, pageId), JSON.stringify(checked));
    } catch {
      // Ignore write errors (e.g. quota exceeded)
    }
  }, [checked, slug, pageId]);

  const completedCount = checked.filter(Boolean).length;
  const totalCount = actions.length;
  const allDone = completedCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const rich = isRichActions(actions);

  const toggle = (index: number) => {
    const wasChecked = checked[index];
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));

    // Track completion events (only when checking, not unchecking)
    if (!wasChecked) {
      const actionTitle = rich ? actions[index].title : actions[index];
      trackEvent("action_completed", { action: actionTitle });
    }
  };

  const markAllDone = () => {
    setChecked(actions.map(() => true));
  };

  const reset = () => {
    setChecked(actions.map(() => false));
  };

  if (actions.length === 0) return null;

  // ── Rich layout (analysis.nextActions with title/detail/impact) ──
  if (rich) {
    return (
      <div className="rounded-2xl border border-brand-200 bg-white p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink-800 flex items-center gap-2">
            <Sparkles strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            Your Action Plan
          </h3>
          <span className="text-xs text-brand-600 font-medium">
            {completedCount}/{totalCount} completed
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-surface-100 rounded-full mb-4 overflow-hidden">
          <div
            className={cn(
              "h-2 rounded-full transition-all duration-500",
              allDone ? "bg-emerald-500" : "bg-brand-600",
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* SVI boost estimate */}
        {sviBoost !== undefined && sviBoost > 0 && !allDone && (
          <p className="text-xs text-brand-700 mb-4">
            Complete all actions to boost your SVI by{" "}
            <span className="font-semibold">+{sviBoost} points</span>
          </p>
        )}
        {allDone && (
          <p className="text-xs text-emerald-700 mb-4 font-medium">
            All actions completed — great work!
          </p>
        )}

        {/* Action items */}
        <div className="divide-y divide-surface-100">
          {actions.map((action, i) => {
            const isDone = checked[i];
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                className="flex items-start gap-3 py-3 w-full text-left cursor-pointer group"
              >
                {isDone ? (
                  <CheckCircle2
                    strokeWidth={1.75}
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  />
                ) : (
                  <Circle
                    strokeWidth={1.75}
                    className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-500 transition-colors"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm font-medium transition-colors",
                      isDone
                        ? "text-ink-400 line-through"
                        : "text-ink-800 group-hover:text-ink-900",
                    )}
                  >
                    {action.title}
                  </p>
                  <p
                    className={cn(
                      "text-xs mt-0.5 transition-colors",
                      isDone ? "text-ink-300" : "text-ink-500",
                    )}
                  >
                    {action.detail}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-xs font-mono shrink-0 mt-0.5",
                    isDone ? "text-ink-300" : "text-teal-600",
                  )}
                >
                  {action.impact}
                </span>
              </button>
            );
          })}
        </div>

        {/* Actions row */}
        <div className="flex items-center gap-3 mt-4 pt-3 border-t border-surface-100">
          {!allDone && (
            <button
              type="button"
              onClick={markAllDone}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
            >
              <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />
              Mark all done
            </button>
          )}
          {completedCount > 0 && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700 transition-colors cursor-pointer"
            >
              <RotateCcw strokeWidth={1.75} className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Simple layout (string[] actions — per-page highlights) ──
  return (
    <div className="mt-6 rounded-xl border border-brand-200 bg-brand-50 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
        <h4 className="text-sm font-semibold text-ink-800">Action Plan</h4>
        <span className="text-[10px] uppercase tracking-wider text-brand-600 font-medium">
          {completedCount}/{totalCount} done
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="h-2 w-full rounded-full bg-surface-200 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              allDone ? "bg-emerald-500" : "bg-brand-500",
            )}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* SVI boost estimate */}
      {sviBoost !== undefined && sviBoost > 0 && (
        <p className="text-xs text-brand-700 mb-3">
          Complete these actions to gain{" "}
          <span className="font-semibold">+{sviBoost} SVI points</span>
        </p>
      )}

      {/* Checklist items */}
      <ul className="space-y-2 mb-4">
        {actions.map((action, i) => {
          const isDone = checked[i];
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                className="flex items-start gap-2.5 w-full text-left cursor-pointer group"
              >
                {isDone ? (
                  <CheckCircle2
                    strokeWidth={1.75}
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  />
                ) : (
                  <Circle
                    strokeWidth={1.75}
                    className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-500 transition-colors"
                  />
                )}
                <span
                  className={cn(
                    "text-sm leading-relaxed transition-colors",
                    isDone
                      ? "text-ink-400 line-through"
                      : "text-ink-700 group-hover:text-ink-800",
                  )}
                >
                  {action}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Actions row */}
      <div className="flex items-center gap-3">
        {!allDone && (
          <button
            type="button"
            onClick={markAllDone}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors cursor-pointer"
          >
            <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />
            Mark all done
          </button>
        )}
        {completedCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700 transition-colors cursor-pointer"
          >
            <RotateCcw strokeWidth={1.75} className="h-3 w-3" />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
