"use client";

/**
 * TrialCountdownBanner — thin urgency strip mounted above <main> in the
 * workspace layout. Only appears when the caller is trialing and there
 * are <= 3 days remaining.
 *
 * Colour ramp:
 *   > 1 day  →  amber (nudge)
 *   = 1 day  →  red   (last day)
 *   = 0 days →  red + "Trial ends today"
 *
 * Frequency cap: session-scoped dismissal via sessionStorage so it
 * doesn't reappear the same visit but returns tomorrow.
 *
 * GA4: `trial_banner_view` fires once per session, `trial_banner_dismiss`
 * on close.
 */

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, X, ArrowRight } from "lucide-react";

interface TrialStatus {
  ok?: boolean;
  inTrial?: boolean;
  daysLeft?: number;
  trialEnd?: string | null;
  requiresPayment?: boolean;
  planId?: string | null;
}

const DISMISS_KEY = "bid_trial_countdown_dismissed_v1";
const VIEW_KEY = "bid_trial_countdown_viewed_v1";
const MAX_DAYS = 3;

function fireGa(event: string, params: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
  };
  try {
    w.gtag?.("event", event, params);
  } catch {
    /* ignore */
  }
  try {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ...params });
  } catch {
    /* ignore */
  }
}

function readSession(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSession(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

export function TrialCountdownBanner(): React.ReactElement | null {
  const [status, setStatus] = React.useState<TrialStatus | null>(null);
  const [dismissed, setDismissed] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const viewFired = React.useRef(false);

  React.useEffect(() => {
    setDismissed(readSession(DISMISS_KEY));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/trial-status", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as TrialStatus;
        if (!cancelled) {
          setStatus(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inTrial = !!status?.inTrial;
  const daysLeft = Math.max(0, Math.floor(status?.daysLeft ?? 0));
  const shouldShow =
    !loading && !dismissed && inTrial && daysLeft <= MAX_DAYS;

  React.useEffect(() => {
    if (!shouldShow || viewFired.current) return;
    if (readSession(VIEW_KEY)) {
      viewFired.current = true;
      return;
    }
    viewFired.current = true;
    writeSession(VIEW_KEY);
    fireGa("trial_banner_view", {
      days_left: daysLeft,
      plan_id: status?.planId ?? null,
    });
  }, [shouldShow, daysLeft, status?.planId]);

  if (!shouldShow) return null;

  const urgent = daysLeft <= 1;
  const toneClass = urgent
    ? "bg-red-600 text-white border-red-700"
    : "bg-amber-500 text-amber-950 border-amber-600";

  const copy =
    daysLeft === 0
      ? "Trial ends today — add a payment method to keep your workspace."
      : daysLeft === 1
        ? "Trial ends tomorrow — add a payment method to avoid interruption."
        : `Trial ends in ${daysLeft} days — add a payment method any time.`;

  const handleDismiss = () => {
    writeSession(DISMISS_KEY);
    setDismissed(true);
    fireGa("trial_banner_dismiss", { days_left: daysLeft });
  };

  return (
    <div
      role="region"
      aria-label="Trial countdown"
      className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm font-medium ${toneClass}`}
    >
      <p className="flex items-center gap-2">
        <AlertTriangle
          strokeWidth={1.75}
          aria-hidden="true"
          className="h-4 w-4 shrink-0"
        />
        <span>{copy}</span>
      </p>
      <div className="flex items-center gap-2">
        <Link
          href="/workspace/billing"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/95 px-3 text-xs font-semibold text-ink-800 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          Add payment method
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss trial countdown"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg opacity-80 transition-colors hover:bg-white/15 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default TrialCountdownBanner;
