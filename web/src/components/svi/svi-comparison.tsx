"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getSVIBenchmark, getSVIPercentile } from "@/lib/benchmarks";
import type { SVIAnalysis } from "@/lib/svi-analysis";

const DIM_LABELS: Record<string, string> = {
  ftv: "Team",
  mpc: "Market",
  ptd: "Product",
  tre: "Traction",
  cgh: "Cap Table",
  iri: "Investor Ready",
  lco: "Legal",
  svm: "Vision",
};

interface LiveBenchmark {
  stage: number;
  stageLabel: string;
  sampleSize: number;
  source: "live" | "static";
  avgSVI: number;
  medianSVI: number;
  p25: number;
  p75: number;
  topDecile: number;
  percentile?: number;
  dimensions: Record<string, { avg: number; top: number }>;
}

function useBenchmark(stage: number, svi: number) {
  const [data, setData] = useState<LiveBenchmark | null>(null);

  useEffect(() => {
    const url = `/api/benchmarks?stage=${stage}&svi=${svi}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: LiveBenchmark) => setData(d))
      .catch(() => {
        // Fall back to static on network error
        const staticBench = getSVIBenchmark(stage);
        setData({
          ...staticBench,
          stageLabel: staticBench.label,
          sampleSize: 0,
          source: "static",
          medianSVI: staticBench.medianSVI,
          percentile: getSVIPercentile(svi, stage),
        });
      });
  }, [stage, svi]);

  return data;
}

export function SVIComparison({
  analysis,
  className,
}: {
  analysis: SVIAnalysis;
  className?: string;
}) {
  const stage = analysis.stage ?? 0;
  const live = useBenchmark(stage, analysis.totalSVI);

  // Use static data while fetching
  const staticBench = getSVIBenchmark(stage);
  const bench = live ?? { ...staticBench, stageLabel: staticBench.label, sampleSize: 0, source: "static" as const, medianSVI: staticBench.medianSVI };
  const percentile = live?.percentile ?? getSVIPercentile(analysis.totalSVI, stage);

  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden",
        className,
      )}
    >
      <div className="px-5 py-4 border-b border-surface-200 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">How You Compare</h3>
          <p className="text-xs text-ink-500 mt-0.5">
            vs other {bench.stageLabel ?? staticBench.label}-stage startups in Australia
          </p>
        </div>
        {live && (
          <span className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full",
            live.source === "live"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-surface-100 text-ink-400",
          )}>
            {live.source === "live"
              ? `${live.sampleSize} startups`
              : "AU estimates"}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Percentile */}
        <div className="text-center">
          <p className="text-4xl font-bold text-brand-600">
            Top {Math.max(1, Math.round(100 - percentile))}%
          </p>
          <p className="text-xs text-ink-500 mt-1">
            of {bench.stageLabel ?? staticBench.label}-stage startups
          </p>
        </div>

        {/* Score comparison bars */}
        <div className="space-y-2">
          {[
            { label: "Your Score", value: analysis.totalSVI, color: "bg-brand-600" },
            { label: "Stage Median", value: bench.medianSVI, color: "bg-surface-400" },
            { label: "Top 10%", value: bench.topDecile, color: "bg-emerald-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-24 text-xs text-ink-500 text-right shrink-0">
                {label}
              </span>
              <div className="flex-1 h-5 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-500", color)}
                  style={{ width: `${Math.min(100, (value / 300) * 100)}%` }}
                />
              </div>
              <span className="w-10 text-sm font-bold text-ink-800 tabular-nums">{value}</span>
            </div>
          ))}
        </div>

        {/* Percentile band indicator */}
        <div className="rounded-xl bg-surface-50 px-4 py-3 flex items-center justify-between text-xs">
          <span className="text-ink-500">p25 <span className="font-semibold text-ink-700">{bench.p25}</span></span>
          <span className="text-ink-500">median <span className="font-semibold text-ink-700">{bench.medianSVI}</span></span>
          <span className="text-ink-500">p75 <span className="font-semibold text-ink-700">{bench.p75}</span></span>
          <span className="text-ink-500">top 10% <span className="font-semibold text-emerald-700">{bench.topDecile}</span></span>
        </div>

        {/* Dimension comparison */}
        <div>
          <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-3">
            Dimension Breakdown
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(analysis.subs ?? []).map((sub) => {
              const dimBench = bench.dimensions[sub.key];
              if (!dimBench) return null;
              const score = Math.round(sub.value);
              const aboveAvg = score > dimBench.avg;
              return (
                <div
                  key={sub.key}
                  className="rounded-xl border border-surface-200 p-3"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-ink-700">
                      {DIM_LABELS[sub.key] ?? sub.label}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold",
                        aboveAvg ? "text-emerald-600" : "text-amber-600",
                      )}
                    >
                      {score}<span className="font-normal text-ink-400">/{dimBench.avg}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        aboveAvg ? "bg-emerald-500" : "bg-amber-500",
                      )}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-ink-400 mt-1">
                    avg {dimBench.avg} · top {dimBench.top}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
