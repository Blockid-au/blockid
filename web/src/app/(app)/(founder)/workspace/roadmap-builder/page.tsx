// /workspace/roadmap-builder — Founder-authored quarterly milestones.
// Distinct from /workspace/roadmap (the platform's growth-phase gates).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getPlatformConfig } from "@/lib/platform-config";
import {
  listRoadmapMilestones,
  getActiveProjectIdOrNull,
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

  const [isSandbox, projectId, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getActiveProjectIdOrNull(),
    getPlatformConfig(),
  ]);
  const milestones = await listRoadmapMilestones(user, projectId);
  const quarters = nextQuarters(cfg.founder_features_copy.roadmap_quarters_ahead);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-bold text-ink-800">Roadmap Builder</h1>
          <p className="text-sm text-ink-600 mt-1">{cfg.founder_features_copy.roadmap_intro}</p>
          <p className="text-xs text-ink-400 mt-1">
            Growth-phase gates live on{" "}
            <a href="/workspace/roadmap" className="text-brand-600 hover:underline">/workspace/roadmap</a>.
            This surface is your own quarterly plan.
          </p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create or select a startup first — milestones are stored per startup.
          </div>
        )}

        <RoadmapBuilderClient
          initial={milestones}
          quarters={quarters}
          disabled={!projectId}
        />

        <ConferenceRecommender />
      </div>
    </WorkspaceLayout>
  );
}
