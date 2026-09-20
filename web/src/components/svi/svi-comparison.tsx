"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getSVIBenchmark } from "@/lib/benchmarks";
import { benchmarkNLabel, notEnoughLine, publishPercentile, publishedFromCohort, type BenchmarkBand, type PublishedPercentile } from "@/lib/benchmarks/publication-rules";
import type { SVIAnalysis } from "@/lib/svi-analysis";

// G21 P1 review (score-governance § 7): every figure on this card is gated
// by lib/benchmarks/publication-rules.ts. The rank comes from the stored
// cohort result (`analysis.cohortPercentile.published`) or the live pool
// with its n; the median / quartile / top-decile row and the per-dimension
// averages render only from a live cohort (n shown). Below the floor the
// card prints "Not enough comparable companies … (n = N)" — never the static
// AU-market table's numbers, which are estimates, not a comparison set.

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
  band?: BenchmarkBand;
  label?: string;
  reason?: string;
  avgSVI: number | null;
  medianSVI: number | null;
  p25: number | null;
  p75: number | null;
  topDecile: number | null;
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
        // Network error → no cohort: nothing to publish (no numbers, no rank).
        const staticBench = getSVIBenchmark(stage);
        setData({
          stage,
          stageLabel: staticBench.label,
          sampleSize: 0,
          source: "static",
          band: "none",
          reason: notEnoughLine(0, `${staticBench.label} stage`),
          avgSVI: null,
          medianSVI: null,
          p25: null,
          p75: null,
          topDecile: null,
          dimensions: staticBench.dimensions,
        });
      });
  }, [stage, svi]);

  return data;
}

/** The rank this card may print: the stored cohort result first, else the live pool (with its n), else null. */
export function comparisonPercentile(analysis: Pick<SVIAnalysis, "cohortPercentile">, live: Pick<LiveBenchmark, "source" | "sampleSize" | "percentile" | "stageLabel"> | null): PublishedPercentile | null {
  const stored = publishedFromCohort(analysis.cohortPercentile ?? null);
  if (stored) return stored;
  if (live && live.source === "live" && typeof live.percentile === "number") {
    return publishPercentile({ percentile: live.percentile, n: live.sampleSize, segment: `${live.stageLabel}-stage AU startups` });
  }
  return null;
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
  const stageLabel = live?.stageLabel ?? getSVIBenchmark(stage).label;
  const published = comparisonPercentile(analysis, live);
  const cohortLive = live !== null && live.source === "live" && live.medianSVI !== null;
  // n for the "not enough" sentence: the live pool's, else the stored cohort's.
  const knownN = live?.sampleSize ?? analysis.cohortPercentile?.cohortSize ?? 0;
  const notEnough = live?.reason ?? notEnoughLine(knownN, `${stageLabel} stage`);

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
            vs other {stageLabel}-stage startups in Australia
          </p>
        </div>
        {live && (
          <span className={cn(
            "text-[10px] font-medium px-2 py-0.5 rounded-full",
            cohortLive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-surface-100 text-muted",
          )}>
            {cohortLive
              ? `${live.sampleSize} startups`
              : `no cohort yet (${benchmarkNLabel(live.sampleSize)})`}
          </span>
        )}
      </div>

      <div className="p-5 space-y-5">
        {/* Percentile — only a published rank, always with its n */}
        <div className="text-center" data-svi-comparison-percentile={published ? "published" : "none"}>
          {published ? (
            <>
              <p className="text-4xl font-bold text-brand-600">
                Top {Math.max(1, 100 - published.percentile)}%
              </p>
              <p className="text-xs text-ink-500 mt-1">
                of {stageLabel}-stage startups — {published.label}
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-500">{notEnough}</p>
          )}
        </div>

        {cohortLive && (
          <>
            {/* Score comparison bars */}
            <div className="space-y-2">
              {[
                { label: "Your Score", value: analysis.totalSVI, color: "bg-brand-600" },
                { label: "Stage Median", value: live.medianSVI ?? 0, color: "bg-surface-400" },
                { label: "Top 10%", value: live.topDecile ?? 0, color: "bg-emerald-500" },
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

            {/* Percentile band indicator — always with n */}
            <div className="rounded-xl bg-surface-50 px-4 py-3 flex items-center justify-between text-xs">
              <span className="text-ink-500">p25 <span className="font-semibold text-ink-700">{live.p25}</span></span>
              <span className="text-ink-500">median <span className="font-semibold text-ink-700">{live.medianSVI}</span></span>
              <span className="text-ink-500">p75 <span className="font-semibold text-ink-700">{live.p75}</span></span>
              <span className="text-ink-500">top 10% <span className="font-semibold text-emerald-700">{live.topDecile}</span></span>
              <span className="text-muted">{benchmarkNLabel(live.sampleSize)}</span>
            </div>
          </>
        )}

        {/* Dimension comparison — cohort averages only from a live cohort */}
        <div>
          <p className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-3">
            Dimension Breakdown
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(analysis.subs ?? []).map((sub) => {
              const dimBench = cohortLive ? live.dimensions[sub.key] : undefined;
              const score = Math.round(sub.value);
              const aboveAvg = dimBench ? score > dimBench.avg : null;
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
                        aboveAvg === null ? "text-ink-700" : aboveAvg ? "text-emerald-600" : "text-amber-600",
                      )}
                    >
                      {score}{dimBench ? <span className="font-normal text-muted">/{dimBench.avg}</span> : null}
                    </span>
                  </div>
                  <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        aboveAvg === null ? "bg-brand-500" : aboveAvg ? "bg-emerald-500" : "bg-amber-500",
                      )}
                      style={{ width: `${score}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted mt-1">
                    {dimBench && live ? `cohort avg ${dimBench.avg} · top ${dimBench.top} (${benchmarkNLabel(live.sampleSize)})` : "no cohort average yet"}
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
