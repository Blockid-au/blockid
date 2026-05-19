import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { BarChart3 } from "lucide-react";
import { ReportsClient, type SnapshotRow } from "./reports-client";
import type { SVIAnalysis } from "@/lib/svi-analysis";

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

  if (sb) {
    // Find the SVI account for this user
    const { data: account } = await sb
      .from("svi_accounts")
      .select("id, current_svi, current_stage")
      .eq("email", user.email)
      .single();

    if (account) {
      // Load snapshots (latest 12)
      const { data: snapshotRows } = await sb
        .from("svi_snapshots")
        .select("id, snapshot_date, svi_total, delta")
        .eq("account_id", account.id)
        .order("snapshot_date", { ascending: false })
        .limit(12);

      if (snapshotRows && snapshotRows.length > 0) {
        snapshots = snapshotRows as SnapshotRow[];
        currentSVI = snapshotRows[0].svi_total;
        previousSVI =
          snapshotRows.length > 1 ? snapshotRows[1].svi_total : currentSVI;
        currentStage = account.current_stage ?? 0;
      }

      // Load latest analysis for wins/gaps
      const { data: analysis } = await sb
        .from("svi_analyses")
        .select("analysis_json")
        .eq("email", user.email)
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

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">Weekly Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
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
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-900/50 px-6 py-16 text-center">
            <BarChart3
              strokeWidth={1.25}
              className="mx-auto h-10 w-10 text-slate-600 mb-3"
            />
            <p className="text-slate-400 font-medium">
              Your first weekly report will be generated after your SVI baseline
              is set.
            </p>
            <p className="text-slate-600 text-sm mt-1">
              Get your SVI score first.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 transition-colors"
            >
              Get your SVI score
            </Link>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
