import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CohortBenchmarkChart } from "@/components/dashboard/cohort-benchmark-chart";

export const metadata: Metadata = {
  title: "SVI Cohort Benchmark · BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Bucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

const BUCKETS: Array<Omit<Bucket, "count">> = [
  { label: "0-9", min: 0, max: 10 },
  { label: "10-19", min: 10, max: 20 },
  { label: "20-29", min: 20, max: 30 },
  { label: "30-39", min: 30, max: 40 },
  { label: "40-49", min: 40, max: 50 },
  { label: "50-59", min: 50, max: 60 },
  { label: "60-69", min: 60, max: 70 },
  { label: "70-79", min: 70, max: 80 },
  { label: "80-89", min: 80, max: 90 },
  { label: "90-100", min: 90, max: 101 },
];

function bucketize(scores: number[]): Bucket[] {
  return BUCKETS.map((b) => ({
    ...b,
    count: scores.filter((s) => s >= b.min && s < b.max).length,
  }));
}

function percentile(scores: number[], value: number): number {
  if (scores.length === 0) return 50;
  const below = scores.filter((s) => s < value).length;
  return Math.round((below / scores.length) * 100);
}

export default async function BenchmarkPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/benchmark");

  let cohortScores: number[] = [];
  let userScore: number | null = null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    // Anonymised cohort — every score in svi_analyses, aggregated server-side.
    const { data: cohort } = await supabase
      .from("svi_analyses")
      .select("total_svi")
      .not("total_svi", "is", null)
      .limit(5000);
    cohortScores = ((cohort as Array<{ total_svi: number | null }> | null) ?? [])
      .map((r) => Number(r.total_svi))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);

    const { data: latest } = await supabase
      .from("svi_analyses")
      .select("total_svi")
      .eq("email", user.email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ts = (latest as { total_svi?: number | null } | null)?.total_svi;
    userScore = typeof ts === "number" ? ts : null;
  }

  const buckets = bucketize(cohortScores);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const userPercentile = userScore != null ? percentile(cohortScores, userScore) : null;

  const median =
    cohortScores.length > 0
      ? [...cohortScores].sort((a, b) => a - b)[Math.floor(cohortScores.length / 2)]
      : null;

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-5xl mx-auto px-6 pb-24 pt-8 space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 flex items-center gap-2">
              <BarChart3 strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
              SVI Cohort Benchmark
            </h1>
            <p className="text-sm text-ink-600 mt-2 max-w-2xl">
              Where you sit relative to the anonymised cohort of Australian
              pre-seed and seed startups that have been analysed by BlockID.
              Bars show the score distribution in buckets of 10. Your position
              is highlighted in indigo.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs font-medium text-brand-700 hover:text-brand-800"
          >
            ← Back to dashboard
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <p className="text-xs text-ink-500 uppercase tracking-wider font-medium">
              Cohort size
            </p>
            <p className="mt-2 text-2xl font-bold text-ink-900">
              {cohortScores.length.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-ink-500">analysed startups</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4">
            <p className="text-xs text-ink-500 uppercase tracking-wider font-medium">
              Cohort median SVI
            </p>
            <p className="mt-2 text-2xl font-bold text-ink-900">
              {median ?? "—"}
            </p>
            <p className="mt-1 text-xs text-ink-500">midpoint of all scores</p>
          </div>
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
            <p className="text-xs text-brand-700 uppercase tracking-wider font-medium">
              Your position
            </p>
            <p className="mt-2 text-2xl font-bold text-brand-900">
              {userScore != null ? userScore : "—"}
              {userPercentile != null && (
                <span className="text-sm font-medium text-brand-700 ml-2">
                  · p{userPercentile}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-brand-700">
              {userScore == null
                ? "Run an analysis to see your position"
                : `Top ${100 - (userPercentile ?? 50)}% of the cohort`}
            </p>
          </div>
        </div>

        <CohortBenchmarkChart
          buckets={buckets}
          maxCount={maxCount}
          userScore={userScore}
        />

        <div className="rounded-2xl border border-surface-200 bg-white p-6 text-sm text-ink-600 leading-relaxed">
          <p>
            <strong className="text-ink-900">Methodology.</strong> Cohort scores
            are aggregated anonymously across every successful BlockID analysis;
            no founder identity is shared with you. The histogram uses{" "}
            {BUCKETS.length} buckets of 10 SVI points each. The percentile is the
            fraction of cohort startups scoring strictly below your score.
          </p>
          {userScore == null && (
            <p className="mt-3">
              You haven&rsquo;t run a BlockID analysis yet —{" "}
              <Link href="/score" className="text-brand-700 hover:text-brand-800 font-medium">
                start your first SVI score
              </Link>{" "}
              to drop your position onto this chart.
            </p>
          )}
        </div>
      </div>
    </WorkspaceLayout>
  );
}
