import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CFODashboardClient } from "./cfo-dashboard-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI CFO Dashboard · BlockID",
  description: "Financial health score, burn rate, runway intelligence, and AI-generated CFO commentary for your startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CFODashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/valuation/cfo");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="px-6 pt-4"><Link className="text-sm underline underline-offset-4" href="/workspace/valuation/scenario">Explore a CFO cash-flow valuation scenario</Link></div>
      <CFODashboardClient userEmail={user.email} startupName={user.startupName ?? undefined} />
    </WorkspaceLayout>
  );
}
