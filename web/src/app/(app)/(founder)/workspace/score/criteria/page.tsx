import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EvaluationClient } from "@/components/evaluation/evaluation-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Criteria | BlockID",
  description:
    "Evaluate your startup across 13 key criteria to build investor-ready evidence and unlock AI-powered insights.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ScoreCriteriaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/score/criteria");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <EvaluationClient user={{ email: user.email }} />
    </WorkspaceLayout>
  );
}
