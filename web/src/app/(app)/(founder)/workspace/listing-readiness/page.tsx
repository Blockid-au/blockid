import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";
import { ListingReadinessClient } from "./listing-readiness-client";

export const metadata: Metadata = {
  title: "Listing Readiness | BlockID",
  description: "ASX admission conditions and Nasdaq Capital Market initial listing standards as readiness indicators computed from your cap table, share price, bank lines and profile.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ListingReadinessPage() {
  // Same floor as the sidebar row (Growth+, Exit subgroup) so a Starter sees
  // the lock instead of an empty page.
  await requireTierForPage({ minTier: "growth", fromPath: "/workspace/listing-readiness" });

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/listing-readiness");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">Exit · listing</p>
          <h1 className="mt-1 text-xl font-bold text-ink-800">Listing readiness</h1>
          <p className="text-sm text-ink-700 mt-1 max-w-2xl">
            Where your company stands against the ASX admission conditions and the Nasdaq Capital Market initial listing standards — every row computed from your cap table, share price, bank lines and profile, with the rule it comes from and what to do next. Pair it with{" "}
            <Link href="/workspace/exit" className="text-brand-600 underline">
              Exit Modelling
            </Link>{" "}
            for the IPO scenario and{" "}
            <Link href="/workspace/clean-room" className="text-brand-600 underline">
              Clean-room preparation
            </Link>{" "}
            for a strategic sale.
          </p>
        </div>
        <ListingReadinessClient />
      </div>
    </WorkspaceLayout>
  );
}
