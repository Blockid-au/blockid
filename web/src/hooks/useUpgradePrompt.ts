// useUpgradePrompt — trigger the CRO upgrade CTA from a client component.
//
// The hook keeps a session-scoped counter in sessionStorage so we can
// respect the 1-per-session cap without a server roundtrip, then
// posts to /api/conversion/track so the CDO funnel can compute lift.
// Cool-downs per trigger are enforced server-side; this hook is a
// best-effort client throttle.

"use client";

import * as React from "react";

const SESSION_KEY = "blockid_upgrade_shown_v1";
const COOLDOWN_KEY_PREFIX = "blockid_upgrade_cooldown_v1:";
const SESSION_CAP = 1;

export type UpgradeTrigger =
  | "feature_gate_hit"
  | "trial_day_5"
  | "trial_day_6"
  | "trial_day_7"
  | "credits_low"
  | "credits_exhausted"
  | "report_cap_hit"
  | "watchlist_cap_hit"
  | "cohort_seat_cap_hit"
  | "post_cancel_winback";

const CLIENT_COOLDOWN_MS: Record<UpgradeTrigger, number> = {
  feature_gate_hit: 24 * 3600 * 1000,
  trial_day_5: 24 * 3600 * 1000,
  trial_day_6: 24 * 3600 * 1000,
  trial_day_7: 24 * 3600 * 1000,
  credits_low: 12 * 3600 * 1000,
  credits_exhausted: 24 * 3600 * 1000,
  report_cap_hit: 24 * 3600 * 1000,
  watchlist_cap_hit: 24 * 3600 * 1000,
  cohort_seat_cap_hit: 24 * 3600 * 1000,
  post_cancel_winback: 7 * 24 * 3600 * 1000,
};

const COUNTS_TOWARDS_CAP: Record<UpgradeTrigger, boolean> = {
  feature_gate_hit: true,
  trial_day_5: false,
  trial_day_6: false,
  trial_day_7: false,
  credits_low: true,
  credits_exhausted: true,
  report_cap_hit: true,
  watchlist_cap_hit: true,
  cohort_seat_cap_hit: true,
  post_cancel_winback: false,
};

function readSessionShown(): number {
  if (typeof window === "undefined") return 0;
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? Number(raw) : 0;
}

function bumpSessionShown() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, String(readSessionShown() + 1));
}

function isCoolingDown(trigger: UpgradeTrigger): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(COOLDOWN_KEY_PREFIX + trigger);
  if (!raw) return false;
  const stamped = Number(raw);
  return Date.now() - stamped < CLIENT_COOLDOWN_MS[trigger];
}

function stampCooldown(trigger: UpgradeTrigger) {
  if (typeof window === "undefined") return;
  localStorage.setItem(COOLDOWN_KEY_PREFIX + trigger, String(Date.now()));
}

async function track(trigger: UpgradeTrigger, action: "shown" | "accepted" | "dismissed" | "snoozed", detail?: Record<string, unknown>) {
  try {
    await fetch("/api/conversion/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger, action, detail }),
      keepalive: true,
    });
  } catch {
    // swallow — analytics failures never break UX
  }
}

export interface UpgradePromptState {
  trigger: UpgradeTrigger | null;
  request(t: UpgradeTrigger, detail?: Record<string, unknown>): boolean;
  accept(nextPlan?: string): void;
  dismiss(): void;
  snooze(): void;
}

export function useUpgradePrompt(): UpgradePromptState {
  const [trigger, setTrigger] = React.useState<UpgradeTrigger | null>(null);
  const detailRef = React.useRef<Record<string, unknown> | undefined>(undefined);

  const request = React.useCallback((t: UpgradeTrigger, detail?: Record<string, unknown>): boolean => {
    if (isCoolingDown(t)) return false;
    if (COUNTS_TOWARDS_CAP[t] && readSessionShown() >= SESSION_CAP) return false;
    detailRef.current = detail;
    if (COUNTS_TOWARDS_CAP[t]) bumpSessionShown();
    stampCooldown(t);
    setTrigger(t);
    void track(t, "shown", detail);
    return true;
  }, []);

  const accept = React.useCallback((nextPlan?: string) => {
    if (!trigger) return;
    void track(trigger, "accepted", { ...detailRef.current, next_plan: nextPlan });
    setTrigger(null);
  }, [trigger]);

  const dismiss = React.useCallback(() => {
    if (!trigger) return;
    void track(trigger, "dismissed", detailRef.current);
    setTrigger(null);
  }, [trigger]);

  const snooze = React.useCallback(() => {
    if (!trigger) return;
    void track(trigger, "snoozed", detailRef.current);
    setTrigger(null);
  }, [trigger]);

  return { trigger, request, accept, dismiss, snooze };
}
