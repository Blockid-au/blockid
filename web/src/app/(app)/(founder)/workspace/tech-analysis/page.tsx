import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { TechIntelligencePanel } from "@/components/founder/tech-intelligence-panel";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";

export const metadata: Metadata = {
  title: "Tech Analysis | BlockID",
  description:
    "Analyse your startup's website and GitHub repository to get a Tech Score that feeds into your SVI and valuation boost.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TechAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/tech-analysis");

  // S18-B — member-aware: the project row is read under the OWNER's id;
  // a viewer gets the panel read-only (the route is editor+, review P2-1).
  const scope = await getProjectScope("viewer");
  const { projectId: startupId, ownerUserId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  if (!startupId) redirect("/workspace/projects");

  const isSandbox = await getCurrentProjectIsSandbox();

  // Fetch existing website + github URLs from the project
  const supabase = getSupabaseAdmin();
  let websiteUrl = "";
  let githubUrl = "";

  if (supabase) {
    const { data: project } = await supabase
      .from("projects")
      .select("website_url, github_url")
      .eq("id", startupId)
      .eq("user_id", ownerUserId)
      .maybeSingle();

    websiteUrl = (project?.website_url as string | null) ?? "";
    githubUrl = (project?.github_url as string | null) ?? "";
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        {isMember && !canEdit && <ViewOnlyNote role={role} action="run a tech analysis" />}
        <TechIntelligencePanel
          startupId={startupId}
          initialWebsiteUrl={websiteUrl}
          initialGithubUrl={githubUrl}
          readOnly={!canEdit}
        />
      </div>
    </WorkspaceLayout>
  );
}
