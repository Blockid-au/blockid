import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { listGrants } from "@/lib/esop-grants";
import { DIV83A_DISCLAIMER } from "@/lib/div83a-checker";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { GrantsClient } from "./grants-client";

export const metadata: Metadata = {
  title: "ESOP Grants + Div 83A Checker | BlockID",
  description:
    "Track employee option grants and check eligibility for the AU Startup Concession under Division 83A.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EsopGrantsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/esop/grants");

  const projectId = await getProjectIdFromRequest();
  const grants = await listGrants(user.id, projectId);

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-6xl mx-auto">
        <GrantsClient
          initialGrants={grants}
          disclaimer={DIV83A_DISCLAIMER}
        />
      </div>
    </WorkspaceLayout>
  );
}
