// /workspace/accelerator/applications — Accelerator application inbox.
// S31-B (2026-09-13): honest "not available yet" surface. The previous page
// promised "Coming Soon — Estimated: Q3 2026" and offered an
// upgrade button under a feature that does not exist. An intake form and review pipeline are not built; cohorts are populated by hand.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { NotAvailableYet } from "@/components/workspace/not-available-yet";
import { ClipboardCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Applications | Workspace | BlockID",
  description: "A structured application inbox for accelerator cohorts is not available yet.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/accelerator/applications");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <NotAvailableYet
        feature="accelerator_applications"
        title="Applications"
        icon={ClipboardCheck}
        userEmail={user.email}
        reason="A public application form with scoring and stage-by-stage review is not built yet. Today you add startups to a cohort yourself and track their SVI, evidence and progress from there; every startup you enter also appears under Startups I'm evaluating with its Progress Radar."
        alternatives={[
          { href: "/workspace/accelerator/cohort", label: "Cohort — add and track startups" },
          { href: "/workspace/evaluations", label: "Startups I'm evaluating" },
        ]}
      />
    </WorkspaceLayout>
  );
}
