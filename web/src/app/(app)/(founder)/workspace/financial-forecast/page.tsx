import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ForecastListClient } from "./forecast-list-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Financial Forecast | BlockID",
  description: "Model your 3-year revenue growth with tax incentives and scenario analysis.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FinancialForecastPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/financial-forecast");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <ForecastListClient />
      </div>
    </WorkspaceLayout>
  );
}
