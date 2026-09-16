// /workspace/advisor — evaluator hub root, rebuilt as the persona landing
// (G13-W4-IA4, spec §C.1). Four blocks via <InvestorLanding>; the shared
// loadEvaluatorHub() does auth → persona → onboarding gate → loaders, and
// this page mounts the workspace shell around it.

import type { Metadata } from "next";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { loadEvaluatorHub, type EvaluatorHubSearchParams } from "@/components/investor/evaluator-hub-page";

export const metadata: Metadata = {
  title: "Advisor desk · BlockID",
  description: "Your clients, this week's movers, report quota and coverage.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<EvaluatorHubSearchParams> }) {
  const hub = await loadEvaluatorHub({ route: "advisor", searchParams });
  return (
    <WorkspaceLayout user={hub.user} isSandbox={hub.isSandbox}>
      {hub.content}
    </WorkspaceLayout>
  );
}
