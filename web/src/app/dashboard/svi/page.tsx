import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";
import { SVIDashboard } from "@/components/svi/svi-dashboard";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WelcomeGuide } from "@/components/workspace/welcome-guide";
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
  let weeklyDelta: number | undefined;
  let startupName: string | undefined;
  let snapshotHistory: Array<{ date: string; svi: number; delta: number | null }> = [];
  let sviHistory: SVIHistoryPoint[] = [];
  let recentReports: ReportEntry[] = [];
  let lastAnalysisDate: string | undefined;
  let previousSVI: number | undefined;

  if (supabase) {
    // Resolve the active project for this user
    const projectId = await getProjectIdFromRequest();

    // Load latest SVI analysis for this user + project
    const analysisQuery = supabase
      .from("svi_analyses")
      .select("analysis_json, total_svi, created_at")
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
    }

    // Load SVI score history (all analyses for the trend chart)
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
      sviHistory = historyData.map(h => ({
        total_svi: h.total_svi as number,
        created_at: h.created_at as string,
      }));
      // Previous SVI (second to last analysis) for delta comparison
      if (historyData.length >= 2) {
        previousSVI = historyData[historyData.length - 2].total_svi as number;
      }
    }

    // Load recent reports (all analyses for this project)
    const reportsQuery = supabase
      .from("svi_analyses")
      .select("id, total_svi, created_at, svi_version, input_type, rnd_report_json")
      .eq("email", user.email);
    if (projectId) reportsQuery.eq("project_id", projectId);
    else reportsQuery.is("project_id", null);

    const { data: reportsData } = await reportsQuery
      .order("created_at", { ascending: false })
      .limit(20);

    if (reportsData) {
      recentReports = reportsData.map(r => ({
        id: r.id as string,
        total_svi: r.total_svi as number,
        created_at: r.created_at as string,
        svi_version: r.svi_version as string | null,
        input_type: r.input_type as string | null,
        rnd_report_json: r.rnd_report_json,
      }));
    }

    // Load or create SVI account (project-scoped)
    const accountId = await findOrCreateSVIAccount(user.email, projectId);

    let account: { id: string; startup_name: string | null; current_svi: number | null; current_stage: number | null } | null = null;
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

      // Load snapshot history
      const { data: snapshots } = await supabase
        .from("svi_snapshots")
        .select("snapshot_date, svi_total, delta")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(12);

      if (snapshots && snapshots.length > 0) {
        snapshotHistory = snapshots.map(s => ({
          date: s.snapshot_date as string,
          svi: s.svi_total as number,
          delta: s.delta as number | null,
        }));
        weeklyDelta = snapshots[0].delta ?? undefined;
      }
    }
  }

  // If no analysis yet, show empty state CTA
  if (!analysis) {
    return (
      <WorkspaceLayout user={user} startupName={startupName}>
        <div className="max-w-5xl mx-auto px-6 pb-24 pt-10">
          <WelcomeGuide />
          <div className="pt-10 text-center">
          <h1 className="text-2xl font-bold text-ink-800 mb-3">No SVI analysis yet</h1>
          <p className="text-ink-600 text-sm mb-6">Go to the home page to analyze your startup idea and get your first SVI score.</p>
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            Get My SVI →
          </Link>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  // Compute delta from analysis history (fallback if no snapshots)
  const computedDelta = previousSVI != null ? analysis.totalSVI - previousSVI : undefined;

  // Inject weeklyDelta into analysis
  const analysisWithDelta: SVIAnalysis = {
    ...analysis,
    weeklyDelta: weeklyDelta ?? computedDelta ?? analysis.weeklyDelta,
  };

  return (
    <WorkspaceLayout user={user} startupName={startupName}>
      <div className="max-w-5xl mx-auto px-6 pb-24 pt-6">
        <WelcomeGuide />
        <SVIDashboard
          analysis={analysisWithDelta}
          startupName={startupName}
          snapshotHistory={snapshotHistory}
          userEmail={user.email}
          sviHistory={sviHistory}
          recentReports={recentReports}
          lastAnalysisDate={lastAnalysisDate}
          previousSVI={previousSVI}
        />
      </div>
    </WorkspaceLayout>
  );
}
