// GST A$75,000 threshold detector.
//
// ATO rule (retrieved 2026):
//   https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
//
// You must register for GST when your business:
//   - has a GST turnover of A$75,000 or more (current GST turnover — sum
//     of the current month's turnover plus the previous 11 months); OR
//   - your projected GST turnover for the current + next 11 months is
//     A$75,000 or more.
//
// Registration must occur within 21 days of realising the threshold has
// been (or will be) crossed. Failure carries backdated GST liability +
// penalties.
//
// This module is a threshold detector, not a BAS engine. It does not
// account for input-tax-credit-only supplies, sales of a going concern,
// or GST-free exports — those cases need a registered tax agent.

export const GST_DISCLAIMER =
  "Not tax advice — GST turnover rules exclude certain supplies (input-taxed, sale of a going concern, GST-free exports). Confirm with a registered tax agent or the ATO GST helpline before relying on this figure.";

export const GST_THRESHOLD_AUD = 75_000 as const;
export const GST_REGISTRATION_WINDOW_DAYS = 21 as const;

export interface GSTInput {
  monthly_turnover_last_12_months: number[];
  projected_next_12_months?: number[];
  registered_for_gst: boolean;
  /** ISO date the business registered — informational only. */
  registration_date?: string;
  abn?: string;
}

export type GSTActionRequired =
  | "none"
  | "register_within_21_days"
  | "urgent_register"
  | "already_registered";

export type GSTUrgency = "ok" | "warning" | "critical";

export interface GSTResult {
  actual_12mo_turnover_aud: number;
  projected_12mo_turnover_aud: number;
  threshold_aud: typeof GST_THRESHOLD_AUD;
  is_above_threshold: boolean;
  /**
   * Estimated days until the projected 12-month turnover crosses the
   * A$75k threshold. Undefined when already crossed OR when there is no
   * projection that ever reaches the threshold within the horizon.
   */
  will_cross_threshold_within_days?: number;
  action_required: GSTActionRequired;
  urgency: GSTUrgency;
  reasoning: string;
  disclaimer: string;
}

function sum(numbers: readonly number[]): number {
  return numbers.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
}

/**
 * Compute the earliest day within the projection horizon at which the
 * rolling projected turnover (current + prior 11 months from the founder's
 * "today") reaches the threshold. We treat each monthly figure as evenly
 * accruing over 30 days.
 */
function daysUntilCrossing(
  actualLast12: readonly number[],
  projectedNext12: readonly number[],
  threshold: number,
): number | undefined {
  if (actualLast12.length === 0 && projectedNext12.length === 0)
    return undefined;

  // Accrue day-by-day using the projection stream; drop the oldest
  // actual-month value as each 30-day chunk of projection is consumed.
  const window = [...actualLast12].slice(-11); // last 11 actual months
  const days = projectedNext12.length * 30;

  let runningTail = sum(window); // months 1..11
  for (let d = 1; d <= days; d += 1) {
    const projIdx = Math.floor((d - 1) / 30);
    const dailyProj = (projectedNext12[projIdx] ?? 0) / 30;

    // Every 30 days we roll off the oldest window month, replaced by the
    // preceding projection month for subsequent calculations.
    if (d > 1 && (d - 1) % 30 === 0) {
      if (window.length > 0) {
        runningTail -= window.shift() ?? 0;
      }
    }

    const currentMonthAccrued =
      (dailyProj * ((d - 1) % 30 + 1));
    const rolling = runningTail + currentMonthAccrued;
    if (rolling >= threshold) return d;
  }
  return undefined;
}

export function assessGST(input: GSTInput, now: Date = new Date()): GSTResult {
  const actual = Array.isArray(input.monthly_turnover_last_12_months)
    ? input.monthly_turnover_last_12_months
    : [];
  const projected = Array.isArray(input.projected_next_12_months)
    ? input.projected_next_12_months
    : [];

  const actualLast12 = actual.slice(-12);
  const actualTotal = sum(actualLast12);

  const projectedTotal = projected.length > 0 ? sum(projected.slice(0, 12)) : 0;

  const isAbove =
    actualTotal >= GST_THRESHOLD_AUD || projectedTotal >= GST_THRESHOLD_AUD;

  let action: GSTActionRequired;
  let urgency: GSTUrgency;
  let reasoning: string;

  if (input.registered_for_gst) {
    action = "already_registered";
    urgency = "ok";
    reasoning = `Registered${input.registration_date ? ` on ${input.registration_date}` : ""}${input.abn ? ` under ABN ${input.abn}` : ""}. Continue lodging BAS on your ATO cycle.`;
  } else if (actualTotal >= GST_THRESHOLD_AUD) {
    action = "urgent_register";
    urgency = "critical";
    reasoning = `Actual 12-month turnover A$${actualTotal.toLocaleString("en-AU", { maximumFractionDigits: 0 })} is already at or above the A$75,000 threshold. ATO requires registration within 21 days of realising the threshold has been crossed — backdated GST liability may apply.`;
  } else if (projectedTotal >= GST_THRESHOLD_AUD) {
    action = "register_within_21_days";
    urgency = "warning";
    reasoning = `Projected 12-month turnover A$${projectedTotal.toLocaleString("en-AU", { maximumFractionDigits: 0 })} will cross the A$75,000 threshold — register within 21 days of forming that projection.`;
  } else {
    action = "none";
    urgency = "ok";
    reasoning = `Actual 12-month turnover A$${actualTotal.toLocaleString("en-AU", { maximumFractionDigits: 0 })} and projected turnover A$${projectedTotal.toLocaleString("en-AU", { maximumFractionDigits: 0 })} are both below the A$75,000 threshold — no GST registration required today.`;
  }

  const willCross =
    action === "register_within_21_days" || action === "urgent_register"
      ? action === "urgent_register"
        ? 0
        : daysUntilCrossing(actualLast12, projected, GST_THRESHOLD_AUD)
      : undefined;

  return {
    actual_12mo_turnover_aud: Math.round(actualTotal),
    projected_12mo_turnover_aud: Math.round(projectedTotal),
    threshold_aud: GST_THRESHOLD_AUD,
    is_above_threshold: isAbove,
    will_cross_threshold_within_days: willCross,
    action_required: action,
    urgency,
    reasoning,
    disclaimer: GST_DISCLAIMER,
  };
}
