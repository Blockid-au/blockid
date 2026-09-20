// Wave 25 Phase B — Vietnamese Trusted Business Report (authenticated).
// Mirror of /workspace/reports/business but with locale="vi" so shell copy
// (headings, TOC, methodology, band names) render in Vietnamese. AI-
// generated narrative stays in whatever language the model produced.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { BusinessReportClient } from "@/app/(app)/(founder)/workspace/reports/business/business-report-client";
import { orderParam } from "@/lib/paywall/report-delivery";

export const metadata: Metadata = {
  title: "Báo cáo Kinh doanh Tin cậy — BlockID",
  description:
    "Báo cáo đầy đủ 8 khía cạnh SVI — điểm, bằng chứng, benchmark thị trường Úc, định giá và lộ trình cải thiện.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ViBusinessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ pid?: string; order?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/reports/business") // no /vi workspace mirror (review 2026-09-19);
  const isSandbox = await getCurrentProjectIsSandbox();
  const { pid, order } = await searchParams;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <BusinessReportClient projectId={pid ?? "default"} locale="vi" orderId={orderParam(order)} />
    </WorkspaceLayout>
  );
}
