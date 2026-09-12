// /workspace/gtm-strategy — Go-to-Market Strategy canvas for founders.
// Single row per project. Renders a guided form with save-to-DB.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox, getProjectScope } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { getPlatformConfig } from "@/lib/platform-config";
import {
  getGtmStrategy,
  founderFeatureScope,
} from "@/lib/founder-features";
import { GtmStrategyClient } from "./gtm-strategy-client";

export const metadata: Metadata = {
  title: "Go-to-Market Strategy | Workspace | BlockID",
  description:
    "Build your go-to-market canvas — ICP, value prop, channels, sales motion, pricing anchor, and north-star metric.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/gtm-strategy");

  // S18-B — member-aware: a shared-project member reads the OWNER's rows
  // (the key /api/founder/* writes under); a viewer gets a read-only form.
  const [isSandbox, scope, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getProjectScope("viewer"),
    getPlatformConfig(),
  ]);
  const { projectId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  const strategy = await getGtmStrategy(founderFeatureScope(scope, user));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-primary font-bold text-xl">Go-to-Market Strategy</h1>
          <p className="text-sm text-muted mt-1">{cfg.founder_features_copy.gtm_intro}</p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Create or select a startup first — GTM strategy is stored per startup.
          </div>
        )}
        {isMember && !canEdit && <ViewOnlyNote role={role} action="edit the GTM strategy" />}

        <GtmStrategyClient
          initial={strategy}
          disabled={!projectId || !canEdit}
          placeholders={{
            segment: cfg.founder_features_copy.gtm_placeholder_segment,
            valueProp: cfg.founder_features_copy.gtm_placeholder_value_prop,
          }}
        />
      </div>
    </WorkspaceLayout>
  );
}
