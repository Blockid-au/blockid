import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { RevenueClient } from "./revenue-client";

export const metadata: Metadata = {
  title: "Revenue Dashboard | BlockID",
  description:
    "Revenue dashboard with P&L statement, expense breakdown, and dividend distribution calculator for BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/revenue");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">
            Revenue Dashboard
          </h1>
          <p className="text-sm text-ink-700 mt-1">
            Real-time P&L, expense tracking, and dividend distribution calculator.
          </p>
        </div>
        <RevenueClient />
      </div>
    </WorkspaceLayout>
  );
}
