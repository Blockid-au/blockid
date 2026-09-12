// /workspace/roadmap-builder — Founder-authored quarterly milestones.
// Distinct from /workspace/roadmap (the platform's growth-phase gates).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox, getProjectScope } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { getPlatformConfig } from "@/lib/platform-config";
import {
  listRoadmapMilestones,
  founderFeatureScope,
  nextQuarters,
} from "@/lib/founder-features";
import { RoadmapBuilderClient } from "./roadmap-builder-client";
import { ConferenceRecommender } from "@/components/founder/conference-recommender";

export const metadata: Metadata = {
  title: "Roadmap Builder | Workspace | BlockID",
  description:
    "Plan the next 4 quarters. Ship / learn / measure — the shape investors want to see in your data room.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/roadmap-builder");

  // S18-B — member-aware: a shared-project member reads the OWNER's rows
  // (the key /api/founder/* writes under); a viewer gets a read-only form.
  const [isSandbox, scope, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getProjectScope("viewer"),
    getPlatformConfig(),
  ]);
  const { projectId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  const milestones = await listRoadmapMilestones(founderFeatureScope(scope, user));
  const quarters = nextQuarters(cfg.founder_features_copy.roadmap_quarters_ahead);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-primary font-bold text-xl">Roadmap Builder</h1>
          <p className="text-sm text-muted mt-1">{cfg.founder_features_copy.roadmap_intro}</p>
          <p className="text-xs text-muted/70 mt-1">
            Growth-phase gates live on{" "}
            <a href="/workspace/roadmap" className="text-action hover:underline">/workspace/roadmap</a>.
            This surface is your own quarterly plan.
          </p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Create or select a startup first — milestones are stored per startup.
          </div>
        )}
        {isMember && !canEdit && <ViewOnlyNote role={role} action="edit milestones" />}

        <RoadmapBuilderClient
          initial={milestones}
          quarters={quarters}
          disabled={!projectId || !canEdit}
        />

        <ConferenceRecommender />
      </div>
    </WorkspaceLayout>
  );
}
