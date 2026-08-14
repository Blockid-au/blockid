// /workspace/competitors — Competitor review + comparison table.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getPlatformConfig } from "@/lib/platform-config";
import { listCompetitors, getActiveProjectIdOrNull } from "@/lib/founder-features";
import { CompetitorsClient } from "./competitors-client";

export const metadata: Metadata = {
  title: "Competitor Review | Workspace | BlockID",
  description:
    "Track direct and indirect competitors. Compare positioning, pricing, strengths and weaknesses.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/competitors");

  const [isSandbox, projectId, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getActiveProjectIdOrNull(),
    getPlatformConfig(),
  ]);
  const items = await listCompetitors(user, projectId);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-bold text-ink-800">Competitor Review</h1>
          <p className="text-sm text-ink-600 mt-1">{cfg.founder_features_copy.competitors_intro}</p>
          <p className="text-xs text-ink-400 mt-1">
            Suggested: at least {cfg.founder_features_copy.competitors_suggested_direct} direct
            competitors before pitching investors.
          </p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create or select a startup first — competitor entries are stored per startup.
          </div>
        )}

        <CompetitorsClient initial={items} disabled={!projectId} />
      </div>
    </WorkspaceLayout>
  );
}
