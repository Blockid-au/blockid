import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { VcValuationDashboard } from "./vc-valuation-dashboard";

export const metadata: Metadata = {
  title: "VC Valuation Dashboard — BlockID",
  description: "Full VC-grade valuation report: market sizing, 4 methods, financial projections, unit economics, and raise plan.",
};

export const dynamic = "force-dynamic";

export default async function ValuationDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/valuation");

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-4xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">VC-Grade Analysis</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800">
            Startup Valuation Report
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Market sizing, 4-method blended valuation, 36-month projections, unit economics and raise plan — compiled from your SVI data.
          </p>
        </header>
        <VcValuationDashboard />
      </div>
    </WorkspaceLayout>
  );
}
