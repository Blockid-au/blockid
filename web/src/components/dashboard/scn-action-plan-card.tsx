"use client";

import * as React from "react";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Compass,
  Flame,
  Navigation,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";

type Plan = NonNullable<SVIAnalysis["scnActionPlan"]>;
type Layer = Plan["layers"][number];
type Action = Layer["actions"][number];

interface Props {
  analysis: SVIAnalysis;
}

function fmtAud(v: number): string {
  if (v >= 1_000_000_000) return `A$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `A$${(v / 1_000).toFixed(0)}K`;
  return `A$${Math.round(v).toLocaleString("en-AU")}`;
}

const LAYER_META: Record<Layer["code"], { icon: typeof Compass; color: string; bg: string }> = {
  validation: { icon: Sparkles, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950/20" },
  position: { icon: Compass, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/20" },
  value: { icon: Target, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
  direction: { icon: Navigation, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/20" },
  capital: { icon: Rocket, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/20" },
};

const STATUS_META = {
  complete: { label: "Complete", icon: CheckCircle2, color: "text-emerald-600", ring: "ring-emerald-200" },
  in_progress: { label: "In progress", icon: Clock, color: "text-blue-600", ring: "ring-blue-200" },
  gap: { label: "Gap", icon: Circle, color: "text-amber-600", ring: "ring-amber-200" },
} as const;

const PRIORITY_BADGE = {
  P0: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  P1: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  P2: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
} as const;

const EFFORT_BADGE = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
} as const;

/* ─── Your Number hero ─────────────────────────────────────────────────── */

function YourNumberHero({ yn, maturity, cohort }: {
  yn: Plan["yourNumber"];
  maturity?: SVIAnalysis["maturitySignal"];
  cohort?: SVIAnalysis["cohortPercentile"];
}) {
  return (
    <div className="rounded-2xl border border-blue-200 dark:border-blue-800/40 bg-gradient-to-br from-blue-50 via-emerald-50 to-amber-50 dark:from-blue-950/30 dark:via-emerald-950/20 dark:to-amber-950/20 p-6 sm:p-8 shadow-sm">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-[0.18em] mb-3">
        <Sparkles className="h-3.5 w-3.5" />
        Your Number · SCN Framework
      </div>

      {maturity?.isEstablished && (
        <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3">
          <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-400 tracking-wide mb-1">
            Established / scale-up signals detected ({maturity.confidence} confidence)
          </p>
          <p className="text-xs text-amber-900 dark:text-amber-300">
            The number below is anchored to public-page signals only. For accurate
            pricing, connect Stripe/Xero or upload current financials.
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 items-end">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">SVI Score</p>
          <p className="text-5xl font-bold mt-1">{yn.sviScore}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {yn.sviLabel} &middot; {yn.sviPercentileLabel}
            {cohort?.source === "real_cohort" && (
              <span className="ml-1 text-[11px] text-blue-600 font-medium">
                (real cohort, n={cohort.cohortSize})
              </span>
            )}
          </p>
        </div>
        <div className="md:text-right md:border-l md:border-blue-200 dark:md:border-blue-800/40 md:pl-6">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Blended Valuation</p>
          <p className="text-4xl font-bold mt-1 text-blue-700 dark:text-blue-300">{fmtAud(yn.valuationMidAud)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Range: {fmtAud(yn.valuationLowAud)}–{fmtAud(yn.valuationHighAud)} &middot; <span className="font-medium capitalize">{yn.valuationConfidence}</span> confidence
          </p>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-blue-200/60 dark:border-blue-800/40">
        <p className="text-sm font-medium text-foreground leading-relaxed">{yn.plainEnglish}</p>
      </div>
    </div>
  );
}

/* ─── This Week hero ───────────────────────────────────────────────────── */

function ThisWeekHero({ action }: { action: Action }) {
  return (
    <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/15 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-amber-500 dark:bg-amber-600 p-2.5">
          <Flame className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400 mb-1">
            This week · Single most important move
          </p>
          <h3 className="text-lg font-bold text-foreground">{action.title}</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{action.detail}</p>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", PRIORITY_BADGE[action.priority])}>{action.priority}</span>
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", EFFORT_BADGE[action.effort])}>{action.effort} effort</span>
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">{action.impact}</span>
          </div>

          <div className="mt-4 rounded-lg bg-white/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">HOW TO DO IT</p>
            <p className="text-xs text-foreground leading-relaxed">{action.tactic}</p>
          </div>

          {action.resources && action.resources.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {action.resources.map((r) => (
                <span key={r} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {r}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Layer card ───────────────────────────────────────────────────────── */

function LayerCard({ layer }: { layer: Layer }) {
  const [open, setOpen] = React.useState(layer.status !== "complete");
  const meta = LAYER_META[layer.code];
  const statusMeta = STATUS_META[layer.status];
  const Icon = meta.icon;
  const StatusIcon = statusMeta.icon;

  return (
    <div className={cn("border border-border rounded-xl overflow-hidden")}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className={cn("shrink-0 rounded-lg p-2", meta.bg)}>
          <Icon className={cn("h-4 w-4", meta.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold">{layer.label}</h3>
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1", statusMeta.color, statusMeta.ring)}>
              <StatusIcon className="h-3 w-3" />
              {statusMeta.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{layer.question}</p>
          <p className="text-xs text-foreground mt-2">{layer.statusReason}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 pt-2 border-t border-border bg-muted/10 space-y-3">
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wide">Unlock criteria:</span> {layer.unlockCriteria}
          </div>

          <div className="space-y-2">
            {layer.actions.map((action, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded", PRIORITY_BADGE[action.priority])}>{action.priority}</span>
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", EFFORT_BADGE[action.effort])}>{action.effort}</span>
                  <span className="text-[10px] text-muted-foreground">{action.timeline.replace("_", " ")}</span>
                  <span className="text-[10px] font-semibold text-emerald-600">{action.impact}</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{action.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{action.detail}</p>
                <details className="mt-2">
                  <summary className="text-[11px] font-semibold text-blue-600 cursor-pointer hover:underline">How to do it</summary>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{action.tactic}</p>
                  {action.resources && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {action.resources.map((r) => (
                        <span key={r} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{r}</span>
                      ))}
                    </div>
                  )}
                </details>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Milestone column ─────────────────────────────────────────────────── */

function MilestoneColumn({ m }: { m: Plan["milestones"][number] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-blue-600">
        <Calendar className="h-3.5 w-3.5" />
        Day {m.day}
      </div>
      <h4 className="text-sm font-bold mt-1.5">{m.title}</h4>
      <p className="text-xs text-muted-foreground mt-1">{m.measurableGoal}</p>
      {m.evidenceRequired.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Evidence</p>
          <ul className="space-y-0.5">
            {m.evidenceRequired.map((e, i) => (
              <li key={i} className="text-xs text-foreground">&bull; {e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Valuation Levers ─────────────────────────────────────────────────── */

function LeversTable({ levers }: { levers: Plan["valuationLevers"] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-emerald-500" />
        How to push your number up
      </h4>
      <div className="space-y-2">
        {levers.map((l, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
            <ArrowRight className="h-3.5 w-3.5 text-emerald-500 mt-1 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{l.lever}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className={cn("inline-block mr-2", EFFORT_BADGE[l.effort], "rounded px-1 text-[10px] font-semibold")}>{l.effort}</span>
                <span className="text-emerald-600 font-medium">{l.upliftAud}</span> &middot; {l.timeframe}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Main card ────────────────────────────────────────────────────────── */

export function ScnActionPlanCard({ analysis }: Props) {
  const plan = analysis.scnActionPlan;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      {/* "Your number" hero */}
      <YourNumberHero
        yn={plan.yourNumber}
        maturity={analysis.maturitySignal}
        cohort={analysis.cohortPercentile}
      />

      {/* This week focus */}
      <ThisWeekHero action={plan.thisWeekFocus} />

      {/* SCN journey layers */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <Compass className="h-4 w-4 text-blue-500" />
              Your SCN Journey
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Validation → Position → Value → Direction → Capital
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {plan.layers.filter((l) => l.status === "complete").length} of {plan.layers.length} layers complete
          </div>
        </div>

        <div className="space-y-3">
          {plan.layers.map((layer) => <LayerCard key={layer.code} layer={layer} />)}
        </div>
      </div>

      {/* 30/60/90 Day Plan */}
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-base font-bold flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-amber-500" />
          30 / 60 / 90 Day Plan
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {plan.milestones.map((m) => <MilestoneColumn key={m.day} m={m} />)}
        </div>
      </div>

      {/* Valuation levers */}
      <LeversTable levers={plan.valuationLevers} />
    </div>
  );
}
