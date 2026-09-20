// /dashboard/reports/lp-quarterly — HIDDEN (G20-F1, 2026-09-20).
// Was a static explainer for a PDF generator that does not exist
// ("Automated PDF export ships in a follow-up release"). The quarterly
// program report and the LP report composer are the working surfaces.
// Key: lp_quarterly_explainer. Route kept — /workspace/reports links here.
import { FileBarChart } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("LP quarterly report");
export const dynamic = "force-dynamic";

export default function LpQuarterlyReportPage() {
  return (
    <HiddenWorkspacePage
      feature="lp_quarterly_explainer"
      path="/dashboard/reports/lp-quarterly"
      title="LP quarterly report"
      icon={FileBarChart}
      reason="A one-click LP PDF is not offered from this page. The quarterly program report and the LP report composer produce the same cohort figures today."
      alternatives={[
        { href: "/workspace/accelerator/quarterly-report", label: "Quarterly program report" },
        { href: "/workspace/lp-report", label: "LP report composer" },
        { href: "/workspace/evaluations/cohort", label: "Cohort table with CSV export" },
      ]}
      backHref="/workspace/accelerator"
      backLabel="Back to Accelerator"
    />
  );
}
