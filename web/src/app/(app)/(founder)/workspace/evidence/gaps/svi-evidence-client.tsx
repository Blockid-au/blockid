"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Circle, Plus, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { canRequestReview, type EvidenceRowOut } from "@/lib/evidence/evidence-row";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  DimensionCompletenessResult,
  RoadmapItem,
  RoadmapForecast,
} from "@/lib/svi-completeness";
import { SviCompletenessHeatmap } from "@/components/svi/svi-completeness-heatmap";
import { SviFixRoadmap } from "@/components/svi/svi-fix-roadmap";
import { EvidenceStatusChip } from "@/components/svi/EvidenceStatusChip";
import { SviStreamAnalysis } from "@/components/svi/svi-stream-analysis";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

// S36: dimension names come from the engine's single table (dimension-owners.ts)
// — this page used to carry its own, different, set of eight names.
const dimensionLabel = (dim: string): string => DIMENSION_OWNERS[dim as DimKey]?.title ?? dim.toUpperCase();

const URGENCY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-700",
};

interface CompletenessData {
  dimensions: DimensionCompletenessResult[];
  roadmap: RoadmapItem[];
  forecast: RoadmapForecast;
  currentSvi: number;
  /** G14-S36: the project the rows belong to + each row's verification state. */
  projectId?: string | null;
  rows?: EvidenceRowOut[];
}

const REVIEW_LABEL: Record<EvidenceRowOut["review_status"], string> = {
  none: "",
  pending: "Verification pending",
  approved: "Verified by BlockID",
  rejected: "Verification declined",
};

function progressColor(pct: number): string {
  if (pct >= 75) return "bg-green-500";
  if (pct >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

export function SviEvidenceClient({ projectId = "" }: { projectId?: string }) {
  const [data, setData] = useState<CompletenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const targetDim = searchParams.get("dim");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = projectId
        ? `/api/svi/evidence-completeness?projectId=${encodeURIComponent(projectId)}`
        : "/api/svi/evidence-completeness";
      const res = await fetch(url);
      const json = (await res.json().catch(() => null)) as (CompletenessData & { ok: boolean }) | null;
      if (!res.ok || !json?.ok) throw ApiError.fromBody(res.status, json);
      setData(json);
    } catch (e) {
      console.error("[svi-evidence] load", e);
      setError(userErrorMessage(e, "Could not load your evidence data. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / projectId change; loading flag + async fetch, the rule cannot see the async boundary through the useCallback reference
    void fetchData();
  }, [fetchData]);

  // Wire the `?dim=xxx` deep-link shipped by the SVI stream analysis
  // fastest-lift CTA: after the heatmap has rendered, scroll the matching
  // dimension card into view and rely on CSS :target for the highlight ring.
  // Falls back gracefully when the param is absent or the card hasn't mounted.
  useEffect(() => {
    if (!targetDim || loading || !data) return;
    // Give the heatmap one frame to mount its cards after fetchData resolves.
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`svi-dim-${targetDim}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Nudge the URL hash so :target activates the highlight ring — replaceState
      // avoids adding a history entry that would break the browser back button.
      if (window.location.hash !== `#svi-dim-${targetDim}`) {
        const url = new URL(window.location.href);
        url.hash = `svi-dim-${targetDim}`;
        window.history.replaceState(null, "", url.toString());
      }
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [targetDim, loading, data]);

  // G14-S36: ask a BlockID reviewer to verify one row. Only a reviewer's
  // approval can raise a row to third_party_verified; this just queues it.
  const [requesting, setRequesting] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const rowFor = (dimension: string, evidenceType: string): EvidenceRowOut | undefined =>
    data?.rows?.find((r) => r.dimension === dimension && r.evidence_type === evidenceType);

  async function requestReview(row: EvidenceRowOut) {
    setRequesting(row.id);
    setReviewNotice(null);
    try {
      const res = await fetch(`/api/svi/dimensions/evidence/${encodeURIComponent(row.projectId)}/${row.dimension}/${row.id}/request-review`, { method: "POST" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && json?.ok) {
        setReviewNotice("Verification requested — a BlockID reviewer will check the evidence and you will see the result here.");
        await fetchData();
      } else if (res.status === 503 && json?.error === "review_unavailable") {
        setReviewNotice("Verification requests are not open yet on this environment.");
      } else {
        setReviewNotice("Could not request verification. Please try again.");
      }
    } finally {
      setRequesting(null);
    }
  }

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
      <div className="flex items-center gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-red-800">
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
      {/* AI Dimension Analysis — streams results as each dimension completes */}
      <div className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-ink-800">
            AI Dimension Analysis
          </h2>
          <p className="text-sm text-ink-500 mt-0.5">
            Instant AI-powered analysis across all 8 SVI dimensions — results stream as each completes.
          </p>
        </div>
        <SviStreamAnalysis projectId={projectId} />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800">SVI Evidence Completeness</h1>
          <p className="text-sm text-ink-600 mt-1">
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
        <div className="flex items-center gap-3 rounded-md border border-brand-200 bg-brand-50 px-4 py-3">
          <TrendingUp className="h-5 w-5 shrink-0 text-brand-600" />
          <p className="text-sm text-brand-800">
            Complete your roadmap to potentially reach{" "}
            <strong>{forecast.projectedSvi}</strong>{" "}
            (+{forecast.potentialSviGain} pts)
          </p>
        </div>
      )}

      {/* Completeness heatmap */}
      <SviCompletenessHeatmap projectId={projectId} className="mb-2" />

      {reviewNotice && (
        <p role="status" className="rounded-md border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700">
          {reviewNotice}
        </p>
      )}

      {/* Dimension cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dimensions.map((dim) => {
          const pct = dim.completenessPercent;
          const colorClass = progressColor(pct);
          const label = dimensionLabel(dim.dimension);

          return (
            <Card key={dim.dimension} className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-ink-800">
                  {dim.dimension.toUpperCase()} — {label}
                </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-2 rounded-full bg-ink-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${colorClass}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-500 tabular-nums whitespace-nowrap">
                    {dim.totalPresent}/{dim.totalPossible}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* Present items */}
                {dim.presentEvidence.length > 0 && (
                  <ul className="space-y-1">
                    {dim.presentEvidence.map((ev) => {
                      const row = rowFor(dim.dimension, ev.code);
                      const status = row?.review_status ?? "none";
                      return (
                        <li key={ev.code} className="flex items-center gap-2 text-xs text-ink-700">
                          {row?.is_verified ? (
                            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="Verified by BlockID" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                          )}
                          <span className="flex-1">{ev.label}</span>
                          {/* G21-P1-B: Claimed · Evidence-backed · Verified · Unverified · Conflicting */}
                          <EvidenceStatusChip item={{ level: row?.confidence_level ?? ev.confidenceLevel, verified: row?.is_verified ?? false, verifiedAt: row?.verified_at ?? null, reviewStatus: status }} />
                          {row && status !== "none" && (
                            <span
                              className={
                                status === "approved"
                                  ? "text-[10px] font-medium text-emerald-700"
                                  : status === "rejected"
                                    ? "text-[10px] font-medium text-red-700"
                                    : "text-[10px] font-medium text-ink-500"
                              }
                              title={row.review_note ?? undefined}
                            >
                              {REVIEW_LABEL[status]}
                            </span>
                          )}
                          {row && row.projectId && canRequestReview(row) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs gap-1"
                              disabled={requesting === row.id}
                              onClick={() => void requestReview(row)}
                              title="Ask a BlockID reviewer to verify this evidence (third-party verified)"
                            >
                              <ShieldCheck className="h-3 w-3" />
                              {requesting === row.id ? "Requesting…" : status === "rejected" ? "Request again" : "Request verification"}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Missing items */}
                {dim.missingEvidence.length > 0 && (
                  <ul className="space-y-1">
                    {dim.missingEvidence.map((ev) => {
                      const key = `${dim.dimension}:${ev.code}`;
                      const isAdding = adding === key;
                      return (
                        <li key={ev.code} className="flex items-center gap-2 text-xs text-ink-500">
                          <Circle className="h-3.5 w-3.5 shrink-0 text-muted" />
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
                  <p className="text-xs text-green-600 font-medium">
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
          <h2 className="text-base font-semibold text-ink-800 mb-3">
            Priority Fix Roadmap
          </h2>
          <div className="overflow-x-auto rounded-md border border-ink-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-sunken text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr className="bg-ink-50 text-left text-xs text-ink-500 uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Dimension</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium text-right">SVI Impact</th>
                  <th className="px-4 py-2 font-medium text-right">Effort (hrs)</th>
                  <th className="px-4 py-2 font-medium text-right">Week</th>
                  <th className="px-4 py-2 font-medium">Urgency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {topRoadmap.map((item, i) => (
                  <tr key={i} className="bg-white hover:bg-ink-50 transition-colors">
                    <td className="px-4 py-2 font-medium text-ink-700 uppercase text-xs">
                      {item.dimension}
                    </td>
                    <td className="px-4 py-2 text-ink-600 max-w-xs truncate">
                      {item.actionTitle}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-green-700 font-medium">
                      +{item.estimatedSviImpact}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-600">
                      {item.estimatedEffortHours}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-600">
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

      {/* 4-week fix roadmap */}
      <div>
        <h2 className="text-base font-semibold text-ink-800 mb-3">
          4-Week Fix Roadmap
        </h2>
        <SviFixRoadmap projectId={projectId} />
      </div>

      {/* Footer */}
      <p className="text-xs text-ink-500 border-t border-ink-100 pt-4">
        Evidence completeness improves SVI scoring confidence. Connect data sources in the Evidence Vault for higher-confidence scores.
      </p>
    </div>
  );
}
