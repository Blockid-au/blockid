// Wave 31D — Japanese Trusted Business Report (authenticated).
// Mirror of /workspace/business-report but with locale="ja" so shell copy
// (headings, TOC, methodology, band names) render in Japanese. AI-generated
// narrative stays in whatever language the model produced.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { BusinessReportClient } from "@/app/(app)/(founder)/workspace/business-report/business-report-client";

export const metadata: Metadata = {
  title: "信頼できる事業レポート — BlockID",
  description:
    "SVI 8項目の完全レポート — スコア、根拠、AU 市場ベンチマーク、バリュエーション、改善ロードマップ。",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function JaBusinessReportPage({
  searchParams,
}: {
  searchParams: Promise<{ pid?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/ja/workspace/business-report");
  const isSandbox = await getCurrentProjectIsSandbox();
  const { pid } = await searchParams;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <BusinessReportClient projectId={pid ?? "default"} locale="ja" />
    </WorkspaceLayout>
  );
}
