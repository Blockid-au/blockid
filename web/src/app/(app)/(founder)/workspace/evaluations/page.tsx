// /workspace/evaluations — "Startups I'm evaluating" (T0270, G12 sprint S3).
//
// Server component inside WorkspaceLayout (same shell as
// workspace/investor/page.tsx). Loads the evaluator's evaluations + plan
// quota, then hands the table / dialog / claim handling to the client.
//
// Gate: isEvaluatorUser() — plan grants `investor.dealflow` OR the account
// type is an evaluator persona. A founder who lands here from a claim link
// (`?claim=<token>`) is NOT an evaluator: the page still renders so the
// client can POST the claim, with the list empty and the add button hidden.
//
// T0273: the Progress Radar (Δ since last week + sparkline per row, deadline
// badge, movers / next-deadlines panel) is computed by buildEvaluatorProgress
// for every evaluator; the panel itself is gated on `money_radar` (Scout /
// Firm / Program) — without it the client shows the Scout trial teaser.
//
// T0272: Program (lp_export / accelerator.cohort via getEntitlements) gets
// row multi-select → Batch score, plus the Cohorts section (listBatches).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getEvaluationQuota, isEvaluatorUser, listEvaluations } from "@/lib/evaluations";
import { getReportQuota, listLastEvaluationReports } from "@/lib/evaluations/report-quota";
import { buildEvaluatorProgress } from "@/lib/evaluations/progress-radar";
import { getEntitlements } from "@/lib/entitlements";
import { listBatches } from "@/lib/evaluations/batch";
import { canBatchScore } from "@/lib/evaluations/batch-shared";
import { EvaluationsClient } from "./evaluations-client";

export const metadata: Metadata = {
  title: "Startups I'm evaluating | BlockID",
  description: "Every startup you evaluate, scored on the same 8-dimension rubric.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ claim?: string | string[] }>;
}

export default async function EvaluationsPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evaluations");

  const params = await searchParams;
  const rawClaim = params?.claim;
  const claimToken = (Array.isArray(rawClaim) ? rawClaim[0] : rawClaim) ?? null;

  const [isSandbox, isEvaluator] = await Promise.all([
    getCurrentProjectIsSandbox(),
    isEvaluatorUser(user),
  ]);

  const [evaluations, quota, lastReports, reportQuota, progress, flags, batches] = isEvaluator
    ? await Promise.all([
        listEvaluations(user.id),
        getEvaluationQuota(user),
        listLastEvaluationReports(user.id),
        getReportQuota(user),
        buildEvaluatorProgress({ userId: user.id }).catch(() => null),
        getEntitlements(user.plan ?? "", user.id).catch(() => [] as string[]),
        listBatches(user.id).catch(() => []),
      ])
    : [[], { used: 0, limit: 0 }, {}, null, null, [] as string[], []];
  const hasMoneyRadar = flags.includes("money_radar");
  const canBatch = canBatchScore(flags);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <EvaluationsClient
        initialEvaluations={evaluations}
        used={quota.used}
        limit={quota.limit}
        plan={user.plan ?? "free"}
        isEvaluator={isEvaluator}
        claimToken={claimToken}
        lastReports={lastReports}
        reportQuota={reportQuota}
        progress={progress}
        hasMoneyRadar={hasMoneyRadar}
        canBatch={canBatch}
        batches={batches}
      />
    </WorkspaceLayout>
  );
}
