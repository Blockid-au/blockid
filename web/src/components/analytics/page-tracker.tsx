"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";
import { resolveShowcasePageEvent } from "@/lib/analytics/showcase-tracker";

// Map page names to their analytics events
const PAGE_EVENTS: Record<string, () => void> = {
  dashboard: () => trackEvent("dashboard_viewed", {}),
  evidence: () => trackEvent("evidence_vault_opened", {}),
  billing: () => trackEvent("billing_page_viewed", {}),
  pricing: () => trackEvent("pricing_viewed", {}),
};

interface PageTrackerProps {
  page: string;
  tool?: string;
  chapter?: number;
  locale?: "en" | "vi";
  source?: "onboarding" | "marketing";
  totalReports?: number;
}

export function PageTracker({
  page,
  tool,
  chapter,
  locale,
  source,
  totalReports,
}: PageTrackerProps) {
  useEffect(() => {
    // Fire page-specific event if defined
    const pageEvent = PAGE_EVENTS[page];
    if (pageEvent) pageEvent();

    // Fire showcase-scoped event when this page maps to one.
    const showcase = resolveShowcasePageEvent(page, {
      chapter,
      locale,
      source,
      totalReports,
      referrer: typeof document === "undefined" ? "" : document.referrer,
    });
    if (showcase) {
      // trackEvent's discriminated union covers each name individually so we
      // dispatch per-name to keep the parameter types honest at the call.
      switch (showcase.name) {
        case "showcase_public_viewed":
          trackEvent("showcase_public_viewed", showcase.params);
          break;
        case "showcase_reports_viewed":
          trackEvent("showcase_reports_viewed", showcase.params);
          break;
        case "showcase_guide_viewed":
          trackEvent("showcase_guide_viewed", showcase.params);
          break;
      }
    }

    // Fire tool_accessed for tool pages
    if (tool) {
      trackEvent("tool_accessed", { tool });
    }
  }, [page, tool, chapter, locale, source, totalReports]);

  return null;
}
