// Block 4 — Evaluator assessment (G13-W4-D2, S-D2). Server component that
// picks the surface by viewer role, already decided in the loader:
//
//   founder   → FounderPreview of the server-masked projection (§C.1) —
//               nothing else from block 4 is in the props.
//   assessor  → the AI-vs-me form; when no row exists yet the prefill is
//               gathered here (one mandate_fit_scores + one snapshot read,
//               only on the empty state so the loader's round stays flat).
//   0392 missing → the honest "not available yet" line.
//
// Supersedes the S-D1 placeholder `AssessmentBlock` in placeholder-blocks.tsx.

import type { DossierView } from "@/lib/evaluations/dossier";
import { prefillFromFit } from "@/lib/evaluations/assessment-prefill";
import { AssessmentForm } from "./assessment-form";
import { FounderPreview } from "./founder-preview";

export async function AssessmentBlock({ view }: { view: DossierView }) {
  const a = view.assessment;
  const founder = view.viewer.role === "founder";
  let body: React.ReactNode;
  if (founder) {
    body = <FounderPreview shared={a.sharedWithFounder} />;
  } else if (!a.available) {
    body = <p data-testid="assessment-unavailable">Assessment not available yet — the assessments table (migration 0392) has not been applied on this environment.</p>;
  } else {
    const prefill = a.mine ? null : await prefillFromFit({ userId: view.viewer.userId, projectId: view.header.projectId }).catch(() => null);
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
      />
    );
  }
  return (
    <section aria-labelledby="dossier-block-4" className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid="dossier-block-4">
      <h2 id="dossier-block-4" className="text-lg font-semibold text-ink-900">
        4 · Evaluator assessment
      </h2>
      <div className="mt-3 text-sm text-ink-600">{body}</div>
    </section>
  );
}
