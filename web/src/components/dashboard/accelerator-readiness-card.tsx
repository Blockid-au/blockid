"use client";

import * as React from "react";
import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  ExternalLink,
  Rocket,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";

type Readiness = NonNullable<SVIAnalysis["acceleratorReadiness"]>;
type Source = Readiness["sources"][number];

const STATUS_COLOR = {
  met: "bg-emerald-500",
  partial: "bg-amber-400",
  gap: "bg-rose-400",
} as const;

const STATUS_LABEL = {
  met: "Met",
  partial: "Partial",
  gap: "Gap",
} as const;

function fmtAud(v?: number): string {
  if (!v || v <= 0) return "—";
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${v}`;
}

function SourceRow({ s }: { s: Source }) {
  const [open, setOpen] = React.useState(false);
  const pctColor = s.pct >= 70 ? "text-emerald-700"
    : s.pct >= 40 ? "text-blue-700"
    : s.pct >= 20 ? "text-amber-700"
    : "text-rose-700";

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-bold">{s.source_name}</span>
            <span className={cn("text-sm font-bold tabular-nums", pctColor)}>{s.pct}%</span>
          </div>
          {/* Mini segment bar */}
          <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden flex">
            <div className="bg-emerald-500" style={{ width: `${(s.met / s.total) * 100}%` }} />
            <div className="bg-amber-400" style={{ width: `${(s.partial / s.total) * 100}%` }} />
            <div className="bg-rose-400" style={{ width: `${(s.gap / s.total) * 100}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {s.met} met &middot; {s.partial} partial &middot; {s.gap} gap &middot; {s.total} criteria
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/10 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">Top leverage to lift this source</p>
          {s.topCriteria.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">All criteria met — nothing to lift!</p>
          ) : (
            s.topCriteria.map((c, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <span className="text-xs font-semibold flex-1">{c.entry.criterion}</span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                    c.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                  )}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                {c.entry.description && (
                  <p className="text-[11px] text-muted-foreground">{c.entry.description}</p>
                )}
                <p className="text-[10px] text-muted-foreground italic">Why: {c.reasoning}</p>
                {c.entry.tactic.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 mt-1.5 mb-0.5">How to lift</p>
                    <ul className="space-y-0.5">
                      {c.entry.tactic.map((t, j) => <li key={j} className="text-[11px] text-foreground">→ {t}</li>)}
                    </ul>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                  {c.estLiftAud && c.estLiftAud > 0 ? (
                    <span className="text-[10px] font-semibold text-emerald-600">+{fmtAud(c.estLiftAud)} valuation</span>
                  ) : <span />}
                  {c.entry.citations[0] && (
                    <a href={c.entry.citations[0]} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-0.5">
                      Source <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function AcceleratorReadinessCard({ analysis }: { analysis: SVIAnalysis }) {
  const r = analysis.acceleratorReadiness;
  if (!r) return null;

  const overallColor = r.overallPct >= 70 ? "text-emerald-700"
    : r.overallPct >= 40 ? "text-blue-700"
    : r.overallPct >= 20 ? "text-amber-700"
    : "text-rose-700";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Rocket className="h-4 w-4 text-purple-500" />
            AU Accelerator Readiness
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ring-1 ring-amber-200">Beta</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your startup mapped against {r.totalCriteria} criteria from Antler, Startmate, YC, Techstars, SkyDeck, MVi, Cicada, Blackbird.
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-4xl font-bold", overallColor)}>{r.overallPct}<span className="text-base font-normal text-muted-foreground">%</span></p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Overall</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/15 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Met</span>
          </div>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{r.totalMet}</p>
        </div>
        <div className="rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/15 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-amber-700 dark:text-amber-400">
            <Target className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Partial</span>
          </div>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">{r.totalPartial}</p>
        </div>
        <div className="rounded-lg border border-rose-200 dark:border-rose-800/40 bg-rose-50/50 dark:bg-rose-950/15 p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-rose-700 dark:text-rose-400">
            <Circle className="h-3.5 w-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Gap</span>
          </div>
          <p className="text-xl font-bold text-rose-700 dark:text-rose-400 mt-1">{r.totalCriteria - r.totalMet - r.totalPartial}</p>
        </div>
      </div>

      {/* High leverage gaps banner */}
      {r.highLeverageGaps.length > 0 && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/15 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1.5">
            <Award className="h-3 w-3" /> Top valuation-lift moves (across all sources)
          </p>
          <ul className="space-y-1.5">
            {r.highLeverageGaps.slice(0, 3).map((g, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span className={cn("inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", STATUS_COLOR[g.status])} />
                <span className="flex-1">
                  <strong>{g.entry.criterion}</strong>
                  <span className="text-muted-foreground"> &middot; {g.entry.source_name}</span>
                  {g.estLiftAud && g.estLiftAud > 0 && (
                    <span className="text-emerald-600 font-semibold ml-1">+{fmtAud(g.estLiftAud)}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Source rows */}
      <div className="space-y-2">
        {r.sources.map((s) => <SourceRow key={s.source} s={s} />)}
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Criteria sourced from public accelerator content (linked). Re-runs every analysis and updates as the knowledge base grows.
      </p>
    </div>
  );
}
