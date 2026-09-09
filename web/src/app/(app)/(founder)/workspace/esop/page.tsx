import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EsopClient } from "./esop-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";

export const metadata: Metadata = {
  title: "ESOP Vesting | BlockID",
  description:
    "Grant and manage employee stock option vesting on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EsopPage() {
  // No minTier. `esop.manage` is now reachable two ways — a Scale/Enterprise
  // plan, or the A$59 Equity add-on on top of any paid plan — and
  // requireTierForPage checks the tier FIRST and redirects before it ever
  // consults can(). A "scale" floor here would have sent every founder who
  // bought the add-on to /pricing for the page they had just paid to unlock,
  // while the matching API routes let them through (gateRequireFeature has no
  // tier notion). The feature flag is the authority; the floor was only ever
  // a restatement of which plans carried it.
  await requireTierForPage({
    feature: "esop.manage",
    fromPath: "/workspace/esop",
  });

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/esop");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <EsopClient />
      </div>
    </WorkspaceLayout>
  );
}
