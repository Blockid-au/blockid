import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { Activity } from "lucide-react";
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

  const sb = getSupabaseAdmin();

  let metrics: MetricRow[] = [];
  let stage = "pre-seed";

  if (sb) {
    // Find the SVI account for this user to determine stage
    const { data: account } = await sb
      .from("svi_accounts")
      .select("id, current_stage")
      .eq("email", user.email)
      .maybeSingle();

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

    // Load metrics from last 12 months
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - 12);
    const cutoff = cutoffDate.toISOString().slice(0, 10);

    const { data: metricRows } = await sb
      .from("startup_metrics")
      .select("id, metric_date, metric_type, value, source, created_at")
      .eq("email", user.email)
      .gte("metric_date", cutoff)
      .order("metric_date", { ascending: true });

    if (metricRows) {
      metrics = metricRows as MetricRow[];
    }
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Metrics</h1>
          <p className="text-sm text-ink-700 mt-1">
            Track your startup product metrics and see how you compare to peers.
          </p>
        </div>

        {metrics.length > 0 || true ? (
          <MetricsClient metrics={metrics} stage={stage} />
        ) : (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-6 py-16 text-center">
            <Activity
              strokeWidth={1.25}
              className="mx-auto h-10 w-10 text-ink-700 mb-3"
            />
            <p className="text-ink-600 font-medium">
              No metrics logged yet.
            </p>
            <p className="text-ink-700 text-sm mt-1">
              Start tracking your MRR, MAU, retention and more.
            </p>
            <Link
              href="/workspace/metrics"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Log your first metric
            </Link>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
