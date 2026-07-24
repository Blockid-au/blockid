// Canonical trial + billing copy — single source of truth for every
// surface that displays "7-day trial, card required" messaging.
//
// Rule: no hard-coded trial strings anywhere else in the codebase. If a
// surface needs different wording, add a new field here (do NOT inline).
//
// Referenced by:
//   - /pricing page + landing hero
//   - Signup page + checkout confirmation
//   - Dashboard trial banner + upgrade prompts
//   - Founder-pack + SVI report PDFs
//   - Welcome + trial-ending drip emails
//   - Marketing markdown under web/content/**
//
// Business decision (founder, 2026-07-24):
//   - No indefinite $0 tier for new signups.
//   - Every new signup = 7-day trial with payment card required upfront.
//   - Pre-charge email fires 48h before the trial converts.
//   - Legacy free-tier users are grandfathered and untouched.

/** Hours before trial end to send the pre-charge warning email. */
export const TRIAL_WARNING_HOURS_BEFORE = 48;

/** Trial length in days. Must match plans.csv `trial_days` column. */
export const TRIAL_DAYS = 7;

export interface AfterTrialCopyArgs {
  planName: string;
  price: string; // e.g. "A$29"
  interval?: "month" | "year";
}

export const TRIAL_COPY = {
  headline: "7-day free trial — card required",
  subheadline:
    "Full access for 7 days. We only charge on day 8 if you keep going.",
  cta: "Start 7-day trial",
  cta_short: "Start trial",
  fine_print:
    `Card required to prevent abuse. Cancel anytime. Email reminder ${TRIAL_WARNING_HOURS_BEFORE}h before we charge.`,
  card_required_reason:
    "We ask for a card upfront so free trials aren't abused — you will NOT be charged until day 8.",
  no_free_forever:
    "BlockID does not offer an indefinite free tier. Every plan starts with a 7-day trial.",
  legacy_free_grandfathered:
    "Signed up before July 2026 on our free tier? You keep your grandfathered access — this change only affects new signups.",

  /** After-trial line for a specific plan. */
  after_trial: (a: AfterTrialCopyArgs): string => {
    const interval = a.interval === "year" ? "/year" : "/mo";
    return `After 7 days, you'll pay ${a.price}${interval} for ${a.planName}. Cancel anytime.`;
  },

  /** Line rendered on the signup form beneath the card input. */
  card_disclosure: (trialEndDate: string): string =>
    `You will not be charged until ${trialEndDate}. We'll email you ${TRIAL_WARNING_HOURS_BEFORE}h before.`,

  /** Dashboard trial banner headline (day-of-trial + total). */
  banner_headline: (dayOfTrial: number, totalDays: number = TRIAL_DAYS): string =>
    `You're on day ${dayOfTrial} of ${totalDays} of your free trial.`,

  /** Dashboard banner sub-line. */
  banner_subline: (trialEndDate: string, price: string): string =>
    `Trial ends ${trialEndDate}. You'll be charged ${price} unless you cancel.`,

  /** Pre-charge email subject. */
  email_subject: (hoursLeft: number, price: string, dateStr: string): string =>
    `Your BlockID trial ends in ${hoursLeft} hours — you'll be charged ${price} on ${dateStr}`,
} as const;

/** Format an AUD cents amount as a display price string ("A$29" / "A$29.50"). */
export function formatAud(cents: number): string {
  const dollars = cents / 100;
  return `A$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}
