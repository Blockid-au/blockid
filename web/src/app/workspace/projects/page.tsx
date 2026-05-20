import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProjects, getProjectLimit } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ProjectsClient } from "./projects-client";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/projects");

  const projects = await getUserProjects(user.id);
  const limit = getProjectLimit(user.plan ?? "free");

  return (
    <WorkspaceLayout user={user}>
      <ProjectsClient
        initialProjects={projects}
        limit={limit}
        plan={user.plan ?? "free"}
      />
    </WorkspaceLayout>
  );
}
