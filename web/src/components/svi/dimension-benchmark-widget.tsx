"use client";

import * as React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { DimensionPercentileResult } from "@/lib/svi-dimension-benchmarks";

const DIMENSION_FULL_NAMES: Record<string, string> = {
  ftv: "Founder Traction Velocity",
  mpc: "Market Pull & Category",
  ptd: "Product-Tech Depth",
  tre: "Traction Revenue Evidence",
  cgh: "Capital Governance Health",
  iri: "Investor Readiness Index",
  lco: "Legal Compliance Observability",
  svm: "Strategic Vision & Moat",
};

const BAND_LABELS: Record<DimensionPercentileResult["band"], string> = {
  top_quartile: "Top Quartile",
  above_median: "Above Median",
  below_median: "Below Median",
  bottom_quartile: "Bottom Quartile",
};

function scoreBadgeVariant(
  score: number,
  p50: number,
  p75: number,
): "success" | "amber" | "danger" {
  if (score >= p75) return "success";
  if (score >= p50) return "amber";
  return "danger";
}

interface CohortBarProps {
  score: number;
  p25: number;
  p50: number;
  p75: number;
}

function CohortBar({ score, p25, p50, p75 }: CohortBarProps) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const scorePos = clamp(score);
  const p25Pos = clamp(p25);
  const p50Pos = clamp(p50);
  const p75Pos = clamp(p75);

  const scoreColor =
    score >= p75
      ? "#10b981"
      : score >= p50
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div
      className="relative h-3 w-full rounded-full bg-surface-100 dark:bg-ink-800 overflow-visible"
      title={`Your score: ${score} · P25: ${p25} · P50: ${p50} · P75: ${p75}`}
    >
      {/* IQR fill */}
      <div
        className="absolute inset-y-0 rounded-full bg-surface-300 dark:bg-ink-600 opacity-60"
        style={{ left: `${p25Pos}%`, width: `${p75Pos - p25Pos}%` }}
      />
      {/* p25 tick */}
      <div
        className="absolute inset-y-0 w-px bg-ink-400 dark:bg-ink-500"
        style={{ left: `${p25Pos}%` }}
      />
      {/* p50 tick */}
      <div
        className="absolute inset-y-0 w-0.5 bg-ink-600 dark:bg-ink-300"
        style={{ left: `${p50Pos}%` }}
      />
      {/* p75 tick */}
      <div
        className="absolute inset-y-0 w-px bg-ink-400 dark:bg-ink-500"
        style={{ left: `${p75Pos}%` }}
      />
      {/* Score dot */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm"
        style={{ left: `${scorePos}%`, backgroundColor: scoreColor }}
      />
    </div>
  );
}

interface ApiResponse {
  ok: boolean;
  stage: number;
  dimensionPercentiles: DimensionPercentileResult[];
  source: string;
}

export function DimensionBenchmarkWidget({ projectId: _projectId }: { projectId: string }) {
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/svi/dimension-benchmarks")
      .then((r) => r.json())
      .then((json: ApiResponse) => {
        setData(json);
      })
      .catch(() => setError("Failed to load benchmark data."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-ink-800 dark:text-ink-100">
          Cohort Benchmarking
        </CardTitle>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          How your SVI dimensions compare to AU-stage peers
        </p>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {!loading && !error && data?.dimensionPercentiles.length === 0 && (
          <p className="text-sm text-ink-400 dark:text-ink-500 py-4 text-center">
            Complete your SVI analysis to see cohort comparison
          </p>
        )}

        {!loading && !error && data && data.dimensionPercentiles.length > 0 && (
          <div className="space-y-5">
            {data.dimensionPercentiles.map((dim) => {
              const fullName =
                DIMENSION_FULL_NAMES[dim.dimension.toLowerCase()] ??
                dim.dimension.toUpperCase();
              const badgeVariant = scoreBadgeVariant(
                dim.score,
                dim.cohortP50,
                dim.cohortP75,
              );
              const isPositive = dim.vsMedianPts > 0;
              const isNeutral = dim.vsMedianPts === 0;
              const DeltaIcon = isNeutral
                ? Minus
                : isPositive
                  ? TrendingUp
                  : TrendingDown;
              const deltaColor = isNeutral
                ? "text-ink-500"
                : isPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400";
              const bandLabel = BAND_LABELS[dim.band];

              return (
                <div key={dim.dimension} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-800 dark:text-ink-200">
                      {fullName}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant={badgeVariant} className="text-xs font-mono tabular-nums">
                        {dim.score}/100
                      </Badge>
                      <span
                        className={`inline-flex items-center gap-0.5 text-xs font-semibold ${deltaColor}`}
                      >
                        <DeltaIcon className="h-3 w-3" />
                        {isNeutral
                          ? "±0"
                          : `${isPositive ? "+" : ""}${dim.vsMedianPts} pts`}
                      </span>
                      <span className="text-xs text-ink-400 dark:text-ink-500 hidden sm:inline">
                        {bandLabel}
                      </span>
                    </div>
                  </div>
                  <CohortBar
                    score={dim.score}
                    p25={dim.cohortP25}
                    p50={dim.cohortP50}
                    p75={dim.cohortP75}
                  />
                  <div className="flex justify-between text-[10px] text-ink-400 dark:text-ink-500 px-0.5">
                    <span>P25: {dim.cohortP25}</span>
                    <span>Median: {dim.cohortP50}</span>
                    <span>P75: {dim.cohortP75}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-[10px] text-ink-400 dark:text-ink-500 border-t border-surface-200 dark:border-ink-800 pt-3">
          Based on AU cohort benchmarks by stage. Updates as your analysis evolves.
        </p>
      </CardContent>
    </Card>
  );
}
