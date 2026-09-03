// Wave 25 Phase B — Vietnamese Trusted Business Report (authenticated).
// Mirror of /workspace/business-report but with locale="vi" so shell copy
// (headings, TOC, methodology, band names) render in Vietnamese. AI-
// generated narrative stays in whatever language the model produced.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { BusinessReportClient } from "@/app/(app)/(founder)/workspace/business-report/business-report-client";

export const metadata: Metadata = {
  title: "Bao cao Kinh doanh Tin cay — BlockID",
  description:
    "Bao cao day du 8 khia canh SVI — diem, bang chung, benchmark thi truong AU, dinh gia va lo trinh cai thien.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ViBusinessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ pid?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/vi/workspace/business-report");
  const isSandbox = await getCurrentProjectIsSandbox();
  const { pid } = await searchParams;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <BusinessReportClient projectId={pid ?? "default"} locale="vi" />
    </WorkspaceLayout>
  );
}
