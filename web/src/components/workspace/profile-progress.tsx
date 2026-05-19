"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface UserAction {
  id: string;
  action_type: string;
  action_label: string;
  dimension: string | null;
  tool_slug: string | null;
  svi_impact_estimate: number;
  created_at: string;
}

interface RescoreResult {
  ok: boolean;
  previousSVI: number;
  newSVI: number;
  evidenceCount: number;
  actionCount: number;
  evidenceBoost: number;
  actionBoost: number;
}

const DIMENSION_LABELS: Record<string, string> = {
  ftv: "Founder",
  mpc: "Market",
  ptd: "Product",
  tre: "Traction",
  cgh: "Governance",
  iri: "Investor",
  lco: "Legal",
  svm: "Stage",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  tool_used: "Tool Used",
  evidence_uploaded: "Evidence Uploaded",
  guide_visited: "Guide Visited",
  external_completed: "Completed",
};

/* ─── Component ──────────────────────────────────────────────────────────── */

export function ProfileProgress({ email }: { email: string }) {
  const [actions, setActions] = React.useState<UserAction[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [rescoring, setRescoring] = React.useState(false);
  const [rescoreResult, setRescoreResult] = React.useState<RescoreResult | null>(null);
  const [rescoreError, setRescoreError] = React.useState<string | null>(null);

  // Fetch action history on mount
  React.useEffect(() => {
    let cancelled = false;
    async function fetchActions() {
      try {
        const res = await fetch(`/api/actions?email=${encodeURIComponent(email)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.ok) {
          setActions(data.actions ?? []);
        }
      } catch { /* ignore */ } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchActions();
    return () => { cancelled = true; };
  }, [email]);

  const handleRescore = async () => {
    setRescoring(true);
    setRescoreError(null);
    setRescoreResult(null);
    try {
      const res = await fetch("/api/svi/rescore", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setRescoreResult(data as RescoreResult);
      } else {
        setRescoreError(data.reason ?? "Rescore failed");
      }
    } catch {
      setRescoreError("Network error");
    } finally {
      setRescoring(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      {/* Header */}
      <div className="bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <TrendingUp strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-bold text-ink-800">Your Progress</h2>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={handleRescore}
            disabled={rescoring}
          >
            <RefreshCw strokeWidth={1.75} className={cn("h-3.5 w-3.5", rescoring && "animate-spin")} />
            {rescoring ? "Rescoring..." : "Rescore my SVI"}
          </Button>
        </div>

        {/* Rescore result */}
        {rescoreResult && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-4">
            <div className="flex items-center gap-3">
              <Zap strokeWidth={1.75} className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-800">SVI Rescored</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-lg font-bold text-ink-600">{rescoreResult.previousSVI}</span>
                  <span className="text-ink-600">&rarr;</span>
                  <span className={cn(
                    "font-mono text-lg font-bold",
                    rescoreResult.newSVI > rescoreResult.previousSVI ? "text-emerald-600" :
                    rescoreResult.newSVI < rescoreResult.previousSVI ? "text-red-600" : "text-ink-800"
                  )}>
                    {rescoreResult.newSVI}
                  </span>
                  {rescoreResult.newSVI !== rescoreResult.previousSVI && (
                    <span className={cn(
                      "text-xs font-mono font-semibold",
                      rescoreResult.newSVI > rescoreResult.previousSVI ? "text-emerald-600" : "text-red-600"
                    )}>
                      ({rescoreResult.newSVI > rescoreResult.previousSVI ? "+" : ""}
                      {rescoreResult.newSVI - rescoreResult.previousSVI})
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-600 mt-1">
                  Based on {rescoreResult.evidenceCount} evidence item{rescoreResult.evidenceCount !== 1 ? "s" : ""} and {rescoreResult.actionCount} action{rescoreResult.actionCount !== 1 ? "s" : ""}.
                </p>
              </div>
            </div>
          </div>
        )}

        {rescoreError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-4">
            <p className="text-sm text-red-700">{rescoreError === "No SVI account found" ? "No SVI account found. Run an SVI analysis first." : rescoreError}</p>
          </div>
        )}

        {/* Action history */}
        {loading ? (
          <div className="text-center py-6">
            <p className="text-sm text-ink-600">Loading actions...</p>
          </div>
        ) : actions.length === 0 ? (
          <div className="text-center py-6">
            <CheckCircle2 strokeWidth={1.75} className="h-8 w-8 text-surface-400 mx-auto mb-2" />
            <p className="text-sm text-ink-600">No actions recorded yet.</p>
            <p className="text-xs text-ink-600 mt-1">
              Actions are tracked when you use tools, upload evidence, or follow recommendations from your SVI report.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((action) => (
              <div
                key={action.id}
                className="flex items-center gap-3 rounded-xl border border-surface-200 bg-surface-50 px-4 py-3"
              >
                <CheckCircle2 strokeWidth={1.75} className="h-4 w-4 shrink-0 text-emerald-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-800 truncate">{action.action_label}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] uppercase tracking-wider font-medium text-ink-600">
                      {ACTION_TYPE_LABELS[action.action_type] ?? action.action_type}
                    </span>
                    {action.dimension && (
                      <span className="rounded-full bg-brand-50 border border-brand-200 px-1.5 py-0.5 text-[10px] font-medium text-brand-600 uppercase tracking-wider">
                        {DIMENSION_LABELS[action.dimension] ?? action.dimension}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {action.svi_impact_estimate > 0 && (
                    <span className="font-mono text-xs font-semibold text-teal-600">+{action.svi_impact_estimate}</span>
                  )}
                  <p className="text-[10px] text-ink-600">
                    {new Date(action.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
