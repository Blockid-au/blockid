// /workspace/investor/startup/[projectId] — alias for the Investor Dossier
// (BA spec §A.1 "Aliases"): deal-flow and watchlist rows know a project, not
// an evaluation. 302 → /workspace/evaluations/[evaluationId] when the caller
// holds an evaluation on that project (as evaluator, or as the founder who
// claimed it); otherwise the "Add to my evaluations" interstitial.
//
// The interstitial deliberately shows NOTHING about the project (not even
// its name): an arbitrary project id must not confirm a startup exists.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { isEvaluatorUser } from "@/lib/evaluations";
import { DOSSIER_PATH, findEvaluationIdForProject } from "@/lib/evaluations/dossier";

export const metadata: Metadata = {
  title: "Investor Dossier | BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export default async function InvestorStartupAliasPage({ params }: PageProps) {
  const { projectId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/investor/startup/${encodeURIComponent(projectId)}`);
  if (!ID_RE.test(projectId)) notFound();

  const [evaluationId, isSandbox, isEvaluator] = await Promise.all([
    findEvaluationIdForProject(user.id, projectId),
    getCurrentProjectIsSandbox(),
    isEvaluatorUser(user),
  ]);
  if (evaluationId) redirect(DOSSIER_PATH(evaluationId));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-10 text-center" data-testid="dossier-interstitial">
          <h1 className="text-xl font-semibold text-ink-900">This startup is not in your evaluations yet</h1>
          <p className="mt-2 text-sm text-ink-600">
            The Investor Dossier opens from a startup you evaluate. Add it to <em>Startups I&apos;m evaluating</em> (it counts against your profiles quota) and the dossier — radar, weighted table, 13 criteria and your assessment — is ready in about two minutes.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {isEvaluator ? (
              <Link href="/workspace/evaluations" className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Add to my evaluations
              </Link>
            ) : (
              <Link href="/pricing?segment=evaluator" className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                See evaluator plans
              </Link>
            )}
            <Link href="/workspace/investor/dealflow" className="inline-flex min-h-11 items-center rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface-50">
              Back to deal flow
            </Link>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
