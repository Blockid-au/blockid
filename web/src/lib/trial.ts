// Trial-state helpers — shared between the Stripe webhook (which mutates
// subscription_trial_state) and any UI/API that needs to render a countdown
// or gate features based on trial status.
//
// The DB shape mirrors migration 0075_entitlements_audit.sql:
//
//   subscription_trial_state(
//     user_id uuid PK,
//     stripe_subscription_id text NOT NULL,
//     plan_id text NOT NULL,
//     trial_start timestamptz NOT NULL,
//     trial_end   timestamptz NOT NULL,
//     status text CHECK (status in ('trialing','active','past_due','canceled','ended')),
//     payment_method_id text,
//     reminder_sent jsonb NOT NULL DEFAULT '{}',
//     updated_at timestamptz
//   )

import type { UserWithPlan } from "@/lib/entitlements";

export type TrialStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "ended";

export interface SubscriptionTrialState {
  user_id: string;
  stripe_subscription_id: string;
  plan_id: string;
  trial_start: string | Date;
  trial_end: string | Date;
  status: TrialStatus;
  payment_method_id?: string | null;
  reminder_sent?: Record<string, unknown>;
  updated_at?: string | Date;
}

export interface TrialSummary {
  inTrial: boolean;
  daysLeft: number;
  endsAt: Date | null;
  requiresPayment: boolean;
  status: TrialStatus | null;
  planId: string | null;
}

// ---------------------------------------------------------------------------
// isInTrial — pure predicate. True only when status='trialing' AND trial_end
// is in the future. Callers should treat all other combinations as "not
// currently in a trial window" (either not started, active-paid, or expired).
// ---------------------------------------------------------------------------

export function isInTrial(state: SubscriptionTrialState | null): boolean {
  if (!state) return false;
  if (state.status !== "trialing") return false;
  const end = toDate(state.trial_end);
  if (!end) return false;
  return end.getTime() > Date.now();
}

// ---------------------------------------------------------------------------
// daysRemaining — ceiling of remaining days until trial_end. Returns 0 when
// the trial has already ended or the input is null.
// ---------------------------------------------------------------------------

export function daysRemaining(trial_end: string | Date | null): number {
  if (!trial_end) return 0;
  const end = toDate(trial_end);
  if (!end) return 0;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// trialSummary — the shape rendered by `/api/entitlement/me` for the UI.
// `requiresPayment` flips true when the trial is within 1 day of ending AND
// no payment_method_id has been captured (CTO spec §3 — card-required policy).
// ---------------------------------------------------------------------------

export function trialSummary(
  _user: UserWithPlan | null,
  state: SubscriptionTrialState | null,
): TrialSummary {
  if (!state) {
    return {
      inTrial: false,
      daysLeft: 0,
      endsAt: null,
      requiresPayment: false,
      status: null,
      planId: null,
    };
  }

  const endsAt = toDate(state.trial_end);
  const inTrial = isInTrial(state);
  const daysLeft = daysRemaining(state.trial_end);
  const requiresPayment =
    inTrial && daysLeft <= 1 && !state.payment_method_id;

  return {
    inTrial,
    daysLeft,
    endsAt,
    requiresPayment,
    status: state.status,
    planId: state.plan_id,
  };
}

// ---------------------------------------------------------------------------
// toDate — parse tolerant of both ISO string and Date input (Supabase returns
// strings; server code may have already deserialised).
// ---------------------------------------------------------------------------

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
