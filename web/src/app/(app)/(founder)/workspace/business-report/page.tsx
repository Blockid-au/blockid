import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
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
  if (!user) redirect("/auth/login?next=/workspace/business-report");
  const isSandbox = await getCurrentProjectIsSandbox();
  const { pid } = await searchParams;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <BusinessReportClient projectId={pid ?? "default"} />
    </WorkspaceLayout>
  );
}
