/**
 * /workspace/projects/[slug]/members — team members surface.
 *
 * Q4 Multi-project #3 (iteration-13 T4). Lets the project owner invite a
 * co-founder / team member, see the current roster, and revoke access.
 *
 * Server component fetches the roster via the same helpers the API route
 * uses (assertProjectOwner + listMembers). If the caller isn't the owner
 * we notFound() — matches the sibling /analyze surface's zero-info
 * disclosure model.
 */

import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject, getCurrentProjectIsSandbox } from "@/lib/projects";
import {
  assertProjectOwner,
  listMembers,
  ProjectMemberScopeError,
} from "@/lib/project-members/scope";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
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

  const project = await getActiveProject(user.id, slug);
  if (!project) notFound();

  // Owner-only surface. assertProjectOwner throws not_owner for shared
  // members — collapse to notFound() to avoid confirming project existence.
  try {
    await assertProjectOwner(project.id, user.id);
  } catch (err) {
    if (err instanceof ProjectMemberScopeError) {
      notFound();
    }
    throw err;
  }

  const members = await listMembers(project.id);
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
            signing in. You remain the project owner.
          </p>
        </header>

        <ProjectMembersClient
          projectId={project.id}
          initialMembers={members}
        />
      </div>
    </WorkspaceLayout>
  );
}
