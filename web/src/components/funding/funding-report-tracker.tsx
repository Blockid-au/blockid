"use client";

/**
 * FundingReportTracker — fires the GA4 `funding_report_paid` event once when
 * a guest lands on `/funding/report/[id]?s=<stripe session>` straight from
 * Checkout (T0242). Signed-in rails fire the same event from the paywall
 * before navigating, so this only runs for the one-off path.
 */

import * as React from "react";
import { trackEvent } from "@/lib/analytics";
import { rememberGuestPaidReport } from "@/lib/funding/guest-paid-reports";

export function FundingReportTracker({ reportId, paidVia }: { reportId: string; paidVia: "one_off" | "credits" | "plan" }) {
  const fired = React.useRef(false);
  React.useEffect(() => {
    if (fired.current || typeof window === "undefined") return;
    fired.current = true;
    const q = new URLSearchParams(window.location.search);
    if (!q.get("s")) return;
    // T0247 — count the purchase for the "3rd A$3 report" Radar upsell on
    // /funding. Idempotent per report id; storage-safe.
    if (paidVia === "one_off") rememberGuestPaidReport(reportId);
    try {
      const key = `funding_report_paid:${reportId}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // storage blocked — fire anyway
    }
    trackEvent("funding_report_paid", { paid_via: paidVia, report_id: reportId });
  }, [reportId, paidVia]);
  return null;
}

export default FundingReportTracker;
