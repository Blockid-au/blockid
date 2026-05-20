"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";
import type { AnalyticsEventMap } from "@/lib/analytics";

/**
 * Fires a single analytics event on mount. Renders nothing.
 * Use inside Server Components that need page-view tracking.
 */
export function PageViewTracker<E extends keyof AnalyticsEventMap>({
  event,
  params,
}: {
  event: E;
  params: AnalyticsEventMap[E];
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (!fired.current) {
      trackEvent(event, params);
      fired.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
