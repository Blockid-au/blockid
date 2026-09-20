// /es/workspace/business-report — HIDDEN (G20-F1, 2026-09-20; F-3: only /vi
// is a maintained mirror). Key: locale_es. Was a Spanish shell over
// <BusinessReportClient> whose login bounce pointed at a path that never
// existed. The English report at /workspace/reports/business is the surface.
import { Languages } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("Informe de negocio");
export const dynamic = "force-dynamic";

export default function EsBusinessReportPage() {
  return (
    <HiddenWorkspacePage
      feature="locale_es"
      path="/es/workspace/business-report"
      title="Informe de negocio"
      icon={Languages}
      reason="The Spanish edition of your Trusted Business Report is not offered. Your report is available in English and Vietnamese."
      alternatives={[
        { href: "/workspace/reports/business", label: "Open my report in English" },
        { href: "/vi/workspace/business-report", label: "Mở báo cáo bằng tiếng Việt" },
      ]}
      backHref="/workspace/reports"
      backLabel="Back to Reports"
    />
  );
}
