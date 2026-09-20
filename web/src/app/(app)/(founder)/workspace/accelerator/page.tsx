// /workspace/accelerator — evaluator hub root, rebuilt as the persona landing
// (G13-W4-IA4, spec §C.1). Four blocks via <InvestorLanding>; the shared
// loadEvaluatorHub() does auth → persona → onboarding gate → loaders, and
// this page mounts the workspace shell around it.
//
// G21 P0-C: a paid Cohort Validation Pilot (`pilot_orders`, migration 0415)
// shows a one-line banner above the desk — "Cohort Validation Pilot active —
// up to N applicants · until <date>" with the intake + cohort links; the
// Stripe success return (`?pilot=paid`) shows it in its "payment received"
// form until the webhook lands.

import type { Metadata } from "next";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { loadEvaluatorHub, type EvaluatorHubSearchParams } from "@/components/investor/evaluator-hub-page";
import { PilotActiveBanner } from "@/components/investor/pilot-active-banner";

export const metadata: Metadata = {
  title: "Accelerator desk · BlockID",
  description: "Your cohort, applications to review, report quota, LP report and program criteria.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = EvaluatorHubSearchParams & { pilot?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const hub = await loadEvaluatorHub({ route: "accelerator", searchParams });
  const sp = await searchParams;
  const justPaid = (Array.isArray(sp.pilot) ? sp.pilot[0] : sp.pilot) === "paid";
  return (
    <WorkspaceLayout user={hub.user} isSandbox={hub.isSandbox}>
      <PilotActiveBanner userId={hub.user.id} justPaid={justPaid} />
      {hub.content}
    </WorkspaceLayout>
  );
}
