// /ja/workspace/business-report — HIDDEN (G20-F1, 2026-09-20; F-3: only /vi
// is a maintained mirror). Key: locale_ja. Was a Japanese shell over
// <BusinessReportClient> whose login bounce pointed at a path that never
// existed. The English report at /workspace/reports/business is the surface.
import { Languages } from "lucide-react";
import { HiddenWorkspacePage, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata = hiddenPageMetadata("ビジネスレポート");
export const dynamic = "force-dynamic";

export default function JaBusinessReportPage() {
  return (
    <HiddenWorkspacePage
      feature="locale_ja"
      path="/ja/workspace/business-report"
      title="ビジネスレポート"
      icon={Languages}
      reason="The Japanese edition of your Trusted Business Report is not offered. Your report is available in English and Vietnamese."
      alternatives={[
        { href: "/workspace/reports/business", label: "Open my report in English" },
        { href: "/vi/workspace/business-report", label: "Mở báo cáo bằng tiếng Việt" },
      ]}
      backHref="/workspace/reports"
      backLabel="Back to Reports"
    />
  );
}
