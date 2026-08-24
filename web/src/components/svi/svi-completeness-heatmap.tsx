"use client";

import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SviEvidenceCard } from "@/components/svi/svi-evidence-card";
import type { DimensionCompletenessResult } from "@/lib/svi-completeness";

const DIMENSION_SHORT: Record<string, string> = {
  ftv: "FTV",
  mpc: "MPC",
  ptd: "PTD",
  tre: "TRE",
  cgh: "CGH",
  iri: "IRI",
  lco: "LCO",
  svm: "SVM",
};

const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder Traction",
  mpc: "Market Pull",
  ptd: "Product Depth",
  tre: "Traction & Revenue",
  cgh: "Cap Governance",
  iri: "Investor Readiness",
  lco: "Legal Compliance",
  svm: "Strategic Vision",
};

function colorClasses(pct: number): { cell: string; bar: string; text: string } {
  if (pct >= 70) {
    return {
      cell: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40",
      bar: "bg-green-500",
      text: "text-green-700 dark:text-green-400",
    };
  }
  if (pct >= 40) {
    return {
      cell: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
      bar: "bg-amber-400",
      text: "text-amber-700 dark:text-amber-400",
    };
  }
  return {
    cell: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  };
}

interface HeatmapData {
  dimensions: DimensionCompletenessResult[];
}

export interface SviCompletenessHeatmapProps {
  projectId: string;
  className?: string;
}

export function SviCompletenessHeatmap({ projectId, className }: SviCompletenessHeatmapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDim, setSelectedDim] = useState<DimensionCompletenessResult | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = projectId
        ? `/api/svi/evidence-completeness?projectId=${encodeURIComponent(projectId)}`
        : "/api/svi/evidence-completeness";
      const res = await fetch(url);
      if (!res.ok) return;
      const json = (await res.json()) as HeatmapData & { ok: boolean };
      if (json.ok) setData(json);
    } catch {
      // silently fail — parent page handles primary error state
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleAdd(dim: DimensionCompletenessResult, evidenceType: string, evidenceLabel: string, confidenceLevel: string) {
    const key = `${dim.dimension}:${evidenceType}`;
    setAdding(key);
    try {
      await fetch("/api/svi/evidence-completeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          dimension: dim.dimension,
          evidenceType,
          evidenceLabel,
          confidenceLevel,
        }),
      });
      await fetchData();
      // refresh modal state
      setSelectedDim((prev) =>
        prev?.dimension === dim.dimension
          ? (data?.dimensions.find((d) => d.dimension === dim.dimension) ?? null)
          : prev
      );
    } finally {
      setAdding(null);
    }
  }

  if (loading) {
    return (
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3", className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data || data.dimensions.length === 0) return null;

  return (
    <>
      <div className={cn("grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3", className)}>
        {data.dimensions.map((dim) => {
          const pct = dim.completenessPercent;
          const colors = colorClasses(pct);
          return (
            <button
              key={dim.dimension}
              type="button"
              onClick={() => setSelectedDim(dim)}
              className={cn(
                "rounded-lg border p-3 text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500",
                colors.cell
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold tracking-wider text-ink-800 dark:text-ink-100">
                  {DIMENSION_SHORT[dim.dimension] ?? dim.dimension.toUpperCase()}
                </span>
                <span className={cn("text-xs font-semibold tabular-nums", colors.text)}>
                  {pct}%
                </span>
              </div>
              <p className="text-[10px] text-ink-500 dark:text-ink-400 mb-2 leading-tight">
                {DIMENSION_LABELS[dim.dimension] ?? dim.dimension}
              </p>
              <div className="h-1.5 w-full rounded-full bg-ink-200 dark:bg-ink-700 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", colors.bar)}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] text-ink-400 dark:text-ink-500 mt-1 tabular-nums">
                {dim.totalPresent}/{dim.totalPossible} items
              </p>
            </button>
          );
        })}
      </div>

      {/* Drill-in modal */}
      {selectedDim && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setSelectedDim(null)}
        >
          <div
            className="relative w-full max-w-md rounded-xl border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900 shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold tracking-widest text-ink-400 dark:text-ink-500">
                  {DIMENSION_SHORT[selectedDim.dimension] ?? selectedDim.dimension.toUpperCase()}
                </span>
                <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100 leading-tight">
                  {DIMENSION_LABELS[selectedDim.dimension] ?? selectedDim.dimension} — {selectedDim.completenessPercent}% complete
                </h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setSelectedDim(null)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>

            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {selectedDim.presentEvidence.map((ev) => (
                <SviEvidenceCard
                  key={ev.code}
                  evidenceType={ev.code}
                  label={ev.label}
                  present={true}
                  impact={ev.estimatedSviImpact}
                />
              ))}
              {selectedDim.missingEvidence.map((ev) => (
                <SviEvidenceCard
                  key={ev.code}
                  evidenceType={ev.code}
                  label={ev.label}
                  present={false}
                  impact={ev.estimatedSviImpact}
                  onAdd={
                    adding === `${selectedDim.dimension}:${ev.code}`
                      ? undefined
                      : () =>
                          void handleAdd(
                            selectedDim,
                            ev.code,
                            ev.label,
                            ev.confidenceLevel
                          )
                  }
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
