// /workspace/evaluations/cohort/[batchId] — the BlockID Cohort view (G21
// P2-B; FI § 53/54). Server component inside WorkspaceLayout.
//
// Access: any seat on the batch (owner = creator, reviewer, viewer —
// lib/evaluations/batch-members assertBatchRole). A non-member → notFound
// (the id space stays non-enumerable). The h1 renders first and outside any
// gate (G20 rule).
//
// Header: n · median SVI · median confidence · last snapshot line (read
// from P2-A's `cohort_snapshots` when the table exists, else "no snapshot
// yet"), an "Organisation" chip when the cohort carries an `org_id` (G22-B,
// 0433 — name read from investor_organisations, fail-soft),
// rubric line with the weight set version, members row + "Invite
// reviewer" (owner), CSV export, sponsor / LP report, link to the program
// journey (/workspace/accelerator — P2-C). Body: CohortTable (client,
// URL-synced filters). "Humans make the decision" closes the table; the
// evaluator disclaimer closes the page.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getEntitlements } from "@/lib/entitlements";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertBatchRole, listBatchMembers } from "@/lib/evaluations/batch-members";
import { loadBlockIdCohortRows } from "@/lib/evaluations/cohort-rows-loader";
import { cohortHeaderStats, parseCohortFilters } from "@/lib/evaluations/cohort-rows";
import { DIMENSION_KEYS, DIMENSION_LABELS, batchProgressPct, canExportLpReport, isEqualWeights } from "@/lib/evaluations/batch-shared";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { CohortMembers } from "@/components/evaluations/CohortMembers";
import { CohortImport } from "@/components/evaluations/CohortImport";
import { CohortSnapshotActions } from "@/components/evaluations/CohortSnapshotActions";
import { latestSnapshots } from "@/lib/evaluations/cohort-snapshots";
import { CohortTable } from "@/components/evaluations/CohortTable";
import { ProgramWeightsDialog } from "@/components/evaluations/ProgramWeightsDialog";
import { cohortDeltaWeightsChanged } from "@/lib/evaluations/cohort-delta";
import { loadDemoCohortLabels } from "@/lib/evaluations/demo-cohort-labels";
import { DemoCohortChip } from "@/components/evaluations/DemoCohortChip";
import { RemoveDemoCohortButton } from "@/components/evaluations/DemoCohortActions";

export const metadata: Metadata = {
  title: "BlockID Cohort | BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ batchId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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

/** P2-A columns / tables read fail-soft: `weights_version` on the batch, the newest `cohort_snapshots` row, the organisation name (G22-B). */
async function loadCohortMeta(batchId: string, orgId: string | null): Promise<{ weightsVersion: number; lastSnapshotAt: string | null; snapshotsAvailable: boolean; orgName: string | null }> {
  const out = { weightsVersion: 1, lastSnapshotAt: null as string | null, snapshotsAvailable: false, orgName: null as string | null };
  const supabase = getSupabaseAdmin();
  if (!supabase) return out;
  if (orgId) {
    try {
      const { data } = await supabase.from("investor_organisations").select("name").eq("id", orgId).maybeSingle();
      const name = (data as { name?: unknown } | null)?.name;
      if (typeof name === "string" && name.trim()) out.orgName = name.trim();
    } catch {
      /* pre-0393 or the org was deleted (SET NULL lands on the next read) */
    }
  }
  try {
    const { data } = await supabase.from("evaluation_batches").select("weights_version").eq("id", batchId).maybeSingle();
    const v = Number((data as { weights_version?: unknown } | null)?.weights_version);
    if (Number.isInteger(v) && v >= 1) out.weightsVersion = v;
  } catch {
    /* pre-0422 */
  }
  try {
    const { data, error } = await supabase.from("cohort_snapshots").select("taken_at").eq("batch_id", batchId).order("taken_at", { ascending: false }).limit(1);
    if (!error) {
      out.snapshotsAvailable = true;
      const row = ((data ?? []) as Array<{ taken_at?: unknown }>)[0];
      if (row?.taken_at) out.lastSnapshotAt = String(row.taken_at);
    }
  } catch {
    /* pre-0422 */
  }
  return out;
}

export default async function CohortPage({ params, searchParams }: PageProps) {
  const { batchId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/evaluations/cohort/${encodeURIComponent(batchId)}`);

  const access = await assertBatchRole(batchId, user.id, "viewer");
  if (!access.ok) notFound();
  const { batch, role } = access;

  const [isSandbox, loaded, flags, members, meta, snapshots, sp, demoLabels] = await Promise.all([
    getCurrentProjectIsSandbox(),
    loadBlockIdCohortRows(batch, user.id),
    getEntitlements(user.plan ?? "", user.id).catch(() => [] as string[]),
    listBatchMembers(batch).catch(() => ({ members: [], available: false })),
    loadCohortMeta(batch.id, batch.orgId ?? null),
    latestSnapshots(batch.id).catch(() => ({ latest: null, previous: null, count: 0 })),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
    loadDemoCohortLabels(),
  ]);
  const isDemo = batch.isDemo === true;
  const rows = loaded.rows;
  const stats = cohortHeaderStats(rows);
  const lpReport = canExportLpReport(flags);
  const pct = batchProgressPct(batch);
  const initialFilters = parseCohortFilters(sp);
  // G22-A A.3: the header version is the batch row's (bumped by the weights
  // editor); meta's read is the fallback for the pre-0422 shape.
  const weightsVersion = Math.max(batch.weightsVersion ?? 1, meta.weightsVersion);
  const deltaWeightsChanged = cohortDeltaWeightsChanged(snapshots.latest, snapshots.previous);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <nav className="text-sm text-secondary" aria-label="Breadcrumb">
          <Link href="/workspace/evaluations" className="hover:text-action">
            Startups I&apos;m evaluating
          </Link>
          {" / "}
          <span className="text-primary">BlockID Cohort</span>
        </nav>

        {/* G24-C: the fictional demo cohort — labelled before anything else, removable by its owner. */}
        {isDemo ? (
          <section className="rounded-2xl border border-warn/40 bg-warn/5 px-4 py-4 sm:px-5" data-testid="demo-cohort-banner" aria-labelledby="demo-cohort-banner-h">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <h2 id="demo-cohort-banner-h" className="flex flex-wrap items-center gap-2 text-base font-semibold text-primary">
                  <DemoCohortChip label={demoLabels.chip} title={demoLabels.chipTitle} size="md" />
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-secondary">{demoLabels.bannerBody}</p>
              </div>
              {role === "owner" ? <RemoveDemoCohortButton labels={demoLabels} /> : null}
            </div>
          </section>
        ) : null}

        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold text-primary" data-testid="cohort-h1">
              <span>BlockID Cohort — {batch.name}</span>
              {isDemo ? <DemoCohortChip label={demoLabels.chip} title={demoLabels.chipTitle} size="md" /> : null}
            </h1>
            {/* G22-B: the organisation this cohort was created for (org_id, 0433). */}
            {batch.orgId ? (
              <span className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-line-subtle bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-secondary" data-testid="cohort-org-chip" title={`Organisation ${meta.orgName ?? batch.orgId}`}>
                <span className="text-muted">Organisation</span>
                <span className="truncate text-primary">{meta.orgName ?? "—"}</span>
              </span>
            ) : null}
            <p className="mt-1 text-sm text-secondary" data-testid="batch-status">
              {STATUS_LABEL[batch.status] ?? batch.status} · {batch.doneCount} of {batch.total} scored
              {batch.failedCount > 0 ? ` · ${batch.failedCount} failed` : ""} · queued {fmtDate(batch.createdAt)}
              {batch.finishedAt ? ` · finished ${fmtDate(batch.finishedAt)}` : ""}
              {" · you are "}
              <span className="font-medium text-primary" data-testid="cohort-role">
                {role}
              </span>
            </p>
            <div className="mt-2 h-1.5 w-64 max-w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
              <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm" data-testid="cohort-stats">
              <div>
                <dt className="inline text-secondary">n </dt>
                <dd className="inline font-semibold tabular-nums text-primary">{stats.n}</dd>
                <span className="text-muted"> ({stats.scored} scored)</span>
              </div>
              <div>
                <dt className="inline text-secondary">Median SVI </dt>
                <dd className="inline font-semibold tabular-nums text-primary">{stats.medianSvi == null ? "—" : stats.medianSvi}</dd>
              </div>
              <div>
                <dt className="inline text-secondary">Median confidence </dt>
                <dd className="inline font-semibold tabular-nums text-primary">{stats.medianConfidence == null ? "—" : stats.medianConfidence}</dd>
              </div>
              <div>
                <dt className="inline text-secondary">Shortlisted </dt>
                <dd className="inline font-semibold tabular-nums text-primary">{stats.shortlisted}</dd>
              </div>
              <div>
                <dt className="inline text-secondary">Last snapshot </dt>
                <dd className="inline text-primary" data-testid="cohort-last-snapshot">
                  {meta.lastSnapshotAt ? fmtDate(meta.lastSnapshotAt) : "no snapshot yet"}
                </dd>
              </div>
            </dl>
            {/* P2-A: Snapshot / Re-score cohort (owner + reviewer). */}
            {role !== "viewer" ? (
              <div className="mt-2">
                <CohortSnapshotActions batchId={batch.id} lastTakenAt={snapshots.latest?.takenAt ?? meta.lastSnapshotAt} lastN={snapshots.latest?.summary.n ?? null} count={snapshots.count} />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/api/evaluations/batch/${encodeURIComponent(batch.id)}/export.csv`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-surface px-4 py-2.5 text-sm font-semibold text-action transition-colors hover:bg-surface-hover" data-testid="cohort-export-csv">
              Download CSV
            </a>
            {lpReport ? (
              <a href={`/api/reports/quarterly?batch=${encodeURIComponent(batch.id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-navy-elev-1">
                Sponsor / LP report
              </a>
            ) : (
              <Link href="/pricing?segment=evaluator" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-secondary hover:bg-surface-hover">
                Sponsor / LP report — Program
              </Link>
            )}
            <Link href="/workspace/accelerator" className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium text-secondary hover:bg-surface-hover" data-testid="cohort-program-journey">
              Program journey
            </Link>
          </div>
        </header>

        <section data-testid="rubric-weights" className="rounded-xl border border-line-subtle bg-surface px-4 py-3 text-sm text-secondary">
          <span className="font-medium text-primary" data-testid="cohort-weights-version">
            Program weights v{weightsVersion}:
          </span>{" "}
          {isEqualWeights(batch.rubricWeights) ? <span>equal across the 8 dimensions (default).</span> : <span>{DIMENSION_KEYS.map((k) => `${DIMENSION_LABELS[k]} ${batch.rubricWeights[k]}%`).join(" · ")}</span>}
          <span className="ml-1 text-xs text-muted">The Program score ranks this cohort by your rubric over each startup&apos;s 8 dimension scores; the canonical SVI is unchanged and always shown beside it.</span>
          {/* G22-A A.3: the weights editor (owner only; the route enforces it again). */}
          {role === "owner" ? (
            <div className="mt-2">
              <ProgramWeightsDialog batchId={batch.id} weights={batch.rubricWeights} weightsVersion={weightsVersion} />
            </div>
          ) : null}
        </section>

        {/* P2-A: CSV import (owner + reviewer; respects the pilot applicants cap). Never into the demo cohort — real applicants get a real cohort. */}
        {role !== "viewer" && !isDemo ? (
          <section data-testid="cohort-import-section" className="rounded-xl border border-line-subtle bg-surface px-4 py-3">
            <CohortImport batchId={batch.id} applicantsCap={batch.applicantsCap ?? null} used={batch.total} />
          </section>
        ) : null}

        <CohortMembers batchId={batch.id} members={members.members.map((m) => ({ userId: m.userId, role: m.role, email: m.email, displayName: m.displayName, isCreator: m.isCreator }))} canManage={role === "owner"} available={members.available} />

        {/* No Suspense: nothing here suspends, and the fallback table rendered a
            second column-chooser toggle beside the real one (live-qa 37). */}
        <CohortTable rows={rows} batchId={batch.id} role={role} weightsVersion={weightsVersion} deltaWeightsChanged={deltaWeightsChanged} initialFilters={initialFilters} isDemo={isDemo} demoChip={{ label: demoLabels.chip, title: demoLabels.chipTitle }} />

        <p className="text-sm text-secondary" data-testid="humans-decide">
          <span className="font-medium text-primary">Humans make the decision.</span> BlockID structures the evidence and standardises the first-pass analysis; every shortlist, override and decision above is recorded with who made it and why.
        </p>

        <EvaluatorReportDisclaimer variant="compact" />
      </div>
    </WorkspaceLayout>
  );
}
