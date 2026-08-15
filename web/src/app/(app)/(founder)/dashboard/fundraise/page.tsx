import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FundraisingReadinessClient } from "./fundraising-readiness-client";
import { CapitalScoreCard } from "@/components/fundraise/capital-score-card";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Fundraising Readiness · BlockID",
  description: "CAPITAL framework investor readiness score + AU checklist, comparable raises, and priority gaps.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FundraisingReadinessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/fundraise");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="space-y-8 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Fundraising Readiness</h1>
          <p className="mt-1 text-sm text-ink-500">
            CAPITAL framework score + AU investor-readiness checklist for your stage
          </p>
        </div>
        <CapitalScoreCard />
        <FundraisingReadinessClient />
      </div>
    </WorkspaceLayout>
  );
}
