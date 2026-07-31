import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CapTableManager } from "@/components/workspace/cap-table-manager";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";

export const metadata: Metadata = {
  title: "Cap Table | BlockID",
  description: "Manage your startup cap table, share classes, and ESOP pool on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CapTablePage() {
  // Server-side tier gate — redirects unauthenticated to /auth/login and
  // sub-tier users to /pricing?feature=... before we touch the DB.
  await requireTierForPage({
    feature: "share_management",
    minTier: "growth",
    fromPath: "/workspace/cap-table",
  });

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/cap-table");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <CapTableManager />
      </div>
    </WorkspaceLayout>
  );
}
