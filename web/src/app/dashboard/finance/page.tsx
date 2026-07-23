import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FinanceDashboardClient } from "./finance-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Finance Dashboard · BlockID",
  description: "Real-time P&L scoreboard — MRR, ARR, burn rate, CAC, gross margin, and runway for your startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FinanceDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/finance");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <FinanceDashboardClient userEmail={user.email} startupName={user.startupName ?? undefined} />
    </WorkspaceLayout>
  );
}
