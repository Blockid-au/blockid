import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { asReportTierClient, emitReportView, resolveReportTier } from "@/lib/analytics/funnel";
import { BusinessReportClient } from "./business-report-client";
import { loadAssessmentContext, resolveProjectStageAndSector } from "@/lib/svi/assessment-context";
import { orderParam } from "@/lib/paywall/report-delivery";

export const metadata: Metadata = {
  title: "Trusted Business Report — BlockID",
  description:
    "Full analyst-quality business report across all 8 SVI dimensions — scores, evidence, AU market benchmarks, valuation, and improvement roadmap.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function BusinessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ pid?: string; order?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/reports/business");
  const isSandbox = await getCurrentProjectIsSandbox();
  const { pid, order } = await searchParams;
  const projectId = pid ?? "default";
  // G19-S45 (D4): `?order=<id>` — the post-purchase landing (reportOrderPath).
  const orderId = orderParam(order);
  // G21 P1: the Assessment Card context (stored evidence confidence, claim
  // count, stage benchmark under the n-rule) — the stage comes from the
  // report the client resolves, so the benchmark is resolved by stage below.
  const projectStage = projectId !== "default" ? await resolveProjectStageAndSector(projectId) : null;
  const assessmentContext = projectStage ? await loadAssessmentContext(projectId, projectStage.stage, projectStage.sector) : null;
  const assessmentBenchmarks = assessmentContext ? { total: assessmentContext.benchmark, evidenceConfidence: assessmentContext.evidenceConfidence, unverifiedMaterialClaims: assessmentContext.unverifiedMaterialClaims } : undefined;

  // G16-A funnel: `report_view` — the founder opened their Trusted Business
  // Report. Server-side so it fires whether or not the client bundle hydrates
  // (CSP: no eval → dev never hydrates); tier = plan | paid | free from the
  // account, never from the client. Never blocks the render.
  try {
    const tier = await resolveReportTier(asReportTierClient(getSupabaseAdmin()), user.id, user.plan);
    emitReportView({ userId: user.id, email: user.email, projectId, tier });
  } catch {
    // analytics must never break the page
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <BusinessReportClient projectId={projectId} orderId={orderId} benchmarks={assessmentBenchmarks} />
    </WorkspaceLayout>
  );
}
