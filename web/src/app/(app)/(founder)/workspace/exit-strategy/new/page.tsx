import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CreateScenarioClient } from "./create-scenario-client";

export const metadata: Metadata = {
  title: "New Exit Scenario | BlockID",
};

export const dynamic = "force-dynamic";

export default async function NewExitScenarioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/exit-strategy/new");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto">
        <CreateScenarioClient />
      </div>
    </WorkspaceLayout>
  );
}
