/**
 * /workspace/projects/[slug]/members — team members surface.
 *
 * Q4 Multi-project #3 (iteration-13 T4). Lets the project owner invite a
 * co-founder / team member, see the current roster, and revoke access.
 *
 * Server component fetches the roster via the same helpers the API route
 * uses (assertProjectOwner + listMembers). A non-member gets notFound()
 * (zero-info disclosure); an accepted editor/viewer is already on the
 * project, so they get the page shell with a "view only" note and no
 * roster (S18-B) instead of a 404.
 */

import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject, getCurrentProjectIsSandbox, roleCanAdmin } from "@/lib/projects";
import type { ProjectRole } from "@/lib/projects";
import { listMembers } from "@/lib/project-members/scope";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { ProjectMembersClient } from "./project-members-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project members",
  description: "Invite a co-founder or team member to collaborate on this project.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectMembersPage({ params }: PageProps) {
  const { slug } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/auth/login?next=/workspace/projects/${encodeURIComponent(slug)}/members`,
    );
  }

  // Member-aware lookup (S17-A): resolves owned OR shared projects by slug.
  const project = await getActiveProject(user.id, slug);
  if (!project) notFound();

  // Admin surface — owner or an accepted admin member (the same rule the
  // /members API enforces). Editors/viewers are members already, so they
  // get the shell + a "view only" note (S18-B) rather than a 404; the
  // roster itself stays admin-only (the /members API would refuse it).
  const role: ProjectRole = project.role ?? (project.userId === user.id ? "owner" : "viewer");
  const canAdmin = roleCanAdmin(role);

  const members = canAdmin ? await listMembers(project.id) : [];
  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} startupName={project.name} isSandbox={isSandbox}>
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex items-center gap-2 text-sm text-ink-600">
          <Link
            href="/workspace/projects"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-100 hover:text-ink-800"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Projects
          </Link>
          <span aria-hidden="true">/</span>
          <span className="font-medium text-ink-800">{project.name}</span>
          <span aria-hidden="true">/</span>
          <span>Members</span>
        </div>

        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-600">
            Team access
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800 sm:text-4xl">
            {project.name} team
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600 sm:text-base">
            Invite a co-founder or advisor to collaborate on this project.
            Share the generated invite link — they&apos;ll accept it after
            signing in.{" "}
            {project.isShared
              ? "You manage this project as an admin; the owner keeps ownership."
              : "You remain the project owner."}{" "}
            Viewers can read everything; editors can also run analyses and
            upload evidence; admins can invite and remove members. Paid
            reports a member runs are charged to that member&apos;s own credits.
          </p>
        </header>

        {canAdmin ? (
          <ProjectMembersClient
            projectId={project.id}
            initialMembers={members}
          />
        ) : (
          <ViewOnlyNote role={role} action="invite or remove members" />
        )}
      </div>
    </WorkspaceLayout>
  );
}
