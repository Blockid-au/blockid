// WGEA 100-employee threshold detector.
//
// Workplace Gender Equality Act 2012 (Cth) rule (retrieved 2026):
//   https://www.wgea.gov.au/what-we-do/reporting
//
// A "relevant employer" — defined in s3 WGE Act — is a non-public-sector
// employer that has 100 or more employees in Australia. Relevant employers
// must lodge an annual public report with the Workplace Gender Equality
// Agency.
//
//   - Reporting period: 1 April to 31 March each year.
//   - Public report due: 31 May immediately after the reporting period ends.
//   - Grace period: an employer that has previously reported and subsequently
//     falls below 100 employees remains a "relevant employer" for the next
//     two reporting periods (s3B(2) grace).
//
// This module is a threshold detector, not a full WGEA workbook. It does
// not build the six gender-equality-indicator dataset — that requires
// person-level HR data + payroll integration and belongs off-platform.
//
// AFSL boundary: nothing here constitutes personal legal or HR advice.
// Founders must confirm with a WGEA-registered consultant or the WGEA
// helpline before relying on the classification.

export const WGEA_DISCLAIMER =
  "Not legal or HR advice — the WGE Act headcount rule counts Australian employees only (excludes overseas workers, most independent contractors, and public-sector staff). Confirm with the WGEA helpline (1800 730 434) or a registered consultant before relying on this classification.";

export const WGEA_HEADCOUNT_THRESHOLD = 100 as const;
export const WGEA_APPROACHING_HEADCOUNT = 80 as const;
export const WGEA_GRACE_PERIODS = 2 as const;
export const WGEA_REPORT_DUE_DAY = 31 as const;
export const WGEA_REPORT_DUE_MONTH_INDEX = 4 as const; // May (0-indexed)

export interface WGEAInput {
  /** Current headcount of Australian employees (excludes contractors, offshore staff). */
  current_headcount_au: number;
  /**
   * Recent monthly headcount points ordered oldest → newest. Used to detect
   * whether the employer crossed the 100-employee threshold at any point in
   * the reporting period (WGEA counts the average of two count days).
   */
  monthly_headcount_last_12_months?: number[];
  /** True if the employer previously lodged a WGEA report (grace-period flag). */
  has_previously_reported: boolean;
  /** ISO date of the most recent WGEA public report lodged, if any. */
  last_report_lodged_at?: string;
  /**
   * How many completed WGEA reporting periods have elapsed since the
   * headcount last stood at ≥ 100 employees. Used to expire the s3B(2)
   * grace period. Undefined when the employer has never crossed the
   * threshold.
   */
  reporting_periods_since_last_over_threshold?: number;
}

export type WGEAActionRequired =
  | "not_required"
  | "approaching_threshold"
  | "report_required"
  | "grace_period"
  | "already_reporting";

export type WGEAUrgency = "ok" | "warning" | "critical";

export interface WGEAResult {
  current_headcount_au: number;
  peak_headcount_last_12_months: number;
  threshold_headcount: typeof WGEA_HEADCOUNT_THRESHOLD;
  is_relevant_employer: boolean;
  is_above_threshold: boolean;
  /** ISO date of the next WGEA public-report deadline (31-May-following). */
  next_report_due_iso?: string;
  action_required: WGEAActionRequired;
  urgency: WGEAUrgency;
  reasoning: string;
  disclaimer: string;
}

function safeInt(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

/**
 * The WGEA public-report deadline is 31 May immediately after the reporting
 * period (1 April → 31 March) ends. If today is already past 31 May, the
 * "next" deadline rolls to next year.
 */
function nextReportDueIso(now: Date): string {
  const year = now.getUTCFullYear();
  const thisMayDeadline = Date.UTC(year, WGEA_REPORT_DUE_MONTH_INDEX, WGEA_REPORT_DUE_DAY);
  const target =
    now.getTime() > thisMayDeadline
      ? new Date(Date.UTC(year + 1, WGEA_REPORT_DUE_MONTH_INDEX, WGEA_REPORT_DUE_DAY))
      : new Date(thisMayDeadline);
  return target.toISOString().slice(0, 10);
}

/**
 * Convenience shortcut for callers that only have a current headcount and
 * no history — most founders on the SVI onboarding flow are in this bucket.
 */
export function assessWGEAFromHeadcount(
  headcount: number,
  opts: { has_previously_reported?: boolean; last_report_lodged_at?: string } = {},
): WGEAResult {
  return assessWGEA({
    current_headcount_au: headcount,
    has_previously_reported: Boolean(opts.has_previously_reported),
    last_report_lodged_at: opts.last_report_lodged_at,
  });
}

export function assessWGEA(input: WGEAInput, now: Date = new Date()): WGEAResult {
  const current = safeInt(input.current_headcount_au);
  const history = Array.isArray(input.monthly_headcount_last_12_months)
    ? input.monthly_headcount_last_12_months.map(safeInt)
    : [];
  const peak = Math.max(current, ...(history.length > 0 ? history : [0]));

  const hasEverCrossed =
    Boolean(input.has_previously_reported) || peak >= WGEA_HEADCOUNT_THRESHOLD;
  const gracePeriodsElapsed = safeInt(
    input.reporting_periods_since_last_over_threshold ?? 0,
  );
  const inGracePeriod =
    Boolean(input.has_previously_reported) &&
    peak < WGEA_HEADCOUNT_THRESHOLD &&
    gracePeriodsElapsed < WGEA_GRACE_PERIODS;

  const isRelevantEmployer = peak >= WGEA_HEADCOUNT_THRESHOLD || inGracePeriod;
  const isAbove = peak >= WGEA_HEADCOUNT_THRESHOLD;

  let action: WGEAActionRequired;
  let urgency: WGEAUrgency;
  let reasoning: string;

  if (input.last_report_lodged_at && isRelevantEmployer) {
    action = "already_reporting";
    urgency = "ok";
    reasoning = `Last WGEA report lodged ${input.last_report_lodged_at}. Continue lodging annually — next public report due ${nextReportDueIso(now)}.`;
  } else if (isAbove) {
    action = "report_required";
    urgency = "critical";
    reasoning = `Headcount peaked at ${peak} Australian employees within the last 12 months — at or above the 100-employee threshold in s3 WGE Act 2012 (Cth). Register with WGEA and lodge a public report by ${nextReportDueIso(now)}.`;
  } else if (inGracePeriod) {
    action = "grace_period";
    urgency = "warning";
    reasoning = `Headcount is now ${current} but you previously reported. WGE Act s3B(2) keeps you a relevant employer for ${WGEA_GRACE_PERIODS} more reporting periods (${WGEA_GRACE_PERIODS - gracePeriodsElapsed} remaining) — continue lodging until then.`;
  } else if (current >= WGEA_APPROACHING_HEADCOUNT || peak >= WGEA_APPROACHING_HEADCOUNT) {
    action = "approaching_threshold";
    urgency = "warning";
    reasoning = `Headcount is ${current} (peak ${peak}) — within striking distance of the 100-employee WGEA trigger. Start building the six gender-equality-indicator dataset now so the first report is not a scramble.`;
  } else {
    action = "not_required";
    urgency = "ok";
    reasoning = `Headcount is ${current} (peak ${peak}) — well below the 100-employee WGEA threshold. No public report required this period.`;
  }

  return {
    current_headcount_au: current,
    peak_headcount_last_12_months: peak,
    threshold_headcount: WGEA_HEADCOUNT_THRESHOLD,
    is_relevant_employer: isRelevantEmployer,
    is_above_threshold: isAbove,
    next_report_due_iso: isRelevantEmployer ? nextReportDueIso(now) : undefined,
    action_required: action,
    urgency,
    reasoning,
    disclaimer: WGEA_DISCLAIMER,
  };
}
