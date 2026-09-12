// /workspace/pricing-tiers — Founder's own SaaS pricing builder.
// Separate from BlockID platform pricing.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox, getProjectScope } from "@/lib/projects";
import { pageScopeKeys } from "@/lib/project-members/page-scope";
import { ViewOnlyNote } from "@/components/workspace/view-only-note";
import { getPlatformConfig } from "@/lib/platform-config";
import { listPricingTiers, founderFeatureScope } from "@/lib/founder-features";
import { PricingTiersClient } from "./pricing-tiers-client";

export const metadata: Metadata = {
  title: "Pricing Tiers | Workspace | BlockID",
  description:
    "Design your product's pricing tiers — freemium, flat, per-seat or usage-based. Anchor the middle tier for conversion.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/pricing-tiers");

  // S18-B — member-aware: a shared-project member reads the OWNER's rows
  // (the key /api/founder/* writes under); a viewer gets a read-only form.
  const [isSandbox, scope, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getProjectScope("viewer"),
    getPlatformConfig(),
  ]);
  const { projectId, role, canEdit, isMember } = pageScopeKeys(scope, user);
  const tiers = await listPricingTiers(founderFeatureScope(scope, user));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-primary font-bold text-xl">Pricing Tiers</h1>
          <p className="text-sm text-muted mt-1">{cfg.founder_features_copy.pricing_intro}</p>
          <p className="text-xs text-muted/70 mt-1">
            Suggested: {cfg.founder_features_copy.pricing_suggested_tiers} tiers plus an Enterprise CTA.
          </p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Create or select a startup first — pricing tiers are stored per startup.
          </div>
        )}
        {isMember && !canEdit && <ViewOnlyNote role={role} action="edit pricing tiers" />}

        <PricingTiersClient initial={tiers} disabled={!projectId || !canEdit} />
      </div>
    </WorkspaceLayout>
  );
}
