// G35 Pricing v5 P4 — "BlockID Reviewed · <date> · <reviewer>" on a Verified
// report (plan §6.6). Hook-free; rendered by the TBR dashboard header only
// when the server attached `report.reviewBadge` (Verified tier + reviewed —
// lib/verified-review/badge.ts). Light template: navy text on the soft info
// surface, no colour-only meaning (the words carry it).

import { BadgeCheck } from "lucide-react";
import type { ReportReviewBadge } from "@/lib/report-v2/schema";

export function TbrReviewedBadge({ badge }: { badge: ReportReviewBadge }) {
  return (
    <span
      data-tbr-reviewed-badge
      title="A BlockID reviewer checked the evidence behind this report. Not an audit; not financial advice."
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-navy/40 bg-info-soft px-2.5 py-0.5 text-xs font-semibold text-brand-navy"
    >
      <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <time dateTime={badge.reviewedAt} className="truncate">
        {badge.label}
      </time>
    </span>
  );
}
