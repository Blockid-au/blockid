// /workspace/settings/project — Project settings for the ACTIVE startup
// (G13-W4-D2 E1.4; BA spec §B.6 step 3 "project settings page"). Hosts the
// founder taxonomy confirmation card (industry · business model · stage ·
// customer type · geography · tags with "Confirm / Edit / Not sure") next to
// the project facts. The classification is what deal-flow matching,
// benchmarks and the Startup Value Index listing key on, so the founder —
// not the pipeline — has the last word (confirmed fields are never
// overwritten by a later auto run).
//
// The active project comes from the workspace cookie (getProjectScope);
// editor+ members may edit the classification (the PATCH route enforces the
// same gate). No active project → the empty state links to My startups.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox, getProjectScope, roleCanWrite } from "@/lib/projects";
import { getTaxonomy } from "@/lib/taxonomy/store";
import { isEvaluatorUser } from "@/lib/evaluations";
import { TaxonomyConfirmCard } from "@/components/taxonomy/taxonomy-confirm-card";

export const metadata: Metadata = {
  title: "Project settings",
  description: "Confirm how BlockID classifies your startup — industry, business model, stage, customers, geography and tags.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/settings/project");

  const [scope, isSandbox] = await Promise.all([getProjectScope().catch(() => null), getCurrentProjectIsSandbox()]);
  const project = scope?.project ?? null;
  const [taxonomy, evaluator] = project ? await Promise.all([getTaxonomy(project.id).catch(() => null), isEvaluatorUser(user)]) : [null, false];
  const canEdit = project ? roleCanWrite(scope?.role) : false;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-3xl space-y-6 p-6" data-testid="project-settings">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Project settings</h1>
          <p className="mt-1 text-sm text-ink-700">
            The classification below drives investor matching, cohort benchmarks and your Startup Value Index listing. Name, description and members live on{" "}
            <Link href="/workspace/projects" className="underline">
              My startups
            </Link>
            .
          </p>
        </div>

        {!project ? (
          <section className="rounded-2xl border border-surface-200 bg-white p-6 text-sm text-ink-700" data-testid="project-settings-empty">
            No active startup selected.{" "}
            <Link href="/workspace/projects" className="underline">
              Pick one on My startups
            </Link>{" "}
            and come back.
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid="project-facts">
              <h2 className="text-base font-semibold text-ink-800">{project.name}</h2>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <div className="flex gap-2">
                  <dt className="text-ink-500">Slug</dt>
                  <dd className="text-ink-800">{project.slug}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-ink-500">Your role</dt>
                  <dd className="text-ink-800">{scope?.role ?? "viewer"}</dd>
                </div>
                {project.industry ? (
                  <div className="flex gap-2">
                    <dt className="text-ink-500">Industry (free text)</dt>
                    <dd className="text-ink-800">{project.industry}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
            {canEdit ? (
              <TaxonomyConfirmCard projectId={project.id} projectName={project.name} taxonomy={taxonomy} actor={evaluator ? "evaluator" : "founder"} />
            ) : (
              <section className="rounded-2xl border border-surface-200 bg-white p-5 text-sm text-ink-700" data-testid="taxonomy-readonly">
                Only editors and owners can confirm the classification. Ask the owner to change it.
              </section>
            )}
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
