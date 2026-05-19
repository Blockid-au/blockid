"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Plus, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { EvidenceWizard } from "@/components/svi/evidence-wizard";

// Dimension weight labels (for tooltip)
const DIM_WEIGHTS: Record<string, string> = {
  ftv: "15%", mpc: "18%", ptd: "12%", tre: "20%",
  cgh: "12%", iri: "10%", lco: "8%", svm: "5%",
};

function DimensionBar({ sub }: { sub: SVIAnalysis["subs"][number] }) {
  const [open, setOpen] = React.useState(false);
  const pct = Math.round(sub.value);
  const adjColor = sub.adjustment >= 0 ? "text-green-400" : "text-red-400";
  const barColor = pct >= 70 ? "bg-green-500" : pct >= 50 ? "bg-brand-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200">{sub.label}</span>
            <span className="text-[10px] text-slate-600 font-mono">{DIM_WEIGHTS[sub.key] ?? ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-mono font-semibold", adjColor)}>
              {sub.adjustment >= 0 ? "+" : ""}{sub.adjustment}
            </span>
            <span className="text-xs text-slate-500 font-mono">{pct}/100</span>
            {open ? <ChevronUp className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.75} /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" strokeWidth={1.75} />}
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-ink-700 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${pct}%` }} />
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-ink-700 space-y-2">
          {sub.evidence.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-teal-400 font-medium mb-1.5">Evidence</p>
              <ul className="space-y-1">
                {sub.evidence.map(e => (
                  <li key={e} className="flex items-start gap-2 text-xs text-slate-400">
                    <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-400" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sub.gaps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400 font-medium mb-1.5">Gaps</p>
              <ul className="space-y-1">
                {sub.gaps.map(g => (
                  <li key={g} className="flex items-start gap-2 text-xs text-slate-400">
                    <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StageJourney({ currentStage }: { currentStage: number }) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 px-6 py-5">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-4">Stage Journey</p>
      <div className="relative">
        {/* Progress line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-ink-700" />
        <div
          className="absolute top-4 left-4 h-0.5 bg-brand-500 transition-all duration-700"
          style={{ width: `${(currentStage / 7) * 100}%` }}
        />
        {/* Stage dots */}
        <div className="relative flex justify-between">
          {SVI_STAGE_LABELS.map((label, i) => {
            const isPast = i < currentStage;
            const isCurrent = i === currentStage;
            return (
              <div key={label} className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all",
                    isPast ? "border-brand-500 bg-brand-500 text-white" :
                    isCurrent ? "border-brand-400 bg-brand-900 text-brand-400 ring-2 ring-brand-400/30" :
                    "border-ink-600 bg-ink-800 text-slate-600",
                  )}
                >
                  {i}
                </div>
                <span className={cn(
                  "text-[9px] text-center leading-tight max-w-[52px] font-medium",
                  isCurrent ? "text-brand-300" : isPast ? "text-slate-400" : "text-slate-600",
                )}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface SVIDashboardProps {
  analysis: SVIAnalysis;
  startupName?: string;
  snapshotHistory?: Array<{ date: string; svi: number; delta: number | null }>;
  userEmail?: string;
}

export function SVIDashboard({ analysis, startupName, snapshotHistory }: SVIDashboardProps) {
  const [wizardOpen, setWizardOpen] = React.useState(false);

  const sviLabel =
    analysis.totalSVI >= 200 ? "Elite"
    : analysis.totalSVI >= 170 ? "Exceptional"
    : analysis.totalSVI >= 140 ? "Strong"
    : analysis.totalSVI >= 120 ? "Above Average"
    : analysis.totalSVI >= 100 ? "Average"
    : analysis.totalSVI >= 80 ? "Below Average"
    : analysis.totalSVI >= 60 ? "Early Stage"
    : "Critical";

  const sviColor =
    analysis.totalSVI >= 140 ? "text-green-400"
    : analysis.totalSVI >= 120 ? "text-brand-400"
    : analysis.totalSVI >= 100 ? "text-amber-400"
    : "text-red-400";

  const deltaPositive = (analysis.weeklyDelta ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pt-6 pb-2">
        <h1 className="text-2xl font-bold text-slate-50">{startupName ?? "My Startup"}</h1>
        <p className="text-sm text-slate-500 mt-1">Startup Value Index Dashboard</p>
      </div>

      {/* SVI Hero */}
      <div className="rounded-2xl border border-ink-700 bg-ink-900 px-8 py-8 flex flex-col sm:flex-row items-center gap-6">
        {/* Score */}
        <div className="flex flex-col items-center gap-2 sm:border-r sm:border-ink-700 sm:pr-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-400 font-medium">Startup Value Index</p>
          <div className="flex items-end gap-1">
            <span className={cn("font-mono text-7xl font-bold tabular-nums tracking-tight leading-none", sviColor)}>
              {analysis.totalSVI}
            </span>
            <span className="mb-2 text-sm text-slate-400 font-mono">SVI</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Base 100</span>
            <span className="text-slate-600">→</span>
            <span className={cn("text-sm font-semibold", sviColor)}>{sviLabel}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
          {/* Weekly delta */}
          <div className="flex flex-col items-center gap-1">
            <div className={cn("flex items-center gap-1 text-xl font-bold font-mono", deltaPositive ? "text-green-400" : "text-red-400")}>
              {deltaPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {deltaPositive ? "+" : ""}{analysis.weeklyDelta ?? 0}
            </div>
            <p className="text-[10px] text-slate-500 text-center">This week</p>
          </div>
          {/* Stage */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold font-mono text-brand-400">{analysis.stage}</span>
            <p className="text-[10px] text-slate-500 text-center">{analysis.stageLabel ?? SVI_STAGE_LABELS[analysis.stage]}</p>
          </div>
          {/* Confidence */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold font-mono text-slate-200">{Math.round(analysis.confidenceMultiplier * 100)}%</span>
            <p className="text-[10px] text-slate-500 text-center">Evidence conf.</p>
          </div>
          {/* Percentile */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold font-mono text-teal-400">
              {analysis.percentileRank ? `Top ${100 - analysis.percentileRank}%` : "—"}
            </span>
            <p className="text-[10px] text-slate-500 text-center">Stage {analysis.stage} peers</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-slate-400 leading-relaxed px-1">{analysis.summary}</p>

      {/* Stage Journey */}
      <StageJourney currentStage={analysis.stage} />

      {/* Snapshot History */}
      {snapshotHistory && snapshotHistory.length > 0 && (
        <div className="rounded-2xl border border-ink-700 bg-ink-900 px-6 py-5">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-4">Score History</p>
          <div className="space-y-2">
            {snapshotHistory.map((snap) => {
              const deltaPositive = snap.delta !== null && snap.delta >= 0;
              const formattedDate = new Date(snap.date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
              return (
                <div key={snap.date} className="flex items-center justify-between py-1.5 border-b border-ink-800 last:border-0">
                  <span className="text-xs text-slate-500 w-28 shrink-0">{formattedDate}</span>
                  <span className="text-sm font-mono font-semibold text-slate-200">{snap.svi} SVI</span>
                  {snap.delta !== null ? (
                    <span className={cn(
                      "text-xs font-mono font-semibold w-14 text-right",
                      deltaPositive ? "text-green-400" : "text-red-400",
                    )}>
                      {deltaPositive ? "+" : ""}{snap.delta}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600 w-14 text-right">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Evidence CTA */}
      <div className="flex items-center justify-between rounded-xl border border-brand-600/30 bg-brand-900/20 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-100">Add Evidence to Lift Your SVI</p>
          <p className="text-xs text-slate-400 mt-0.5">Upload docs, connect integrations, or verify claims.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)} className="shrink-0 h-9 gap-1.5">
          <Plus strokeWidth={1.75} className="h-4 w-4" />
          Add Evidence
        </Button>
      </div>

      {/* 8 Dimension Bars */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3">Index Breakdown</p>
        <div className="space-y-2">
          {analysis.subs.map(sub => <DimensionBar key={sub.key} sub={sub} />)}
        </div>
      </div>

      {/* Risk flags */}
      {analysis.riskPenalties.length > 0 && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/5 px-5 py-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-red-400 font-medium flex items-center gap-2">
            <AlertTriangle strokeWidth={1.75} className="h-3.5 w-3.5" />
            Risk Flags ({analysis.riskPenalties.length})
          </p>
          {analysis.riskPenalties.map(r => (
            <div key={r.label} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{r.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{r.reason}</p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-red-400">-{r.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Evidence gaps */}
      {analysis.evidenceGaps.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3">Evidence to Add (by impact)</p>
          <div className="space-y-2">
            {analysis.evidenceGaps.map(gap => (
              <div key={gap.label} className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3">
                <span className={cn(
                  "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  gap.priority === "P0" ? "bg-red-500/20 text-red-400" : gap.priority === "P1" ? "bg-amber-500/20 text-amber-400" : "bg-slate-500/20 text-slate-400",
                )}>
                  {gap.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{gap.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{gap.action}</p>
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold text-teal-400">+{gap.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next actions */}
      {analysis.nextActions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 font-medium mb-3">Next Actions</p>
          <div className="space-y-2">
            {analysis.nextActions.map(action => (
              <div key={action.title} className="rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Zap strokeWidth={1.75} className={cn("mt-0.5 h-4 w-4 shrink-0", action.priority === "P0" ? "text-red-400" : action.priority === "P1" ? "text-amber-400" : "text-slate-500")} />
                    <div>
                      <p className="text-sm font-medium text-slate-200">{action.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{action.detail}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-teal-400 mt-0.5">{action.impact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence Wizard Modal */}
      {wizardOpen && <EvidenceWizard onClose={() => setWizardOpen(false)} />}
    </div>
  );
}
