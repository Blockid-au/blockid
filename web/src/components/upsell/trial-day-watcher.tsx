// <TrialDayWatcher> — silent client-side arm for the trial-day nudges
// (T-0412). Renders nothing; on mount, calls /api/stripe/trial-status and,
// when the user is trialing with <=2 days left, fires the matching
// useUpgradePrompt trigger so the modal + banner have a live signal.
//
// Days-left → trigger mapping:
//   2 → trial_day_5
//   1 → trial_day_6
//   0 → trial_day_7
//
// Higher day counts arm nothing. Fetch failures are swallowed.

"use client";

import * as React from "react";

import { useUpgradePrompt, type UpgradeTrigger } from "@/hooks/useUpgradePrompt";

interface TrialStatusResponse {
  ok?: boolean;
  inTrial?: boolean;
  daysLeft?: number;
  days_remaining?: number;
  trialEnd?: string | null;
}

function triggerFor(daysLeft: number): UpgradeTrigger | null {
  if (daysLeft <= 0) return "trial_day_7";
  if (daysLeft === 1) return "trial_day_6";
  if (daysLeft === 2) return "trial_day_5";
  return null;
}

export interface TrialDayWatcherProps {
  children?: never;
}

export function TrialDayWatcher(_props: TrialDayWatcherProps = {}): null {
  const prompt = useUpgradePrompt();
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (firedRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/stripe/trial-status", {
          method: "GET",
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const body = (await res.json()) as TrialStatusResponse;
        if (cancelled) return;
        if (!body || body.inTrial === false) return;

        const days =
          typeof body.days_remaining === "number"
            ? body.days_remaining
            : typeof body.daysLeft === "number"
              ? body.daysLeft
              : NaN;
        if (!Number.isFinite(days)) return;

        const trigger = triggerFor(days);
        if (!trigger) return;

        firedRef.current = true;
        prompt.request(trigger, { days_remaining: days });
      } catch {
        // Silent — analytics-only surface, never break UX.
      }
    })();

    return () => {
      cancelled = true;
    };
    // Prompt object is stable enough for a mount-once effect; deliberately
    // no deps so we don't refire on rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default TrialDayWatcher;
