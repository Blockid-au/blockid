"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RoadmapItem, RoadmapForecast } from "@/lib/svi-completeness";

const DIMENSION_LABELS: Record<string, string> = {
  ftv: "FTV",
  mpc: "MPC",
  ptd: "PTD",
  tre: "TRE",
  cgh: "CGH",
  iri: "IRI",
  lco: "LCO",
  svm: "SVM",
};

const URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

interface RoadmapData {
  roadmap: RoadmapItem[];
  forecast: RoadmapForecast | null;
  currentSvi: number;
}

export interface SviFixRoadmapProps {
  projectId: string;
  className?: string;
}

interface WeekGroup {
  week: number;
  items: RoadmapItem[];
  weeklyImpact: number;
}

function groupByWeek(items: RoadmapItem[]): WeekGroup[] {
  const map = new Map<number, RoadmapItem[]>();
  for (const item of items) {
    const week = item.roadmapWeek ?? 1;
    if (!map.has(week)) map.set(week, []);
    map.get(week)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([week, groupItems]) => ({
      week,
      items: groupItems,
      weeklyImpact: groupItems.reduce((s, i) => s + i.estimatedSviImpact, 0),
    }));
}

export function SviFixRoadmap({ projectId, className }: SviFixRoadmapProps) {
  const [data, setData] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(new Set([1]));
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [patching, setPatching] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = projectId
        ? `/api/svi/evidence-completeness?projectId=${encodeURIComponent(projectId)}&include=roadmap`
        : "/api/svi/evidence-completeness?include=roadmap";
      const res = await fetch(url);
      if (!res.ok) return;
      const json = (await res.json()) as RoadmapData & { ok: boolean };
      if (json.ok) setData(json);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  function toggleWeek(week: number) {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(week)) {
        next.delete(week);
      } else {
        next.add(week);
      }
      return next;
    });
  }

  async function handleCheck(item: RoadmapItem) {
    const key = `${item.dimension}:${item.evidenceType}`;
    // Optimistic toggle
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

    setPatching((prev) => new Set(prev).add(key));
    try {
      await fetch("/api/svi/evidence-completeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          dimension: item.dimension,
          evidenceType: item.evidenceType,
          evidenceLabel: item.evidenceLabel,
          confidenceLevel: "self_declared",
        }),
      });
    } catch {
      // revert on failure
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    } finally {
      setPatching((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  }

  if (!data || !data.roadmap.length) return null;

  const { roadmap, forecast, currentSvi } = data;
  const weeks = groupByWeek(roadmap);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Forecast banner */}
      {forecast && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/60 px-4 py-3">
          <TrendingUp className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-ink-700 dark:text-ink-300">
              Current SVI: <strong className="text-ink-900 dark:text-ink-100">{currentSvi}</strong>
            </span>
            <span className="text-ink-700 dark:text-ink-300">
              Projected: <strong className="text-green-700 dark:text-green-400">{forecast.projectedSvi}</strong>
            </span>
            <span className="text-ink-700 dark:text-ink-300">
              Week 1 uplift: <strong className="text-brand-700 dark:text-brand-400">+{forecast.week1Impact}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Week sections */}
      {weeks.map(({ week, items: weekItems, weeklyImpact }) => {
        const isOpen = openWeeks.has(week);
        return (
          <div
            key={week}
            className="rounded-lg border border-ink-200 dark:border-ink-700 overflow-hidden"
          >
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-3 bg-ink-50 dark:bg-ink-900 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors text-left"
              onClick={() => toggleWeek(week)}
            >
              <div className="flex items-center gap-3">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-ink-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-ink-400" />
                )}
                <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                  Week {week}
                </span>
                <Badge variant="default" className="text-xs">
                  {weekItems.length} items
                </Badge>
              </div>
              <span className="text-xs font-medium text-green-700 dark:text-green-400 tabular-nums">
                +{weeklyImpact} SVI
              </span>
            </button>

            {isOpen && (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800 bg-white dark:bg-ink-950">
                {weekItems.map((item) => {
                  const key = `${item.dimension}:${item.evidenceType}`;
                  const isChecked = checked.has(key);
                  const isPending = patching.has(key);

                  return (
                    <li key={key} className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isPending}
                        onChange={() => void handleCheck(item)}
                        className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500 shrink-0 cursor-pointer"
                        aria-label={item.actionTitle}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-xs font-medium leading-snug",
                            isChecked
                              ? "line-through text-ink-400 dark:text-ink-500"
                              : "text-ink-800 dark:text-ink-100"
                          )}
                        >
                          {item.actionTitle}
                        </p>
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium mt-0.5",
                            URGENCY_COLORS[item.urgencyLabel] ?? URGENCY_COLORS.low
                          )}
                        >
                          {DIMENSION_LABELS[item.dimension] ?? item.dimension.toUpperCase()} · {item.urgencyLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 h-5">
                          {item.estimatedEffortHours}h
                        </Badge>
                        <Badge
                          variant="success"
                          className="text-[10px] px-1.5 py-0.5 h-5"
                        >
                          +{item.estimatedSviImpact}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
