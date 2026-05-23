"use client";

import * as React from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronDown, ChevronUp, Clock, ExternalLink, FileText, Plus, RefreshCw, TrendingDown, TrendingUp, Upload, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { estimateValuation, formatAUD } from "@/lib/valuation";
import { EvidenceWizard } from "@/components/svi/evidence-wizard";
import { SVIChart } from "@/components/svi/svi-chart";
import { SVIDimensionCompare } from "@/components/svi/svi-dimension-compare";
import { SVITrendChart } from "@/components/ui/svi-trend-chart";
import { PriorityTasks, generatePriorityTasks } from "@/components/workspace/priority-tasks";
import { SVIComparison } from "@/components/svi/svi-comparison";
import { ComplianceChecker } from "@/components/svi/compliance-checker";
import { RecentAnalyses } from "@/components/dashboard/recent-analyses";

import type { ReportEntry, SVIHistoryPoint } from "@/app/dashboard/svi/page";

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

function DimensionBar({ sub, rank }: { sub: SVIAnalysis["subs"][number]; rank: number }) {
  const [open, setOpen] = React.useState(false);
  const pct = Math.round(sub.value);
  const adjColor = sub.adjustment >= 0 ? "text-emerald-600" : "text-red-600";
  const barColor = pct >= 70 ? "bg-emerald-500" : pct >= 50 ? "bg-brand-500" : pct >= 35 ? "bg-amber-500" : "bg-red-500";

  // Estimate potential points from improving this dimension
  const potentialPts = Math.max(1, Math.round((100 - pct) * parseFloat(DIM_WEIGHTS[sub.key] ?? "10") / 100 * 0.5));

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
              <ArrowUpRight className="h-3 w-3" /> Improve (+{potentialPts} pts)
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

/** Relative time: "2 days ago", "3 weeks ago" etc. */
function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  if (diffDays < 7) return `${diffDays} days ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "1 month ago";
  return `${diffMonths} months ago`;
}

/** Color-coded SVI score history chart using svi_analyses data */
function SVIScoreHistoryChart({ history }: { history: SVIHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6 text-center">
        <p className="text-sm text-ink-500">Your SVI score history chart will appear after your second analysis.</p>
      </div>
    );
  }

  const width = 600;
  const height = 220;
  const padding = { top: 24, right: 20, bottom: 32, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const sviValues = history.map(d => d.total_svi);
  const minSVI = Math.max(0, Math.min(...sviValues) - 15);
  const maxSVI = Math.max(...sviValues) + 15;

  const points = history.map((d, i) => ({
    x: padding.left + (i / (history.length - 1)) * chartW,
    y: padding.top + chartH - ((d.total_svi - minSVI) / (maxSVI - minSVI)) * chartH,
    svi: d.total_svi,
    date: d.created_at,
  }));

  // Build line segments colored by direction
  const segments: { path: string; color: string }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const increasing = to.svi >= from.svi;
    segments.push({
      path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
      color: increasing ? "#10b981" : "#ef4444", // emerald-500 / red-500
    });
  }

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`;

  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const delta = latest.total_svi - previous.total_svi;
  const isUp = delta >= 0;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-800">SVI Score History</h3>
          <p className="text-xs text-ink-500">{history.length} analyses tracked</p>
        </div>
        <div className="text-right flex items-center gap-2">
          <span className="text-2xl font-bold text-ink-900">{latest.total_svi}</span>
          <span className={cn("flex items-center gap-0.5 text-sm font-semibold", isUp ? "text-emerald-600" : "text-red-600")}>
            {isUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {isUp ? "+" : ""}{delta}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padding.top + chartH * (1 - pct);
          const val = Math.round(minSVI + (maxSVI - minSVI) * pct);
          return (
            <g key={pct}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{val}</text>
            </g>
          );
        })}
        {/* Area fill with gradient */}
        <defs>
          <linearGradient id="sviHistGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.12" />
            <stop offset="100%" stopColor={isUp ? "#10b981" : "#ef4444"} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#sviHistGrad)" />
        {/* Color-coded line segments */}
        {segments.map((seg, i) => (
          <path key={i} d={seg.path} fill="none" stroke={seg.color} strokeWidth="2.5" strokeLinecap="round" />
        ))}
        {/* Data points */}
        {points.map((p, i) => {
          const pointColor = i > 0 ? (p.svi >= points[i - 1].svi ? "#10b981" : "#ef4444") : "#2563eb";
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === points.length - 1 ? 5 : 3}
              fill={i === points.length - 1 ? pointColor : "white"}
              stroke={pointColor}
              strokeWidth="2"
            />
          );
        })}
        {/* Date labels */}
        {points.filter((_, i) => i === 0 || i === points.length - 1 || (history.length > 5 && i % Math.ceil(points.length / 4) === 0)).map((p, i) => (
          <text key={i} x={p.x} y={height - 5} textAnchor="middle" fontSize="9" fill="#94a3b8">
            {new Date(p.date).toLocaleDateString("en-AU", { month: "short", day: "numeric" })}
          </text>
        ))}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-surface-100">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-ink-500">Score increasing</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-4 rounded-full bg-red-500" />
          <span className="text-[10px] text-ink-500">Score decreasing</span>
        </div>
      </div>
    </div>
  );
}

/** Recent reports list */
function RecentReports({ reports }: { reports: ReportEntry[] }) {
  if (reports.length === 0) return null;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-900">Recent Reports</h3>
        </div>
        <span className="text-xs text-ink-400">{reports.length} report{reports.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="divide-y divide-surface-100">
        {reports.map((report, idx) => {
          const date = new Date(report.created_at);
          const isDeepDive = report.rnd_report_json != null;
          const reportType = isDeepDive ? "Deep Dive" : report.input_type === "url" ? "URL Analysis" : "SVI Analysis";
          const prevSVI = idx < reports.length - 1 ? reports[idx + 1].total_svi : null;
          const delta = prevSVI != null ? report.total_svi - prevSVI : null;

          return (
            <Link
              key={report.id}
              href={`/s/${report.id}`}
              className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-50 transition-colors group"
            >
              {/* SVI badge */}
              <div className={cn(
                "flex items-center justify-center h-10 w-10 rounded-xl text-sm font-bold shrink-0",
                report.total_svi >= 140 ? "bg-emerald-50 text-emerald-700" :
                report.total_svi >= 100 ? "bg-brand-50 text-brand-700" :
                "bg-amber-50 text-amber-700",
              )}>
                {report.total_svi}
              </div>
              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink-800 truncate">{reportType}</span>
                  {isDeepDive && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-50 text-brand-600">R&D</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-ink-500">
                    {date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  {report.svi_version && (
                    <span className="text-[10px] text-ink-400">v{report.svi_version}</span>
                  )}
                </div>
              </div>
              {/* Delta */}
              {delta !== null && (
                <span className={cn(
                  "text-xs font-mono font-semibold shrink-0",
                  delta >= 0 ? "text-emerald-600" : "text-red-600",
                )}>
                  {delta >= 0 ? "+" : ""}{delta}
                </span>
              )}
              <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-300 group-hover:text-brand-500 transition-colors shrink-0" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

interface SVIDashboardProps {
  analysis: SVIAnalysis;
  startupName?: string;
  snapshotHistory?: Array<{ date: string; svi: number; delta: number | null }>;
  userEmail?: string;
  sviHistory?: SVIHistoryPoint[];
  recentReports?: ReportEntry[];
  lastAnalysisDate?: string;
  previousSVI?: number;
}

export function SVIDashboard({
  analysis,
  startupName,
  snapshotHistory,
  sviHistory = [],
  recentReports = [],
  lastAnalysisDate,
  previousSVI,
}: SVIDashboardProps) {
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

  const deltaValue = analysis.weeklyDelta ?? (previousSVI != null ? analysis.totalSVI - previousSVI : 0);
  const deltaPositive = deltaValue >= 0;

  // Valuation estimate
  const est = estimateValuation(analysis.totalSVI, analysis.stage ?? 0);

  // Sort dimensions by score (lowest first) for prioritized improvement suggestions
  const sortedSubs = [...analysis.subs].sort((a, b) => a.value - b.value);

  return (
    <div className="space-y-6">
      {/* Recent Analyses (from localStorage) */}
      <RecentAnalyses className="mb-6" />

      {/* Header */}
      <div className="pt-6 pb-2">
        <h1 className="text-2xl font-bold text-ink-800">{startupName ?? "My Startup"}</h1>
        <p className="text-sm text-ink-600 mt-1">Startup Value Index Dashboard</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          HERO SECTION — SVI Score + Valuation + Last Updated
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-surface-200 bg-gradient-to-br from-white via-white to-brand-50/30 px-8 py-8 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
          {/* SVI Score (primary) */}
          <div className="flex flex-col items-center gap-2 lg:border-r lg:border-surface-200 lg:pr-8">
            <p className="text-[10px] uppercase tracking-[0.2em] text-brand-600 font-medium">Startup Value Index</p>
            <div className="flex items-end gap-1">
              <span className={cn("font-mono text-7xl font-bold tabular-nums tracking-tight leading-none", sviColor)}>
                {analysis.totalSVI}
              </span>
              <span className="mb-2 text-sm text-ink-600 font-mono">SVI</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={cn("flex items-center gap-1 text-sm font-semibold", deltaPositive ? "text-emerald-600" : "text-red-600")}>
                {deltaPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {deltaPositive ? "+" : ""}{deltaValue}
              </div>
              <span className="text-ink-300">|</span>
              <span className={cn("text-sm font-semibold", sviColor)}>{sviLabel}</span>
            </div>
          </div>

          {/* Valuation Estimate (secondary) */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Estimated valuation */}
              <div className="rounded-xl bg-white border border-surface-200 px-5 py-4">
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium mb-1">Estimated Valuation</p>
                <p className="text-2xl font-extrabold text-brand-600 leading-tight">{formatAUD(est.mid)}</p>
                <p className="text-xs text-ink-500 mt-0.5">{formatAUD(est.low)} — {formatAUD(est.high)} range</p>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Stage */}
                <div className="rounded-xl bg-white border border-surface-200 px-4 py-3">
                  <p className="text-[10px] text-ink-500 mb-0.5">Stage</p>
                  <p className="text-lg font-bold font-mono text-brand-600">{analysis.stage}</p>
                  <p className="text-[10px] text-ink-500 truncate">{analysis.stageLabel ?? SVI_STAGE_LABELS[analysis.stage]}</p>
                </div>
                {/* Confidence */}
                <div className="rounded-xl bg-white border border-surface-200 px-4 py-3">
                  <p className="text-[10px] text-ink-500 mb-0.5">Evidence</p>
                  <p className="text-lg font-bold font-mono text-ink-800">{Math.round(analysis.confidenceMultiplier * 100)}%</p>
                  <p className="text-[10px] text-ink-500">confidence</p>
                </div>
              </div>
            </div>

            {/* Last updated + re-analyze CTA */}
            <div className="flex items-center justify-between mt-3 px-1">
              <div className="flex items-center gap-1.5 text-xs text-ink-500">
                <Clock strokeWidth={1.75} className="h-3.5 w-3.5" />
                {lastAnalysisDate ? (
                  <span>Last analyzed {timeAgo(lastAnalysisDate)}</span>
                ) : (
                  <span>Current analysis</span>
                )}
                {analysis.percentileRank != null && (
                  <>
                    <span className="text-ink-300 ml-1">|</span>
                    <span className="text-teal-600 font-medium ml-1">Top {Math.max(1, 100 - analysis.percentileRank)}% for stage {analysis.stage}</span>
                  </>
                )}
              </div>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" />
                Re-analyze
              </Link>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="mt-4 pt-3 border-t border-surface-200 text-[10px] text-ink-400 leading-relaxed text-center">
          Valuation estimate is indicative only, based on SVI score and AU market benchmarks. This is not financial, investment, or legal advice.
          Upload more evidence and revenue data to improve accuracy. Always consult a qualified professional before making financial decisions.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SCORE HISTORY CHART — Color-coded line chart from svi_analyses
          ═══════════════════════════════════════════════════════════════════════ */}
      {sviHistory.length > 0 && (
        <SVIScoreHistoryChart history={sviHistory} />
      )}

      {/* SVI Trend Chart (snapshot-based, if available) */}
      {snapshotHistory && snapshotHistory.length > 0 && sviHistory.length < 2 && (
        <SVITrendChart data={snapshotHistory.map(s => ({ date: s.date, svi: s.svi }))} />
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          EVIDENCE IMPACT SECTION — Highest-impact uploads
          ═══════════════════════════════════════════════════════════════════════ */}
      {analysis.evidenceGaps.length > 0 && (
        <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50/60 via-white to-emerald-50/30 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-brand-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              <div>
                <h3 className="text-sm font-semibold text-ink-900">Upload Evidence to Increase Your SVI</h3>
                <p className="text-xs text-ink-500 mt-0.5">These actions will give you the most points</p>
              </div>
            </div>
            <Button variant="primary" size="xs" onClick={() => setWizardOpen(true)} className="shrink-0 gap-1.5">
              <Plus strokeWidth={1.75} className="h-3.5 w-3.5" />
              Add Evidence
            </Button>
          </div>
          <div className="divide-y divide-surface-100">
            {analysis.evidenceGaps.slice(0, 5).map(gap => (
              <div key={gap.label} className="flex items-center gap-4 px-5 py-3.5 hover:bg-brand-50/30 transition-colors">
                <span className={cn(
                  "shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                  gap.priority === "P0" ? "bg-red-100 text-red-700" : gap.priority === "P1" ? "bg-amber-100 text-amber-700" : "bg-surface-200 text-ink-600",
                )}>
                  {gap.priority}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-800">{gap.label}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{gap.action}</p>
                </div>
                <Link
                  href="/workspace/evidence"
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors shadow-sm"
                >
                  Upload → <span className="text-teal-600">+{gap.impact} pts</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Priority Tasks */}
      <PriorityTasks
        tasks={generatePriorityTasks(analysis, analysis.stage ?? 0)}
        className="mb-0"
      />

      {/* ═══════════════════════════════════════════════════════════════════════
          DIMENSION BREAKDOWN — 8 scored bars with improve CTAs
          ═══════════════════════════════════════════════════════════════════════ */}
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-ink-700 font-medium mb-3">Index Breakdown — 8 Dimensions</p>
        <div className="space-y-2">
          {analysis.subs.map((sub, idx) => <DimensionBar key={sub.key} sub={sub} rank={idx + 1} />)}
        </div>
      </div>

      {/* Stage Journey */}
      <StageJourney currentStage={analysis.stage} />

      {/* SVI Comparison — benchmark vs stage peers */}
      <SVIComparison analysis={analysis} className="" />

      {/* Summary */}
      <p className="text-sm text-ink-600 leading-relaxed px-1">{analysis.summary}</p>

      {/* Compliance Checker */}
      <ComplianceChecker analysis={analysis} className="" />

      {/* ═══════════════════════════════════════════════════════════════════════
          RECENT REPORTS — All SVI analyses for this project
          ═══════════════════════════════════════════════════════════════════════ */}
      {recentReports.length > 0 && (
        <RecentReports reports={recentReports} />
      )}

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

      {/* Snapshot History Chart (detailed, from snapshots table) */}
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
