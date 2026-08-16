"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Circle, Plus, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  DimensionCompletenessResult,
  RoadmapItem,
  RoadmapForecast,
} from "@/lib/svi-completeness";

const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder Traction Velocity",
  mpc: "Market Pull & Category",
  ptd: "Product-Tech Depth",
  tre: "Traction & Revenue Evidence",
  cgh: "Capital Governance Health",
  iri: "Investor Readiness Index",
  lco: "Legal Compliance Observability",
  svm: "Strategic Vision & Moat",
};

const URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  low: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

interface CompletenessData {
  dimensions: DimensionCompletenessResult[];
  roadmap: RoadmapItem[];
  forecast: RoadmapForecast;
  currentSvi: number;
}

function progressColor(pct: number): string {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

export function SviEvidenceClient() {
  const [data, setData] = useState<CompletenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/svi/evidence-completeness");
      if (!res.ok) throw new Error("Failed to load evidence data");
      const json = await res.json() as CompletenessData & { ok: boolean };
      if (!json.ok) throw new Error("API error");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function addEvidence(dimension: string, evidenceType: string, evidenceLabel: string, confidenceLevel: string) {
    const key = `${dimension}:${evidenceType}`;
    setAdding(key);
    try {
      const res = await fetch("/api/svi/evidence-completeness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimension, evidenceType, evidenceLabel, confidenceLevel }),
      });
      if (res.ok) await fetchData();
    } finally {
      setAdding(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
              <CardContent><Skeleton className="h-24 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const { dimensions, roadmap, forecast, currentSvi } = data;
  const topRoadmap = roadmap.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800 dark:text-ink-100">SVI Evidence Completeness</h1>
          <p className="text-sm text-ink-600 dark:text-ink-400 mt-1">
            Track evidence across all 8 SVI dimensions and follow the fix roadmap to boost your score.
          </p>
        </div>
        {currentSvi > 0 && (
          <Badge variant="default" className="text-base px-3 py-1 font-semibold">
            Score: {currentSvi}
          </Badge>
        )}
      </div>

      {/* Forecast banner */}
      {forecast && forecast.potentialSviGain > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-3 dark:border-brand-800 dark:bg-brand-950">
          <TrendingUp className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
          <p className="text-sm text-brand-800 dark:text-brand-300">
            Complete your roadmap to potentially reach{" "}
            <strong>{forecast.projectedSvi}</strong>{" "}
            (+{forecast.potentialSviGain} pts)
          </p>
        </div>
      )}

      {/* Dimension cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dimensions.map((dim) => {
          const pct = dim.completenessPercent;
          const colorClass = progressColor(pct);
          const label = DIMENSION_LABELS[dim.dimension] ?? dim.dimension.toUpperCase();

          return (
            <Card key={dim.dimension} className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                  {dim.dimension.toUpperCase()} — {label}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${colorClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-500 dark:text-ink-400 tabular-nums whitespace-nowrap">
                    {dim.totalPresent}/{dim.totalPossible}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* Present items */}
                {dim.presentEvidence.length > 0 && (
                  <ul className="space-y-1">
                    {dim.presentEvidence.map((ev) => (
                      <li key={ev.code} className="flex items-center gap-2 text-xs text-ink-700 dark:text-ink-300">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        {ev.label}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Missing items */}
                {dim.missingEvidence.length > 0 && (
                  <ul className="space-y-1">
                    {dim.missingEvidence.map((ev) => {
                      const key = `${dim.dimension}:${ev.code}`;
                      const isAdding = adding === key;
                      return (
                        <li key={ev.code} className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                          <Circle className="h-3.5 w-3.5 shrink-0 text-ink-300 dark:text-ink-600" />
                          <span className="flex-1">{ev.label}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs gap-1"
                            disabled={isAdding}
                            onClick={() =>
                              void addEvidence(
                                dim.dimension,
                                ev.code,
                                ev.label,
                                ev.confidenceLevel
                              )
                            }
                          >
                            <Plus className="h-3 w-3" />
                            {isAdding ? "Adding…" : "Add"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {dim.missingEvidence.length === 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                    All evidence items present
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Roadmap table */}
      {topRoadmap.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-ink-800 dark:text-ink-100 mb-3">
            Priority Fix Roadmap
          </h2>
          <div className="overflow-x-auto rounded-md border border-ink-200 dark:border-ink-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50 dark:bg-ink-900 text-left text-xs text-ink-500 dark:text-ink-400 uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Dimension</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium text-right">SVI Impact</th>
                  <th className="px-4 py-2 font-medium text-right">Effort (hrs)</th>
                  <th className="px-4 py-2 font-medium text-right">Week</th>
                  <th className="px-4 py-2 font-medium">Urgency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {topRoadmap.map((item, i) => (
                  <tr key={i} className="bg-white dark:bg-ink-950 hover:bg-ink-50 dark:hover:bg-ink-900 transition-colors">
                    <td className="px-4 py-2 font-medium text-ink-700 dark:text-ink-300 uppercase text-xs">
                      {item.dimension}
                    </td>
                    <td className="px-4 py-2 text-ink-600 dark:text-ink-400 max-w-xs truncate">
                      {item.actionTitle}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-green-700 dark:text-green-400 font-medium">
                      +{item.estimatedSviImpact}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-600 dark:text-ink-400">
                      {item.estimatedEffortHours}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-600 dark:text-ink-400">
                      {item.roadmapWeek}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${URGENCY_COLORS[item.urgencyLabel] ?? URGENCY_COLORS.low}`}>
                        {item.urgencyLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-ink-500 dark:text-ink-400 border-t border-ink-100 dark:border-ink-800 pt-4">
        Evidence completeness improves SVI scoring confidence. Connect data sources in the Evidence Vault for higher-confidence scores.
      </p>
    </div>
  );
}
