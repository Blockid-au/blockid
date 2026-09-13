import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { InvestorsClient } from "./investors-client";

export const metadata: Metadata = {
  title: "Investor CRM | BlockID",
  description: "Track every investor conversation by stage, with next steps, notes and the cheques that follow.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// S28-B — the pipeline is fetched client-side from /api/investors/crm/**,
// which resolves the caller's role through getProjectScope — the page adds
// nothing keyed on the caller (S18-B guard: no project-record reads here).
// Same gate as /workspace/fundraise: signed-in founders; the nav leaf
// carries the starter minPlan, and a viewer role gets a read-only board.
export default async function InvestorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/investors");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-7xl p-6">
        <InvestorsClient />
      </div>
    </WorkspaceLayout>
  );
}
