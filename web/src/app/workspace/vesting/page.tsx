import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { VestingDashboard } from "./vesting-client";

export const metadata: Metadata = {
  title: "Vesting Schedules | BlockID",
  description:
    "View and manage equity vesting schedules for your startup on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function VestingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/vesting");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <VestingDashboard />
      </div>
    </WorkspaceLayout>
  );
}
