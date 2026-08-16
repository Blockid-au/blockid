import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ForecastWizardClient } from "./forecast-wizard-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "New Financial Forecast | BlockID",
  description: "Create a new revenue forecast with tax incentives and scenario analysis.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ForecastWizardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/financial-forecast/wizard");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-2xl mx-auto">
        <ForecastWizardClient />
      </div>
    </WorkspaceLayout>
  );
}
