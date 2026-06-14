"use client";

import { useState, useEffect } from "react";
import { TrendingUp, CheckCircle2, Clock, ArrowRight, Zap } from "lucide-react";

interface UpgradeAction {
  priority: 1 | 2 | 3;
  action: string;
  sviBenefit: number;
  effort: "low" | "medium" | "high";
  cost: string;
  deadline?: string;
  completed?: boolean;
}

interface SviUpgradeRoadmapProps {
  currentSvi: number;
  targetSvi?: number;
  userEmail?: string;
}

const EFFORT_COLORS = {
  low: "text-emerald-600 bg-emerald-50",
  medium: "text-amber-600 bg-amber-50",
  high: "text-red-600 bg-red-50",
};

const PRIORITY_LABELS = {
  1: "Do now",
  2: "This week",
  3: "This month",
};

export function SviUpgradeRoadmap({ currentSvi, targetSvi = 75, userEmail }: SviUpgradeRoadmapProps) {
  const [actions, setActions] = useState<UpgradeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  useEffect(() => {
    async function loadActions() {
      try {
        const res = await fetch("/api/esop/score");
        const data = await res.json();
        if (data.ok && data.actions) {
          setActions(data.actions as UpgradeAction[]);
        } else {
          setActions(defaultActions());
        }
      } catch {
        setActions(defaultActions());
      } finally {
        setLoading(false);
      }
    }
    loadActions();
  }, []);

  function defaultActions(): UpgradeAction[] {
    return [
      { priority: 1, action: "Create 12% ESOP pool in BlockID cap table", sviBenefit: 8, effort: "medium", cost: "A$2-5K legal", deadline: "Before pitch" },
      { priority: 1, action: "Sign Founder Vesting Confirmation Deed", sviBenefit: 4, effort: "low", cost: "A$500-1K legal", deadline: "Before pitch" },
      { priority: 2, action: "Complete data room to 70%", sviBenefit: 3, effort: "medium", cost: "Founder time" },
      { priority: 2, action: "Get first paying customer (Founding 50)", sviBenefit: 5, effort: "medium", cost: "Marketing time" },
      { priority: 3, action: "Hire technical advisor or co-founder", sviBenefit: 6, effort: "high", cost: "ESOP grant" },
    ];
  }

  const totalBenefit = actions.filter((_, i) => !completed.has(i)).reduce((s, a) => s + a.sviBenefit, 0);
  const projectedSvi = Math.min(currentSvi + actions.filter((_, i) => !completed.has(i)).slice(0, 3).reduce((s, a) => s + a.sviBenefit, 0), 100);
  const gap = targetSvi - currentSvi;

  function toggle(i: number) {
    setCompleted(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  if (loading) {
    return <div className="rounded-xl border border-surface-200 bg-white p-4 animate-pulse h-48" />;
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2">
            <TrendingUp className="h-4 w-4 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-ink-900 text-sm">SVI Upgrade Roadmap</h3>
            <p className="text-xs text-ink-500">From {currentSvi} → target {targetSvi}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-ink-500">Projected (top 3)</p>
          <p className="text-lg font-bold text-brand-600">{projectedSvi}/100</p>
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 pt-3 pb-1">
        <div className="flex justify-between text-xs text-ink-500 mb-1">
          <span>Current: {currentSvi}</span>
          <span>Gap: {gap} points</span>
        </div>
        <div className="h-2 rounded-full bg-surface-100 relative">
          <div
            className="h-2 rounded-full bg-brand-500 transition-all"
            style={{ width: `${currentSvi}%` }}
          />
          <div
            className="absolute top-0 h-2 rounded-full bg-brand-200 transition-all"
            style={{ left: `${currentSvi}%`, width: `${Math.max(0, projectedSvi - currentSvi)}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-amber-400"
            style={{ left: `${targetSvi}%` }}
            title={`Target: ${targetSvi}`}
          />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-emerald-600">+{totalBenefit} pts available</span>
          <span className="text-amber-600">Target {targetSvi}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="divide-y divide-surface-50">
        {actions.slice(0, 5).map((action, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-surface-50 transition-colors ${completed.has(i) ? "opacity-50" : ""}`}
            onClick={() => toggle(i)}
          >
            <button className="mt-0.5 flex-shrink-0">
              {completed.has(i) ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-surface-300 hover:border-brand-400 transition-colors" />
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${completed.has(i) ? "line-through text-ink-400" : "text-ink-900"}`}>
                {action.action}
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                  <Zap className="h-3 w-3" />+{action.sviBenefit} SVI
                </span>
                <span className={`inline-flex items-center text-xs rounded-full px-2 py-0.5 ${EFFORT_COLORS[action.effort]}`}>
                  {action.effort}
                </span>
                {action.deadline && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                    <Clock className="h-3 w-3" />{action.deadline}
                  </span>
                )}
                <span className="text-xs text-ink-400">{action.cost}</span>
              </div>
            </div>
            <span className={`flex-shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${
              action.priority === 1 ? "bg-red-50 text-red-600" :
              action.priority === 2 ? "bg-amber-50 text-amber-600" :
              "bg-surface-100 text-ink-500"
            }`}>
              {PRIORITY_LABELS[action.priority]}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="px-5 py-3 bg-surface-50 border-t border-surface-100 flex items-center justify-between">
        <p className="text-xs text-ink-500">
          {completed.size} of {Math.min(actions.length, 5)} completed
        </p>
        <a
          href="/dashboard/esop"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Setup ESOP <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
