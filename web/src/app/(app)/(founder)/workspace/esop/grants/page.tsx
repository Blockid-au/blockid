import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
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

  const isSandbox = await getCurrentProjectIsSandbox();

  // S18-B — member-aware: grants are keyed on the OWNER's id + project
  // (same key /api/esop/grants uses); viewers get a read-only table.
  const scope = await getProjectScope("viewer");
  const { projectId, ownerUserId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  const grants = await listGrants(ownerUserId, projectId);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        {isMember && !canEdit && (
          <ViewOnlyNote role={role} action="create or update option grants" className="mb-4" />
        )}
        <GrantsClient
          initialGrants={grants}
          disclaimer={DIV83A_DISCLAIMER}
          readOnly={!canEdit}
        />
      </div>
    </WorkspaceLayout>
  );
}
