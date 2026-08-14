// /workspace/pricing-tiers — Founder's own SaaS pricing builder.
// Separate from BlockID platform pricing.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getPlatformConfig } from "@/lib/platform-config";
import { listPricingTiers, getActiveProjectIdOrNull } from "@/lib/founder-features";
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

  const [isSandbox, projectId, cfg] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getActiveProjectIdOrNull(),
    getPlatformConfig(),
  ]);
  const tiers = await listPricingTiers(user, projectId);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-xl font-bold text-ink-800">Pricing Tiers</h1>
          <p className="text-sm text-ink-600 mt-1">{cfg.founder_features_copy.pricing_intro}</p>
          <p className="text-xs text-ink-400 mt-1">
            Suggested: {cfg.founder_features_copy.pricing_suggested_tiers} tiers plus an Enterprise CTA.
          </p>
        </header>

        {!projectId && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Create or select a startup first — pricing tiers are stored per startup.
          </div>
        )}

        <PricingTiersClient initial={tiers} disabled={!projectId} />
      </div>
    </WorkspaceLayout>
  );
}
