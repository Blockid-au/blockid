// /workspace/evidence/outcomes — the founder's outcome ledger (G21 P3-A;
// migration 0427; score-governance § 13 "Outcome calibration").
//
// Three things on one page, available on Free, h1 outside any gate:
//   1. the trajectory (Day 0 / 60 / 180 — SVI, Evidence Confidence,
//      evidence level, confirmed outcomes) for the current project;
//   2. the record form (kind → per-kind value fields, date, source link,
//      note) → POST /api/projects/[id]/outcomes (owner only — the record is
//      the founder's; members see the list);
//   3. proposals awaiting confirmation (own records, evaluators, connectors,
//      public registers) with confirm / reject for founder- and
//      evaluator-sourced rows (PATCH /api/outcomes/[id]) — register and
//      connector proposals say "BlockID confirms" — and the settled ledger.
//
// Nothing here changes a score: an outcome is an observation. Confirmed
// outcomes are what the calibration script aggregates, with n.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { TrajectoryTimeline } from "@/components/svi/TrajectoryTimeline";
import { loadTrajectory } from "@/lib/svi/trajectory-load";
import { listProjectOutcomes, projectOutcomesByTier } from "@/lib/outcomes/service";
import { OutcomesClient, type OutcomeItem } from "./outcomes-client";

export const metadata: Metadata = {
  title: "Outcomes",
  description: "Record what happened after your assessment — a round, a grant, a program selection, revenue growth, a release — and see the record's trajectory from Day 0.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evidence/outcomes");

  const isSandbox = await getCurrentProjectIsSandbox();
  const scope = await getProjectScope("viewer");
  const { projectId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  const isOwner = Boolean(projectId) && !isMember;

  let outcomes: OutcomeItem[] = [];
  let ledgerUnavailable = false;
  const sb = getSupabaseAdmin();
  const trajectory = projectId ? await loadTrajectory(sb, projectId, { verificationLevel: scope?.project?.verificationLevel != null ? `L${scope.project.verificationLevel}` : null }) : null;
  if (sb && projectId) {
    try {
      outcomes = projectOutcomesByTier(await listProjectOutcomes(sb, projectId), null);
    } catch {
      ledgerUnavailable = true;
    }
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <PageTracker page="evidence-outcomes" />
      <div className="mx-auto max-w-4xl space-y-8 p-6" data-workspace-outcomes>
        <header>
          <h1 className="text-xl font-bold text-primary">Outcomes</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            What happened after the assessment — a round closed, a grant won, a program said yes, revenue grew, a release shipped, the team grew. Each outcome is dated and sourced, confirmed by a person, and plotted on the trajectory. In aggregate, confirmed outcomes are published on the{" "}
            <Link href="/methodology/calibration" className="text-action underline decoration-dotted underline-offset-4">
              calibration page
            </Link>{" "}
            with n — never as a forecast for one company.
          </p>
        </header>

        {isMember && !canEdit && <ViewOnlyNote role={role} action="record an outcome" />}

        {!projectId ? (
          <p className="text-sm text-secondary" data-testid="outcomes-no-project">
            Create or select a project first.
          </p>
        ) : (
          <>
            {trajectory ? <TrajectoryTimeline data={trajectory} headingLevel={2} outcomesHref={null} /> : null}
            {ledgerUnavailable ? (
              <p className="rounded-xl border border-dashed border-line-subtle bg-surface-sunken p-4 text-sm text-secondary" data-testid="outcomes-unavailable">
                The outcome ledger is briefly unavailable — the trajectory above still reflects every snapshot. Try again in a minute.
              </p>
            ) : (
              <OutcomesClient projectId={projectId} initial={outcomes} canRecord={isOwner} canResolve={isOwner} recordAs="founder" headingLevel={2} />
            )}
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
