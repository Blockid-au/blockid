import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CfoScenarioClient } from "./scenario-client";

export const metadata = { title: "CFO valuation scenario · BlockID", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function CfoScenarioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/valuation/scenario");
  const scope = await getProjectScope("viewer");
  const isSandbox = await getCurrentProjectIsSandbox();
  return <WorkspaceLayout user={user} isSandbox={isSandbox}><CfoScenarioClient entityId={scope?.projectId ?? user.id} /></WorkspaceLayout>;
}
