/**
 * /workspace/projects/[slug]/analyze — per-project SVI analyzer.
 *
 * Runs the SVIEntrance analyzer scoped to a specific project the current
 * user owns. The route param is the project slug (already used everywhere
 * else — ProjectSwitcher, cookie `blockid_project`), not a UUID. The
 * server component resolves the project and hands its identity to a small
 * client wrapper that sets the `blockid_project` cookie before rendering
 * SVIEntrance, so all downstream SVI writes (svi_analyses.project_id,
 * per-project svi_account, Drive folder) attach to THIS project.
 *
 * Auth: redirects to /auth/login when unauthenticated. 404 when the
 * project doesn't exist for this user (prevents cross-tenant enumeration).
 *
 * The SVI report email is sent by /api/svi as it already does — no
 * change needed here. This page just guarantees the project context is
 * pinned before the founder hits submit.
 */

import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ProjectAnalyzeShell } from "./project-analyze-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analyse project — SVI",
  description:
    "Run a Startup Value Index analysis on this project and email the report.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ProjectAnalyzePage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/login?next=/workspace/projects/${encodeURIComponent(slug)}/analyze`);
  }

  const project = await getActiveProject(user.id, slug);
  if (!project) notFound();

  const queryParam = typeof sp.query === "string" ? sp.query : "";

  return (
    <WorkspaceLayout user={user} startupName={project.name}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
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
          <span>Analyse</span>
        </div>

        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-600">
            Startup Value Index
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800 sm:text-4xl">
            Analyse {project.name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600 sm:text-base">
            Paste an idea, website URL, pitch deck excerpt, or product notes.
            We&apos;ll score this project across 13 SVI criteria and email
            the full report to <span className="font-medium text-ink-800">{user.email}</span>.
            Results attach to this project only.
          </p>
          <p className="mt-3 text-xs text-ink-500">
            General information only. Not financial advice.
          </p>
        </header>

        <Suspense>
          <ProjectAnalyzeShell
            projectSlug={project.slug}
            initialQuery={queryParam}
          />
        </Suspense>
      </div>
    </WorkspaceLayout>
  );
}
