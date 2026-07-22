"use client";

// Track B B5 follow-up — download CTA per gallery card. Fires the
// `showcase_report_downloaded` GA4 event on click, then lets the browser
// follow the anchor to /api/guide/reports/[filename]. The anchor `download`
// attribute keeps the response body served as an attachment even if the
// browser mishandles Content-Disposition on cross-origin caches.

import { trackEvent } from "@/lib/analytics";

interface Props {
  filename: string;
  phase: number | null;
  className?: string;
}

export function ReportDownloadCta({ filename, phase, className }: Props) {
  const href = `/api/guide/reports/${encodeURIComponent(filename)}`;

  function handleClick() {
    trackEvent("showcase_report_downloaded", {
      template: filename,
      // AnalyticsEventMap requires a number; cross-cutting rows (phase===null)
      // report as 0 so GA4 audiences can still segment "unphased" downloads.
      phase: phase ?? 0,
    });
  }

  return (
    <a
      href={href}
      download={filename}
      onClick={handleClick}
      rel="nofollow"
      className={
        className ??
        "mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-600 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 dark:border-emerald-500 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
      }
    >
      Download .md
    </a>
  );
}
