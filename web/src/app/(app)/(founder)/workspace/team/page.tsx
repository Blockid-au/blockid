// /workspace/team — Team & Salaries planner.
// Multi-startup-scoped roster: founders, hires, advisors, contractors — with
// equity, salary, start date, and status.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getPlatformConfig } from "@/lib/platform-config";
import { listTeamMembers, getActiveProjectIdOrNull } from "@/lib/founder-features";
import { TeamPlannerClient } from "./team-planner-client";

export const metadata: Metadata = {
  title: "Team & Salaries | Workspace | BlockID",
  description:
    "Plan your founding team, next hires, advisors and contractors — with equity and salary tracking.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/team");

  const [isSandbox, projectId, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getActiveProjectIdOrNull(),
    getPlatformConfig(),
  ]);
  const items = await listTeamMembers(user, projectId);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="bg-gradient-to-r from-[#00D4FF] to-[#0066FF] bg-clip-text text-transparent font-bold text-xl">Team &amp; Salaries</h1>
          <p className="text-sm text-[#94A3B8] mt-1">{cfg.founder_features_copy.team_intro}</p>
          <p className="text-xs text-[#94A3B8]/70 mt-1">
            Suggested: at least {cfg.founder_features_copy.team_suggested_advisors} advisors on board
            before a priced round.
          </p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Create or select a startup first — team roster is stored per startup.
          </div>
        )}

        <TeamPlannerClient
          initial={items}
          disabled={!projectId}
          suggestedAdvisors={cfg.founder_features_copy.team_suggested_advisors}
        />
      </div>
    </WorkspaceLayout>
  );
}
