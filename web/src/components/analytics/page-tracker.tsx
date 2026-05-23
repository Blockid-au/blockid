"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

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
}

export function PageTracker({ page, tool }: PageTrackerProps) {
  useEffect(() => {
    // Fire page-specific event if defined
    const pageEvent = PAGE_EVENTS[page];
    if (pageEvent) pageEvent();

    // Fire tool_accessed for tool pages
    if (tool) {
      trackEvent("tool_accessed", { tool });
    }
  }, [page, tool]);

  return null;
}
