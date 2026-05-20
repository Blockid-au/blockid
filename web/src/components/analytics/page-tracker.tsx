"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

interface PageTrackerProps {
  page: string;
  tool?: string;
}

export function PageTracker({ page, tool }: PageTrackerProps) {
  useEffect(() => {
    if (tool) {
      trackEvent("tool_accessed", { tool });
    }
  }, [page, tool]);

  return null;
}
