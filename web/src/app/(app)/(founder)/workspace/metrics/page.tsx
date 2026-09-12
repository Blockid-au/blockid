import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys, resolveSVIAccountIdForPage } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PageTracker } from "@/components/analytics/page-tracker";
import { MetricsClient, type MetricRow } from "./metrics-client";

export const metadata: Metadata = {
  title: "Metrics",
  description:
    "Track your startup product metrics — MRR, MAU, retention, and more on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/metrics");

  const isSandbox = await getCurrentProjectIsSandbox();

  const sb = getSupabaseAdmin();

  let metrics: MetricRow[] = [];
  let stage = "pre-seed";

  // S18-B — member-aware: metrics are keyed on the OWNER's email + project
  // (the key /api/metrics writes under); viewers get the dashboard only.
  const scope = await getProjectScope("viewer");
  const { projectId, dataEmail, role, canEdit, isMember } = pageScopeKeys(scope, user);

  if (sb) {
    const accountId = await resolveSVIAccountIdForPage(scope, user);

    if (accountId) {
      const { data: account } = await sb
        .from("svi_accounts")
        .select("id, current_stage")
        .eq("id", accountId)
        .single();

      if (account) {
        // Map numeric stage to string key
        const stageMap: Record<number, string> = {
          0: "pre-seed",
          1: "seed",
          2: "series-a",
          3: "series-b",
        };
        stage = stageMap[account.current_stage ?? 0] ?? "pre-seed";
      }
    }

    // Load metrics from last 12 months (project-scoped)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
    const cutoff = cutoffDate.toISOString().slice(0, 10);

    const metricsQuery = sb
      .from("startup_metrics")
      .select(
        "id, metric_date, mrr_aud, arr_aud, revenue_growth_pct, revenue, mau, dau, users_total, users_new, monthly_churn_pct, nrr_pct, cac_aud, ltv_aud, burn_rate_aud, runway_months, nps, notes, source, created_at",
      )
      .eq("email", dataEmail);
    if (projectId) metricsQuery.eq("project_id", projectId);
    else metricsQuery.is("project_id", null);

    const { data: metricRows } = await metricsQuery
      .gte("metric_date", cutoff)
      .order("metric_date", { ascending: true });

    if (metricRows) {
      metrics = metricRows as MetricRow[];
    }
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <PageTracker page="metrics" />
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Metrics</h1>
          <p className="text-sm text-ink-700 mt-1">
            Track your startup product metrics and see how you compare to peers.
          </p>
        </div>

        {isMember && !canEdit && (
          <ViewOnlyNote role={role} action="record metrics" className="mb-4" />
        )}
        <MetricsClient metrics={metrics} stage={stage} readOnly={!canEdit} />
      </div>
    </WorkspaceLayout>
  );
}
