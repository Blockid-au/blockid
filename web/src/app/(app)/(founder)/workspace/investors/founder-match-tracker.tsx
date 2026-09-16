"use client";

// Fires the GA4 `founder_match_viewed` event once per page view (BA spec
// §C.5, G13-W3-T2). Renders nothing.

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

export function FounderMatchTracker({ matches, source }: { matches: number; source: "mandates" | "prefs" | "mixed" | "none" }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("founder_match_viewed", { matches, source });
  }, [matches, source]);
  return null;
}
