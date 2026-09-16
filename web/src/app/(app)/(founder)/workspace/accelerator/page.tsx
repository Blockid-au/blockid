// /workspace/accelerator — evaluator hub root, rebuilt as the persona landing
// (G13-W4-IA4, spec §C.1). Four blocks via <InvestorLanding>; the page is
// a thin wrapper around the shared EvaluatorHubPage (auth → persona →
// onboarding gate → loaders → shell).

import type { Metadata } from "next";
import { EvaluatorHubPage, type EvaluatorHubSearchParams } from "@/components/investor/evaluator-hub-page";

export const metadata: Metadata = {
  title: "Accelerator desk · BlockID",
  description: "Your cohort, applications to review, report quota, LP report and program criteria.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<EvaluatorHubSearchParams> }) {
  return <EvaluatorHubPage route="accelerator" searchParams={searchParams} />;
}
