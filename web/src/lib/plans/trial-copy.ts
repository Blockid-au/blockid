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
//   - Pre-charge email fires 72h (T-3 d, `trial-end-reminder`) before the
//     trial converts.
//   - Legacy free-tier users are grandfathered and untouched.

/**
 * Hours before trial end at which the pre-charge reminder is actually sent.
 *
 * G18-A (2026-09-19): the installed cron is `trial-end-reminder`
 * (crontab.production, hourly; window now+3d → now+3d+1h — "ends in 3 days"),
 * backed by Stripe's `customer.subscription.trial_will_end` (also T-3 d).
 * `trial-charge-warning` (48 h) exists but is NOT in the crontab, so the
 * public promise said "48h before" while the e-mail arrived at 72 h. The
 * copy now states the cadence that runs.
 */
export const TRIAL_WARNING_HOURS_BEFORE = 72;

/** Trial length in days. Must match plans.csv `trial_days` column. */
export const TRIAL_DAYS = 7;

export interface AfterTrialCopyArgs {
  planName: string;
  price: string; // e.g. "A$29"
  interval?: "month" | "year";
  /**
   * The plan's own trial length (plans.csv / `plans.trial_days`). G18-A:
   * the Programs rungs run 14 days, and the signup price line said
   * "After 7 days" for them. Defaults to TRIAL_DAYS.
   */
  trialDays?: number | null;
}

export const TRIAL_COPY = {
  headline: "7-day free trial — card required",
  subheadline:
    "Full access for 7 days. We only charge on day 8 if you keep going.",
  cta: "Start 7-day trial",
  cta_short: "Start trial",
  /**
   * G25-D (founder 2026-09-21): the submit button of the card-required
   * sign-up sits under a Review block and names what the click does —
   * "Add card & start 7-day trial" — for both ladders (the Programs rungs
   * run 14 days). Never "Start trial" on a button that takes a card.
   */
  cta_card: (trialDays?: number | null): string => `Add card & start ${normaliseTrialDays(trialDays)}-day trial`,
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
    return `After ${normaliseTrialDays(a.trialDays)} days, you'll pay ${a.price}${interval} for ${a.planName}. Cancel anytime.`;
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
  /**
   * Submit CTA for the selected plan's trial length. W4 review P3-b: the
   * Cohort 25 / 100 rungs run a 14-day trial and the button still said
   * "Start 7-day evaluator trial" — the CTA is a function of `trialDays`
   * now, like `evaluatorTrialLine`.
   */
  cta: (trialDays: number = TRIAL_DAYS): string => `Start ${normaliseTrialDays(trialDays)}-day evaluator trial`,
  account_type_label: "I evaluate startups as",
} as const;

/** A positive integer trial length, else the default. */
function normaliseTrialDays(trialDays: number | null | undefined): number {
  return typeof trialDays === "number" && Number.isInteger(trialDays) && trialDays > 0 ? trialDays : TRIAL_DAYS;
}

/**
 * The evaluator trial line for a specific plan's trial length — the Programs
 * rungs (accelerator_intake / Cohort 25 / Cohort 100) run a 14-day trial
 * (Pricing v4, 2026-09-16), so the signup page must not promise "7-day ·
 * charged on day 8" while the picker says 14. Same wording otherwise.
 */
export function evaluatorTrialLine(trialDays: number = TRIAL_DAYS): string {
  const days = normaliseTrialDays(trialDays);
  return `${days}-day free trial · card required · cancel anytime · charged on day ${days + 1}`;
}

/**
 * Release QA-2 F10 (matches S7-C, docs/plans/evaluator-traction §3b): the
 * evaluator trial includes ONE full Trusted Business Report for the whole 7 days —
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
  // Pricing v4 (2026-09-16): -1 = unlimited (report-quota.ts convention).
  investor_fund: -1,
  accelerator_intake: 40,
  accelerator_starter: 50,
  accelerator_growth: 200,
};

/**
 * "1 full Trusted Business Report included during the trial, then 10/month
 * on Scout" — or "then unlimited on Fund" for a -1 quota.
 */
export function evaluatorTrialIncludedLine(planId: string, planName: string): string {
  const monthly = EVALUATOR_MONTHLY_REPORTS[planId];
  const n = EVALUATOR_TRIAL_REPORT_ALLOWANCE;
  const head = `${n} full Trusted Business Report${n === 1 ? "" : "s"} included during the trial`;
  if (monthly === -1) return `${head}, then unlimited on ${planName}`;
  return monthly ? `${head}, then ${monthly}/month on ${planName}` : head;
}

/** Format an AUD cents amount as a display price string ("A$29" / "A$29.50"). */
export function formatAud(cents: number): string {
  const dollars = cents / 100;
  return `A$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}
