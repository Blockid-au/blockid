import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { CapTableManager } from "@/components/workspace/cap-table-manager";

export const metadata: Metadata = {
  title: "Cap Table | BlockID",
  description: "Manage your startup cap table, share classes, and ESOP pool on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CapTablePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/cap-table");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-6xl mx-auto">
        <CapTableManager />
      </div>
    </WorkspaceLayout>
  );
}
