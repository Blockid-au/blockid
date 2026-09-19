import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { asReportTierClient, emitReportView, resolveReportTier } from "@/lib/analytics/funnel";
import { BusinessReportClient } from "./business-report-client";

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
  searchParams: Promise<{ pid?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/reports/business");
  const isSandbox = await getCurrentProjectIsSandbox();
  const { pid } = await searchParams;
  const projectId = pid ?? "default";

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
      <BusinessReportClient projectId={projectId} />
    </WorkspaceLayout>
  );
}
