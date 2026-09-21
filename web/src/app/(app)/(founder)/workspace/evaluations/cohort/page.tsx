// /workspace/evaluations/cohort — the BlockID Cohort index (G21 P2-A).
//
// The one cohort model: every `evaluation_batches` row the evaluator holds,
// newest first, plus "New cohort" (an empty cohort the CSV import / intake
// link fills). The legacy /workspace/accelerator/cohort (accelerator_cohorts
// / cohort_members, 0021) and /workspace/cohort redirect here
// (lib/nav/legacy-redirects.ts). Server component inside WorkspaceLayout;
// the h1 sits outside any gate — a Scout / Firm user sees the list they may
// already hold and the Program upgrade link instead of the create form.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getEntitlements } from "@/lib/entitlements";
import { listBatches } from "@/lib/evaluations/batch";
import { canBatchScore } from "@/lib/evaluations/batch-shared";
import { listTemplates } from "@/lib/intake/templates";
import { CohortIndex } from "@/components/evaluations/CohortIndex";
import { EvaluatorReportDisclaimer } from "@/components/legal/evaluator-report-disclaimer";
import { loadDemoCohortLabels } from "@/lib/evaluations/demo-cohort-labels";

export const metadata: Metadata = {
  title: "Cohorts | BlockID",
  description: "Every program round you score on one rubric: import, assess, compare, decide, track.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CohortIndexPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evaluations/cohort");

  const [isSandbox, batches, flags, templates, demoLabels, sp] = await Promise.all([
    getCurrentProjectIsSandbox(),
    listBatches(user.id),
    getEntitlements(user.plan ?? "", user.id).catch(() => [] as string[]),
    listTemplates(user.id),
    loadDemoCohortLabels(),
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const demoRemoved = (Array.isArray(sp.demo) ? sp.demo[0] : sp.demo) === "removed";

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="cohort-index-page">
        <header>
          <nav className="text-sm text-ink-500" aria-label="Breadcrumb">
            <Link href="/workspace/evaluations" className="hover:text-ink-700">
              Startups I&apos;m evaluating
            </Link>
            <span className="mx-2">/</span>
            <span className="text-ink-700">Cohorts</span>
          </nav>
          <h1 className="mt-1 text-2xl font-semibold text-ink-900">BlockID Cohort</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            Screen faster, trust the evidence, track improvement — one program round per cohort, every startup on the same 8-dimension rubric. Humans make the decision.
          </p>
        </header>

        <CohortIndex batches={batches} templates={templates.map((t) => ({ id: t.id, name: t.name }))} canCreate={canBatchScore(flags)} demoLabels={demoLabels} demoRemoved={demoRemoved} />

        <EvaluatorReportDisclaimer variant="compact" />
      </div>
    </WorkspaceLayout>
  );
}
