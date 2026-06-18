"use client";

import * as React from "react";
import {
  Award,
  Brain,
  ChevronDown,
  ChevronUp,
  Compass,
  Rocket,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";

type Eval = NonNullable<SVIAnalysis["antlerSignals"]>;
type Signal = Eval["signals"][number];

const ICON: Record<Signal["key"], typeof Users> = {
  team: Users,
  progress: TrendingUp,
  invention: Brain,
  vision: Compass,
  product_10x: Zap,
};

const STRENGTH_COLOR: Record<Signal["strength"], string> = {
  exceptional: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40",
  strong: "text-blue-700 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40",
  developing: "text-amber-700 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40",
  weak: "text-rose-700 bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40",
};

const STRENGTH_BAR: Record<Signal["strength"], string> = {
  exceptional: "bg-emerald-500",
  strong: "bg-blue-500",
  developing: "bg-amber-500",
  weak: "bg-rose-500",
};

function SignalRow({ s }: { s: Signal }) {
  const [open, setOpen] = React.useState(false);
  const Icon = ICON[s.key];

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors"
      >
        <div className={cn("shrink-0 rounded-lg p-2 border", STRENGTH_COLOR[s.strength])}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-bold">{s.label}</span>
            <div className="flex items-center gap-2">
              <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ring-1", STRENGTH_COLOR[s.strength].replace("border-", "ring-"))}>
                {s.strength}
              </span>
              <span className="text-sm font-bold tabular-nums">{s.score}/100</span>
            </div>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full", STRENGTH_BAR[s.strength])} style={{ width: `${s.score}%` }} />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{s.question}</p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-border bg-muted/10 space-y-3">
          {s.whatWeSee.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 mb-1">What we see</p>
              <ul className="space-y-0.5">
                {s.whatWeSee.map((w, i) => <li key={i} className="text-xs text-foreground">✓ {w}</li>)}
              </ul>
            </div>
          )}
          {s.gaps.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">Gaps</p>
              <ul className="space-y-0.5">
                {s.gaps.map((g, i) => <li key={i} className="text-xs text-foreground">○ {g}</li>)}
              </ul>
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-1">How to lift</p>
            <ul className="space-y-0.5">
              {s.howToLift.map((h, i) => <li key={i} className="text-xs text-foreground">→ {h}</li>)}
            </ul>
          </div>
          <p className="text-[10px] text-muted-foreground">Weight in progression score: {Math.round(s.weight * 100)}%</p>
        </div>
      )}
    </div>
  );
}

export function AntlerSignalsCard({ analysis }: { analysis: SVIAnalysis }) {
  const evalResult = analysis.antlerSignals;
  if (!evalResult) return null;

  const { signals, progressionScore, oneLine, standout, weakestLink, sourceNote } = evalResult;
  const scoreColor = progressionScore >= 80 ? "text-emerald-700"
    : progressionScore >= 60 ? "text-blue-700"
    : progressionScore >= 40 ? "text-amber-700"
    : "text-rose-700";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Rocket className="h-4 w-4 text-purple-500" />
            Stage-Progression Signals
            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 ring-1 ring-amber-200">Beta</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Antler / Sequoia / a16z heuristics for "are they ready to level up?"
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-4xl font-bold", scoreColor)}>{progressionScore}<span className="text-base font-normal text-muted-foreground">/100</span></p>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Readiness</p>
        </div>
      </div>

      {/* One-line read */}
      <div className="rounded-xl bg-gradient-to-br from-purple-50 via-blue-50 to-emerald-50 dark:from-purple-950/20 dark:via-blue-950/20 dark:to-emerald-950/20 border border-purple-200 dark:border-purple-800/40 p-4">
        <p className="text-sm font-medium leading-relaxed">{oneLine}</p>
      </div>

      {/* Standout + weakest link */}
      <div className="grid sm:grid-cols-2 gap-3">
        {standout && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/15 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <Award className="h-3 w-3" /> Investors will see this first
            </p>
            <p className="text-sm font-bold mt-1">{standout.label} <span className="text-emerald-600 ml-1">({standout.score})</span></p>
          </div>
        )}
        {weakestLink && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/15 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> What to fix next
            </p>
            <p className="text-sm font-bold mt-1">{weakestLink.label} <span className="text-amber-600 ml-1">({weakestLink.score})</span></p>
          </div>
        )}
      </div>

      {/* All 5 signals */}
      <div className="space-y-2">
        {signals.map((s) => <SignalRow key={s.key} s={s} />)}
      </div>

      <p className="text-[10px] text-muted-foreground italic">{sourceNote}</p>
    </div>
  );
}
