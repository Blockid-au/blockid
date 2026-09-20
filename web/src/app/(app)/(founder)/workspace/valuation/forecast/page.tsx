import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ForecastListClient } from "./forecast-list-client";
import { getCurrentProjectIsSandbox, getProjectScope } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Financial Forecast | BlockID",
  description: "Model your 3-year revenue growth with tax incentives and scenario analysis.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FinancialForecastPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/valuation/forecast");

  // G20-sweep: the list is per project — GET /api/financial/forecast/[projectId]
  // (the client used to call a bare /api/financial/forecast that never existed
  // → 404 on every first paint and a permanent "Something went wrong"). No
  // project → the empty state, no fetch.
  const [isSandbox, scope] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getProjectScope("viewer").catch(() => null),
  ]);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <ForecastListClient projectId={scope?.projectId ?? null} />
      </div>
    </WorkspaceLayout>
  );
}
