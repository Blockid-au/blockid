"use client";

import * as React from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp, Plus, TrendingDown, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { EvidenceWizard } from "@/components/svi/evidence-wizard";
import { SVIChart } from "@/components/svi/svi-chart";
import { SVIDimensionCompare } from "@/components/svi/svi-dimension-compare";
import { SVITrendChart } from "@/components/ui/svi-trend-chart";
import { PriorityTasks, generatePriorityTasks } from "@/components/workspace/priority-tasks";
import { SVIComparison } from "@/components/svi/svi-comparison";
import { SVIValuation } from "@/components/svi/svi-valuation";
import { ComplianceChecker } from "@/components/svi/compliance-checker";

// Dimension weight labels (for tooltip)
const DIM_WEIGHTS: Record<string, string> = {
  ftv: "15%", mpc: "18%", ptd: "12%", tre: "20%",
  cgh: "12%", iri: "10%", lco: "8%", svm: "5%",
};

const DIMENSION_ACTIONS: Record<string, { label: string; action: string; link?: string; uploadType?: string }> = {
  ftv: { label: "Add team profiles", action: "Upload LinkedIn profiles, CVs, or advisor agreements", link: "/workspace/evidence" },
  mpc: { label: "Add market research", action: "Upload TAM/SAM analysis, customer interviews, or survey data", link: "/workspace/evidence" },
  ptd: { label: "Connect GitHub", action: "Link your repository or upload product demo/screenshots", link: "/workspace/evidence" },
  tre: { label: "Add revenue proof", action: "Connect Stripe, upload invoices, or add analytics screenshots", link: "/workspace/evidence" },
  cgh: { label: "Upload cap table", action: "Upload shareholder agreement, vesting schedule, or equity split", link: "/workspace/evidence" },
  iri: { label: "Upload pitch deck", action: "Add your investor deck, financial model, or data room docs", link: "/workspace/evidence" },
  lco: { label: "Add legal docs", action: "Upload ABN/ASIC registration, IP assignment, or contracts", link: "/workspace/evidence" },
  svm: { label: "Define your moat", action: "Document competitive advantages, network effects, or data moat", link: "/workspace/evidence" },
};

function DimensionBar({ sub }: { sub: SVIAnalysis["subs"][number] }) {
  const [open, setOpen] = React.useState(false);
  const pct = Math.round(sub.value);
  const adjColor = sub.adjustment >= 0 ? "text-emerald-600" : "text-red-600";
  const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink-800">{sub.label}</span>
            <span className="text-[10px] text-ink-600 font-mono">{DIM_WEIGHTS[sub.key] ?? ""}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-mono font-semibold", adjColor)}>
              {sub.adjustment >= 0 ? "+" : ""}{sub.adjustment}
            </span>
            <span className="text-xs text-ink-600 font-mono">{pct}/100</span>
            <Link
              href={DIMENSION_ACTIONS[sub.key]?.link ?? "/workspace/evidence"}
              onClick={(e) => e.stopPropagation()}
              className="ml-2 shrink-0 inline-flex items-center gap-1 rounded-lg bg-brand-50 border border-brand-200 px-2.5 py-1 text-[11px] font-medium text-brand-600 hover:bg-brand-100 transition-colors"
            >
              <ArrowUpRight className="h-3 w-3" /> {DIMENSION_ACTIONS[sub.key]?.label ?? "Improve"}
            </Link>
            {open ? <ChevronUp className="h-3.5 w-3.5 text-ink-600" strokeWidth={1.75} /> : <ChevronDown className="h-3.5 w-3.5 text-ink-600" strokeWidth={1.75} />}
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-surface-200 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all duration-700", barColor)} style={{ width: `${pct}%` }} />
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-surface-200 space-y-2">
          {sub.evidence.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-teal-600 font-medium mb-1.5">Evidence</p>
              <ul className="space-y-1">
                {sub.evidence.map(e => (
                  <li key={e} className="flex items-start gap-2 text-xs text-ink-600">
                    <CheckCircle2 strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sub.gaps.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-600 font-medium mb-1.5">Gaps</p>
              <ul className="space-y-1">
                {sub.gaps.map(g => (
                  <li key={g} className="flex items-start gap-2 text-xs text-ink-600">
                    <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
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
    <div className="rounded-2xl border border-surface-200 bg-white px-6 py-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-4">Stage Journey</p>
      <div className="relative">
        {/* Progress line */}
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-surface-200" />
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
              <div key={label} className="flex flex-col items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "h-7 w-7 sm:h-8 sm:w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all shrink-0",
                    isPast ? "border-brand-500 bg-brand-500 text-white" :
                    isCurrent ? "border-brand-600 bg-brand-50 text-brand-600 ring-2 ring-brand-200" :
                    "border-surface-200 bg-surface-100 text-ink-600",
                  )}
                >
                  {i}
                </div>
                <span className={cn(
                  "text-[8px] sm:text-[9px] text-center leading-tight w-8 sm:w-[52px] font-medium break-words",
                  isCurrent ? "text-brand-600" : isPast ? "text-ink-600" : "text-ink-700",
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
    analysis.totalSVI >= 140 ? "text-emerald-600"
    : analysis.totalSVI >= 120 ? "text-brand-600"
    : analysis.totalSVI >= 100 ? "text-amber-600"
    : "text-red-600";

  const deltaPositive = (analysis.weeklyDelta ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pt-6 pb-2">
        <h1 className="text-2xl font-bold text-ink-800">{startupName ?? "My Startup"}</h1>
        <p className="text-sm text-ink-600 mt-1">Startup Value Index Dashboard</p>
      </div>

      {/* SVI Hero */}
      <div className="rounded-2xl border border-surface-200 bg-white px-8 py-8 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
        {/* Score */}
        <div className="flex flex-col items-center gap-2 sm:border-r sm:border-surface-200 sm:pr-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-brand-600 font-medium">Startup Value Index</p>
          <div className="flex items-end gap-1">
            <span className={cn("font-mono text-7xl font-bold tabular-nums tracking-tight leading-none", sviColor)}>
              {analysis.totalSVI}
            </span>
            <span className="mb-2 text-sm text-ink-600 font-mono">SVI</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-600">Base 100</span>
            <span className="text-ink-700">→</span>
            <span className={cn("text-sm font-semibold", sviColor)}>{sviLabel}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
          {/* Weekly delta */}
          <div className="flex flex-col items-center gap-1">
            <div className={cn("flex items-center gap-1 text-xl font-bold font-mono", deltaPositive ? "text-emerald-600" : "text-red-600")}>
              {deltaPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {deltaPositive ? "+" : ""}{analysis.weeklyDelta ?? 0}
            </div>
            <p className="text-[10px] text-ink-600 text-center">This week</p>
          </div>
          {/* Stage */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold font-mono text-brand-600">{analysis.stage}</span>
            <p className="text-[10px] text-ink-600 text-center">{analysis.stageLabel ?? SVI_STAGE_LABELS[analysis.stage]}</p>
          </div>
          {/* Confidence */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold font-mono text-ink-800">{Math.round(analysis.confidenceMultiplier * 100)}%</span>
            <p className="text-[10px] text-ink-600 text-center">Evidence conf.</p>
          </div>
          {/* Percentile */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-bold font-mono text-teal-600">
              {analysis.percentileRank ? `Top ${100 - analysis.percentileRank}%` : "—"}
            </span>
            <p className="text-[10px] text-ink-600 text-center">Stage {analysis.stage} peers</p>
          </div>
        </div>
      </div>

      {/* SVI Trend Chart */}
      {snapshotHistory && snapshotHistory.length > 0 && (
        <SVITrendChart data={snapshotHistory.map(s => ({ date: s.date, svi: s.svi }))} />
      )}

      {/* Priority Tasks */}
      <PriorityTasks
        tasks={generatePriorityTasks(analysis, analysis.stage ?? 0)}
        className="mb-6"
      />

      {/* SVI Comparison — benchmark vs stage peers */}
      <SVIComparison analysis={analysis} className="mb-6" />

      {/* Estimated Valuation */}
      <SVIValuation analysis={analysis} className="mb-6" />

      {/* Compliance Checker */}
      <ComplianceChecker analysis={analysis} className="mb-6" />

      {/* Summary */}
      <p className="text-sm text-ink-600 leading-relaxed px-1">{analysis.summary}</p>

      {/* Stage Journey */}
      <StageJourney currentStage={analysis.stage} />

      {/* Snapshot History Chart */}
      {snapshotHistory && snapshotHistory.length > 0 && (
        <SVIChart snapshots={snapshotHistory} />
      )}

      {/* Week-over-Week Dimension Comparison */}
      {snapshotHistory && snapshotHistory.length > 0 && analysis.subs.length > 0 && (
        <SVIDimensionCompare
          current={analysis.subs.map((s) => ({ key: s.key, label: s.label, value: Math.round(s.value) }))}
          previous={analysis.subs.map((s) => ({
            key: s.key,
            label: s.label,
            value: Math.max(0, Math.round(s.value) - (s.adjustment >= 0 ? s.adjustment : 0)),
          }))}
        />
      )}

      {/* Add Evidence CTA */}
      <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-ink-800">Add Evidence to Lift Your SVI</p>
          <p className="text-xs text-ink-600 mt-0.5">Upload docs, connect integrations, or verify claims.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)} className="shrink-0 h-9 gap-1.5">
          <Plus strokeWidth={1.75} className="h-4 w-4" />
          Add Evidence
        </Button>
      </div>

      {/* 8 Dimension Bars */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">Index Breakdown</p>
        <div className="space-y-2">
          {analysis.subs.map(sub => <DimensionBar key={sub.key} sub={sub} />)}
        </div>
      </div>

      {/* Risk flags */}
      {analysis.riskPenalties.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.18em] text-red-600 font-medium flex items-center gap-2">
            <AlertTriangle strokeWidth={1.75} className="h-3.5 w-3.5" />
            Risk Flags ({analysis.riskPenalties.length})
          </p>
          {analysis.riskPenalties.map(r => (
            <div key={r.label} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink-800">{r.label}</p>
                <p className="text-xs text-ink-600 mt-0.5">{r.reason}</p>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-red-600">-{r.points}</span>
            </div>
          ))}
        </div>
      )}

      {/* Evidence gaps */}
      {analysis.evidenceGaps.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">Evidence to Add (by impact)</p>
          <div className="space-y-2">
            {analysis.evidenceGaps.map(gap => (
              <div key={gap.label} className="flex items-start gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
                <span className={cn(
                  "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                  gap.priority === "P0" ? "bg-red-50 text-red-600" : gap.priority === "P1" ? "bg-amber-50 text-amber-600" : "bg-surface-200 text-ink-600",
                )}>
                  {gap.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-800">{gap.label}</p>
                  <p className="text-xs text-ink-600 mt-0.5">{gap.action}</p>
                </div>
                <span className="shrink-0 font-mono text-xs font-semibold text-teal-600">+{gap.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next actions */}
      {analysis.nextActions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">Next Actions</p>
          <div className="space-y-2">
            {analysis.nextActions.map(action => (
              <div key={action.title} className="rounded-xl border border-surface-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <Zap strokeWidth={1.75} className={cn("mt-0.5 h-4 w-4 shrink-0", action.priority === "P0" ? "text-red-600" : action.priority === "P1" ? "text-amber-600" : "text-ink-600")} />
                    <div>
                      <p className="text-sm font-medium text-ink-800">{action.title}</p>
                      <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">{action.detail}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-semibold text-teal-600 mt-0.5">{action.impact}</span>
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
