import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";
import { getBalance } from "@/lib/credits";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { LivingSVIDashboard } from "@/components/dashboard/living-svi-dashboard";
import type { SVIAnalysis } from "@/lib/svi-analysis";

export const metadata: Metadata = {
  title: "SVI Dashboard",
  description: "Your Startup Value Index dashboard",
};

export const dynamic = "force-dynamic";

export interface ReportEntry {
  id: string;
  total_svi: number;
  created_at: string;
  svi_version: string | null;
  input_type: string | null;
  rnd_report_json: unknown | null;
}

export interface SVIHistoryPoint {
  total_svi: number;
  created_at: string;
}

export default async function SVIDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/dashboard/svi");
  }

  const supabase = getSupabaseAdmin();
  let analysis: SVIAnalysis | null = null;
  let latestAnalysisId: string | undefined;
  let weeklyDelta: number | undefined;
  let startupName: string | undefined;
  let snapshotHistory: Array<{ date: string; svi: number; delta: number | null }> = [];
  let sviHistory: SVIHistoryPoint[] = [];
  let recentReports: Array<{
    id: string;
    total_svi: number;
    created_at: string;
    input_type: string | null;
    raw_input?: string;
  }> = [];
  let lastAnalysisDate: string | undefined;
  let previousSVI: number | undefined;
  let savedSections: Array<{
    section_id: string;
    depth: string;
    content: string;
    word_count: number;
    credits_cost: number;
  }> = [];
  let creditBalance = 0;
  let evidenceCount = 0;
  let shareViews = 0;
  let userActions: Array<{
    id: string;
    action_type: string;
    action_label: string;
    dimension: string | null;
    svi_impact_estimate: number;
    completed_at: string;
  }> = [];

  if (supabase) {
    // Resolve the active project for this user
    const projectId = await getProjectIdFromRequest();

    // ── Load latest SVI analysis ─────────────────────────────────────────
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
      lastAnalysisDate = latestAnalysis.created_at as string;
      latestAnalysisId = latestAnalysis.id as string;
    }

    // ── Load SVI score history (trend chart) ─────────────────────────────
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

    // ── Load recent reports (with raw_input for snippets) ────────────────
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

    // ── Load or create SVI account (project-scoped) ──────────────────────
    const accountId = await findOrCreateSVIAccount(user.email, projectId);

    let account: {
      id: string;
      startup_name: string | null;
      current_svi: number | null;
      current_stage: number | null;
    } | null = null;

    if (accountId) {
      const { data: row } = await supabase
        .from("svi_accounts")
        .select("id, startup_name, current_svi, current_stage")
        .eq("id", accountId)
        .single();
      account = row;
    }

    if (account) {
      startupName = account.startup_name ?? undefined;

      // Snapshot history
      const { data: snapshots } = await supabase
        .from("svi_snapshots")
        .select("snapshot_date, svi_total, delta")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(12);

      if (snapshots && snapshots.length > 0) {
        snapshotHistory = snapshots.map((s) => ({
          date: s.snapshot_date as string,
          svi: s.svi_total as number,
          delta: s.delta as number | null,
        }));
        weeklyDelta = snapshots[0].delta ?? undefined;
      }

      // ── Evidence count ───────────────────────────────────────────────
      const { count: evCount } = await supabase
        .from("svi_evidence")
        .select("id", { count: "exact", head: true })
        .eq("account_id", account.id);
      evidenceCount = evCount ?? 0;
    }

    // ── Saved report sections (for latest analysis) ──────────────────────
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

    // ── Credit balance ───────────────────────────────────────────────────
    creditBalance = await getBalance(user.id);

    // ── Share link views ─────────────────────────────────────────────────
    // Get all score IDs for this user, then count views
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

    // ── User actions (recent 10) ─────────────────────────────────────────
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

  // ── Empty state — no analysis yet ────────────────────────────────────────
  if (!analysis) {
    return (
      <WorkspaceLayout user={user} startupName={startupName}>
        <div className="max-w-5xl mx-auto px-6 pb-24 pt-10">
          <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-emerald-50/40 px-8 py-10 text-center shadow-sm">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-brand-100 border border-brand-200 mb-4">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                className="h-7 w-7 text-brand-600"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-ink-800 mb-2">Your AI Advisor is Ready</h1>
            <p className="text-ink-600 text-sm mb-2 max-w-md mx-auto">
              Run your first SVI analysis to unlock personalised startup guidance, evidence tracking,
              and actionable recommendations tailored to your stage.
            </p>
            <p className="text-xs text-ink-500 mb-6">
              It takes less than 60 seconds. No credit card required.
            </p>
            <Link
              href="/"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Get My SVI Score
            </Link>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  // ── Inject weeklyDelta into analysis ─────────────────────────────────────
  const computedDelta = previousSVI != null ? analysis.totalSVI - previousSVI : undefined;
  const analysisWithDelta: SVIAnalysis = {
    ...analysis,
    weeklyDelta: weeklyDelta ?? computedDelta ?? analysis.weeklyDelta,
  };

  // ── Render the living dashboard ──────────────────────────────────────────
  return (
    <WorkspaceLayout user={user} startupName={startupName}>
      <div className="max-w-5xl mx-auto px-6 pb-24 pt-6">
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
          lastAnalysisDate={lastAnalysisDate}
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
      </div>
    </WorkspaceLayout>
  );
}
