// Subscription state helpers — G18-D (Truth sweep, 2026-09-19).
//
// Pure functions shared by /workspace/billing (server page), the cancel /
// reactivate routes and the trial banner. No Stripe SDK import at runtime
// (types only) so the client bundle and the unit tests stay light.
//
// Vocabulary:
//   phase "trialing"          card on file, first charge on `trialEnd`;
//                             cancelling ends the trial NOW, no charge.
//   phase "active"/"past_due" paid; cancelling schedules the end of access
//                             at `currentPeriodEnd` (no refund — /legal/terms#refunds).
//   phase "cancel_scheduled"  cancel_at_period_end = true; "Resume" clears it.
//   phase "canceled"/"none"   nothing to cancel (Free, expired, deleted).

import type Stripe from "stripe";

export type SubscriptionPhase =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "cancel_scheduled"
  | "canceled";

/** The Stripe-mirrored inputs (subscription_trial_state row or a live Stripe.Subscription, normalised). */
export interface SubscriptionSnapshot {
  subscriptionId: string | null;
  planId: string | null;
  status: string | null;
  /** ISO timestamps (null when unknown). */
  trialStart: string | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentMethodSaved: boolean;
}

export interface BillingSubscriptionView extends SubscriptionSnapshot {
  phase: SubscriptionPhase;
  /** Whole days until trial_end (0 when not trialing or already past). */
  trialDaysLeft: number;
  /** Trialing: the first-charge date (= trialEnd). Active: the renewal date. Cancel scheduled: the access-end date. */
  nextChargeOn: string | null;
  /** When access ends if the user cancels now (trial → today; active → period end). */
  accessEndsOnCancel: string | null;
  canCancel: boolean;
  canResume: boolean;
}

const LIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

/** Whole-day countdown, ceil'd like /api/stripe/trial-status. */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - now.getTime()) / 86_400_000));
}

/**
 * Trial length in whole days from Stripe's own trial_start / trial_end —
 * what checkout's `trial_period_days` (= plans.trial_days) produced. The
 * unit test asserts this equals the plan row's trial_days for a fixture.
 */
export function trialLengthDays(snap: Pick<SubscriptionSnapshot, "trialStart" | "trialEnd">): number | null {
  if (!snap.trialStart || !snap.trialEnd) return null;
  const a = new Date(snap.trialStart).getTime();
  const b = new Date(snap.trialEnd).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Classify a snapshot into the phase the billing UI renders. */
export function describeSubscription(
  snap: SubscriptionSnapshot | null | undefined,
  now: Date = new Date(),
): BillingSubscriptionView {
  const base: SubscriptionSnapshot = snap ?? {
    subscriptionId: null,
    planId: null,
    status: null,
    trialStart: null,
    trialEnd: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    paymentMethodSaved: false,
  };

  const status = base.status;
  let phase: SubscriptionPhase = "none";
  if (status && LIVE_STATUSES.has(status)) {
    if (base.cancelAtPeriodEnd) phase = "cancel_scheduled";
    else if (status === "trialing") phase = "trialing";
    else if (status === "past_due") phase = "past_due";
    else phase = "active";
  } else if (status === "canceled" || status === "trial_ended_no_payment" || status === "incomplete_expired") {
    phase = "canceled";
  }

  // A trial whose end has passed but whose mirror still says trialing is a
  // stale mirror — treat as active for the countdown (0 days), never negative.
  const trialDaysLeft = status === "trialing" ? daysUntil(base.trialEnd, now) : 0;

  const periodEnd = base.currentPeriodEnd ?? base.trialEnd ?? null;
  let nextChargeOn: string | null = null;
  let accessEndsOnCancel: string | null = null;
  switch (phase) {
    case "trialing":
      nextChargeOn = base.trialEnd;
      accessEndsOnCancel = now.toISOString();
      break;
    case "active":
    case "past_due":
      nextChargeOn = periodEnd;
      accessEndsOnCancel = periodEnd;
      break;
    case "cancel_scheduled":
      // No further charge; access ends at the period (or trial) end.
      nextChargeOn = null;
      accessEndsOnCancel = periodEnd;
      break;
    default:
      break;
  }

  return {
    ...base,
    phase,
    trialDaysLeft,
    nextChargeOn,
    accessEndsOnCancel,
    canCancel: phase === "trialing" || phase === "active" || phase === "past_due",
    canResume: phase === "cancel_scheduled",
  };
}

// ---------------------------------------------------------------------------
// Stripe object → snapshot
// ---------------------------------------------------------------------------

type SubscriptionLike = Pick<Stripe.Subscription, "id" | "status" | "cancel_at_period_end"> & {
  trial_start?: number | null;
  trial_end?: number | null;
  /** Pre-2025 API versions carried current_period_end on the subscription. */
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null; price?: { id?: string; lookup_key?: string | null } | null }> };
  metadata?: Record<string, string> | null;
  default_payment_method?: unknown;
};

const toIso = (secs: number | null | undefined): string | null =>
  typeof secs === "number" && secs > 0 ? new Date(secs * 1000).toISOString() : null;

/** Item-level current_period_end (2025+ API) with the legacy top-level fallback. */
export function currentPeriodEndOf(sub: SubscriptionLike): number | null {
  const item = sub.items?.data?.[0];
  return item?.current_period_end ?? sub.current_period_end ?? null;
}

/** Plan id stamped on the subscription by checkout / register-with-card, if any. */
export function planIdFromSubscriptionMetadata(sub: SubscriptionLike): string | null {
  const meta = sub.metadata ?? {};
  for (const key of ["plan_id", "blockid_plan"]) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Normalise a live Stripe subscription into the mirror shape. `planId` wins over metadata. */
export function snapshotFromStripe(
  sub: SubscriptionLike,
  opts: { planId?: string | null; paymentMethodSaved?: boolean } = {},
): SubscriptionSnapshot {
  return {
    subscriptionId: sub.id,
    planId: opts.planId ?? planIdFromSubscriptionMetadata(sub),
    status: sub.status ?? null,
    trialStart: toIso(sub.trial_start),
    trialEnd: toIso(sub.trial_end),
    currentPeriodEnd: toIso(currentPeriodEndOf(sub)),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    paymentMethodSaved: opts.paymentMethodSaved ?? Boolean(sub.default_payment_method),
  };
}

/** Normalise a subscription_trial_state row. */
export function snapshotFromMirrorRow(
  row:
    | {
        stripe_subscription_id?: string | null;
        plan_id?: string | null;
        status?: string | null;
        trial_start?: string | null;
        trial_end?: string | null;
        current_period_end?: string | null;
        cancel_at_period_end?: boolean | null;
        payment_method_saved?: boolean | null;
      }
    | null
    | undefined,
): SubscriptionSnapshot | null {
  if (!row) return null;
  return {
    subscriptionId: row.stripe_subscription_id ?? null,
    planId: row.plan_id ?? null,
    status: row.status ?? null,
    trialStart: row.trial_start ?? null,
    trialEnd: row.trial_end ?? null,
    currentPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    paymentMethodSaved: Boolean(row.payment_method_saved),
  };
}

/**
 * The subscription a cancel / resume acts on: the live one (trialing,
 * active, past_due), newest first. Canceled / incomplete ones are ignored so
 * a customer with an old canceled sub plus a fresh trial cancels the trial.
 */
export function pickLiveSubscription<T extends { status: string; created?: number }>(subs: T[]): T | null {
  const live = subs.filter((s) => LIVE_STATUSES.has(s.status));
  if (live.length === 0) return null;
  const rank = (s: T) => (s.status === "trialing" ? 0 : s.status === "active" ? 1 : 2);
  return [...live].sort((a, b) => rank(a) - rank(b) || (b.created ?? 0) - (a.created ?? 0))[0] ?? null;
}

/** en-AU date for the billing copy ("Fri 26 Sep 2026"). */
export function formatBillingDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
