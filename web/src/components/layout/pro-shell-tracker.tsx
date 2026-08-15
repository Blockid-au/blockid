"use client";

import { useEffect } from "react";

/**
 * Fires GA4 `page_view` on mount for every route rendered through the
 * landing variant of {@link ProShell}. Uses the ambient `window.gtag`
 * exposed by the root layout's GoogleAnalytics component; renders and
 * does nothing when GA isn't loaded.
 */
export function ProShellNavLandingTracker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void })
      .gtag;
    if (typeof gtag !== "function") return;
    gtag("event", "page_view", {
      page_path: window.location.pathname + window.location.search,
      page_location: window.location.href,
      shell: "pro-landing",
    });
  }, []);
  return null;
}
