import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ExitStrategyResultsClient } from "./exit-strategy-results-client";

export const metadata: Metadata = {
  title: "Exit Scenario | BlockID",
};

export const dynamic = "force-dynamic";

interface Props {
  params: { scenarioId: string };
}

export default async function ExitScenarioResultsPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/exit-strategy/${params.scenarioId}`);

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <ExitStrategyResultsClient scenarioId={params.scenarioId} />
      </div>
    </WorkspaceLayout>
  );
}
