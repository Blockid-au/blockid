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
  // Server-side gate — redirects unauthenticated to /auth/login and users
  // without the flag to /pricing?feature=... before we touch the DB.
  //
  // No minTier. `cap_table.write` sits on exactly founder_growth and above
  // (plans.csv), so the "growth" floor that used to sit alongside it granted
  // and denied precisely the same set — it was a restatement, not a second
  // check. What it did add was a failure mode: requireTierForPage evaluates
  // the tier FIRST and redirects before can() runs, so any per-user grant of
  // `cap_table.write` (an add-on, a support override) would have been
  // invisible here while the matching /api/cap-table routes, which have no
  // tier notion, let the same user straight through. That mismatch has
  // already bitten once on /workspace/esop. One authority: the flag.
  await requireTierForPage({
    feature: "cap_table.write",
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
