import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { runStripePricingAudit } from "@/lib/stripe-pricing-audit";
import { StripeSyncClient } from "./stripe-sync-client";

export const metadata: Metadata = {
  title: "Stripe Sync — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StripeSyncPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/stripe-sync");
  if (user.role !== "admin") redirect("/dashboard");

  // Run audit server-side so the first paint shows fresh data without a client round-trip.
  const audit = await runStripePricingAudit();

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <Link href="/dashboard/admin/30day" className="text-xs text-blue-600 hover:underline">
            ← Back to 30-Day Scoreboard
          </Link>
          <h1 className="text-2xl font-bold mt-1">Stripe Sync</h1>
          <p className="text-sm text-muted-foreground max-w-3xl mt-1 leading-relaxed">
            Cross-check every plan in <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">platform-config.ts</code> against
            the actual Stripe Price object the customer is charged at checkout.
            When prices drift, create a new Price here (Stripe Prices are immutable)
            and update the matching env var, then redeploy.
          </p>
        </div>

        <StripeSyncClient initialAudit={audit} />
      </div>
    </WorkspaceLayout>
  );
}
