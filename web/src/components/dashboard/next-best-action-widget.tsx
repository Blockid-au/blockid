"use client";

import * as React from "react";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Types (mirror cto-next-best-action.ts) ─────────────────────────────── */

interface NextBestAction {
  id: string;
  priority: "P0" | "P1" | "P2";
  title: string;
  rationale: string;
  dimension: string;
  sviBenefit: number;
  effort: "low" | "medium" | "high";
  timeToComplete: string;
  auResource?: string;
  tags: string[];
}

interface NBAResult {
  currentSvi: number;
  projectedSvi: number;
  stage: number;
  stageLabel: string;
  weakestDimension: string;
  actions: NextBestAction[];
  topInsight: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const effortColor = {
  low: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20",
  medium: "text-amber-600 bg-amber-50 dark:bg-amber-950/20",
  high: "text-red-500 bg-red-50 dark:bg-red-950/20",
};

const priorityBadge = {
  P0: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  P1: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  P2: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

/* ─── Action Card ─────────────────────────────────────────────────────────── */

function ActionCard({ action, index }: { action: NextBestAction; index: number }) {
  const [expanded, setExpanded] = React.useState(index === 0);

  return (
    <div className={cn(
      "rounded-xl border transition-all",
      action.priority === "P0"
        ? "border-red-200 dark:border-red-800/40 bg-red-50/40 dark:bg-red-950/10"
        : "border-border bg-card"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0",
            priorityBadge[action.priority]
          )}>
            {action.priority}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-snug">{action.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-muted-foreground">{action.dimension}</span>
            <span className="text-xs text-emerald-600 font-medium">+{action.sviBenefit} SVI</span>
            <span className={cn(
              "text-[10px] font-medium px-1.5 py-0.5 rounded",
              effortColor[action.effort]
            )}>
              {action.effort} effort
            </span>
            <span className="text-[10px] text-muted-foreground">{action.timeToComplete}</span>
          </div>
        </div>

        <div className="shrink-0 text-muted-foreground mt-0.5">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{action.rationale}</p>

          {action.auResource && (
            <div className="flex items-start gap-2 text-xs">
              <ArrowRight className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
              <span className="text-blue-600">{action.auResource}</span>
            </div>
          )}

          {action.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {action.tags.map((t) => (
                <span key={t} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Widget ──────────────────────────────────────────────────────────────── */

interface Props {
  startupId?: string;
  className?: string;
}

export function NextBestActionWidget({ startupId, className }: Props) {
  const [data, setData] = React.useState<NBAResult | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  React.useEffect(() => {
    const url = startupId
      ? `/api/next-best-action?startup_id=${encodeURIComponent(startupId)}`
      : "/api/next-best-action";

    fetch(url)
      .then((r) => r.json())
      .then((json: { ok: boolean; result?: NBAResult; error?: string }) => {
        if (json.ok && json.result) {
          setData(json.result);
        } else {
          setError(json.error ?? "Failed to load recommendations.");
        }
      })
      .catch(() => setError("Network error."))
      .finally(() => setLoading(false));
  }, [startupId]);

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center h-32", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const p0Actions = data.actions.filter((a) => a.priority === "P0");
  const otherActions = data.actions.filter((a) => a.priority !== "P0");
  const visibleOther = showAll ? otherActions : otherActions.slice(0, 2);
  const sviBump = data.projectedSvi - data.currentSvi;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Next Best Actions
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Complete top actions to reach <span className="font-semibold text-foreground">SVI {data.projectedSvi}</span>
            {sviBump > 0 && <span className="text-emerald-600"> (+{sviBump} points)</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Stage</p>
            <p className="text-sm font-semibold">{data.stageLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Weakest dim.</p>
            <p className="text-sm font-semibold text-amber-600">{data.weakestDimension}</p>
          </div>
        </div>
      </div>

      {/* Top insight */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3">
        <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
          <span className="font-semibold">AI Insight: </span>{data.topInsight}
        </p>
      </div>

      {/* P0 actions — always visible */}
      {p0Actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-red-500" />
            Priority actions (do these first)
          </p>
          {p0Actions.map((a, i) => (
            <ActionCard key={a.id} action={a} index={i} />
          ))}
        </div>
      )}

      {/* P1/P2 actions */}
      {otherActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
            Also recommended
          </p>
          {visibleOther.map((a, i) => (
            <ActionCard key={a.id} action={a} index={i + 10} />
          ))}

          {otherActions.length > 2 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2 border border-dashed border-border rounded-lg flex items-center justify-center gap-1.5"
            >
              {showAll ? (
                <><ChevronUp className="h-3.5 w-3.5" /> Show fewer</>
              ) : (
                <><ChevronDown className="h-3.5 w-3.5" /> {otherActions.length - 2} more actions</>
              )}
            </button>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground text-right">
        <CheckCircle2 className="h-3 w-3 inline mr-1 text-emerald-500" />
        Generated from your {data.currentSvi} SVI · {data.actions.length} recommendations
      </div>
    </div>
  );
}
