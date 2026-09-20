// /workspace/accelerator/cohort/add — HIDDEN (G20-F1, 2026-09-20).
// Was a static explainer ("the invite form ships in a follow-up release").
// Founders join a cohort from the cohort roster or through the intake link.
// Key: accelerator_cohort_add.
import { UserPlus } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("Add a founder");
export const dynamic = "force-dynamic";

export default function AddCohortFounderPage() {
  return (
    <HiddenWorkspacePage
      feature="accelerator_cohort_add"
      path="/workspace/accelerator/cohort/add"
      title="Add a founder"
      icon={UserPlus}
      reason="A separate add-founder form is not offered. Founders are added from the cohort roster, or arrive already scored through your intake link."
      alternatives={[
        { href: "/workspace/accelerator/cohort", label: "Cohort roster" },
        { href: "/workspace/accelerator/applications", label: "Intake link and scored applicants" },
      ]}
      backHref="/workspace/accelerator/cohort"
      backLabel="Back to Cohort"
    />
  );
}
