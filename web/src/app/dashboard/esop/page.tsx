import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EsopDashboardClient } from "./esop-dashboard-client";

export const metadata: Metadata = {
  title: "ESOP Manager · BlockID",
  description: "Manage your Employee Share Option Plan — pool, grants, and vesting schedules.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EsopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/esop");

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink-900">ESOP Manager</h1>
          <p className="text-sm text-ink-500 mt-1">
            Employee Share Option Plan · Australian ESS Part 7A compliant · 4-year vesting
          </p>
        </div>

        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-700">
          <strong>Before granting options:</strong> Engage a tax advisor (BDO, Pitcher Partners) to review your ESOP Plan Deed.
          Budget A$2–5K for legal work. See your ESOP_LEGAL_TEMPLATES.md for ready-to-use documents.
        </div>

        <EsopDashboardClient />
      </div>
    </WorkspaceLayout>
  );
}
