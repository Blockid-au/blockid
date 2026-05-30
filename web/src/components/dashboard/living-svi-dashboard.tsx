"use client";

/**
 * LivingSVIDashboard — The most important page in BlockID.
 *
 * This is a premium startup mentor dashboard that:
 *  1. Shows the founder's current stage and exactly what to do next (Journey)
 *  2. Preserves and displays ALL paid report content (Full Report)
 *  3. Shows analysis history with score trends (History)
 *  4. Surfaces actionable improvement opportunities by stage (Actions)
 *
 * Design principles:
 *  - Stage-aware: different guidance for Idea vs Growth founders
 *  - Content preservation: every credit spent = content always visible
 *  - Mentor tone: encouraging, specific, actionable
 *  - Mobile-first: stacks cleanly, collapsible sections
 */

import * as React from "react";
import Link from "next/link";
import Markdown from "react-markdown";
import {
  Target,
  Rocket,
  TrendingUp,
  TrendingDown,
  FileText,
  History,
  Zap,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  Shield,
  Lightbulb,
  Users,
  Clock,
  RefreshCw,
  CreditCard,
  Eye,
  Loader2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import type { SVIAnalysis, SVIEvidenceGap } from "@/lib/svi-analysis";
import { REPORT_SECTIONS, getUnlockAllCost } from "@/lib/report-sections";
import type { ReportSectionDef } from "@/lib/report-sections";
import { SVITrendChart } from "@/components/ui/svi-trend-chart";
import { cn } from "@/lib/utils";

/* ─── Types ───────────────────────────────────────────────────────────────── */

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

/* ─── Stage Detection (maps SVI score to 5 mentor stages) ────────────────── */

interface StageInfo { num: number; label: string; bgClass: string; borderClass: string; textClass: string }

const STAGE_DEFS: Array<{ min: number } & StageInfo> = [
  { min: 120, num: 4, label: "Growth",    bgClass: "bg-emerald-50", borderClass: "border-emerald-200", textClass: "text-emerald-700" },
  { min: 70,  num: 3, label: "Traction",  bgClass: "bg-brand-50",   borderClass: "border-brand-200",   textClass: "text-brand-700" },
  { min: 40,  num: 2, label: "Validated", bgClass: "bg-purple-50",  borderClass: "border-purple-200",  textClass: "text-purple-700" },
  { min: 20,  num: 1, label: "MVP",       bgClass: "bg-blue-50",    borderClass: "border-blue-200",    textClass: "text-blue-700" },
  { min: 0,   num: 0, label: "Idea",      bgClass: "bg-amber-50",   borderClass: "border-amber-200",   textClass: "text-amber-700" },
];

function getStage(svi: number): StageInfo {
  const def = STAGE_DEFS.find((d) => svi >= d.min) ?? STAGE_DEFS[STAGE_DEFS.length - 1];
  return { num: def.num, label: def.label, bgClass: def.bgClass, borderClass: def.borderClass, textClass: def.textClass };
}

/* ─── Mentor Messages — Stage-specific guidance ──────────────────────────── */

const MENTOR_MESSAGES: Record<
  number,
  { title: string; advice: string; cta: string; ctaHref: string }
> = {
  0: {
    title: "Welcome to your startup journey!",
    advice:
      "Focus on validating your idea. Talk to 10 potential customers this week. Document what you learn as evidence.",
    cta: "Research Your Market",
    ctaHref: "/score",
  },
  1: {
    title: "Your idea has potential!",
    advice:
      "Build a minimal prototype. Focus on solving one problem really well. Upload your code or demo to boost your score.",
    cta: "Analyze Your Product",
    ctaHref: "/score",
  },
  2: {
    title: "You're building something real!",
    advice:
      "Get your first paying customers. Revenue proves market fit. Connect your analytics and Stripe to track traction.",
    cta: "Track Your Traction",
    ctaHref: "/workspace/metrics",
  },
  3: {
    title: "Traction confirmed!",
    advice:
      "Prepare for fundraising. Clean your cap table, build a data room, and get your financials investor-ready.",
    cta: "Prepare Data Room",
    ctaHref: "/workspace/data-room",
  },
  4: {
    title: "You're scaling!",
    advice:
      "Optimize governance, plan your Series A, and build your board. Your SVI puts you ahead of most AU startups at this stage.",
    cta: "Review Cap Table",
    ctaHref: "/workspace/cap-table",
  },
};

/* ─── Stage Roadmap ──────────────────────────────────────────────────────── */

const ROADMAP_STAGES = [
  { num: 0, label: "Idea", icon: Lightbulb },
  { num: 1, label: "MVP", icon: Rocket },
  { num: 2, label: "Validated", icon: CheckCircle2 },
  { num: 3, label: "Traction", icon: TrendingUp },
  { num: 4, label: "Growth", icon: BarChart3 },
];

/* ─── Report Phases — group sections by business phase ───────────────────── */

interface Phase {
  id: string;
  label: string;
  color: string; // Tailwind color prefix
  description: string;
  sectionIds: string[];
  icon: typeof FileText;
}

const PHASES: Phase[] = [
  {
    id: "overview",
    label: "Overview",
    color: "brand",
    description: "Executive summary and overall assessment",
    sectionIds: ["executive"],
    icon: FileText,
  },
  {
    id: "foundation",
    label: "Foundation",
    color: "blue",
    description: "Team, equity, legal basics",
    sectionIds: ["founder_team", "cap_table", "legal"],
    icon: Users,
  },
  {
    id: "pmf",
    label: "Product-Market Fit",
    color: "purple",
    description: "Market, product, traction",
    sectionIds: ["market", "product", "traction"],
    icon: Target,
  },
  {
    id: "growth",
    label: "Growth & Fundraise",
    color: "emerald",
    description: "GTM, financials, investor ready",
    sectionIds: ["gtm", "financial", "investor_ready"],
    icon: TrendingUp,
  },
  {
    id: "strategic",
    label: "Strategic",
    color: "amber",
    description: "Vision, risk, competition",
    sectionIds: ["vision_moat", "risk"],
    icon: Shield,
  },
  {
    id: "premium",
    label: "Deep Intelligence",
    color: "rose",
    description: "Premium insights",
    sectionIds: ["competitive", "roadmap", "board_summary", "au_market"],
    icon: Sparkles,
  },
];

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
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
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

/** Map an evidence gap to a user-facing CTA with appropriate link */
function gapToCTA(gap: SVIEvidenceGap): { label: string; href: string } {
  const lower = (gap.label + " " + gap.action).toLowerCase();
  const has = (...terms: string[]) => terms.some((t) => lower.includes(t));
  if (has("evidence", "upload", "document", "testimonial")) return { label: "Upload Evidence", href: "/workspace/evidence" };
  if (has("pitch deck", "pitch")) return { label: "Upload Pitch Deck", href: "/workspace/evidence" };
  if (has("github", "repo", "code")) return { label: "Connect GitHub", href: "/workspace/tools/github-audit" };
  if (has("website", "url", "seo")) return { label: "Audit Website", href: "/workspace/tools/website-audit" };
  if (has("financial", "revenue", "metric")) return { label: "Update Metrics", href: "/workspace/metrics" };
  if (has("cap table", "equity", "vesting")) return { label: "Setup Cap Table", href: "/workspace/equity" };
  return { label: "Take Action", href: "/" };
}

/** Tailwind color classes for each phase — keyed by color name */
type PhaseStyle = { badge: string; progressBg: string; progressFill: string };
const PHASE_STYLES: Record<string, PhaseStyle> = {
  brand:   { badge: "bg-brand-100 text-brand-700",     progressBg: "bg-brand-100",   progressFill: "bg-brand-500" },
  blue:    { badge: "bg-blue-100 text-blue-700",       progressBg: "bg-blue-100",    progressFill: "bg-blue-500" },
  purple:  { badge: "bg-purple-100 text-purple-700",   progressBg: "bg-purple-100",  progressFill: "bg-purple-500" },
  emerald: { badge: "bg-emerald-100 text-emerald-700", progressBg: "bg-emerald-100", progressFill: "bg-emerald-500" },
  amber:   { badge: "bg-amber-100 text-amber-700",     progressBg: "bg-amber-100",   progressFill: "bg-amber-500" },
  rose:    { badge: "bg-rose-100 text-rose-700",       progressBg: "bg-rose-100",    progressFill: "bg-rose-500" },
};
const DEFAULT_STYLE: PhaseStyle = { badge: "bg-surface-100 text-ink-700", progressBg: "bg-surface-100", progressFill: "bg-surface-500" };
function phaseColors(color: string): PhaseStyle {
  return PHASE_STYLES[color] ?? DEFAULT_STYLE;
}

/* ─── Tab IDs ─────────────────────────────────────────────────────────────── */

type TabId = "journey" | "report" | "history" | "actions";

/* ─── Main Component ─────────────────────────────────────────────────────── */

export function LivingSVIDashboard(props: LivingDashboardProps) {
  const {
    analysis,
    sviHistory,
    recentReports,
    savedSections,
    startupName,
    creditBalance,
    shareViews,
    lastAnalysisDate,
    previousSVI,
    userProfile,
  } = props;

  const [activeTab, setActiveTab] = React.useState<TabId>("journey");

  // Optimistic local state: track sections unlocked during this session.
  // We store only the *new* sections added by the user. The full list is
  // derived by merging the server-provided savedSections with localAdditions.
  // This avoids useEffect setState issues and keeps the server data as source of truth.
  const [localAdditions, setLocalAdditions] = React.useState<SavedSection[]>([]);

  const localSections = React.useMemo(() => {
    const merged = [...savedSections];
    for (const addition of localAdditions) {
      const idx = merged.findIndex(
        (s) => s.section_id === addition.section_id,
      );
      if (idx >= 0) {
        merged[idx] = addition;
      } else {
        merged.push(addition);
      }
    }
    return merged;
  }, [savedSections, localAdditions]);

  const svi = analysis.totalSVI;
  const stage = getStage(svi);
  const delta =
    previousSVI != null ? svi - previousSVI : undefined;

  // Count unlocked full-depth sections for the tab badge
  const unlockedFullCount = localSections.filter(
    (s) => s.depth === "full",
  ).length;
  const totalSectionCount = REPORT_SECTIONS.length;

  const tabs: {
    id: TabId;
    label: string;
    badge?: string;
    icon: typeof BarChart3;
  }[] = [
    { id: "journey", label: "Journey", icon: Rocket },
    {
      id: "report",
      label: "Full Report",
      badge: `${unlockedFullCount}/${totalSectionCount}`,
      icon: FileText,
    },
    { id: "history", label: "History", icon: History },
    { id: "actions", label: "Actions", icon: Target },
  ];

  return (
    <div className="space-y-6">
      {/* ── SVI Hero Header ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm overflow-hidden">
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Score + name */}
            <div className="flex items-center gap-5">
              <div
                className={cn(
                  "flex items-center justify-center h-20 w-20 rounded-2xl border-2 shadow-sm",
                  scoreBgColor(svi),
                )}
              >
                <span
                  className={cn("text-3xl font-extrabold", scoreColor(svi))}
                >
                  {svi}
                </span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-ink-900">
                  {startupName ??
                    userProfile.startupName ??
                    "My SVI Score"}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {/* Stage badge */}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      stage.bgClass,
                      stage.borderClass,
                      stage.textClass,
                    )}
                  >
                    {stage.label} Stage
                  </span>
                  {/* Delta badge */}
                  {delta != null && delta !== 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        delta > 0
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-red-50 text-red-700 border border-red-200",
                      )}
                    >
                      {delta > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {delta > 0 ? "+" : ""}
                      {delta} from last
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

      {/* ── Tab Navigation ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map((tab) => {
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
              {tab.badge && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-surface-200 text-ink-500",
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      {activeTab === "journey" && (
        <JourneyTab
          analysis={analysis}
          sviHistory={sviHistory}
          recentReports={recentReports}
          savedSections={localSections}
          creditBalance={creditBalance}
          shareViews={shareViews}
          stage={stage}
          delta={delta}
        />
      )}
      {activeTab === "report" && (
        <FullReportTab
          savedSections={localSections}
          creditBalance={creditBalance}
          onSectionUnlocked={(section) => {
            setLocalAdditions((prev) => [
              ...prev.filter(
                (s) => s.section_id !== section.section_id,
              ),
              section,
            ]);
          }}
        />
      )}
      {activeTab === "history" && (
        <HistoryTab
          recentReports={recentReports}
          sviHistory={sviHistory}
        />
      )}
      {activeTab === "actions" && (
        <ActionsTab analysis={analysis} stage={stage} />
      )}
    </div>
  );
}

/* ─── TAB 1: JOURNEY — stage-aware roadmap with mentor guidance ───────────── */
/* WHY: Founders need WHERE they are and WHAT to do next. Default tab. */

function JourneyTab({
  analysis,
  sviHistory,
  recentReports,
  savedSections,
  creditBalance,
  shareViews,
  stage,
}: {
  analysis: SVIAnalysis;
  sviHistory: Array<{ total_svi: number; created_at: string }>;
  recentReports: ReportEntry[];
  savedSections: SavedSection[];
  creditBalance: number;
  shareViews: number;
  stage: StageInfo;
  delta: number | undefined;
}) {
  const mentor = MENTOR_MESSAGES[stage.num] ?? MENTOR_MESSAGES[0];
  const gaps = analysis.evidenceGaps ?? [];
  const topActions = [...gaps]
    .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
    .slice(0, 3);

  const trendData = sviHistory.map((h) => ({
    date: h.created_at,
    svi: h.total_svi,
  }));

  return (
    <div className="space-y-6">
      {/* 1. Stage Roadmap — horizontal progress showing 5 stages */}
      {/* WHY: Visual progress motivates founders and shows what comes next */}
      <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink-900">
            Your Startup Journey
          </h3>
          <span className="text-xs text-ink-500">
            Stage {stage.num + 1} of 5
          </span>
        </div>
        <div className="flex items-center gap-0">
          {ROADMAP_STAGES.map((rs, i) => {
            const Icon = rs.icon;
            const isComplete = stage.num > rs.num;
            const isCurrent = stage.num === rs.num;
            const isFuture = stage.num < rs.num;
            return (
              <React.Fragment key={rs.num}>
                {/* Connector line (before each stage except the first) */}
                {i > 0 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 transition-colors",
                      isComplete || isCurrent
                        ? "bg-brand-400"
                        : "bg-surface-200",
                    )}
                  />
                )}
                {/* Stage node */}
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div
                    className={cn(
                      "flex items-center justify-center h-10 w-10 rounded-xl border-2 transition-all",
                      isComplete &&
                        "bg-brand-600 border-brand-600 text-white",
                      isCurrent &&
                        "bg-brand-50 border-brand-500 text-brand-600 ring-2 ring-brand-200",
                      isFuture &&
                        "bg-surface-50 dark:bg-surface-100 border-surface-200 text-ink-400",
                    )}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isCurrent ? "text-brand-700" : "text-ink-500",
                    )}
                  >
                    {rs.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* 2. Mentor Banner — stage-specific advice from an AI advisor */}
      {/* WHY: Founders at different stages need different guidance. */}
      {/*       A generic "welcome" is useless. Stage-specific advice is gold. */}
      <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-surface-50 to-emerald-50/40 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl bg-brand-100 border border-brand-200 flex items-center justify-center shrink-0">
            <Lightbulb className="h-5 w-5 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-ink-900 mb-1">
              {mentor.title}
            </h3>
            <p className="text-sm text-ink-600 mb-3">
              {mentor.advice}
            </p>
            <Link
              href={mentor.ctaHref}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              {mentor.cta}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 3. "What to Do Now" — top 3 actions for THIS stage */}
      {/* WHY: Overwhelmed founders need exactly 3 things, not 15. */}
      {/*       Sorted by SVI impact so the highest-value action is first. */}
      {topActions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-900 mb-3">
            What to Do Now
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {topActions.map((gap, i) => {
              const cta = gapToCTA(gap);
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm p-5 flex flex-col"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-ink-800 leading-snug">
                      {gap.label}
                    </h4>
                    <span className="shrink-0 text-xs font-mono font-bold text-emerald-600">
                      +{gap.impact}
                    </span>
                  </div>
                  <p className="text-xs text-ink-500 flex-1 mb-3">
                    {gap.action}
                  </p>
                  <Link
                    href={cta.href}
                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors self-start"
                  >
                    {cta.label}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Quick Stats Row — at-a-glance metrics */}
      {/* WHY: Founders need to see the numbers without clicking around. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickStatCard
          icon={BarChart3}
          label="Analyses"
          value={recentReports.length.toString()}
          color="text-brand-600 bg-brand-50"
        />
        <QuickStatCard
          icon={FileText}
          label="Reports Unlocked"
          value={savedSections.filter((s) => s.depth === "full").length.toString()}
          color="text-emerald-600 bg-emerald-50"
        />
        <QuickStatCard
          icon={CreditCard}
          label="Credits"
          value={creditBalance.toFixed(2)}
          color="text-amber-600 bg-amber-50"
        />
        <QuickStatCard
          icon={Eye}
          label="Share Views"
          value={shareViews.toString()}
          color="text-blue-600 bg-blue-50"
        />
      </div>

      {/* 5. SVI Trend Chart — visual progress over time */}
      {/* WHY: Seeing an upward trend is the #1 motivator for founders. */}
      <SVITrendChart data={trendData} />
    </div>
  );
}

/* ─── TAB 2: FULL REPORT — ALL paid content grouped by phase ─────────────── */
/* WHY: Users pay credits to unlock sections and MUST see everything paid for. */

function FullReportTab({
  savedSections,
  creditBalance,
  onSectionUnlocked,
}: {
  savedSections: SavedSection[];
  creditBalance: number;
  onSectionUnlocked: (section: SavedSection) => void;
}) {
  // Track which phases are expanded (all expanded by default)
  const [expandedPhases, setExpandedPhases] = React.useState<
    Record<string, boolean>
  >(() => {
    const initial: Record<string, boolean> = {};
    for (const phase of PHASES) {
      initial[phase.id] = true;
    }
    return initial;
  });

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => ({
      ...prev,
      [phaseId]: !prev[phaseId],
    }));
  };

  // Calculate unlock-all bundle pricing
  const alreadyUnlocked = savedSections
    .filter((s) => s.depth === "full")
    .map((s) => s.section_id);
  const bundle = getUnlockAllCost(alreadyUnlocked);

  return (
    <div className="space-y-4">
      {/* Phase groups */}
      {PHASES.map((phase) => {
        const colors = phaseColors(phase.color);
        const PhaseIcon = phase.icon;

        // Find saved sections for this phase
        const phaseSections = phase.sectionIds.map((sid) => {
          const def = REPORT_SECTIONS.find((s) => s.id === sid);
          const saved = savedSections.find(
            (s) => s.section_id === sid,
          );
          return { id: sid, def, saved };
        });

        // Phase completion: count of sections with full content
        const fullCount = phaseSections.filter(
          (ps) => ps.saved?.depth === "full",
        ).length;
        const totalCount = phaseSections.length;
        const completionPct =
          totalCount > 0
            ? Math.round((fullCount / totalCount) * 100)
            : 0;

        const isExpanded = expandedPhases[phase.id] ?? true;

        return (
          <div
            key={phase.id}
            className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm overflow-hidden"
          >
            {/* Phase Header — clickable to collapse */}
            <button
              type="button"
              onClick={() => togglePhase(phase.id)}
              className="w-full px-5 py-4 flex items-center gap-3 hover:bg-surface-100 dark:hover:bg-surface-200 transition-colors cursor-pointer"
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                  colors.badge,
                )}
              >
                <PhaseIcon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-ink-900">
                    {phase.label}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold",
                      colors.badge,
                    )}
                  >
                    {fullCount}/{totalCount}
                  </span>
                </div>
                <p className="text-xs text-ink-500 mt-0.5">
                  {phase.description}
                </p>
              </div>
              {/* Progress bar */}
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <div
                  className={cn(
                    "w-24 h-1.5 rounded-full",
                    colors.progressBg,
                  )}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      colors.progressFill,
                    )}
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-ink-500 w-8 text-right">
                  {completionPct}%
                </span>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-ink-400 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 text-ink-400 shrink-0" />
              )}
            </button>

            {/* Sections within this phase */}
            {isExpanded && (
              <div className="border-t border-surface-100 divide-y divide-surface-100">
                {phaseSections.map((ps) => (
                  <ReportSectionRow
                    key={ps.id}
                    sectionId={ps.id}
                    def={ps.def}
                    saved={ps.saved}
                    creditBalance={creditBalance}
                    onUnlocked={onSectionUnlocked}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Unlock All Bundle — bottom CTA */}
      {/* WHY: Bulk unlock at a discount encourages deeper engagement */}
      {bundle.sections.length > 0 && (
        <div className="rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-emerald-50/40 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-ink-900">
                Unlock All Remaining Sections
              </h3>
              <p className="text-sm text-ink-600 mt-1">
                {bundle.sections.length} section
                {bundle.sections.length !== 1 ? "s" : ""} remaining.
                Save 30% with the bundle.
              </p>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-ink-400 line-through">
                  {bundle.total.toFixed(2)} cr
                </span>
                <span className="text-lg font-bold text-brand-700">
                  {bundle.discounted.toFixed(2)} cr
                </span>
                <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold">
                  SAVE {bundle.savings.toFixed(2)} cr
                </span>
              </div>
            </div>
            <div className="text-sm text-ink-500">
              {creditBalance >= bundle.discounted ? (
                <span className="text-emerald-600 font-medium">
                  You have enough credits
                </span>
              ) : (
                <span className="text-amber-600 font-medium">
                  Need {(bundle.discounted - creditBalance).toFixed(2)} more credits
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Individual Report Section Row ──────────────────────────────────────── */

function ReportSectionRow({
  sectionId,
  def,
  saved,
  creditBalance,
  onUnlocked,
}: {
  sectionId: string;
  def: ReportSectionDef | undefined;
  saved: SavedSection | undefined;
  creditBalance: number;
  onUnlocked: (section: SavedSection) => void;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [confirmingUnlock, setConfirmingUnlock] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!def) return null;

  const title = def.title;
  const hasFull = saved?.depth === "full";
  const hasSummary = saved?.depth === "summary";
  const creditCost = def.creditCost;
  const canAfford = creditBalance >= creditCost;

  /** Call the API to unlock this section at full depth */
  async function handleUnlock() {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/svi/report-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, depth: "full" }),
      });
      const data = await res.json();

      if (data.ok) {
        // Optimistic update — add the section to local state immediately
        onUnlocked({
          section_id: sectionId,
          depth: "full",
          content: data.content,
          word_count: data.wordCount ?? 0,
          credits_cost: data.creditsCost ?? 0,
        });
        setConfirmingUnlock(false);
        setIsExpanded(true);
      } else {
        setError(
          data.error ?? "Failed to unlock section. Please try again.",
        );
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="mt-0.5 shrink-0">
          {hasFull ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : hasSummary ? (
            <Unlock className="h-5 w-5 text-amber-500" />
          ) : (
            <Lock className="h-5 w-5 text-ink-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (hasFull || hasSummary) setIsExpanded(!isExpanded);
              }}
              className={cn(
                "text-sm font-semibold text-ink-800 text-left",
                (hasFull || hasSummary) &&
                  "hover:text-brand-700 cursor-pointer",
              )}
            >
              {title}
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {/* Word count badge for unlocked content */}
              {hasFull && saved && (
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                  {saved.word_count.toLocaleString()}w
                </span>
              )}
              {/* Tier badge */}
              {def.tier === "free" && (
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  FREE
                </span>
              )}
              {(def.tier === "paid" || def.tier === "premium") &&
                !hasFull && (
                  <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {def.tier === "premium" ? "PREMIUM" : "PAID"}
                  </span>
                )}
              {/* Expand/collapse for content */}
              {(hasFull || hasSummary) && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 rounded hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-ink-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-ink-400" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-xs text-ink-500 mt-0.5">{def.subtitle}</p>

          {/* Expanded content: markdown rendering of full report */}
          {isExpanded && (hasFull || hasSummary) && saved && (
            <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 dark:bg-surface-50 p-5">
              <div className="prose prose-sm max-w-none prose-headings:text-ink-900 prose-p:text-ink-700 prose-li:text-ink-700 prose-strong:text-ink-800">
                <Markdown>{saved.content}</Markdown>
              </div>
            </div>
          )}

          {/* Unlock CTA for sections without full content */}
          {!hasFull && creditCost > 0 && (
            <div className="mt-3">
              {/* Summary preview: show summary content + unlock CTA */}
              {hasSummary && saved && !isExpanded && (
                <p className="text-xs text-ink-500 italic mb-2 line-clamp-2">
                  {saved.content.slice(0, 200)}...
                </p>
              )}

              {/* Inline credit confirmation */}
              {confirmingUnlock ? (
                <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-xs text-amber-800">
                    Unlock for{" "}
                    <strong>{creditCost.toFixed(2)} credits</strong>?
                    {!canAfford && (
                      <span className="text-red-600 ml-1">
                        (insufficient balance)
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      type="button"
                      onClick={() => setConfirmingUnlock(false)}
                      disabled={isLoading}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlock}
                      disabled={isLoading || !canAfford}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer",
                        canAfford
                          ? "bg-brand-600 text-white hover:bg-brand-700"
                          : "bg-surface-200 text-ink-400 cursor-not-allowed",
                      )}
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          <span className="text-xs truncate">Analyzing section...</span>
                        </span>
                      ) : (
                        "Confirm"
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingUnlock(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer"
                >
                  <Zap className="h-3 w-3" />
                  {hasSummary
                    ? `Read full analysis (${creditCost.toFixed(2)} cr)`
                    : `Unlock (${creditCost.toFixed(2)} cr)`}
                </button>
              )}

              {/* Error message */}
              {error && (
                <p className="text-xs text-red-600 mt-1.5">{error}</p>
              )}
            </div>
          )}

          {/* Free section: auto-generate CTA if not yet generated */}
          {!hasFull && creditCost === 0 && !hasSummary && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  setConfirmingUnlock(false);
                  handleUnlock();
                }}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                    <span className="text-xs truncate">AI agent is writing your report...</span>
                  </>
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {!isLoading && "Generate (free)"}
              </button>
              {error && (
                <p className="text-xs text-red-600 mt-1.5">{error}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── TAB 3: HISTORY — Timeline of all analyses with SVI trend ───────────── */

function HistoryTab({
  recentReports,
  sviHistory,
}: {
  recentReports: ReportEntry[];
  sviHistory: Array<{ total_svi: number; created_at: string }>;
}) {
  const trendData = sviHistory.map((h) => ({
    date: h.created_at,
    svi: h.total_svi,
  }));

  if (recentReports.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 px-8 py-12 text-center shadow-sm">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-surface-100 border border-surface-200 mb-4">
          <History
            strokeWidth={1.75}
            className="h-6 w-6 text-ink-400"
          />
        </div>
        <h3 className="text-lg font-semibold text-ink-800 mb-2">
          No history yet
        </h3>
        <p className="text-sm text-ink-500 max-w-sm mx-auto">
          Your analysis timeline will appear here as you run SVI analyses.
          Each analysis is saved and can be revisited.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* SVI Trend Chart at top */}
      <SVITrendChart data={trendData} />

      {/* Analysis timeline */}
      <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-100">
          <h3 className="text-sm font-semibold text-ink-900">
            All Analyses
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {recentReports.length} total
          </p>
        </div>

        <div className="divide-y divide-surface-100">
          {recentReports.map((report, idx) => {
            const prevReport = recentReports[idx + 1];
            const reportDelta = prevReport
              ? report.total_svi - prevReport.total_svi
              : undefined;
            const typeLabel =
              report.input_type === "url"
                ? "URL Analysis"
                : report.input_type === "rnd"
                  ? "R&D Report"
                  : report.input_type === "deep_dive"
                    ? "Deep Dive"
                    : "SVI Analysis";
            const inputSnippet = report.raw_input
              ? report.raw_input.slice(0, 80) +
                (report.raw_input.length > 80 ? "..." : "")
              : null;

            return (
              <div
                key={report.id}
                className="px-5 py-4 flex items-start gap-3 hover:bg-surface-100 dark:hover:bg-surface-200 transition-colors"
              >
                {/* Score circle */}
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl border text-lg font-bold shrink-0",
                    scoreBgColor(report.total_svi),
                    scoreColor(report.total_svi),
                  )}
                >
                  {report.total_svi}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-ink-800">
                      {typeLabel}
                    </p>
                    {reportDelta != null && reportDelta !== 0 && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 text-xs font-semibold",
                          reportDelta > 0
                            ? "text-emerald-600"
                            : "text-red-500",
                        )}
                      >
                        {reportDelta > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {reportDelta > 0 ? "+" : ""}
                        {reportDelta}
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

                <Link
                  href={`/workspace/reports/${report.id}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0 mt-1"
                >
                  View
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── TAB 4: ACTIONS — Improvement opportunities by stage relevance ──────── */

function ActionsTab({
  analysis,
  stage,
}: {
  analysis: SVIAnalysis;
  stage: StageInfo;
}) {
  const gaps = analysis.evidenceGaps ?? [];

  if (gaps.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 px-8 py-12 text-center shadow-sm">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-emerald-50 border border-emerald-200 mb-4">
          <CheckCircle2
            strokeWidth={1.75}
            className="h-6 w-6 text-emerald-600"
          />
        </div>
        <h3 className="text-lg font-semibold text-ink-800 mb-2">
          Looking great!
        </h3>
        <p className="text-sm text-ink-500 max-w-sm mx-auto">
          No critical evidence gaps found. Keep building and run another
          analysis when you hit your next milestone.
        </p>
      </div>
    );
  }

  // Sort by impact descending
  const sorted = [...gaps].sort(
    (a, b) => (b.impact ?? 0) - (a.impact ?? 0),
  );
  const totalPotential = sorted.reduce(
    (sum, g) => sum + (g.impact ?? 0),
    0,
  );

  // Separate priority actions (P0) from the rest
  const priorityGaps = sorted.filter((g) => g.priority === "P0");
  const otherGaps = sorted.filter((g) => g.priority !== "P0");

  return (
    <div className="space-y-6">
      {/* Potential banner */}
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-50/50 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            Total improvement potential
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Complete all actions below to maximize your SVI score
          </p>
        </div>
        <span className="text-2xl font-extrabold text-emerald-700">
          +{totalPotential}
        </span>
      </div>

      {/* Priority for your stage — P0 items */}
      {priorityGaps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-ink-900">
              Priority for {stage.label} Stage
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {priorityGaps.map((gap, i) => (
              <ActionCard key={`p0-${i}`} gap={gap} />
            ))}
          </div>
        </div>
      )}

      {/* All other improvement opportunities */}
      {otherGaps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink-900 mb-3">
            All Improvement Opportunities
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {otherGaps.map((gap, i) => (
              <ActionCard key={`other-${i}`} gap={gap} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared Components ──────────────────────────────────────────────────── */

/** Quick stat card for the Journey tab overview row */
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
    <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm p-4">
      <div
        className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center mb-2",
          color,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <p className="text-xl font-bold text-ink-900">{value}</p>
      <p className="text-xs text-ink-500 mt-0.5">{label}</p>
    </div>
  );
}

/** Action card for a single evidence gap */
function ActionCard({ gap }: { gap: SVIEvidenceGap }) {
  const cta = gapToCTA(gap);
  const priorityStyles: Record<string, string> = {
    P0: "bg-red-50 text-red-700 border-red-200",
    P1: "bg-amber-50 text-amber-700 border-amber-200",
    P2: "bg-blue-50 text-blue-700 border-blue-200",
  };
  const priorityLabels: Record<string, string> = {
    P0: "HIGH",
    P1: "MEDIUM",
    P2: "LOW",
  };

  return (
    <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 shadow-sm p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h4 className="text-sm font-semibold text-ink-800 leading-snug">
          {gap.label}
        </h4>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
            priorityStyles[gap.priority] ??
              "bg-surface-100 text-ink-600 border-surface-200",
          )}
        >
          {priorityLabels[gap.priority] ?? gap.priority}
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
}
