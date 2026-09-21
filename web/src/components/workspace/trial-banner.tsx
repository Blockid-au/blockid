"use client";

// TrialBanner — persistent header banner for trialing users.
//
// Renders nothing when the caller is not in a trial (or when the trial has
// already ended).  When active, colour and copy escalate as trial_end nears
// (`daysLeft` counts DOWN from plans.trial_days to 0):
//
//   > 4 days left  →  neutral surface (no urgency)
//   3-4 days left  →  amber  (nudge)
//   ≤ 2 days left  →  red    (last-mile — card will be charged soon)
//
// G18-D (2026-09-19): the thresholds were inverted (`daysLeft >= 6` painted
// day 1 of a 7-day trial red and the last day blue); the "Cancel Trial"
// button POSTed /api/stripe/cancel, which listed only active subscriptions
// and so silently 404'd for every trial. Cancelling now goes through the
// one confirm flow on /workspace/billing#cancel (exit survey, trial ends
// now, no charge).
//
// Dismiss button hides the banner for the rest of the calendar day via a
// localStorage key (`dismissed_trial_banner_YYYY-MM-DD`) so it re-appears on
// each new day right up to the trial-end date.

import * as React from "react";
import Link from "next/link";

import { PLANS_V2 } from "@/lib/plans-v2";
import { evaluatorPlanLabel } from "@/lib/plans/signup-plans";

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

/**
 * Banner message for a trialing user. Exported for the colocated test.
 *
 * Evaluator rungs (investor_angel / investor_advisor / investor_vc_small)
 * name the plan under its public label (Scout / Firm / Program) so an
 * evaluator sees "Card will be charged A$79 for Scout on …"; founder plans
 * keep the original wording. Price comes from PLANS_V2 (monthly_aud).
 */
export function buildTrialBannerMessage(args: {
  daysLeft: number;
  planId: string | null | undefined;
  endDate: string;
  monthlyPrice?: number | null;
}): string {
  const monthlyPrice =
    args.monthlyPrice === undefined ? lookupMonthlyPrice(args.planId) : args.monthlyPrice;
  const daysLabel = args.daysLeft === 1 ? "1 day left" : args.daysLeft + " days left";
  const evaluatorName = evaluatorPlanLabel(args.planId);
  const forPlan = evaluatorName ? " for " + evaluatorName : "";
  const trialLabel = evaluatorName
    ? " in your free " + evaluatorName + " trial."
    : " in your free trial.";
  const priceCopy =
    monthlyPrice != null
      ? " Card will be charged A$" + monthlyPrice + forPlan + " on " + args.endDate + "."
      : " Your" + (evaluatorName ? " " + evaluatorName : "") + " subscription will begin on " + args.endDate + ".";
  return daysLabel + trialLabel + priceCopy;
}

/** Tone class for the countdown — exported for the colocated test. */
export function trialBannerTone(daysLeft: number): "neutral" | "amber" | "red" {
  if (daysLeft <= 2) return "red";
  if (daysLeft <= 4) return "amber";
  return "neutral";
}

/**
 * The trial-truth suffix: card on file, first charge on the end date,
 * cancel before then for no charge — or the scheduled-cancel state.
 */
export function trialBannerSuffix(args: { cancelAtPeriodEnd?: boolean; endDate: string }): string {
  return args.cancelAtPeriodEnd
    ? " Cancellation scheduled — you keep access until " + args.endDate + " and will not be charged."
    : " Cancel any time before then — no charge.";
}

export function TrialBanner(): React.ReactElement | null {
  const [status, setStatus] = React.useState<TrialStatusResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);

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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read per-day dismiss flag from localStorage after mount (SSR-safe)
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

  const endDate = formatEndDate(status.trialEnd);

  // Escalate the visual tone as trial-end approaches (daysLeft counts down).
  const tone = trialBannerTone(daysLeft);
  const toneClass =
    tone === "red"
      ? "bg-red-100/70 border-red-500 text-red-900"
      : tone === "amber"
        ? "bg-amber-100/70 border-amber-400 text-amber-900"
        : "bg-blue-50 border-blue-300 text-blue-900";

  const message = buildTrialBannerMessage({ daysLeft, planId: status.planId, endDate });

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

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        "border-b px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 " +
        toneClass
      }
    >
      <span className="text-sm font-medium flex-1" data-testid="trial-banner-message" data-tone={tone}>
        {message}
        {trialBannerSuffix({ cancelAtPeriodEnd: status.cancelAtPeriodEnd, endDate })}
      </span>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/workspace/billing"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/70 hover:bg-white ring-1 ring-current/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          Choose Plan
        </Link>
        {!status.cancelAtPeriodEnd ? (
          <Link
            href="/workspace/billing#cancel"
            data-testid="trial-banner-cancel"
            className="text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-white/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            Cancel trial
          </Link>
        ) : null}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss trial banner for today"
          className="text-xs font-medium px-2 py-1.5 rounded-lg hover:bg-white/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
