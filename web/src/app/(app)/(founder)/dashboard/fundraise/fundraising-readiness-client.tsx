"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronRight, TrendingUp, AlertCircle } from "lucide-react";

interface ChecklistItem {
  id: string;
  category: string;
  item: string;
  weight: number;
  completed: boolean;
  relevantForStage: boolean;
}

interface Gap {
  id: string;
  category: string;
  item: string;
  weight: number;
  impact: string;
}

interface Comparable {
  stage: string;
  range: string;
  medianValuation: string;
  medianRaise: string;
  equity: string;
  investors: string;
  examples: string[];
}

interface ReadinessData {
  readinessScore: number;
  readinessTier: string;
  readinessBadge: string;
  currentStage: string;
  sviScore: number;
  completedCount: number;
  totalCount: number;
  checklist: Record<string, ChecklistItem[]>;
  priorityGaps: Gap[];
  comparables: Comparable[];
  targets: { preSeedReady: number; seedReady: number; seriesAReady: number };
}

const TIER_COLORS: Record<string, string> = {
  "not-ready": "text-red-600 bg-red-50 border-red-200",
  "early": "text-amber-600 bg-amber-50 border-amber-200",
  "getting-ready": "text-blue-600 bg-blue-50 border-blue-200",
  "investor-ready": "text-emerald-600 bg-emerald-50 border-emerald-200",
};

const CATEGORY_ICONS: Record<string, string> = {
  Team: "👥",
  Product: "🚀",
  Traction: "📈",
  Market: "🌏",
  Legal: "⚖️",
  Financials: "💰",
  Pitch: "🎯",
};

export function FundraisingReadinessClient() {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/fundraise/readiness")
      .then(r => r.json())
      .then(d => {
        if (d.ok) setData(d);
        else setError(d.error ?? "Failed to load");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error ?? "Failed to load readiness data"}
      </div>
    );
  }

  const tierColorClass = TIER_COLORS[data.readinessTier] ?? TIER_COLORS["early"];
  const barWidth = `${data.readinessScore}%`;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Fundraising Readiness</h1>
        <p className="mt-1 text-sm text-ink-500">
          AU investor-readiness checklist tailored for your current stage
        </p>
      </div>

      {/* Score card */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-ink-400">Readiness Score</p>
            <p className="mt-1 text-5xl font-bold text-ink-900">{data.readinessScore}<span className="text-2xl text-ink-400">/100</span></p>
            <span className={`mt-2 inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${tierColorClass}`}>
              {data.readinessBadge}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-400">Current Stage</p>
            <p className="text-lg font-semibold text-ink-800 capitalize">{data.currentStage.replace("-", " ")}</p>
            <p className="text-xs text-ink-400 mt-1">SVI Score: <span className="font-medium text-ink-700">{data.sviScore}/100</span></p>
            <p className="text-xs text-ink-400">{data.completedCount}/{data.totalCount} items complete</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex justify-between text-xs text-ink-400 mb-1">
            <span>Progress</span>
            <span>{data.readinessScore}%</span>
          </div>
          <div className="h-3 rounded-full bg-surface-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
              style={{ width: barWidth }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-400">
            <span>Pre-Seed Ready ({data.targets.preSeedReady}%)</span>
            <span>Seed Ready ({data.targets.seedReady}%)</span>
            <span>Series A Ready ({data.targets.seriesAReady}%)</span>
          </div>
        </div>
      </div>

      {/* Priority gaps */}
      {data.priorityGaps.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">Top Priority Gaps</h2>
          </div>
          <div className="space-y-2">
            {data.priorityGaps.map(gap => (
              <div key={gap.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Circle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="text-xs text-ink-700 truncate">{gap.item}</span>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">
                  {gap.impact}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checklist by category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(data.checklist).map(([category, items]) => {
          const stageItems = items.filter(i => i.relevantForStage);
          if (stageItems.length === 0) return null;
          const doneCount = stageItems.filter(i => i.completed).length;
          return (
            <div key={category} className="rounded-xl border border-surface-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">{CATEGORY_ICONS[category] ?? "📋"}</span>
                  <h3 className="text-sm font-semibold text-ink-800">{category}</h3>
                </div>
                <span className="text-xs text-ink-400">{doneCount}/{stageItems.length}</span>
              </div>
              <div className="space-y-1.5">
                {stageItems.map(item => (
                  <div key={item.id} className="flex items-start gap-2">
                    {item.completed ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-ink-300 mt-0.5" />
                    )}
                    <span className={`text-xs leading-relaxed ${item.completed ? "text-ink-400 line-through" : "text-ink-700"}`}>
                      {item.item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* AU comparable raises */}
      <div className="rounded-2xl border border-surface-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-ink-800 mb-4">AU Comparable Raises</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.comparables.map(comp => (
            <div key={comp.stage} className="rounded-xl bg-surface-50 border border-surface-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-ink-800">{comp.stage}</span>
                <span className="text-xs font-medium text-brand-600">{comp.range}</span>
              </div>
              <div className="space-y-1 text-xs text-ink-500">
                <div className="flex justify-between">
                  <span>Median valuation</span>
                  <span className="font-medium text-ink-700">{comp.medianValuation}</span>
                </div>
                <div className="flex justify-between">
                  <span>Median raise</span>
                  <span className="font-medium text-ink-700">{comp.medianRaise}</span>
                </div>
                <div className="flex justify-between">
                  <span>Typical equity</span>
                  <span className="font-medium text-ink-700">{comp.equity}</span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-surface-200">
                <p className="text-[10px] text-ink-400">Key investors: {comp.investors}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl bg-ink-950 text-white p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold">Improve your SVI score to unlock better valuations</p>
          <p className="text-sm text-slate-400 mt-1">Complete your startup profile to auto-fill more checklist items</p>
        </div>
        <a
          href="/score"
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold hover:bg-brand-700 transition-colors"
        >
          Update SVI Score <ChevronRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
