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
import type { SVIAnalysis } from "@/lib/svi-analysis";

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

function computeNextAction(sviScore: number | null): {
  text: string;
  label: string;
  url: string;
} {
  if (sviScore == null) {
    return {
      text: "Describe your startup idea to get your free SVI score. It takes less than 60 seconds and is completely free.",
      label: "Get My SVI Score",
      url: "/",
    };
  }
  if (sviScore < 30) {
    return {
      text: "Upload evidence to boost your idea score (+8-20 pts). Connect GitHub, Stripe, or upload documents to strengthen your profile.",
      label: "Upload Evidence",
      url: "/workspace/evidence",
    };
  }
  if (sviScore <= 50) {
    return {
      text: "Build your valuation model to unlock equity tools. Use your SVI data to generate a pre-revenue valuation range.",
      label: "Start Valuation",
      url: "/tools/idea-valuation",
    };
  }
  if (sviScore <= 70) {
    return {
      text: "Set up your equity structure. Define your cap table, share classes, and founder splits before you raise capital.",
      label: "Equity Setup",
      url: "/workspace/equity-setup",
    };
  }
  if (sviScore <= 85) {
    return {
      text: "Prepare your data room for fundraising. Compile your key documents, metrics, and pitch materials in one place.",
      label: "Build Data Room",
      url: "/workspace/data-room",
    };
  }
  return {
    text: "Your startup is investor-ready! Start fundraising with a strong data room and compelling pitch materials.",
    label: "Start Fundraising",
    url: "/workspace/fundraise",
  };
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

/* ─── Quick Actions ─────────────────────────────────────────────────────────── */

function QuickActionsList({ hasAnalysis }: { hasAnalysis: boolean }) {
  const actions = [
    {
      href: "/",
      icon: Sparkles,
      label: hasAnalysis ? "Run New Analysis" : "Get SVI Score",
      desc: hasAnalysis ? "Re-score with latest data" : "Free AI analysis in 60s",
    },
    {
      href: "/workspace/evidence",
      icon: Upload,
      label: "Upload Evidence",
      desc: "Connect GitHub, Stripe, docs",
    },
    {
      href: "/workspace/cap-table",
      icon: PieChart,
      label: "Cap Table",
      desc: "Manage equity and splits",
    },
    {
      href: "/tools/idea-valuation",
      icon: BarChart3,
      label: "Idea Valuation",
      desc: "Pre-revenue valuation model",
    },
    {
      href: "/workspace/projects",
      icon: Target,
      label: "Manage Projects",
      desc: "Track multiple startups",
    },
  ];

  return (
    <div className="space-y-1">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-50 group"
        >
          <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-surface-100 text-ink-500 group-hover:bg-brand-50 group-hover:text-brand-600 transition-colors shrink-0">
            <a.icon strokeWidth={1.75} className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-800 truncate">{a.label}</p>
            <p className="text-xs text-ink-500 truncate">{a.desc}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-ink-500" />
        </Link>
      ))}
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
  let userActions: Array<{
    id: string;
    action_type: string;
    action_label: string;
    dimension: string | null;
    svi_impact_estimate: number;
    completed_at: string;
  }> = [];
  let weeklyDelta: number | undefined;

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
      .select("id")
      .eq("email", user.email)
      .limit(50);

    if (userScores && userScores.length > 0) {
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
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const sviScore = analysis?.totalSVI ?? null;
  const delta = previousSVI != null && sviScore != null ? sviScore - previousSVI : weeklyDelta ?? null;
  const { phase, name: phaseName } = computePhase(sviScore);
  const readiness = sviScore != null ? Math.min(100, Math.round(sviScore * 0.8 + evidenceCount * 2)) : 0;
  const nextAction = computeNextAction(sviScore);
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
    <WorkspaceLayout user={user} startupName={startupName}>
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

        {/* ── Row 1: Metric Cards ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* ── Row 3: Next Best Action ───────────────────────────────────────── */}
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
            <QuickActionsList hasAnalysis={!!analysis} />
          </div>
        </div>

        {/* ── Row 5: Living SVI Dashboard ───────────────────────────────────── */}
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
