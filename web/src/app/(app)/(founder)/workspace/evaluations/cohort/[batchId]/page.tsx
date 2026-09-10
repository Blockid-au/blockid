// /workspace/evaluations/cohort/[batchId] — one batch's cohort table (T0272,
// G12 sprint S5). Server component inside WorkspaceLayout; owner-only (a
// batch that is not the caller's → notFound). Header: name, status +
// progress, rubric weights, CSV + sponsor/LP report buttons; body: the
// sortable CohortTable (client). The evaluator disclaimer closes the page —
// this is an evaluator report surface (T0275).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getEntitlements } from "@/lib/entitlements";
import { getBatchForUser, loadCohortRows } from "@/lib/evaluations/batch";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  batchProgressPct,
  canExportLpReport,
  isEqualWeights,
} from "@/lib/evaluations/batch-shared";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { CohortTable } from "../cohort-table";

export const metadata: Metadata = {
  title: "Cohort | BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ batchId: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  queued: "Queued — scores off-peak tonight",
  running: "Scoring…",
  done: "Scored",
  failed: "Failed",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default async function CohortPage({ params }: PageProps) {
  const { batchId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`);

  const batch = await getBatchForUser(user.id, batchId);
  if (!batch) notFound();

  const [isSandbox, rows, flags] = await Promise.all([
    getCurrentProjectIsSandbox(),
    loadCohortRows(batch),
    getEntitlements(user.plan ?? "", user.id).catch(() => [] as string[]),
  ]);
  const lpReport = canExportLpReport(flags);
  const pct = batchProgressPct(batch);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/evaluations" className="hover:text-brand-600">Startups I&apos;m evaluating</Link>
          {" / "}
          <span className="text-ink-700">Cohort</span>
        </nav>

        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink-900">{batch.name}</h1>
            <p className="mt-1 text-sm text-ink-500" data-testid="batch-status">
              {STATUS_LABEL[batch.status] ?? batch.status} · {batch.doneCount} of {batch.total} scored
              {batch.failedCount > 0 ? ` · ${batch.failedCount} failed` : ""} · queued {fmtDate(batch.createdAt)}
              {batch.finishedAt ? ` · finished ${fmtDate(batch.finishedAt)}` : ""}
            </p>
            <div className="mt-2 h-1.5 w-64 overflow-hidden rounded-full bg-surface-100" aria-hidden="true">
              <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/evaluations/batch/${encodeURIComponent(batch.id)}/export.csv`}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
            >
              Download CSV
            </a>
            {lpReport ? (
              <a
                href={`/api/reports/quarterly?batch=${encodeURIComponent(batch.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Sponsor / LP report
              </a>
            ) : (
              <Link href="/pricing?segment=evaluator" className="inline-flex min-h-11 items-center rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-600 hover:bg-surface-50">
                Sponsor / LP report — Program
              </Link>
            )}
          </div>
        </header>

        <section data-testid="rubric-weights" className="rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-ink-600">
          <span className="font-medium text-ink-800">Rubric weights:</span>{" "}
          {isEqualWeights(batch.rubricWeights) ? (
            <span>equal across the 8 dimensions (default).</span>
          ) : (
            <span>{DIMENSION_KEYS.map((k) => `${DIMENSION_LABELS[k]} ${batch.rubricWeights[k]}%`).join(" · ")}</span>
          )}
          <span className="ml-1 text-xs text-ink-500">The weighted score re-aggregates each startup&apos;s 8 dimension scores; the SVI itself is unweighted so cohorts stay comparable.</span>
        </section>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center text-sm text-ink-500">
            No startups in this batch.
          </div>
        ) : (
          <CohortTable rows={rows} />
        )}

        <EvaluatorReportDisclaimer variant="compact" />
      </div>
    </WorkspaceLayout>
  );
}
