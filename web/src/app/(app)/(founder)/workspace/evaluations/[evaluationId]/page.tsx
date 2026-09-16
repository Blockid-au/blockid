// /workspace/evaluations/[evaluationId] — the Investor Dossier (G13-W2-D1,
// BA spec §A). Keyed on `evaluations.id` (goal doc D1) so consent tier and
// evaluator ownership are one lookup; never public (the public artefact
// stays /tbr/[token]).
//
// Server component inside WorkspaceLayout. Everything is read from
// persisted rows by lib/evaluations/dossier.ts — access lookup, then ONE
// parallel round (snapshot ×2, taxonomy, assessment, evidence, connectors,
// last report), then a cached percentile — no model call, no recharts:
// the radar is the report cover's VisualSpecV2 rendered to one inline SVG.
//
// Gate (§A.1): the row's evaluator must still be an evaluator persona or
// hold `investor.dealflow` (isEvaluatorUser); the founder who CLAIMED the
// row gets the read-only "what my evaluator sees" preview WITHOUT any
// assessment field (§C.1 — masked in the loader, not by CSS). Anyone else,
// and any unknown id, gets notFound() — never a 403.
//
// S-D1 shipped the header + block 1 (radar · weighted table with the weight
// column, F3 · 13-criteria strip); S-D2 ships block 4 (AI-vs-me form, share
// allow-list, history, founder preview — ./dossier/assessment/*) and block 6
// (actions & audit trail); S-R4 (G13-W4-R4) fills block 2 (Valuation from
// ReportV2), block 5 (Progress radar scoped to this evaluation) and the
// header's mandate fit + "Δ since last view"; block 3 stays a labelled
// placeholder until S-D3.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { isEvaluatorUser } from "@/lib/evaluations";
import { loadDossier } from "@/lib/evaluations/dossier";
import { auditDossierView } from "@/lib/evaluations/dossier-audit";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { DossierHeader } from "./dossier/dossier-header";
import { ReportSummary } from "./dossier/report-summary";
import { EvidenceBlock } from "./dossier/placeholder-blocks";
import { ValuationBlock } from "./dossier/valuation-block";
import { ProgressBlock } from "./dossier/progress-block";
import { AssessmentBlock } from "./dossier/assessment/assessment-block";
import { ActionsBlock } from "./dossier/assessment/actions-block";
import { DossierViewTracker } from "./dossier/dossier-view-tracker";

export const metadata: Metadata = {
  title: "Investor Dossier | BlockID",
  description: "One evaluator page per startup: Trusted Business Report summary, valuation, evidence and your assessment.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ evaluationId: string }>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default async function InvestorDossierPage({ params }: PageProps) {
  const { evaluationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/evaluations/${encodeURIComponent(evaluationId)}`);
  if (!ID_RE.test(evaluationId)) notFound();

  const [dossier, isSandbox, isEvaluator] = await Promise.all([
    loadDossier(evaluationId, user.id),
    getCurrentProjectIsSandbox(),
    isEvaluatorUser(user),
  ]);
  if (!dossier) notFound();
  // The evaluator seat must still be an evaluator; the claimed founder needs
  // no evaluator entitlement for the read-only preview.
  if (dossier.viewer.role === "assessor" && !isEvaluator) notFound();

  auditDossierView({
    userId: user.id,
    evaluationId: dossier.header.evaluationId,
    projectId: dossier.header.projectId,
    role: dossier.viewer.role,
    consentTier: dossier.header.consentTier,
    surface: "page",
    sviTotal: dossier.header.svi,
    snapshotId: dossier.header.snapshotId,
  });

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <DossierViewTracker evaluationId={dossier.header.evaluationId} consentTier={dossier.header.consentTier} plan={user.plan ?? "free"} role={dossier.viewer.role} />
      <div className="mx-auto max-w-6xl space-y-6 p-6" data-testid="investor-dossier" data-viewer-role={dossier.viewer.role}>
        <DossierHeader header={dossier.header} role={dossier.viewer.role} />
        <ReportSummary report={dossier.report} />
        <ValuationBlock block={dossier.valuation} fullReportHref={dossier.report.links.fullReport} />
        <EvidenceBlock view={dossier} />
        <AssessmentBlock view={dossier} />
        <ProgressBlock block={dossier.progress} role={dossier.viewer.role} />
        <ActionsBlock view={dossier} />
        <EvaluatorReportDisclaimer variant="compact" />
      </div>
    </WorkspaceLayout>
  );
}
