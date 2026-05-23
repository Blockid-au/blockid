"use client";

import * as React from "react";
import Link from "next/link";
import { Calculator, Upload, ArrowRight } from "lucide-react";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { cn } from "@/lib/utils";

interface Props {
  analysis: SVIAnalysis;
}

export function EvidenceImpactCalc({ analysis }: Props) {
  const gaps = analysis.evidenceGaps ?? [];
  const [selected, setSelected] = React.useState<Set<number>>(new Set());

  if (gaps.length === 0) return null;

  const totalImpact = Array.from(selected).reduce(
    (sum, i) => sum + (gaps[i]?.impact ?? 0),
    0,
  );
  const projectedSVI = analysis.totalSVI + totalImpact;

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-200">
        <div className="flex items-center gap-2">
          <Calculator strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-900">Evidence Impact Calculator</h3>
        </div>
        <p className="text-[11px] text-ink-500 mt-0.5">See what uploading evidence does to your score</p>
      </div>

      {/* Projected bar */}
      <div className="px-5 py-3 bg-surface-50 border-b border-surface-200">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-ink-500">Current SVI</span>
          <span className="text-xs font-mono font-semibold text-ink-700">{analysis.totalSVI}</span>
        </div>
        <div className="h-3 rounded-full bg-surface-200 overflow-hidden relative">
          {/* Current */}
          <div
            className="h-full rounded-full bg-brand-400 transition-all duration-500 absolute left-0 top-0"
            style={{ width: `${Math.min((analysis.totalSVI / 250) * 100, 100)}%` }}
          />
          {/* Projected overlay */}
          {totalImpact > 0 && (
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-500 absolute left-0 top-0"
              style={{ width: `${Math.min((projectedSVI / 250) * 100, 100)}%` }}
            />
          )}
        </div>
        {totalImpact > 0 && (
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-emerald-600 font-medium">Projected SVI</span>
            <span className="text-xs font-mono font-bold text-emerald-600">{projectedSVI} (+{totalImpact})</span>
          </div>
        )}
      </div>

      {/* Evidence gaps checklist */}
      <div className="divide-y divide-surface-100">
        {gaps.slice(0, 6).map((gap, i) => {
          const checked = selected.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-50 transition-colors cursor-pointer"
            >
              <div
                className={cn(
                  "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                  checked
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-surface-300",
                )}
              >
                {checked && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-xs font-medium", checked ? "text-emerald-700" : "text-ink-800")}>{gap.label}</p>
                <p className="text-[11px] text-ink-500 truncate">{gap.action}</p>
              </div>
              <span className={cn(
                "text-[10px] font-mono font-semibold shrink-0",
                gap.priority === "P0" ? "text-red-500" : gap.priority === "P1" ? "text-amber-500" : "text-ink-400",
              )}>
                +{gap.impact ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* CTA */}
      <div className="px-5 py-3 border-t border-surface-200">
        <Link
          href="/workspace/evidence"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Upload strokeWidth={1.75} className="h-4 w-4" />
          Upload Evidence
          <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
