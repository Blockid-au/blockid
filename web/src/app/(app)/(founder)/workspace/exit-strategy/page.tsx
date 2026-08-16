import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ExitStrategyListClient } from "./exit-strategy-list-client";

export const metadata: Metadata = {
  title: "Exit Strategy | BlockID",
  description: "Model Series A/B funding paths, dilution, founder payouts, and AU exit readiness.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ExitStrategyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/exit-strategy");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <ExitStrategyListClient />
      </div>
    </WorkspaceLayout>
  );
}
