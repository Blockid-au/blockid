import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CFODashboardClient } from "./cfo-dashboard-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "AI CFO Dashboard · BlockID",
  description: "Financial health score, burn rate, runway intelligence, and AI-generated CFO commentary for your startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CFODashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/cfo");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <CFODashboardClient userEmail={user.email} startupName={user.startupName ?? undefined} />
    </WorkspaceLayout>
  );
}
