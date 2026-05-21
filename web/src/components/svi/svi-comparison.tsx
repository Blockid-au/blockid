"use client";

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

export function SVIComparison({
  analysis,
  className,
}: {
  analysis: SVIAnalysis;
  className?: string;
}) {
  const stage = analysis.stage ?? 0;
  const bench = getSVIBenchmark(stage);
  const percentile = getSVIPercentile(analysis.totalSVI, stage);

  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden",
        className,
      )}
    >
      <div className="px-5 py-4 border-b border-surface-200">
        <h3 className="text-sm font-semibold text-ink-900">How You Compare</h3>
        <p className="text-xs text-ink-500 mt-0.5">
          vs other {bench.label}-stage startups in Australia
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Percentile */}
        <div className="text-center">
          <p className="text-4xl font-bold text-brand-600">
            Top {Math.round(100 - percentile)}%
          </p>
          <p className="text-xs text-ink-500 mt-1">
            of {bench.label}-stage startups
          </p>
        </div>

        {/* Score comparison bar */}
        <div className="space-y-2">
          {[
            { label: "Your Score", value: analysis.totalSVI, color: "bg-brand-600" },
            { label: "Stage Average", value: bench.avgSVI, color: "bg-surface-400" },
            { label: "Top 10%", value: bench.topDecile, color: "bg-emerald-500" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-24 text-xs text-ink-500 text-right">
                {label}
              </span>
              <div className="flex-1 h-5 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", color)}
                  style={{ width: `${Math.min(100, (value / 300) * 100)}%` }}
                />
              </div>
              <span className="w-10 text-sm font-bold text-ink-800">{value}</span>
            </div>
          ))}
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
                      {score}/{dimBench.avg} avg
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        aboveAvg ? "bg-emerald-500" : "bg-amber-500",
                      )}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
