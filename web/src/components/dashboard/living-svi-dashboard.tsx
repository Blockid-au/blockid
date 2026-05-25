"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  FileText,
  Plus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Upload,
  Zap,
} from "lucide-react";
import type { SVIAnalysis, SVIEvidenceGap } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { SVITrendChart } from "@/components/ui/svi-trend-chart";
import { AdvisorDashboard } from "@/components/dashboard/advisor-dashboard";
import { cn } from "@/lib/utils";

/* ─── Types ────────────────────────────────────────────────────────────────── */

interface ReportEntry {
  id: string;
  total_svi: number;
  created_at: string;
  input_type: string | null;
  raw_input?: string;
}

interface SavedSection {
  section_id: string;
  depth: string;
  content: string;
  word_count: number;
  credits_cost: number;
}

interface UserAction {
  id: string;
  action_type: string;
  action_label: string;
  dimension: string | null;
  svi_impact_estimate: number;
  completed_at: string;
}

export interface LivingDashboardProps {
  analysis: SVIAnalysis;
  sviHistory: Array<{ total_svi: number; created_at: string }>;
  recentReports: ReportEntry[];
  savedSections: SavedSection[];
  snapshotHistory: Array<{ date: string; svi: number; delta: number | null }>;
  startupName?: string;
  userEmail: string;
  creditBalance: number;
  evidenceCount: number;
  shareViews: number;
  lastAnalysisDate?: string;
  previousSVI?: number;
  userActions: UserAction[];
  userProfile: {
    displayName: string | null;
    startupName: string | null;
    startupStage: string | null;
    industry: string | null;
    startupGoals: string[] | null;
  };
}

/* ─── Section title mapping ───────────────────────────────────────────────── */

const SECTION_TITLES: Record<string, string> = {
  executive: "Executive Summary",
  founder_team: "Founder & Team",
  market: "Market Opportunity",
  product: "Product & Tech",
  traction: "Traction & Revenue",
  gtm: "Go-to-Market",
  cap_table: "Cap Table & Governance",
  investor_ready: "Investor Readiness",
  legal: "Legal & Compliance",
  vision_moat: "Strategic Vision & Moat",
  financial: "Financial Projections",
  risk: "Risk & Mitigation",
  competitive: "Competitive Intelligence",
  roadmap: "90-Day Roadmap",
  board_summary: "Board-Ready Summary",
  au_market: "AU Market Deep Dive",
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scoreColor(svi: number): string {
  if (svi >= 200) return "text-violet-600";
  if (svi >= 170) return "text-emerald-600";
  if (svi >= 140) return "text-brand-600";
  if (svi >= 110) return "text-blue-600";
  if (svi >= 80) return "text-amber-600";
  return "text-red-600";
}

function scoreBgColor(svi: number): string {
  if (svi >= 200) return "bg-violet-50 border-violet-200";
  if (svi >= 170) return "bg-emerald-50 border-emerald-200";
  if (svi >= 140) return "bg-brand-50 border-brand-200";
  if (svi >= 110) return "bg-blue-50 border-blue-200";
  if (svi >= 80) return "bg-amber-50 border-amber-200";
  return "bg-red-50 border-red-200";
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "P0":
      return "bg-red-50 text-red-700 border-red-200";
    case "P1":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "P2":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-surface-100 text-ink-600 border-surface-200";
  }
}

function priorityLabel(priority: string): string {
  switch (priority) {
    case "P0":
      return "HIGH";
    case "P1":
      return "MEDIUM";
    case "P2":
      return "LOW";
    default:
      return priority;
  }
}

function gapToCTA(gap: SVIEvidenceGap): { label: string; href: string } {
  const lower = (gap.label + " " + gap.action).toLowerCase();
  if (lower.includes("evidence") || lower.includes("upload") || lower.includes("document") || lower.includes("testimonial")) {
    return { label: "Upload Evidence", href: "/workspace/evidence" };
  }
  if (lower.includes("pitch deck") || lower.includes("pitch")) {
    return { label: "Upload Pitch Deck", href: "/workspace/evidence" };
  }
  if (lower.includes("github") || lower.includes("repo") || lower.includes("code")) {
    return { label: "Connect GitHub", href: "/workspace/tools/github-audit" };
  }
  if (lower.includes("website") || lower.includes("url") || lower.includes("seo")) {
    return { label: "Audit Website", href: "/workspace/tools/website-audit" };
  }
  if (lower.includes("financial") || lower.includes("revenue") || lower.includes("metric")) {
    return { label: "Update Metrics", href: "/workspace/metrics" };
  }
  if (lower.includes("cap table") || lower.includes("equity") || lower.includes("vesting")) {
    return { label: "Setup Cap Table", href: "/workspace/equity" };
  }
  return { label: "Take Action", href: "/" };
}

/* ─── Tab IDs ─────────────────────────────────────────────────────────────── */

type TabId = "overview" | "reports" | "actions" | "history";

const TABS: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "actions", label: "Actions", icon: Target },
  { id: "history", label: "History", icon: Clock },
];

/* ─── Main Component ──────────────────────────────────────────────────────── */

export function LivingSVIDashboard(props: LivingDashboardProps) {
  const {
    analysis,
    sviHistory,
    recentReports,
    savedSections,
    snapshotHistory,
    startupName,
    userEmail,
    creditBalance,
    evidenceCount,
    shareViews,
    lastAnalysisDate,
    previousSVI,
    userActions,
    userProfile,
  } = props;

  const [activeTab, setActiveTab] = React.useState<TabId>("overview");

  const svi = analysis.totalSVI;
  const stage = analysis.stage ?? 0;
  const stageLabel = analysis.stageLabel ?? SVI_STAGE_LABELS[stage] ?? "Concept";
  const delta = previousSVI != null ? svi - previousSVI : undefined;
  const unlockedSections = savedSections.length;

  return (
    <div className="space-y-6">
      {/* ── SVI Hero Header ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 shadow-sm overflow-hidden">
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Score + name */}
            <div className="flex items-center gap-5">
              {/* Large score circle */}
              <div className={cn(
                "flex items-center justify-center h-20 w-20 rounded-2xl border-2 shadow-sm",
                scoreBgColor(svi),
              )}>
                <span className={cn("text-3xl font-extrabold", scoreColor(svi))}>{svi}</span>
              </div>

              <div>
                <h1 className="text-xl font-bold text-ink-900">
                  {startupName ?? userProfile.startupName ?? "My SVI Score"}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {/* Stage badge */}
                  <span className="inline-flex items-center rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    Stage {stage}: {stageLabel}
                  </span>
                  {/* Delta badge */}
                  {delta != null && delta !== 0 && (
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      delta > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200",
                    )}>
                      {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {delta > 0 ? "+" : ""}{delta} from last
                    </span>
                  )}
                  {/* Updated time */}
                  {lastAnalysisDate && (
                    <span className="text-xs text-ink-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Updated {timeAgo(lastAnalysisDate)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors shrink-0 self-start sm:self-center"
            >
              <RefreshCw className="h-4 w-4" />
              Run New Analysis
            </Link>
          </div>
        </div>
      </div>

      {/* ── Tab Navigation ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap cursor-pointer",
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-surface-50 dark:bg-surface-100 text-ink-600 hover:bg-surface-100 dark:hover:bg-surface-200 hover:text-ink-800",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <OverviewTab
          analysis={analysis}
          sviHistory={sviHistory}
          recentReports={recentReports}
          savedSections={savedSections}
          snapshotHistory={snapshotHistory}
          startupName={startupName}
          userEmail={userEmail}
          creditBalance={creditBalance}
          evidenceCount={evidenceCount}
          shareViews={shareViews}
          lastAnalysisDate={lastAnalysisDate}
          previousSVI={previousSVI}
          userActions={userActions}
          userProfile={userProfile}
          unlockedSections={unlockedSections}
        />
      )}
      {activeTab === "reports" && (
        <ReportsTab
          recentReports={recentReports}
          savedSections={savedSections}
        />
      )}
      {activeTab === "actions" && (
        <ActionsTab analysis={analysis} />
      )}
      {activeTab === "history" && (
        <HistoryTab
          recentReports={recentReports}
          savedSections={savedSections}
          userActions={userActions}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 1: OVERVIEW
   ═══════════════════════════════════════════════════════════════════════════ */

function OverviewTab(
  props: LivingDashboardProps & { unlockedSections: number },
) {
  const {
    analysis,
    sviHistory,
    recentReports,
    snapshotHistory,
    startupName,
    userEmail,
    creditBalance,
    shareViews,
    lastAnalysisDate,
    previousSVI,
    userActions,
    userProfile,
    unlockedSections,
  } = props;

  // Build trend chart data from sviHistory
  const trendData = sviHistory.map((h) => ({
    date: h.created_at,
    svi: h.total_svi,
  }));

  // Generate notifications from evidence gaps
  const notifications = generateNotifications(analysis, lastAnalysisDate);

  return (
    <div className="space-y-6">
      {/* Row 1: Trend Chart */}
      <SVITrendChart data={trendData} />

      {/* Row 2: Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickStatCard
          icon={BarChart3}
          label="Analyses Run"
          value={recentReports.length.toString()}
          color="text-brand-600 bg-brand-50"
        />
        <QuickStatCard
          icon={BookOpen}
          label="Reports Unlocked"
          value={unlockedSections.toString()}
          color="text-emerald-600 bg-emerald-50"
        />
        <QuickStatCard
          icon={Eye}
          label="Share Link Views"
          value={shareViews.toString()}
          color="text-blue-600 bg-blue-50"
        />
        <QuickStatCard
          icon={CreditCard}
          label="Credits Remaining"
          value={creditBalance.toFixed(2)}
          color="text-amber-600 bg-amber-50"
        />
      </div>

      {/* Row 3: Notifications Panel */}
      {notifications.length > 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
            <Bell strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-ink-900">AI Advisor Insights</h3>
          </div>
          <div className="divide-y divide-surface-100">
            {notifications.map((n, i) => (
              <div key={i} className="px-5 py-3 flex items-start gap-3">
                <div className={cn(
                  "mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                  n.type === "improvement" ? "bg-emerald-50" : n.type === "warning" ? "bg-amber-50" : "bg-blue-50",
                )}>
                  {n.type === "improvement" ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                  ) : n.type === "warning" ? (
                    <Bell className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink-800">{n.message}</p>
                  {n.impact && (
                    <p className="text-xs text-emerald-600 font-medium mt-0.5">
                      Potential: +{n.impact} SVI points
                    </p>
                  )}
                </div>
                {n.href && (
                  <Link
                    href={n.href}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0"
                  >
                    {n.ctaLabel ?? "View"}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 4: Advisor Dashboard (existing) */}
      <AdvisorDashboard
        analysis={analysis}
        userProfile={userProfile}
        startupName={startupName}
        snapshotHistory={snapshotHistory}
        userEmail={userEmail}
        sviHistory={sviHistory}
        recentReports={recentReports.map((r) => ({
          id: r.id,
          total_svi: r.total_svi,
          created_at: r.created_at,
          svi_version: null,
          input_type: r.input_type,
          rnd_report_json: null,
        }))}
        lastAnalysisDate={lastAnalysisDate}
        previousSVI={previousSVI}
      />

      {/* Row 5: Recent Activity */}
      {userActions.length > 0 && (
        <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-100 flex items-center gap-2">
            <Activity strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-ink-900">Recent Activity</h3>
          </div>
          <div className="divide-y divide-surface-100">
            {userActions.slice(0, 5).map((action) => (
              <div key={action.id} className="px-5 py-3 flex items-center gap-3">
                <div className="h-7 w-7 rounded-lg bg-surface-50 dark:bg-surface-100 flex items-center justify-center shrink-0">
                  <ActionTypeIcon type={action.action_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink-800 truncate">{action.action_label}</p>
                  <p className="text-[11px] text-ink-500">{timeAgo(action.completed_at)}</p>
                </div>
                {action.svi_impact_estimate > 0 && (
                  <span className="text-[11px] font-mono font-semibold text-emerald-600 shrink-0">
                    +{action.svi_impact_estimate} SVI
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 2: REPORTS
   ═══════════════════════════════════════════════════════════════════════════ */

function ReportsTab({
  recentReports,
  savedSections,
}: {
  recentReports: ReportEntry[];
  savedSections: SavedSection[];
}) {
  if (recentReports.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 px-8 py-12 text-center shadow-sm">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-brand-50 border border-brand-200 mb-4">
          <FileText strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
        </div>
        <h3 className="text-lg font-semibold text-ink-800 mb-2">No reports yet</h3>
        <p className="text-sm text-ink-500 mb-4 max-w-sm mx-auto">
          Run your first SVI analysis to generate a comprehensive startup report with actionable insights.
        </p>
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Get My SVI Score
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {recentReports.map((report, idx) => {
        const prevReport = recentReports[idx + 1];
        const reportDelta = prevReport ? report.total_svi - prevReport.total_svi : undefined;
        const inputSnippet = report.raw_input
          ? report.raw_input.slice(0, 80) + (report.raw_input.length > 80 ? "..." : "")
          : null;
        const typeLabel =
          report.input_type === "url" ? "URL Analysis" :
          report.input_type === "rnd" ? "R&D Report" :
          report.input_type === "deep_dive" ? "Deep Dive" :
          "SVI Analysis";

        // Only show saved sections for the latest analysis
        const isLatest = idx === 0;

        return (
          <div
            key={report.id}
            className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 shadow-sm overflow-hidden"
          >
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shrink-0",
                    scoreBgColor(report.total_svi),
                    scoreColor(report.total_svi),
                  )}>
                    {report.total_svi}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-ink-800">{typeLabel}</p>
                      {reportDelta != null && reportDelta !== 0 && (
                        <span className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-semibold",
                          reportDelta > 0 ? "text-emerald-600" : "text-red-500",
                        )}>
                          {reportDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {reportDelta > 0 ? "+" : ""}{reportDelta}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5">
                      {formatDate(report.created_at)}
                    </p>
                    {inputSnippet && (
                      <p className="text-xs text-ink-400 mt-1 truncate max-w-md">
                        {inputSnippet}
                      </p>
                    )}
                  </div>
                </div>
                <Link
                  href={`/workspace/reports/${report.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0 mt-1"
                >
                  View Report <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              {/* Saved sections for latest */}
              {isLatest && savedSections.length > 0 && (
                <div className="mt-4 pt-3 border-t border-surface-100">
                  <p className="text-xs font-medium text-ink-600 mb-2">Saved Sections</p>
                  <div className="flex flex-wrap gap-2">
                    {savedSections.map((section) => (
                      <span
                        key={section.section_id}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {SECTION_TITLES[section.section_id] ?? section.section_id}
                        <span className="text-emerald-500 font-normal ml-0.5">
                          ({section.word_count}w)
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Run New Analysis CTA */}
      <div className="flex justify-center pt-2">
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Run New Analysis
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 3: ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

function ActionsTab({ analysis }: { analysis: SVIAnalysis }) {
  const gaps = analysis.evidenceGaps ?? [];

  if (gaps.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 px-8 py-12 text-center shadow-sm">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-200 mb-4">
          <CheckCircle2 strokeWidth={1.75} className="h-6 w-6 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-ink-800 mb-2">Looking great!</h3>
        <p className="text-sm text-ink-500 max-w-sm mx-auto">
          No critical evidence gaps found. Keep building and run another analysis when you hit your next milestone.
        </p>
      </div>
    );
  }

  // Sort by impact descending
  const sorted = [...gaps].sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0));
  const totalPotential = sorted.reduce((sum, g) => sum + (g.impact ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Potential banner */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-50/50 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">Total improvement potential</p>
          <p className="text-xs text-emerald-600 mt-0.5">Complete all actions below to maximize your SVI score</p>
        </div>
        <span className="text-2xl font-extrabold text-emerald-700">+{totalPotential}</span>
      </div>

      {/* Action cards */}
      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((gap, i) => {
          const cta = gapToCTA(gap);
          return (
            <div
              key={i}
              className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 shadow-sm p-5 flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h4 className="text-sm font-semibold text-ink-800 leading-snug">{gap.label}</h4>
                <span className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                  priorityColor(gap.priority),
                )}>
                  {priorityLabel(gap.priority)}
                </span>
              </div>

              <p className="text-xs text-ink-500 flex-1 mb-3">{gap.action}</p>

              <div className="flex items-center justify-between mt-auto">
                <span className="text-xs font-mono font-semibold text-emerald-600">
                  +{gap.impact} SVI points
                </span>
                <Link
                  href={cta.href}
                  className="inline-flex items-center gap-1 rounded-lg bg-brand-50 border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  {cta.label}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TAB 4: HISTORY
   ═══════════════════════════════════════════════════════════════════════════ */

interface TimelineEvent {
  id: string;
  type: "analysis" | "section" | "action";
  title: string;
  detail: string;
  date: string;
  icon: typeof FileText;
  iconColor: string;
}

function HistoryTab({
  recentReports,
  savedSections,
  userActions,
}: {
  recentReports: ReportEntry[];
  savedSections: SavedSection[];
  userActions: UserAction[];
}) {
  // Build combined timeline
  const events: TimelineEvent[] = [];

  // Analyses
  for (const r of recentReports) {
    const typeLabel =
      r.input_type === "url" ? "URL Analysis" :
      r.input_type === "rnd" ? "R&D Report" :
      r.input_type === "deep_dive" ? "Deep Dive" :
      "SVI Analysis";
    events.push({
      id: `analysis-${r.id}`,
      type: "analysis",
      title: `${typeLabel} completed`,
      detail: `SVI Score: ${r.total_svi}`,
      date: r.created_at,
      icon: BarChart3,
      iconColor: "text-brand-600 bg-brand-50",
    });
  }

  // Saved sections
  for (const s of savedSections) {
    const title = SECTION_TITLES[s.section_id] ?? s.section_id;
    events.push({
      id: `section-${s.section_id}`,
      type: "section",
      title: `Report section unlocked: ${title}`,
      detail: `${s.word_count} words, ${s.depth} depth (${s.credits_cost > 0 ? s.credits_cost.toFixed(2) + " cr" : "free"})`,
      date: "", // We don't have date for sections, place them near top
      icon: BookOpen,
      iconColor: "text-emerald-600 bg-emerald-50",
    });
  }

  // User actions
  for (const a of userActions) {
    events.push({
      id: `action-${a.id}`,
      type: "action",
      title: a.action_label,
      detail: a.dimension ? `Dimension: ${a.dimension.toUpperCase()}` : a.action_type,
      date: a.completed_at,
      icon: Zap,
      iconColor: "text-amber-600 bg-amber-50",
    });
  }

  // Sort by date descending (events without dates go first)
  events.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return -1;
    if (!b.date) return 1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 px-8 py-12 text-center shadow-sm">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-surface-100 border border-surface-200 mb-4">
          <Clock strokeWidth={1.75} className="h-6 w-6 text-ink-400" />
        </div>
        <h3 className="text-lg font-semibold text-ink-800 mb-2">No history yet</h3>
        <p className="text-sm text-ink-500 max-w-sm mx-auto">
          Your activity timeline will appear here as you run analyses, unlock reports, and take actions.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-surface-100">
        <h3 className="text-sm font-semibold text-ink-900">Full Timeline</h3>
        <p className="text-xs text-ink-500 mt-0.5">{events.length} events</p>
      </div>
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[1.875rem] top-0 bottom-0 w-px bg-surface-200" />

        <div className="divide-y divide-surface-100">
          {events.map((event) => {
            const Icon = event.icon;
            return (
              <div key={event.id} className="flex items-start gap-3 px-5 py-3 relative">
                <div className={cn(
                  "relative z-10 h-7 w-7 rounded-lg flex items-center justify-center shrink-0",
                  event.iconColor,
                )}>
                  <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink-800">{event.title}</p>
                  <p className="text-[11px] text-ink-500">{event.detail}</p>
                </div>
                {event.date && (
                  <span className="text-[11px] text-ink-400 shrink-0">
                    {timeAgo(event.date)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

function QuickStatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white dark:bg-surface-50 shadow-sm p-4">
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2", color)}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <p className="text-xl font-bold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
    </div>
  );
}

function ActionTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "tool_used":
      return <Zap className="h-3.5 w-3.5 text-amber-500" />;
    case "evidence_uploaded":
      return <Upload className="h-3.5 w-3.5 text-emerald-500" />;
    case "guide_visited":
      return <BookOpen className="h-3.5 w-3.5 text-blue-500" />;
    case "external_completed":
      return <ArrowUpRight className="h-3.5 w-3.5 text-brand-500" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-ink-400" />;
  }
}

/* ─── Notification generation ─────────────────────────────────────────────── */

interface Notification {
  type: "improvement" | "warning" | "tip";
  message: string;
  impact?: number;
  href?: string;
  ctaLabel?: string;
}

function generateNotifications(analysis: SVIAnalysis, lastAnalysisDate?: string): Notification[] {
  const notifications: Notification[] = [];
  const gaps = analysis.evidenceGaps ?? [];

  // Map top 3 evidence gaps to actionable notifications
  for (const gap of gaps.slice(0, 3)) {
    const cta = gapToCTA(gap);
    notifications.push({
      type: "improvement",
      message: gap.action,
      impact: gap.impact,
      href: cta.href,
      ctaLabel: cta.label,
    });
  }

  // Check if analysis is stale
  if (lastAnalysisDate) {
    const daysSince = Math.floor((Date.now() - new Date(lastAnalysisDate).getTime()) / 86400000);
    if (daysSince >= 7) {
      notifications.push({
        type: "warning",
        message: `Your SVI hasn't been updated in ${daysSince} days. Run a new analysis to capture recent progress.`,
        href: "/",
        ctaLabel: "Analyze Now",
      });
    }
  }

  // Tip based on stage
  const stage = analysis.stage ?? 0;
  if (stage <= 1 && notifications.length < 4) {
    notifications.push({
      type: "tip",
      message: "Early stage startups grow fastest by validating with real customers. Upload interview notes or survey results as evidence.",
      href: "/workspace/evidence",
      ctaLabel: "Add Evidence",
    });
  }

  return notifications.slice(0, 4);
}
