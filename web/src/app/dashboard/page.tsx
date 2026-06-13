import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  ChevronRight,
  FileText,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  PieChart,
  BarChart3,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { PageTracker } from "@/components/analytics/page-tracker";
import { getCurrentUser } from "@/lib/auth";
import { getBalance } from "@/lib/credits";
import { getProjectIdFromRequest, getActiveProject, findOrCreateSVIAccount } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { JourneyBar } from "@/components/dashboard/journey-bar";
import { LivingSVIDashboard } from "@/components/dashboard/living-svi-dashboard";
import { GrowthRoadmap } from "@/components/dashboard/growth-roadmap";
import { GrowthProgressDashboard } from "@/components/dashboard/growth-progress-dashboard";
import { CapTableMini } from "@/components/dashboard/cap-table-mini";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { StatusCards } from "@/components/dashboard/status-cards";
import { ScnPositionHero } from "@/components/dashboard/scn-position-hero";
import { ScnDirectionNavigator, type DirectionStep } from "@/components/dashboard/scn-direction-navigator";
import type { SVIAnalysis, SVISubScore } from "@/lib/svi-analysis";
import { getSVIPercentile } from "@/lib/benchmarks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard · BlockID",
  robots: { index: false, follow: false },
};

/* ─── Inline MetricCard ─────────────────────────────────────────────────────── */

function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-ink-500 uppercase tracking-wider font-medium">{title}</p>
        <Icon className="h-4 w-4 text-ink-400" />
      </div>
      <p className="text-2xl font-bold text-ink-900">{value}</p>
      {subtitle && <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>}
      {trend != null && trend !== 0 && (
        <span className={`text-xs font-semibold ${trend > 0 ? "text-emerald-600" : "text-red-500"}`}>
          {trend > 0 ? "+" : ""}
          {trend}
        </span>
      )}
    </div>
  );
}

/* ─── Next Action Logic ─────────────────────────────────────────────────────── */

/**
 * Phase-aware next action — follows the actual startup development roadmap.
 * Early-stage startups (Idea/Validation) get guidance on problem validation,
 * team building, and market research — NOT revenue evidence or fundraising.
 */
function computeNextAction(sviScore: number | null): {
  text: string;
  label: string;
  url: string;
  phase: string;
} {
  if (sviScore == null) {
    return {
      text: "Describe your startup idea to get your free SVI score. It takes less than 60 seconds and helps you understand where you stand.",
      label: "Get My SVI Score",
      url: "/",
      phase: "start",
    };
  }
  // Phase 0: Idea (SVI 0-30) — focus on idea validation, not revenue
  if (sviScore < 30) {
    return {
      text: "Your idea needs validation. Refine your problem statement, define your target customer, and research your market size. Run a deeper analysis with more detail to boost your score.",
      label: "Refine Your Idea",
      url: "/",
      phase: "idea",
    };
  }
  // Phase 1: Validation (SVI 30-50) — focus on market fit, team, early evidence
  if (sviScore <= 50) {
    return {
      text: "Your idea has potential! Now validate it — describe your team background, connect your LinkedIn profile, or upload a competitor analysis to strengthen your founder credibility.",
      label: "Strengthen Your Profile",
      url: "/workspace/evidence",
      phase: "validation",
    };
  }
  // Phase 2: Build (SVI 50-70) — focus on valuation, equity structure
  if (sviScore <= 70) {
    return {
      text: "You're building something real. Set up your equity structure — define co-founder splits, share classes, and vesting schedules before you bring on investors.",
      label: "Set Up Equity",
      url: "/workspace/equity-setup",
      phase: "build",
    };
  }
  // Phase 3: Pre-fundraise (SVI 70-85) — focus on investor readiness
  if (sviScore <= 85) {
    return {
      text: "You're nearly investor-ready! Build your data room with key documents, a pitch deck, and financial projections. This is what investors expect to see.",
      label: "Build Data Room",
      url: "/workspace/data-room",
      phase: "pre-fundraise",
    };
  }
  // Phase 4+: Fundraise & Growth (SVI 85+)
  return {
    text: "Your startup is investor-ready! Share your data room with potential investors and start your fundraising conversations.",
    label: "Start Fundraising",
    url: "/workspace/fundraise",
    phase: "fundraise",
  };
}

/* ─── SCN DIRECTION — Google-Maps-style next-best-action route ───────────────── */

/**
 * Map an analysis-generated next-action title to the best workspace route.
 * Keyword-based — keeps the dashboard a self-contained surface.
 */
function actionToUrl(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("cap table")) return "/workspace/cap-table";
  if (t.includes("vesting")) return "/workspace/vesting";
  if (t.includes("esop")) return "/workspace/esop";
  if (t.includes("pitch deck") || t.includes("data room")) return "/workspace/data-room";
  if (t.includes("financial model") || t.includes("projection")) return "/workspace/metrics";
  if (t.includes("revenue") || t.includes("paying customer") || t.includes("first customer")) return "/workspace/revenue";
  if (t.includes("analytics")) return "/workspace/metrics";
  if (t.includes("demo") || t.includes("prototype") || t.includes("product")) return "/workspace/projects";
  if (t.includes("asic") || t.includes("abn") || t.includes("register")) return "/workspace/profile";
  if (t.includes("ip") || t.includes("patent") || t.includes("trademark") || t.includes("legal")) return "/workspace/documents";
  if (t.includes("advisor") || t.includes("team") || t.includes("co-founder")) return "/workspace/shareholders";
  if (t.includes("market") || t.includes("tam") || t.includes("sam")) return "/workspace/evaluation";
  if (t.includes("moat") || t.includes("evidence")) return "/workspace/evidence";
  if (t.includes("fundraise") || t.includes("raise")) return "/workspace/fundraise";
  return "/workspace/evidence";
}

/** Stage-driven fallback route used when no analysis is available yet. */
function fallbackDirectionSteps(stage: number): DirectionStep[] {
  if (stage <= 0) {
    return [
      { label: "Describe your idea in detail", detail: "Add target customer, problem, and market — the SVI engine needs this to score Validation.", impact: "+12 SVI", url: "/", priority: "P0" },
      { label: "Capture validation evidence", detail: "Upload customer interviews, waitlist signups, or survey results to the Evidence Vault.", impact: "+10 SVI", url: "/workspace/evidence", priority: "P1" },
      { label: "Map your market (TAM / SAM / SOM)", detail: "Quantify the opportunity so investors can size the prize.", impact: "+8 SVI", url: "/workspace/evaluation", priority: "P2" },
    ];
  }
  if (stage <= 1) {
    return [
      { label: "Lock in problem validation", detail: "Add interviews, surveys, or waitlist data to the Evidence Vault — move from self-declared to verified.", impact: "+12 SVI", url: "/workspace/evidence", priority: "P0" },
      { label: "Set up your cap table", detail: "Define founder splits, share classes, and vesting before bringing on capital.", impact: "+10 SVI", url: "/workspace/cap-table", priority: "P1" },
      { label: "Ship a working demo", detail: "A live prototype is the highest-signal evidence you can show investors.", impact: "+8 SVI", url: "/workspace/projects", priority: "P2" },
    ];
  }
  if (stage <= 3) {
    return [
      { label: "Acquire 20 paying customers", detail: "Revenue is the strongest validation signal — even small ARR unlocks the Traction layer.", impact: "+18 SVI", url: "/workspace/revenue", priority: "P0" },
      { label: "Finalise your cap table", detail: "Confirm founder/ESOP split, vesting schedules, and shareholders before raise conversations.", impact: "+10 SVI", url: "/workspace/cap-table", priority: "P1" },
      { label: "Draft your pitch deck", detail: "Structure the narrative — problem, solution, traction, team, ask — and store it in your data room.", impact: "+8 SVI", url: "/workspace/data-room", priority: "P2" },
    ];
  }
  if (stage <= 5) {
    return [
      { label: "Build your data room", detail: "Pitch deck, financial model, cap table, contracts — everything investors expect.", impact: "+12 SVI", url: "/workspace/data-room", priority: "P0" },
      { label: "Lock in financial model", detail: "Three-year P&L forecast with unit economics — investors will model your business themselves.", impact: "+10 SVI", url: "/workspace/metrics", priority: "P1" },
      { label: "Open fundraise pipeline", detail: "Shortlist target investors, plan intros, and start tracking conversations.", impact: "+8 SVI", url: "/workspace/fundraise", priority: "P2" },
    ];
  }
  return [
    { label: "Run your raise process", detail: "Open conversations, share the data room, and track investor signals.", impact: "+10 SVI", url: "/workspace/fundraise", priority: "P0" },
    { label: "Tighten unit economics", detail: "Confirm LTV / CAC, churn, and gross margin — Series-A grade investors will probe these.", impact: "+8 SVI", url: "/workspace/metrics", priority: "P1" },
    { label: "Plan exit scenarios", detail: "Model acquisition, IPO, or secondary paths so the cap table is exit-ready.", impact: "+6 SVI", url: "/workspace/exit", priority: "P2" },
  ];
}

/** Identify the weakest SVI sub-layer so the navigator can name it as "you are here". */
function weakestLayerLabel(subs: SVISubScore[] | undefined): string | null {
  if (!subs || subs.length === 0) return null;
  const sorted = [...subs].sort((a, b) => a.value - b.value);
  return sorted[0]?.label ?? null;
}

/**
 * Combine analysis-generated next actions with the stage-driven fallback so we
 * always present 3 steps. Analysis actions take precedence (they reflect real
 * gaps in the founder's data) and routes are inferred from action titles.
 */
function computeDirectionSteps(analysis: SVIAnalysis | null, stage: number): DirectionStep[] {
  const fromAnalysis: DirectionStep[] = (analysis?.nextActions ?? []).map((a) => ({
    label: a.title,
    detail: a.detail,
    impact: a.impact,
    priority: a.priority,
    url: actionToUrl(a.title),
  }));
  if (fromAnalysis.length >= 3) return fromAnalysis.slice(0, 3);
  const fallback = fallbackDirectionSteps(stage);
  const seen = new Set(fromAnalysis.map((s) => s.label.toLowerCase()));
  const merged = [...fromAnalysis];
  for (const step of fallback) {
    if (merged.length >= 3) break;
    if (seen.has(step.label.toLowerCase())) continue;
    merged.push(step);
  }
  return merged.slice(0, 3);
}

/* ─── Phase mapping ─────────────────────────────────────────────────────────── */

function computePhase(sviScore: number | null): { phase: number; name: string } {
  if (sviScore == null) return { phase: 0, name: "Idea" };
  if (sviScore < 30) return { phase: 0, name: "Idea" };
  if (sviScore <= 50) return { phase: 1, name: "Validation" };
  if (sviScore <= 70) return { phase: 2, name: "Equity" };
  if (sviScore <= 85) return { phase: 3, name: "Fundraise" };
  if (sviScore <= 120) return { phase: 4, name: "Traction" };
  return { phase: 5, name: "Growth" };
}

/* ─── Estimated Valuation from SVI ──────────────────────────────────────────── */

function estimateValuation(sviScore: number | null): { value: string; raw: number } {
  if (sviScore == null || sviScore < 10) return { value: "—", raw: 0 };
  // SVI-to-valuation mapping based on stage + market comparables
  // Idea (0-30): $10K-$100K | Validation (30-50): $50K-$500K
  // Build (50-70): $200K-$2M | Pre-fundraise (70-85): $500K-$5M
  // Traction (85-120): $1M-$10M | Growth (120+): $5M+
  let raw: number;
  if (sviScore < 30) raw = Math.round(sviScore * 3000);
  else if (sviScore <= 50) raw = Math.round(50_000 + (sviScore - 30) * 22_500);
  else if (sviScore <= 70) raw = Math.round(500_000 + (sviScore - 50) * 75_000);
  else if (sviScore <= 85) raw = Math.round(2_000_000 + (sviScore - 70) * 200_000);
  else if (sviScore <= 120) raw = Math.round(5_000_000 + (sviScore - 85) * 142_857);
  else raw = Math.round(10_000_000 + (sviScore - 120) * 250_000);

  if (raw >= 1_000_000) return { value: `A$${(raw / 1_000_000).toFixed(1)}M`, raw };
  if (raw >= 1_000) return { value: `A$${(raw / 1_000).toFixed(0)}K`, raw };
  return { value: `A$${raw.toLocaleString()}`, raw };
}

/* ─── Quick Actions ─────────────────────────────────────────────────────────── */

/**
 * Phase-aware quick actions — shows relevant actions for the startup's
 * current stage. Later-phase actions appear at bottom with "Coming next" label.
 */
function QuickActionsList({ hasAnalysis, phase }: { hasAnalysis: boolean; phase: number }) {
  // All actions ordered by startup development roadmap
  const allActions: { href: string; icon: LucideIcon; label: string; desc: string; minPhase: number; badge?: string }[] = [
    // Phase 0: Idea — always available
    { href: "/", icon: Sparkles, label: hasAnalysis ? "Re-analyze Idea" : "Get SVI Score", desc: hasAnalysis ? "Re-score with more detail" : "Free AI analysis in 60s", minPhase: 0 },
    { href: "/workspace/reports", icon: FileText, label: "View Reports", desc: "Your analysis history", minPhase: 0 },
    // Phase 1: Validation
    { href: "/workspace/evidence", icon: Upload, label: "Add Evidence", desc: "LinkedIn, team bios, market research", minPhase: 0, badge: phase < 2 ? "Boost Score" : undefined },
    { href: "/tools/idea-valuation", icon: BarChart3, label: "Idea Valuation", desc: "Pre-revenue valuation range", minPhase: 1 },
    // Phase 2: Build
    { href: "/workspace/equity-setup", icon: PieChart, label: "Equity Structure", desc: "Co-founder splits & vesting", minPhase: 2 },
    { href: "/workspace/cap-table", icon: PieChart, label: "Cap Table", desc: "Share classes & shareholders", minPhase: 2 },
    // Phase 3: Pre-fundraise
    { href: "/workspace/data-room", icon: Target, label: "Data Room", desc: "Investor documents & pitch", minPhase: 3 },
    // Phase 4+: Fundraise & Growth
    { href: "/workspace/fundraise", icon: TrendingUp, label: "Fundraise", desc: "Raise capital", minPhase: 3 },
    { href: "/workspace/revenue", icon: BarChart3, label: "Revenue Tracking", desc: "Track MRR, ARR, metrics", minPhase: 4 },
    { href: "/workspace/exit", icon: ShieldCheck, label: "Exit Modeling", desc: "Scenario planning", minPhase: 5 },
  ];

  // Split into current-phase actions and upcoming actions
  const currentActions = allActions.filter(a => a.minPhase <= phase).slice(0, 5);
  const upcomingActions = allActions.filter(a => a.minPhase > phase).slice(0, 3);

  return (
    <div className="space-y-1">
      {currentActions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-50 group"
        >
          <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-surface-100 text-ink-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors shrink-0">
            <a.icon strokeWidth={1.75} className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-ink-800 truncate">{a.label}</p>
              {a.badge && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{a.badge}</span>}
            </div>
            <p className="text-xs text-ink-500 truncate">{a.desc}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-ink-500" />
        </Link>
      ))}

      {/* Upcoming actions — greyed out with roadmap context */}
      {upcomingActions.length > 0 && (
        <>
          <div className="pt-3 pb-1 px-3">
            <p className="text-[10px] uppercase tracking-widest text-ink-400 font-medium">Coming next in your journey</p>
          </div>
          {upcomingActions.map((a) => (
            <div
              key={a.href}
              className="flex items-center gap-3 rounded-xl px-3 py-3 opacity-50"
            >
              <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-surface-100 text-ink-400 shrink-0">
                <a.icon strokeWidth={1.75} className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink-500 truncate">{a.label}</p>
                <p className="text-xs text-ink-400 truncate">{a.desc}</p>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ─── Main Dashboard Page ───────────────────────────────────────────────────── */

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; checkout?: string; plan?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/dashboard");
  }

  const sp = await searchParams;
  const supabase = getSupabaseAdmin();

  // First-time user: redirect to onboarding wizard before showing the dashboard
  if (supabase && !user.onboardingCompleted) {
    const { count: priorSviCount } = await supabase
      .from("svi_analyses")
      .select("id", { count: "exact", head: true })
      .eq("email", user.email);
    if (!priorSviCount || priorSviCount === 0) {
      redirect("/dashboard/onboarding");
    }
  }

  // ── Fetch data in parallel where possible ────────────────────────────────
  const projectId = await getProjectIdFromRequest();
  const [activeProject, creditBalance] = await Promise.all([
    projectId
      ? getActiveProject(user.id, undefined).then((p) => p)
      : getActiveProject(user.id),
    getBalance(user.id),
  ]);

  // ── Load latest SVI analysis ─────────────────────────────────────────────
  let analysis: SVIAnalysis | null = null;
  let latestAnalysisId: string | undefined;
  let rawInput: string | undefined;
  let previousSVI: number | undefined;
  let startupName: string | undefined;
  let evidenceCount = 0;
  let sviHistory: Array<{ total_svi: number; created_at: string }> = [];
  let recentReports: Array<{
    id: string;
    total_svi: number;
    created_at: string;
    input_type: string | null;
    raw_input?: string;
  }> = [];
  let snapshotHistory: Array<{ date: string; svi: number; delta: number | null }> = [];
  let savedSections: Array<{
    section_id: string;
    depth: string;
    content: string;
    word_count: number;
    credits_cost: number;
  }> = [];
  let shareViews = 0;
  let latestScoreId: string | undefined;
  let userActions: Array<{
    id: string;
    action_type: string;
    action_label: string;
    dimension: string | null;
    svi_impact_estimate: number;
    completed_at: string;
  }> = [];
  let weeklyDelta: number | undefined;
  let shareholders: Array<{ name: string; percentage: number; color: string }> = [];
  let totalShareCount = 1_000_000;

  if (supabase) {
    // Latest analysis
    const analysisQuery = supabase
      .from("svi_analyses")
      .select("id, analysis_json, total_svi, created_at, raw_input")
      .eq("email", user.email);
    if (projectId) analysisQuery.eq("project_id", projectId);
    else analysisQuery.is("project_id", null);

    const { data: latestAnalysis } = await analysisQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestAnalysis?.analysis_json) {
      analysis = latestAnalysis.analysis_json as SVIAnalysis;
      latestAnalysisId = latestAnalysis.id as string;
      rawInput = (latestAnalysis.raw_input as string | null) ?? undefined;
    }

    // SVI score history
    const historyQuery = supabase
      .from("svi_analyses")
      .select("total_svi, created_at")
      .eq("email", user.email);
    if (projectId) historyQuery.eq("project_id", projectId);
    else historyQuery.is("project_id", null);

    const { data: historyData } = await historyQuery
      .order("created_at", { ascending: true })
      .limit(50);

    if (historyData && historyData.length > 0) {
      sviHistory = historyData.map((h) => ({
        total_svi: h.total_svi as number,
        created_at: h.created_at as string,
      }));
      if (historyData.length >= 2) {
        previousSVI = historyData[historyData.length - 2].total_svi as number;
      }
    }

    // Recent reports (last 5 for the dashboard card)
    const reportsQuery = supabase
      .from("svi_analyses")
      .select("id, total_svi, created_at, input_type, raw_input")
      .eq("email", user.email);
    if (projectId) reportsQuery.eq("project_id", projectId);
    else reportsQuery.is("project_id", null);

    const { data: reportsData } = await reportsQuery
      .order("created_at", { ascending: false })
      .limit(20);

    if (reportsData) {
      recentReports = reportsData.map((r) => ({
        id: r.id as string,
        total_svi: r.total_svi as number,
        created_at: r.created_at as string,
        input_type: r.input_type as string | null,
        raw_input: (r.raw_input as string | null) ?? undefined,
      }));
    }

    // SVI account data
    const accountId = await findOrCreateSVIAccount(user.email, projectId);
    if (accountId) {
      const { data: account } = await supabase
        .from("svi_accounts")
        .select("id, startup_name, current_svi, current_stage")
        .eq("id", accountId)
        .single();

      if (account) {
        startupName = (account.startup_name as string | null) ?? undefined;

        // Snapshot history
        const { data: snapshots } = await supabase
          .from("svi_snapshots")
          .select("snapshot_date, svi_total, delta")
          .eq("account_id", account.id as string)
          .order("snapshot_date", { ascending: false })
          .limit(12);

        if (snapshots && snapshots.length > 0) {
          snapshotHistory = snapshots.map((s) => ({
            date: s.snapshot_date as string,
            svi: s.svi_total as number,
            delta: s.delta as number | null,
          }));
          weeklyDelta = (snapshots[0].delta as number | null) ?? undefined;
        }

        // Evidence count
        const { count: evCount } = await supabase
          .from("svi_evidence")
          .select("id", { count: "exact", head: true })
          .eq("account_id", account.id as string);
        evidenceCount = evCount ?? 0;
      }
    }

    // Saved report sections
    if (latestAnalysisId) {
      const { data: sectionsData } = await supabase
        .from("report_sections")
        .select("section_id, depth, content, word_count, credits_cost")
        .eq("analysis_id", latestAnalysisId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (sectionsData) {
        savedSections = sectionsData.map((s) => ({
          section_id: s.section_id as string,
          depth: s.depth as string,
          content: s.content as string,
          word_count: (s.word_count as number) ?? 0,
          credits_cost: (s.credits_cost as number) ?? 0,
        }));
      }
    }

    // Share link views
    const { data: userScores } = await supabase
      .from("scores")
      .select("id, created_at")
      .eq("email", user.email)
      .order("created_at", { ascending: false })
      .limit(50);

    if (userScores && userScores.length > 0) {
      latestScoreId = userScores[0].id as string;
      const scoreIds = userScores.map((s) => s.id as string);
      const { count: viewCount } = await supabase
        .from("score_views")
        .select("id", { count: "exact", head: true })
        .in("score_id", scoreIds);
      shareViews = viewCount ?? 0;
    }

    // User actions
    const { data: actionsData } = await supabase
      .from("user_actions")
      .select("id, action_type, action_label, dimension, svi_impact_estimate, completed_at")
      .eq("email", user.email)
      .order("completed_at", { ascending: false })
      .limit(10);

    if (actionsData) {
      userActions = actionsData.map((a) => ({
        id: a.id as string,
        action_type: a.action_type as string,
        action_label: a.action_label as string,
        dimension: a.dimension as string | null,
        svi_impact_estimate: (a.svi_impact_estimate as number) ?? 0,
        completed_at: a.completed_at as string,
      }));
    }
    // Shareholders for cap table mini chart
    if (accountId) {
      const { data: shData } = await supabase
        .from("shareholders")
        .select("name, role, shares_held")
        .eq("account_id", accountId);
      if (shData && shData.length > 0) {
        const totalShares = shData.reduce((sum, s) => sum + Number(s.shares_held ?? 0), 0);
        shareholders = shData.map((s) => ({
          name: (s.name as string) ?? "Unknown",
          percentage: totalShares > 0 ? (Number(s.shares_held ?? 0) / totalShares) * 100 : 0,
          color: (s.role as string) === "founder" ? "#2563EB" : (s.role as string) === "investor" ? "#F59E0B" : "#10B981",
        }));
        totalShareCount = totalShares;
      }
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const sviScore = analysis?.totalSVI ?? null;
  const delta = previousSVI != null && sviScore != null ? sviScore - previousSVI : weeklyDelta ?? null;
  const { phase, name: phaseName } = computePhase(sviScore);
  const readiness = sviScore != null ? Math.min(100, Math.round(sviScore * 0.8 + evidenceCount * 2)) : 0;
  const valuation = estimateValuation(sviScore);
  const nextAction = computeNextAction(sviScore);
  // SCN POSITION: rank the founder's SVI against the AU cohort distribution for their stage.
  const scnStage = analysis?.stage ?? phase;
  const scnPercentile =
    sviScore != null ? Math.round(getSVIPercentile(sviScore, scnStage)) : null;
  // SCN DIRECTION: sequenced 3-step route driven by weakest layer + stage.
  const directionSteps = computeDirectionSteps(analysis, scnStage);
  const weakestLayer = weakestLayerLabel(analysis?.subs);
  const directionStageLabel = analysis?.stageLabel ?? phaseName;
  const projectName = activeProject?.name ?? startupName ?? user.startupName ?? null;
  const ideaSummary = rawInput ? rawInput.slice(0, 200) : analysis?.summary?.slice(0, 200) ?? null;

  // For the LivingSVIDashboard
  const computedDelta = previousSVI != null && analysis ? analysis.totalSVI - previousSVI : undefined;
  const analysisWithDelta: SVIAnalysis | null = analysis
    ? {
        ...analysis,
        weeklyDelta: weeklyDelta ?? computedDelta ?? analysis.weeklyDelta,
      }
    : null;

  // Recent 5 reports for the summary card
  const displayReports = recentReports.slice(0, 5);

  return (
    <WorkspaceLayout user={user} startupName={startupName} currentPhase={phase}>
      <PageTracker page="dashboard" />

      <div className="max-w-5xl mx-auto px-6 pb-24 pt-6 space-y-6">
        {/* ── Banners ───────────────────────────────────────────────────────── */}
        {sp.checkout === "success" && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-700">
                Your {sp.plan ?? "new"} plan is now active!
              </p>
              <p className="mt-1 text-sm text-ink-600">
                Payment confirmed. All plan features are unlocked and ready to use.
              </p>
            </div>
          </div>
        )}
        {sp.welcome === "1" && (
          <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold text-brand-700">
                Welcome to BlockID. Your account is live.
              </p>
              <p className="mt-1 text-sm text-ink-600">
                Run your first SVI analysis to unlock personalised startup guidance.
              </p>
            </div>
          </div>
        )}

        {/* ── Journey Progress Bar ──────────────────────────────────────────── */}
        <JourneyBar currentPhase={phase} sviScore={sviScore ?? 0} />

        {/* ── SCN POSITION hero — "Where am I?" above valuation ─────────────── */}
        <ScnPositionHero
          sviScore={sviScore}
          stageLabel={phaseName}
          percentile={scnPercentile}
          valuationLabel={valuation.value}
        />

        {/* ── Row 1: Metric Cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Company Value"
            value={valuation.value}
            trend={delta && sviScore ? Math.round(delta * (valuation.raw / (sviScore || 1)) / 1000) : undefined}
            icon={BarChart3}
          />
          <MetricCard
            title="SVI Score"
            value={sviScore ?? "--"}
            trend={delta ?? undefined}
            icon={TrendingUp}
          />
          <MetricCard
            title="Current Phase"
            value={phaseName}
            subtitle={`Phase ${phase + 1} of 6`}
            icon={Target}
          />
          <MetricCard
            title="Credits"
            value={creditBalance % 1 === 0 ? creditBalance : creditBalance.toFixed(2)}
            subtitle="remaining"
            icon={Zap}
          />
          <MetricCard
            title="Investor Ready"
            value={`${readiness}%`}
            icon={ShieldCheck}
          />
        </div>

        {/* ── Row 2: Project Context Card ───────────────────────────────────── */}
        {(analysis || projectName) && (
          <div className="rounded-2xl border border-surface-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wider text-brand-600 font-medium">
                  Current Project
                </p>
                <h2 className="text-xl font-bold text-ink-900 mt-1">
                  {projectName || "My Startup"}
                </h2>
                {ideaSummary && (
                  <p className="text-sm text-ink-500 mt-2 line-clamp-2">{ideaSummary}</p>
                )}
              </div>
              {sviScore != null && (
                <div className="text-right shrink-0 ml-4">
                  <div className="text-3xl font-bold text-brand-600">{sviScore}</div>
                  <p className="text-xs text-ink-500">SVI Score</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Row 3: SCN DIRECTION — Google-Maps-style navigation ───────────── */}
        {sviScore == null ? (
          <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/50 p-6">
            <div className="flex items-start gap-4">
              <Lightbulb className="h-8 w-8 text-brand-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-brand-800">Recommended Next Step</p>
                <p className="text-sm text-brand-700 mt-1">{nextAction.text}</p>
                <Link
                  href={nextAction.url}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  {nextAction.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <ScnDirectionNavigator
            stageLabel={directionStageLabel}
            weakestLayer={weakestLayer}
            steps={directionSteps}
          />
        )}

        {/* ── Row 4: Recent Reports + Quick Actions ─────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Reports */}
          <div className="rounded-2xl border border-surface-200 bg-white p-6">
            <h3 className="text-sm font-bold text-ink-800 mb-4">Recent Reports</h3>
            {displayReports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-200 px-4 py-8 text-center">
                <FileText className="h-6 w-6 mx-auto text-ink-300 mb-2" />
                <p className="text-sm text-ink-500">No reports yet.</p>
                <p className="text-xs text-ink-400 mt-1">
                  Run your first SVI analysis to generate a report.
                </p>
              </div>
            ) : (
              <div className="space-y-0">
                {displayReports.map((r) => (
                  <Link key={r.id} href={`/workspace/reports/${r.id}`}>
                    <div className="flex items-center gap-3 py-3 border-b border-surface-100 last:border-0 hover:bg-surface-50/50 -mx-2 px-2 rounded-lg transition-colors">
                      <FileText className="h-4 w-4 text-ink-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-800 truncate">
                          {r.raw_input
                            ? r.raw_input.slice(0, 60) + (r.raw_input.length > 60 ? "..." : "")
                            : `Analysis ${new Date(r.created_at).toLocaleDateString("en-AU")}`}
                        </p>
                        <p className="text-xs text-ink-500">
                          {new Date(r.created_at).toLocaleDateString("en-AU")} · SVI {r.total_svi}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-ink-400 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {recentReports.length > 5 && (
              <Link
                href="/workspace/reports"
                className="mt-3 block text-center text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View all reports
              </Link>
            )}
          </div>

          {/* Quick Actions */}
          <div className="rounded-2xl border border-surface-200 bg-white p-6">
            <h3 className="text-sm font-bold text-ink-800 mb-4">Quick Actions</h3>
            <QuickActionsList hasAnalysis={!!analysis} phase={phase} />
          </div>
        </div>

        {/* ── Row 5: Status Cards ───────────────────────────────────────────── */}
        <StatusCards
          sviScore={sviScore}
          evidenceCount={evidenceCount}
          phase={phase}
          phaseName={phaseName}
          hasCapTable={shareholders.length > 0}
          hasEquity={shareholders.length > 1}
        />

        {/* ── Row 6: Cap Table + Activity Feed ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CapTableMini shareholders={shareholders} totalShares={totalShareCount} />
          <ActivityFeed rawActions={
            userActions.map(a => ({ action_type: a.action_type, description: a.action_label, created_at: a.completed_at }))
          } />
        </div>

        {/* ── Row 7: Growth Roadmap ────────────────────────────────────────── */}
        <GrowthRoadmap currentPhase={phase} />

        {/* ── Row 7b: Growth Phase Progress Dashboard ─────────────────────── */}
        <GrowthProgressDashboard />

        {/* ── Row 8: Living SVI Dashboard ───────────────────────────────────── */}
        {analysisWithDelta && (
          <LivingSVIDashboard
            analysis={analysisWithDelta}
            sviHistory={sviHistory}
            recentReports={recentReports}
            savedSections={savedSections}
            snapshotHistory={snapshotHistory}
            startupName={startupName}
            userEmail={user.email}
            creditBalance={creditBalance}
            evidenceCount={evidenceCount}
            shareViews={shareViews}
            analysisId={latestScoreId}
            lastAnalysisDate={
              recentReports.length > 0 ? recentReports[0].created_at : undefined
            }
            previousSVI={previousSVI}
            userActions={userActions}
            userProfile={{
              displayName: user.displayName,
              startupName: user.startupName,
              startupStage: user.startupStage,
              industry: user.industry,
              startupGoals: user.startupGoals,
            }}
          />
        )}
      </div>
    </WorkspaceLayout>
  );
}
