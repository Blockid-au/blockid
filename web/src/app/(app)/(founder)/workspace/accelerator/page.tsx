// /workspace/accelerator — the BlockID Cohort journey (G21 P2-C, 2026-09-20)
// on top of the evaluator hub root (G13-W4-IA4).
//
// `loadEvaluatorHub()` still does auth → persona → onboarding gate → the
// landing loaders; this page mounts the workspace shell, the paid-pilot
// banner (G21 P0-C), then — for an evaluator persona — the six-stage
// journey (Intake → Assessment → Selection → Program → Demo day → Sponsor
// reporting, `?stage=`, `?batch=` picks the cohort) with a completeness
// chip per stage derived from the data, and the persona landing below it.
// The h1 sits outside every gate (G20-F2). A founder-track user keeps the
// hub's FeatureGate card and never triggers the cohort reads.

import type { Metadata } from "next";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { loadEvaluatorHub, type EvaluatorHubSearchParams } from "@/components/investor/evaluator-hub-page";
import { PilotActiveBanner } from "@/components/investor/pilot-active-banner";
import { ProgramJourney } from "@/components/accelerator/program-journey";
import { parseProgramStage } from "@/lib/evaluations/program-journey";
import { loadIntakeSummary, loadProgramJourney } from "@/lib/evaluations/program-journey-data";
import { loadDemoCohortLabels } from "@/lib/evaluations/demo-cohort-labels";

export const metadata: Metadata = {
  title: "BlockID Cohort · Accelerator desk",
  description: "Your program journey: intake, assessment, selection, program, demo day and sponsor reporting on one evidence-backed record.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = EvaluatorHubSearchParams & { pilot?: string | string[]; session_id?: string | string[]; stage?: string | string[]; batch?: string | string[] };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const hub = await loadEvaluatorHub({ route: "accelerator", searchParams, landingHeading: "h2" });
  const sp = await searchParams;
  const sessionId = one(sp.session_id);
  // Only a Stripe return (with its session id) may show the pending state.
  const justPaid = one(sp.pilot) === "paid" && typeof sessionId === "string" && /^cs_/.test(sessionId);
  const stage = parseProgramStage(sp.stage);
  const batchParam = one(sp.batch) ?? null;

  const [journey, demoLabels] = await Promise.all([
    hub.evaluator
      ? (async () => {
          const intake = await loadIntakeSummary(hub.user.id);
          return loadProgramJourney(hub.user, { batchId: batchParam, intake });
        })()
      : Promise.resolve(null),
    loadDemoCohortLabels(),
  ]);

  return (
    <WorkspaceLayout user={hub.user} isSandbox={hub.isSandbox}>
      <PilotActiveBanner userId={hub.user.id} justPaid={justPaid} />
      <div className="mx-auto max-w-6xl px-6 pt-6">
        <header className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-action">BlockID Cohort</p>
          <h1 className="mt-1 text-2xl font-bold text-primary">Program journey</h1>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            Screen faster · Trust the evidence · Track improvement. BlockID structures the evidence and standardises the first-pass analysis; your committee makes the decision.
          </p>
        </header>
        {journey ? <ProgramJourney view={journey.view} stage={stage} canAct={journey.bundle ? journey.bundle.role !== "viewer" : true} isOwner={journey.bundle?.role === "owner"} demoLabels={demoLabels} /> : null}
      </div>
      {hub.content}
    </WorkspaceLayout>
  );
}
