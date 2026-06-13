import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { AdvisorClient } from "./advisor-client";

export const metadata: Metadata = {
  title: "Advisor Portal — BlockID",
  description: "Manage your startup clients and track their SVI progress.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdvisorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/advisor");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Advisor Portal</h1>
          <p className="text-sm text-ink-600 mt-1">
            Track and manage your client startups — scores, stages, and
            investor readiness at a glance.
          </p>
        </div>
        <AdvisorClient />
      </div>
    </WorkspaceLayout>
  );
}
