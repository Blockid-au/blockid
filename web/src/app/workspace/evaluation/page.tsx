import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EvaluationClient } from "@/components/evaluation/evaluation-client";

export const metadata: Metadata = {
  title: "Startup Evaluation | BlockID",
  description:
    "Evaluate your startup across 13 key criteria to build investor-ready evidence and unlock AI-powered insights.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EvaluationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evaluation");

  return (
    <WorkspaceLayout user={user}>
      <EvaluationClient user={{ email: user.email }} />
    </WorkspaceLayout>
  );
}
