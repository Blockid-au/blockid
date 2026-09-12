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

  /**
   * T-3d reminder body line (card-required trial — the card is already on
   * file, so the ask is "cancel before X if you don't want to be charged",
   * never "add a payment method"). `price` is null when the plan price
   * could not be resolved.
   */
  reminder_body: (a: { planName: string; price: string | null; dateStr: string }): string =>
    a.price
      ? `Your BlockID ${a.planName} trial ends in 3 days. Your card will be charged ${a.price} on ${a.dateStr} unless you cancel before then.`
      : `Your BlockID ${a.planName} trial ends in 3 days. Your card will be charged on ${a.dateStr} unless you cancel before then.`,

  /** T-3d reminder footnote — how to avoid the charge. */
  reminder_footnote: (dateStr: string): string =>
    `Don't want to continue? Cancel any time before ${dateStr} from Billing and nothing will be charged. You keep full access until then.`,
} as const;

/**
 * Evaluator-segment copy for `/signup?segment=evaluator` — investors,
 * accelerators / incubators, advisors / consulting firms, service providers.
 * Same card-required 7-day mechanism as founders (founder decision D1,
 * 2026-09-10); different headline (docs/plans/evaluator-traction-2026-09-10.md
 * §5 "Pricing card headline").
 */
export const EVALUATOR_TRIAL_COPY = {
  headline: "Evaluate any Australian startup for A$3. Track it from A$79 a month.",
  subheadline:
    "One rubric, a whole C-suite, the startup's own evidence — Australian context, from A$3 a report.",
  trial_line: "7-day free trial · card required · cancel anytime · charged on day 8",
  cta: "Start 7-day evaluator trial",
  account_type_label: "I evaluate startups as",
} as const;

/**
 * Release QA-2 F10 (matches S7-C, docs/plans/evaluator-traction §3b): the
 * evaluator trial includes ONE full Trust BizReport for the whole 7 days —
 * not the plan's monthly quota, which starts on day 8. Both the pricing
 * card and the signup trial step must say so, in the same words. The
 * numbers mirror plans.csv `usage_limits.reports_per_month` (Scout 10 /
 * Firm 30 / Program 100); `report-quota.ts` is server-only, hence the
 * client-safe copy here.
 */
export const EVALUATOR_TRIAL_REPORT_ALLOWANCE = 1;

export const EVALUATOR_MONTHLY_REPORTS: Readonly<Record<string, number>> = {
  investor_angel: 10,
  investor_advisor: 30,
  investor_vc_small: 100,
};

/** "1 full Trust BizReport included during the trial, then 10/month on Scout". */
export function evaluatorTrialIncludedLine(planId: string, planName: string): string {
  const monthly = EVALUATOR_MONTHLY_REPORTS[planId];
  const n = EVALUATOR_TRIAL_REPORT_ALLOWANCE;
  const head = `${n} full Trust BizReport${n === 1 ? "" : "s"} included during the trial`;
  return monthly ? `${head}, then ${monthly}/month on ${planName}` : head;
}

/** Format an AUD cents amount as a display price string ("A$29" / "A$29.50"). */
export function formatAud(cents: number): string {
  const dollars = cents / 100;
  return `A$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}
