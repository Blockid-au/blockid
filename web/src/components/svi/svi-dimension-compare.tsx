"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DimensionValue {
  key: string;
  label: string;
  value: number;
}

interface DimensionCompareProps {
  current: DimensionValue[];
  previous: DimensionValue[];
}

const DIMENSION_ORDER = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"];

export function SVIDimensionCompare({ current, previous }: DimensionCompareProps) {
  // Build lookup maps
  const currentMap = new Map(current.map((d) => [d.key, d]));
  const previousMap = new Map(previous.map((d) => [d.key, d]));

  // Merge into ordered list
  const dimensions = DIMENSION_ORDER.map((key) => {
    const cur = currentMap.get(key);
    const prev = previousMap.get(key);
    const currentVal = cur?.value ?? 0;
    const previousVal = prev?.value ?? 0;
    const delta = currentVal - previousVal;
    return {
      key,
      label: cur?.label ?? prev?.label ?? key.toUpperCase(),
      currentVal,
      previousVal,
      delta,
    };
  });

  return (
    <div className="rounded-2xl border border-surface-200 bg-white px-6 py-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-4">Week-over-Week Comparison</p>
      <div className="space-y-3">
        {dimensions.map((dim) => {
          const deltaColor = dim.delta > 0
            ? "text-emerald-600"
            : dim.delta < 0
              ? "text-red-600"
              : "text-ink-700";
          const deltaArrow = dim.delta > 0 ? "↑" : dim.delta < 0 ? "↓" : "–";
          const barColor = dim.currentVal >= 70
            ? "bg-emerald-500"
            : dim.currentVal >= 50
              ? "bg-brand-500"
              : dim.currentVal >= 35
                ? "bg-amber-500"
                : "bg-red-500";
          const prevBarColor = "bg-surface-300";

          return (
            <div key={dim.key}>
              {/* Label row */}
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-ink-800">{dim.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-ink-600">{dim.currentVal}/100</span>
                  <span className={cn("text-xs font-mono font-semibold", deltaColor)}>
                    {deltaArrow} {dim.delta !== 0 ? Math.abs(dim.delta) : ""}
                  </span>
                </div>
              </div>
              {/* Bar comparison */}
              <div className="relative h-2.5 w-full rounded-full bg-surface-200 overflow-hidden">
                {/* Previous week bar (behind, faded) */}
                {dim.previousVal > 0 && (
                  <div
                    className={cn("absolute inset-y-0 left-0 rounded-full opacity-30", prevBarColor)}
                    style={{ width: `${Math.min(dim.previousVal, 100)}%` }}
                  />
                )}
                {/* Current week bar */}
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-500", barColor)}
                  style={{ width: `${Math.min(dim.currentVal, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-surface-200">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded-full bg-brand-500" />
          <span className="text-[10px] text-ink-600">This week</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded-full bg-surface-300 opacity-30" />
          <span className="text-[10px] text-ink-600">Last week</span>
        </div>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[10px] text-emerald-600 font-medium">↑ Improved</span>
          <span className="text-[10px] text-red-600 font-medium">↓ Decreased</span>
          <span className="text-[10px] text-ink-700 font-medium">– No change</span>
        </div>
      </div>
    </div>
  );
}
