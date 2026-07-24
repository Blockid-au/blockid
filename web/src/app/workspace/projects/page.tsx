import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserProjects,
  getUserArchivedProjects,
  getProjectLimit,
  getCurrentProjectIsSandbox,
} from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ProjectsClient } from "./projects-client";

export const metadata: Metadata = {
  title: "Projects",
  description: "Manage your startup projects on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/projects");

  const isSandbox = await getCurrentProjectIsSandbox();

  const [projects, archivedProjects, limit] = await Promise.all([
    getUserProjects(user.id),
    getUserArchivedProjects(user.id),
    getProjectLimit(user.plan ?? "free"),
  ]);

  // Load account_type separately — AppUser doesn't carry it and the client
  // needs it to gate the "Create New Startup" button per the 2026-07-24
  // founder 1-startup directive.
  let accountType: string | null = null;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("account_type")
      .eq("id", user.id)
      .maybeSingle();
    accountType = (data?.account_type as string | null | undefined) ?? null;
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <ProjectsClient
        initialProjects={projects}
        initialArchivedProjects={archivedProjects}
        limit={limit}
        plan={user.plan ?? "free"}
        accountType={accountType}
      />
    </WorkspaceLayout>
  );
}
