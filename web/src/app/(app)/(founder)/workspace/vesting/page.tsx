import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { VestingDashboard } from "./vesting-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";

export const metadata: Metadata = {
  title: "Vesting Schedules | BlockID",
  description:
    "View and manage equity vesting schedules for your startup on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VestingPage() {
  // Same reasoning as /workspace/esop: `vesting.read` is granted by the Equity
  // add-on, and a tier floor short-circuits ahead of the feature check. No
  // plan bundle carries vesting.read, so the flag alone is what decides.
  await requireTierForPage({
    feature: "vesting.read",
    fromPath: "/workspace/vesting",
  });

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/vesting");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <VestingDashboard />
      </div>
    </WorkspaceLayout>
  );
}
