import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest, getCurrentProjectIsSandbox } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { TechIntelligencePanel } from "@/components/founder/tech-intelligence-panel";

export const metadata: Metadata = {
  title: "Tech Analysis | BlockID",
  description:
    "Analyse your startup's website and GitHub repository to get a Tech Score that feeds into your SVI and valuation boost.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TechAnalysisPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const startupId = await getProjectIdFromRequest();
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
      .eq("user_id", user.id)
      .maybeSingle();

    websiteUrl = (project?.website_url as string | null) ?? "";
    githubUrl = (project?.github_url as string | null) ?? "";
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <TechIntelligencePanel
          startupId={startupId}
          initialWebsiteUrl={websiteUrl}
          initialGithubUrl={githubUrl}
        />
      </div>
    </WorkspaceLayout>
  );
}
