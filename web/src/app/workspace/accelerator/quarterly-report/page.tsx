// /workspace/accelerator/quarterly-report — LP-ready quarterly summary.
//
// Server component. Four hero tiles (cohort size, avg SVI, capital raised,
// trailing 30-day activity), followed by the top-10 cohort founders table
// and an "Export to PDF" CTA that links to /api/reports/quarterly.
// Degrades gracefully when cohort_members/analyses tables are missing.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Feature } from "@/lib/entitlements";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Quarterly Report — Accelerator Workspace",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const COHORT_FEATURE = "accelerator.cohort" as Feature;

interface CohortMemberRow {
  id: string;
  startupName: string;
  stage: string | null;
  latestSvi: number | null;
  latestRaiseAud: number | null;
  lastActivityAt: string | null;
  isActive: boolean;
}

interface Summary {
  cohortId: string | null;
  activeCount: number;
  avgSvi: number | null;
  totalRaisedAud: number;
  trailing30dActivity: number;
  topTen: CohortMemberRow[];
}

async function loadSummary(ownerId: string): Promise<Summary> {
  const supabase = getSupabaseAdmin();
  const empty: Summary = {
    cohortId: null,
    activeCount: 0,
    avgSvi: null,
    totalRaisedAud: 0,
    trailing30dActivity: 0,
    topTen: [],
  };
  if (!supabase) return empty;

  let members: CohortMemberRow[] = [];
  let cohortId: string | null = null;
  try {
    const { data, error } = await supabase
      .from("cohort_members")
      .select(
        "id,cohort_id,startup_name,stage,latest_svi,latest_raise_aud,last_activity_at,is_active",
      )
      .eq("owner_id", ownerId);
    if (!error && data) {
      members = data.map((row) => ({
        id: String(row.id),
        startupName: String(row.startup_name ?? "Untitled"),
        stage: row.stage == null ? null : String(row.stage),
        latestSvi: row.latest_svi == null ? null : Number(row.latest_svi),
        latestRaiseAud:
          row.latest_raise_aud == null ? null : Number(row.latest_raise_aud),
        lastActivityAt:
          row.last_activity_at == null ? null : String(row.last_activity_at),
        isActive: row.is_active !== false,
      }));
      const first = data.find((r) => r.cohort_id != null);
      cohortId = first ? String(first.cohort_id) : null;
    }
  } catch {
    // fall through
  }

  const active = members.filter((m) => m.isActive);
  const sviSamples = active
    .map((m) => m.latestSvi)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgSvi =
    sviSamples.length === 0
      ? null
      : sviSamples.reduce((a, b) => a + b, 0) / sviSamples.length;
  const totalRaisedAud = active.reduce(
    (sum, m) => sum + (m.latestRaiseAud ?? 0),
    0,
  );

  // Trailing 30-day activity count from `analyses` table.
  let trailing30dActivity = 0;
  try {
    const startupIds = active.map((m) => m.id);
    if (startupIds.length > 0) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from("analyses")
        .select("id", { count: "exact", head: true })
        .in("startup_id", startupIds)
        .gte("created_at", since);
      if (!error && typeof count === "number") trailing30dActivity = count;
    }
  } catch {
    // ignore — analyses may not exist
  }

  const topTen = [...active]
    .sort((a, b) => (b.latestSvi ?? -1) - (a.latestSvi ?? -1))
    .slice(0, 10);

  return {
    cohortId,
    activeCount: active.length,
    avgSvi,
    totalRaisedAud,
    trailing30dActivity,
    topTen,
  };
}

const audFmt = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AcceleratorQuarterlyReportPage() {
  const user = await getCurrentUser();
  if (!user)
    redirect("/auth/login?next=/workspace/accelerator/quarterly-report");

  const isSandbox = await getCurrentProjectIsSandbox();

  const summary = await loadSummary(user.id);

  const exportHref = summary.cohortId
    ? `/api/reports/quarterly?cohort=${encodeURIComponent(summary.cohortId)}`
    : "/api/reports/quarterly";

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <FeatureGate feature={COHORT_FEATURE} label="Quarterly report">
        <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-ink-900">
                Quarterly LP Report
              </h1>
              <p className="text-sm text-ink-500 mt-1">
                Snapshot of your cohort's performance this quarter — ready to
                share with limited partners.
              </p>
            </div>
            <Link
              href={exportHref}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Export to PDF
            </Link>
          </header>

          <section
            aria-label="Key metrics"
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            <Tile label="Cohort size" value={String(summary.activeCount)} />
            <Tile
              label="Average SVI"
              value={summary.avgSvi == null ? "—" : summary.avgSvi.toFixed(1)}
            />
            <Tile
              label="Total capital raised"
              value={audFmt.format(summary.totalRaisedAud)}
            />
            <Tile
              label="30-day activity"
              value={String(summary.trailing30dActivity)}
              hint="Analyses run in the trailing 30 days"
            />
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-ink-900">
              Top 10 cohort founders by SVI
            </h2>
            {summary.topTen.length === 0 ? (
              <p className="mt-4 text-sm text-ink-500 italic">
                No cohort data yet — add founders in the{" "}
                <Link
                  href="/workspace/accelerator/cohort"
                  className="text-brand-600 hover:underline"
                >
                  Cohort
                </Link>{" "}
                view to populate this report.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                      <th className="py-2 pr-4">Startup</th>
                      <th className="py-2 pr-4">Score</th>
                      <th className="py-2 pr-4">Stage</th>
                      <th className="py-2 pr-4">Cap raised</th>
                      <th className="py-2 pr-4">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topTen.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-slate-100 dark:border-slate-800 last:border-0"
                      >
                        <td className="py-2 pr-4 text-ink-900">
                          {m.startupName}
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {m.latestSvi == null
                            ? "—"
                            : m.latestSvi.toFixed(0)}
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {m.stage ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-ink-700">
                          {m.latestRaiseAud == null
                            ? "—"
                            : audFmt.format(m.latestRaiseAud)}
                        </td>
                        <td className="py-2 pr-4 text-ink-500">
                          {fmtDate(m.lastActivityAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <NotFinancialAdvice kind="not_financial_advice" compact />
        </div>
      </FeatureGate>
    </WorkspaceLayout>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-900">{value}</p>
      {hint ? (
        <p className="mt-1 text-xs text-slate-500 italic">{hint}</p>
      ) : null}
    </div>
  );
}
