// /workspace/plan — Action plan hub root (G13-W3-IA3, spec §B.2).
//
// The plan's spine: the 12-phase JourneyStepLadder, the SCN direction
// navigator (3-step route), the SCN action plan card, the growth roadmap +
// phase-progress widgets (all moved here off the founder landing), then the
// guided roadmap steps and the platform roadmap that already lived here.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import type { ProjectScope } from "@/lib/projects";
import { pageScopeKeys, resolveSVIAccountIdForPage } from "@/lib/project-members/page-scope";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { RoadmapSteps } from "@/components/workspace/roadmap-steps";
import { PlatformRoadmap } from "@/components/workspace/platform-roadmap";
import { JourneyStepLadder } from "@/components/dashboard/journey-step-ladder";
import { ScnDirectionNavigator } from "@/components/dashboard/scn-direction-navigator";
import { ScnActionPlanCard } from "@/components/dashboard/scn-action-plan-card";
import { GrowthRoadmap } from "@/components/dashboard/growth-roadmap";
import { GrowthProgressDashboard } from "@/components/dashboard/growth-progress-dashboard";
import { computeDirectionSteps, weakestLayerLabel } from "@/lib/dashboard/direction-steps";
import { loadStanding } from "@/lib/dashboard/landing-data";
import { NAV_PHASE_NAMES, resolveFounderNavPhase } from "@/lib/nav/founder-phase";

export const metadata: Metadata = {
  title: "Action plan",
  description: "Your 12-phase journey, the next three steps and the guided roadmap to grow your SVI score on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// S18-B — member-aware: steps are read off the OWNER's record (`dataEmail`
// + project); a member never creates a split svi_accounts row here.
async function getCompletedSteps(
  scope: ProjectScope | null,
  user: { id: string; email: string },
  accountId: string | null,
): Promise<number[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const completed: number[] = [];

  const { projectId, dataEmail } = pageScopeKeys(scope, user);

  // Step 1: Get SVI Baseline — at least 1 svi_analyses record (project-scoped)
  const countQuery = sb
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", dataEmail);
  if (projectId) countQuery.eq("project_id", projectId);
  else countQuery.is("project_id", null);

  const { count: analysisCount } = await countQuery;
  if (analysisCount && analysisCount > 0) completed.push(1);

  if (accountId) {
    const { data: evidence } = await sb
      .from("svi_evidence")
      .select("evidence_type, label, dimension")
      .eq("account_id", accountId);

    if (evidence && evidence.length > 0) {
      for (const ev of evidence) {
        const label = (ev.label ?? "").toLowerCase();
        const type = ev.evidence_type as string;
        const dim = (ev.dimension ?? "").toLowerCase();

        // Step 2: Add Website URL
        if (type === "public_url") completed.push(2);

        // Step 3: Upload Pitch Deck
        if (
          type === "document_uploaded" &&
          (label.includes("pitch") || label.includes("deck"))
        )
          completed.push(3);

        // Step 4: Build Cap Table
        if (dim === "cgh") completed.push(4);

        // Step 5: Connect GitHub
        if (type === "connected_source" && label.includes("github"))
          completed.push(5);

        // Step 6: Connect Analytics
        if (type === "connected_source" && label.includes("analytics"))
          completed.push(6);

        // Step 7: Add Revenue Proof
        if (
          type === "connected_source" &&
          (label.includes("stripe") || label.includes("revenue"))
        )
          completed.push(7);
      }
    }
  }

  // Deduplicate in case multiple evidence rows satisfy the same step
  return Array.from(new Set(completed));
}

export default async function ActionPlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/plan");

  const isSandbox = await getCurrentProjectIsSandbox();
  const scope = await getProjectScope("viewer");
  const { projectId, dataEmail, ownerUserId } = pageScopeKeys(scope, user);
  // Owner: find-or-create; member: read-only (null when the owner has no record).
  const accountId = await resolveSVIAccountIdForPage(scope, user);

  const [completedSteps, standing] = await Promise.all([
    getCompletedSteps(scope, user, accountId),
    loadStanding(getSupabaseAdmin(), { dataEmail, projectId, ownerUserId, callerId: user.id, accountId }),
  ]);

  const { analysis, sviScore } = standing;
  const navPhase = resolveFounderNavPhase({ svi: sviScore, growthPhaseId: scope?.project.growth_phase_current ?? null });
  const stage = analysis?.stage ?? navPhase;
  const directionSteps = computeDirectionSteps(analysis, stage);
  const stageLabel = analysis?.stageLabel ?? NAV_PHASE_NAMES[navPhase] ?? NAV_PHASE_NAMES[0];

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox} currentPhase={navPhase} startupName={standing.startupName ?? undefined}>
      <div className="mx-auto max-w-4xl space-y-10 p-6" data-workspace-plan>
        <div>
          <h1 className="text-xl font-bold text-ink-800">Action plan</h1>
          <p className="mt-1 text-sm text-ink-700">Your 12-phase journey, the next three steps and the guided roadmap to grow your SVI score.</p>
        </div>

        {/* 12-phase step ladder — the plan's spine (ux-ia-startup-flow-v1 §C.4). */}
        <JourneyStepLadder currentPhase={navPhase} mode="coarse" />

        {/* SCN direction — You are here → Next → Then → Then. */}
        <ScnDirectionNavigator stageLabel={stageLabel} weakestLayer={weakestLayerLabel(analysis?.subs)} steps={directionSteps} />

        {/* SCN action plan — Your Number → What to do (needs an analysis). */}
        {analysis ? <ScnActionPlanCard analysis={analysis} /> : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GrowthRoadmap currentPhase={navPhase} />
          <GrowthProgressDashboard />
        </div>

        <div>
          <div className="mb-6">
            <h2 className="text-lg font-bold text-ink-800">Growth Roadmap</h2>
            <p className="mt-1 text-sm text-ink-700">Complete these steps to grow your SVI score and attract investors.</p>
          </div>
          <RoadmapSteps completedSteps={completedSteps} />
        </div>

        {/* Platform Roadmap — 8-phase spiral */}
        <PlatformRoadmap />
      </div>
    </WorkspaceLayout>
  );
}
