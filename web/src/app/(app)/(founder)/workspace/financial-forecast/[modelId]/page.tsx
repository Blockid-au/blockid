import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ForecastResultsClient } from "./forecast-results-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Financial Forecast Results | BlockID",
  description: "View your 36-month revenue projection with metrics and export options.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ modelId: string }>;
}

export default async function ForecastResultsPage({ params }: Props) {
  const { modelId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/financial-forecast");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-7xl mx-auto">
        <ForecastResultsClient modelId={modelId} />
      </div>
    </WorkspaceLayout>
  );
}
