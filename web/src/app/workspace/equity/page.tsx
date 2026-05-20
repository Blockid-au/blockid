import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getEquitySummary } from "@/lib/equity";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EquityClient } from "./equity-client";

export const metadata: Metadata = {
  title: "Equity & Cap Table",
  description: "Manage your startup cap table and equity on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EquityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/equity");

  // Read the active project from the cookie
  const store = await cookies();
  const projectSlug = store.get("blockid_project")?.value ?? undefined;
  const project = await getActiveProject(user.id, projectSlug);

  if (!project) {
    return (
      <WorkspaceLayout user={user}>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-6 py-16 text-center">
            <p className="text-ink-600 font-medium">No project found.</p>
            <p className="text-ink-700 text-sm mt-1">
              Create a startup project first to manage your cap table.
            </p>
            <a
              href="/workspace/projects?new=1"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Create Project
            </a>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  const summary = await getEquitySummary(project.id);

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <EquityClient
          projectId={project.id}
          projectName={project.name}
          initialSummary={summary}
        />
      </div>
    </WorkspaceLayout>
  );
}
