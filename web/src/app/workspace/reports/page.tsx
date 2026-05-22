import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { BarChart3 } from "lucide-react";
import { ReportsClient, type SnapshotRow } from "./reports-client";
import type { SVIAnalysis } from "@/lib/svi-analysis";

export const metadata: Metadata = {
  title: "Weekly Reports",
  description: "Track your Startup Value Index progress week by week on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/reports");

  const sb = getSupabaseAdmin();

  let snapshots: SnapshotRow[] = [];
  let currentSVI = 100;
  let previousSVI = 100;
  let currentStage = 0;
  let wins: string[] = [];
  let gaps: string[] = [];
  let latestAISummary: string | null = null;

  if (sb) {
    // Resolve active project
    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(user.email, projectId);

    if (accountId) {
      const { data: account } = await sb
        .from("svi_accounts")
        .select("id, current_svi, current_stage")
        .eq("id", accountId)
        .single();

      if (account) {
        // Load snapshots (latest 12) — include ai_summary and dimension_scores
        const { data: snapshotRows } = await sb
          .from("svi_snapshots")
          .select("id, snapshot_date, svi_total, delta, ai_summary")
          .eq("account_id", account.id)
          .order("snapshot_date", { ascending: false })
          .limit(12);

        if (snapshotRows && snapshotRows.length > 0) {
          snapshots = snapshotRows as SnapshotRow[];
          currentSVI = snapshotRows[0].svi_total;
          previousSVI =
            snapshotRows.length > 1 ? snapshotRows[1].svi_total : currentSVI;
          currentStage = account.current_stage ?? 0;

          // Get the most recent AI summary from snapshots
          for (const row of snapshotRows) {
            if (row.ai_summary) {
              latestAISummary = row.ai_summary as string;
              break;
            }
          }
        }

        // Load latest analysis for wins/gaps (project-scoped)
        const analysisQuery = sb
          .from("svi_analyses")
          .select("analysis_json")
          .eq("email", user.email);
        if (projectId) analysisQuery.eq("project_id", projectId);
        else analysisQuery.is("project_id", null);

        const { data: analysis } = await analysisQuery
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (analysis?.analysis_json) {
          const parsed = analysis.analysis_json as SVIAnalysis;

          // Wins: sub-scores with value >= 60
          if (parsed.subs && Array.isArray(parsed.subs)) {
            wins = parsed.subs
              .filter((s) => s.value >= 60)
              .map((s) => s.label);
          }

          // Gaps: top 3 evidence gaps
          if (parsed.evidenceGaps && Array.isArray(parsed.evidenceGaps)) {
            gaps = parsed.evidenceGaps.slice(0, 3).map((g) => g.label);
          }
        }
      }
    }
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Weekly Reports</h1>
          <p className="text-sm text-ink-700 mt-1">
            Track your SVI progress week by week.
          </p>
        </div>

        {snapshots.length > 0 ? (
          <ReportsClient
            snapshots={snapshots}
            currentSVI={currentSVI}
            previousSVI={previousSVI}
            currentStage={currentStage}
            wins={wins}
            gaps={gaps}
            latestAISummary={latestAISummary}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-6 py-16 text-center">
            <BarChart3
              strokeWidth={1.25}
              className="mx-auto h-10 w-10 text-ink-700 mb-3"
            />
            <p className="text-ink-600 font-medium">
              Your first weekly report will be generated after your SVI baseline
              is set.
            </p>
            <p className="text-ink-700 text-sm mt-1">
              Get your SVI score first.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Get your SVI score
            </Link>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
