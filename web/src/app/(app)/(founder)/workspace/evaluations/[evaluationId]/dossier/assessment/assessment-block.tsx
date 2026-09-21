// Block 4 — Evaluator assessment (G13-W4-D2, S-D2). Server component that
// picks the surface by viewer role, already decided in the loader:
//
//   founder   → FounderPreview of the server-masked projection (§C.1) —
//               nothing else from block 4 is in the props.
//   assessor  → the AI-vs-me form; when no row exists yet the prefill is
//               gathered here (one mandate_fit_scores + one snapshot read,
//               only on the empty state so the loader's round stays flat).
//   0392 missing → the honest "not available yet" line.
//   S-D3: the seats & consensus table (../seats-consensus.tsx) renders under
//   the form for the assessor — every same-org seat's current view.
//
// Supersedes the S-D1 placeholder `AssessmentBlock` in placeholder-blocks.tsx.

import Link from "next/link";
import type { DossierView } from "@/lib/evaluations/dossier";
import { prefillFromFit } from "@/lib/evaluations/assessment-prefill";
import { readFeedbackOptOut } from "@/lib/evaluations/feedback-letter-store";
import { AssessmentForm } from "./assessment-form";
import { FounderPreview } from "./founder-preview";
import { SeatsConsensus } from "../seats-consensus";

export async function AssessmentBlock({ view }: { view: DossierView }) {
  const a = view.assessment;
  const founder = view.viewer.role === "founder";
  let body: React.ReactNode;
  if (founder) {
    body = <FounderPreview shared={a.sharedWithFounder} />;
  } else if (view.viewer.readOnly) {
    // G22-A: a BlockID Cohort seat reads the dossier; assessments stay with
    // the evaluator seat. Reviewer overrides and decisions live on the cohort.
    body = (
      <p data-testid="assessment-read-only">
        You opened this dossier as a cohort reviewer. The evaluator&apos;s assessment stays with their seat; record your overrides and decision on the{" "}
        <Link href={view.viewer.viaBatchId ? `/workspace/evaluations/cohort/${encodeURIComponent(view.viewer.viaBatchId)}` : "/workspace/evaluations/cohort"} className="font-medium text-action hover:underline">
          cohort table
        </Link>
        .
      </p>
    );
  } else if (!a.available) {
    body = <p data-testid="assessment-unavailable">Assessment pending — the assessments table (migration 0392) has not been applied on this environment.</p>;
  } else {
    const [prefill, feedbackOptOut] = await Promise.all([
      a.mine ? Promise.resolve(null) : prefillFromFit({ userId: view.viewer.userId, projectId: view.header.projectId }).catch(() => null),
      // G14-S34: null while 0406 is missing or no row exists yet → the
      // checkbox stays hidden; false/true once the seat has a row.
      a.mine ? readFeedbackOptOut(view.header.evaluationId, view.viewer.userId).catch(() => null) : Promise.resolve(null),
    ]);
    body = (
      <AssessmentForm
        evaluationId={view.header.evaluationId}
        initial={a.mine}
        history={a.history}
        prefill={prefill}
        snapshotId={view.header.snapshotId}
        aiDims={view.report.dims}
        criteria={view.report.criteria}
        founderClaimed={view.header.founderClaimed}
        feedbackOptOut={feedbackOptOut}
      />
    );
  }
  return (
    <section aria-labelledby="dossier-block-4" className="rounded-2xl border border-surface-200 bg-surface p-5 sm:p-6" data-testid="dossier-block-4">
      <h2 id="dossier-block-4" className="text-lg font-semibold text-ink-900">
        4 · Evaluator assessment
      </h2>
      <div className="mt-3 text-sm text-ink-600">{body}</div>
      {!founder && !view.viewer.readOnly && a.available && view.consensus ? <SeatsConsensus consensus={view.consensus} evaluationId={view.header.evaluationId} /> : null}
    </section>
  );
}
