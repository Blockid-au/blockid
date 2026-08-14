// /workspace/gtm-strategy — Go-to-Market Strategy canvas for founders.
// Single row per project. Renders a guided form with save-to-DB.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getPlatformConfig } from "@/lib/platform-config";
import {
  getGtmStrategy,
  getActiveProjectIdOrNull,
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

  const [isSandbox, projectId, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getActiveProjectIdOrNull(),
    getPlatformConfig(),
  ]);
  const strategy = await getGtmStrategy(user, projectId);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-bold text-ink-800">Go-to-Market Strategy</h1>
          <p className="text-sm text-ink-600 mt-1">{cfg.founder_features_copy.gtm_intro}</p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create or select a startup first — GTM strategy is stored per startup.
          </div>
        )}

        <GtmStrategyClient
          initial={strategy}
          disabled={!projectId}
          placeholders={{
            segment: cfg.founder_features_copy.gtm_placeholder_segment,
            valueProp: cfg.founder_features_copy.gtm_placeholder_value_prop,
          }}
        />
      </div>
    </WorkspaceLayout>
  );
}
