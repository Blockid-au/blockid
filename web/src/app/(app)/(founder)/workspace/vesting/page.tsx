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
  await requireTierForPage({
    feature: "vesting.read",
    minTier: "growth",
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
