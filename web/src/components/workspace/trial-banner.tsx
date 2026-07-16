"use client";

// TrialBanner — persistent header banner for trialing users.
//
// Renders nothing when the caller is not in a trial (or when the trial has
// already ended).  When active, colour and copy escalate as trial_end nears:
//
//   day 1-2  →  neutral surface (no urgency)
//   day 3-5  →  amber  (nudge)
//   day 6-7  →  red    (last-mile — card will be charged soon)
//
// Dismiss button hides the banner for the rest of the calendar day via a
// localStorage key (`dismissed_trial_banner_YYYY-MM-DD`) so it re-appears on
// each new day right up to the trial-end date.

import * as React from "react";
import Link from "next/link";

import { PLANS_V2 } from "@/lib/plans-v2";

interface TrialStatusResponse {
  ok?: boolean;
  inTrial?: boolean;
  daysLeft?: number;
  trialEnd?: string | null;
  planId?: string | null;
  status?: string | null;
  requiresPayment?: boolean;
  cancelAtPeriodEnd?: boolean;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return "dismissed_trial_banner_" + y + "-" + m + "-" + day;
}

function formatEndDate(iso: string | null | undefined): string {
  if (!iso) return "the end of your trial";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "the end of your trial";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function lookupMonthlyPrice(planId: string | null | undefined): number | null {
  if (!planId) return null;
  try {
    const plan = PLANS_V2.find((p) => p.id === planId);
    return plan?.monthly_aud ?? null;
  } catch {
    return null;
  }
}

export function TrialBanner(): React.ReactElement | null {
  const [status, setStatus] = React.useState<TrialStatusResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  React.useEffect(() => {
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
        const json = (await res.json()) as TrialStatusResponse;
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

  React.useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const flag = window.localStorage.getItem(todayKey());
      if (flag === "1") setDismissed(true);
    } catch {
      // localStorage blocked (private mode / SSR) — treat as not dismissed.
    }
  }, []);

  if (loading || !status) return null;
  if (!status.inTrial) return null;

  const daysLeft = status.daysLeft ?? 0;
  if (daysLeft <= 0) return null;
  if (dismissed) return null;

  const monthlyPrice = lookupMonthlyPrice(status.planId);
  const endDate = formatEndDate(status.trialEnd);

  // Escalate the visual tone as trial-end approaches.
  let toneClass = "bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-100";
  if (daysLeft >= 6) {
    toneClass = "bg-red-100/70 border-red-500 text-red-900 dark:bg-red-900/40 dark:border-red-600 dark:text-red-100";
  } else if (daysLeft >= 3) {
    toneClass = "bg-amber-100/70 border-amber-400 text-amber-900 dark:bg-amber-900/40 dark:border-amber-600 dark:text-amber-100";
  }

  const daysLabel = daysLeft === 1 ? "1 day left" : daysLeft + " days left";
  const priceCopy =
    monthlyPrice != null
      ? " Card will be charged A$" + monthlyPrice + " on " + endDate + "."
      : " Your subscription will begin on " + endDate + ".";

  const message = daysLabel + " in your free trial." + priceCopy;

  async function handleDismiss(): Promise<void> {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(todayKey(), "1");
      }
    } catch {
      // ignore quota / private-mode errors — dismiss is per-tab regardless
    }
    setDismissed(true);
  }

  async function handleCancel(): Promise<void> {
    if (cancelling) return;
    const ok =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "Cancel your free trial? You'll keep access until " + endDate + ", but your card won't be charged.",
          );
    if (!ok) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "trial_banner_cancel" }),
      });
      if (res.ok) {
        setStatus((prev) => (prev ? { ...prev, cancelAtPeriodEnd: true } : prev));
      }
    } catch {
      // Non-fatal; user can retry via Billing page.
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "border-b px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 " +
        toneClass
      }
    >
      <span className="text-sm font-medium flex-1">
        {message}
        {status.cancelAtPeriodEnd
          ? " Cancellation scheduled — you keep access until " + endDate + "."
          : null}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/workspace/billing"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white ring-1 ring-current/20 transition-colors"
        >
          Choose Plan
        </Link>
        {!status.cancelAtPeriodEnd ? (
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {cancelling ? "Cancelling…" : "Cancel Trial"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss trial banner for today"
          className="text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-white/40 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
