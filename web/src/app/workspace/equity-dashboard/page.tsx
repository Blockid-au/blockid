import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EquityDashboardClient } from "./equity-dashboard-client";

export const metadata: Metadata = {
  title: "Equity Dashboard | BlockID",
  description:
    "Unified equity dashboard — ownership, token info, quick actions, and on-chain activity.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EquityDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/equity-dashboard");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-6xl mx-auto">
        <EquityDashboardClient
          isAdmin={
            user.email === ADMIN_EMAIL || user.role === "admin"
          }
        />
      </div>
    </WorkspaceLayout>
  );
}
