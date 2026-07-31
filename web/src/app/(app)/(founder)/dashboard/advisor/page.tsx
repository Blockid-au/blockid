import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { AdvisorClient } from "./advisor-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { RoleLandingIntro } from "@/components/role/role-landing-intro";

export const metadata: Metadata = {
  title: "Advisor Portal — BlockID",
  description: "Manage your startup clients and track their SVI progress.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdvisorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/advisor");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <RoleLandingIntro role="advisor" hasGlobalSpotlight />
        </div>
        <AdvisorClient />
      </div>
    </WorkspaceLayout>
  );
}
