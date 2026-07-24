// Modern Slavery Act 2018 (Cth) A$100M consolidated-revenue threshold detector.
//
// Rule (retrieved 2026):
//   https://modernslaveryregister.gov.au/
//   https://www.ag.gov.au/rights-and-protections/publications/modern-slavery-act-2018-guidance-reporting-entities
//
// An entity is a "reporting entity" under s5 Modern Slavery Act 2018 (Cth)
// if it is an Australian entity — or a foreign entity carrying on business
// in Australia — with a consolidated revenue of at least A$100 million for
// the reporting period (the entity's financial year).
//
//   - Reporting period = the entity's financial year (usually 1 Jul – 30 Jun
//     for AU companies).
//   - Statement due: within 6 months after the end of the reporting period
//     (s13). For a 30-Jun FY, that means 31 December of the same calendar
//     year.
//   - Statement must be approved by the principal governing body and signed
//     by a responsible member (s13(2)); then lodged with the Attorney-
//     General's online register (s16).
//
// This module is a threshold detector, not a full statement generator. It
// does not draft the seven mandatory reporting criteria (s16), does not
// audit supply-chain risk, and does not compose the responsible-member
// approval declaration — those need a compliance lead + legal review.

export const MODERN_SLAVERY_DISCLAIMER =
  "Not legal advice — 'consolidated revenue' under the Modern Slavery Act 2018 (Cth) follows Australian Accounting Standards including AASB 10 controlled-entity aggregation. Confirm with your auditor before relying on this classification; the reporting entity must have its statement approved and signed by its principal governing body.";

export const MODERN_SLAVERY_THRESHOLD_AUD = 100_000_000 as const;
export const MODERN_SLAVERY_APPROACHING_AUD = 80_000_000 as const;
export const MODERN_SLAVERY_STATEMENT_WINDOW_MONTHS = 6 as const;

export interface ModernSlaveryInput {
  /** Consolidated revenue for the current reporting period so far (AUD). */
  current_period_revenue_aud: number;
  /** Projected consolidated revenue for the full current period (AUD). */
  projected_full_period_revenue_aud?: number;
  /** Actual consolidated revenue for the most recently completed FY (AUD). */
  last_full_period_revenue_aud?: number;
  /** ISO date the current financial year ends. Default: 30-Jun of the calendar year of `now`. */
  current_fy_end_iso?: string;
  /** ISO date the last Modern Slavery statement was lodged with the Attorney-General's register. */
  last_statement_lodged_at?: string;
  /** True if the entity is an Australian entity OR a foreign entity carrying on business in Australia. */
  is_australian_or_carrying_on_business_in_au?: boolean;
}

export type ModernSlaveryActionRequired =
  | "not_required"
  | "approaching_threshold"
  | "statement_required"
  | "statement_due_soon"
  | "statement_overdue"
  | "already_lodged";

export type ModernSlaveryUrgency = "ok" | "warning" | "critical";

export interface ModernSlaveryResult {
  current_period_revenue_aud: number;
  projected_full_period_revenue_aud: number;
  last_full_period_revenue_aud: number;
  threshold_aud: typeof MODERN_SLAVERY_THRESHOLD_AUD;
  is_reporting_entity: boolean;
  is_above_threshold: boolean;
  statement_due_iso?: string;
  days_until_statement_due?: number;
  action_required: ModernSlaveryActionRequired;
  urgency: ModernSlaveryUrgency;
  reasoning: string;
  disclaimer: string;
}

function safeMoney(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

function defaultFyEndIso(now: Date): string {
  // Default to the most recent 30-June relative to `now`. If `now` is on or
  // before 30-June, the current FY still ends this calendar year. If after
  // 30-June, the current FY ends next calendar year (30-June + 12mo).
  const year = now.getUTCFullYear();
  const june30 = Date.UTC(year, 5, 30);
  const fyEndYear = now.getTime() <= june30 ? year : year + 1;
  return new Date(Date.UTC(fyEndYear, 5, 30)).toISOString().slice(0, 10);
}

function statementDueIso(fyEndIso: string): string {
  const fyEnd = new Date(fyEndIso);
  if (Number.isNaN(fyEnd.getTime())) return fyEndIso;
  // Add 6 calendar months without JS's "31-Dec + 6mo = 1-Jul" overflow —
  // clamp the day-of-month to the last valid day of the target month.
  const y = fyEnd.getUTCFullYear();
  const m = fyEnd.getUTCMonth();
  const d = fyEnd.getUTCDate();
  const targetY = y + Math.floor((m + MODERN_SLAVERY_STATEMENT_WINDOW_MONTHS) / 12);
  const targetM = (m + MODERN_SLAVERY_STATEMENT_WINDOW_MONTHS) % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  const targetD = Math.min(d, lastDayOfTargetMonth);
  return new Date(Date.UTC(targetY, targetM, targetD)).toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Convenience shortcut for callers that only know current-FY revenue and
 * carry-on-business status. Most founders in the SVI onboarding flow are
 * in this bucket.
 */
export function assessModernSlaveryFromRevenue(
  currentPeriodRevenueAud: number,
  opts: {
    projected_full_period_revenue_aud?: number;
    last_full_period_revenue_aud?: number;
    is_australian_or_carrying_on_business_in_au?: boolean;
    last_statement_lodged_at?: string;
  } = {},
): ModernSlaveryResult {
  return assessModernSlavery({
    current_period_revenue_aud: currentPeriodRevenueAud,
    projected_full_period_revenue_aud: opts.projected_full_period_revenue_aud,
    last_full_period_revenue_aud: opts.last_full_period_revenue_aud,
    is_australian_or_carrying_on_business_in_au:
      opts.is_australian_or_carrying_on_business_in_au ?? true,
    last_statement_lodged_at: opts.last_statement_lodged_at,
  });
}

export function assessModernSlavery(
  input: ModernSlaveryInput,
  now: Date = new Date(),
): ModernSlaveryResult {
  const current = safeMoney(input.current_period_revenue_aud);
  const projected = safeMoney(
    input.projected_full_period_revenue_aud ?? input.current_period_revenue_aud,
  );
  const lastFy = safeMoney(input.last_full_period_revenue_aud);
  const fyEndIso = input.current_fy_end_iso ?? defaultFyEndIso(now);
  const dueIso = statementDueIso(fyEndIso);
  const fyEndDate = new Date(fyEndIso);
  const dueDate = new Date(dueIso);
  const inScope = input.is_australian_or_carrying_on_business_in_au ?? true;

  const projectedAbove = projected >= MODERN_SLAVERY_THRESHOLD_AUD;
  const lastFyAbove = lastFy >= MODERN_SLAVERY_THRESHOLD_AUD;
  const isAbove = projectedAbove || lastFyAbove;
  const isReportingEntity = inScope && isAbove;

  const daysUntilDue = Number.isNaN(dueDate.getTime())
    ? undefined
    : daysBetween(now, dueDate);
  const fyEnded = !Number.isNaN(fyEndDate.getTime()) && now.getTime() > fyEndDate.getTime();

  let action: ModernSlaveryActionRequired;
  let urgency: ModernSlaveryUrgency;
  let reasoning: string;

  if (!inScope) {
    action = "not_required";
    urgency = "ok";
    reasoning = `Entity flagged as not Australian and not carrying on business in Australia — Modern Slavery Act 2018 (Cth) s5 does not apply.`;
  } else if (input.last_statement_lodged_at && lastFyAbove) {
    action = "already_lodged";
    urgency = "ok";
    reasoning = `Last Modern Slavery statement lodged ${input.last_statement_lodged_at}. Continue lodging annually — next statement due ${dueIso} (6 months after ${fyEndIso}).`;
  } else if (lastFyAbove && fyEnded && daysUntilDue !== undefined && daysUntilDue < 0) {
    action = "statement_overdue";
    urgency = "critical";
    reasoning = `Consolidated revenue for the completed FY (${fyEndIso}) was A$${lastFy.toLocaleString("en-AU", { maximumFractionDigits: 0 })} — above the A$100M s5 threshold. Statement was due ${dueIso} and is ${Math.abs(daysUntilDue)} days overdue. Lodge immediately with the Attorney-General's register (s13).`;
  } else if (lastFyAbove && fyEnded) {
    action = "statement_due_soon";
    urgency = "critical";
    reasoning = `Consolidated revenue for the completed FY (${fyEndIso}) was A$${lastFy.toLocaleString("en-AU", { maximumFractionDigits: 0 })} — above the A$100M s5 threshold. Statement due ${dueIso} (${daysUntilDue} days). Governing-body approval + signature by a responsible member required before lodgement (s13(2)).`;
  } else if (projectedAbove) {
    action = "statement_required";
    urgency = "warning";
    reasoning = `Projected consolidated revenue for the current period is A$${projected.toLocaleString("en-AU", { maximumFractionDigits: 0 })} — at or above the A$100M s5 threshold. Start building the seven mandatory reporting criteria dataset (s16) so the statement is ready to lodge by ${dueIso}.`;
  } else if (
    current >= MODERN_SLAVERY_APPROACHING_AUD ||
    projected >= MODERN_SLAVERY_APPROACHING_AUD ||
    lastFy >= MODERN_SLAVERY_APPROACHING_AUD
  ) {
    action = "approaching_threshold";
    urgency = "warning";
    reasoning = `Revenue is within striking distance of the A$100M Modern Slavery threshold (current A$${current.toLocaleString("en-AU", { maximumFractionDigits: 0 })}, projected A$${projected.toLocaleString("en-AU", { maximumFractionDigits: 0 })}, last FY A$${lastFy.toLocaleString("en-AU", { maximumFractionDigits: 0 })}). Voluntary opt-in reporting is available under s6 — many acquirers prefer to see one before you're forced to.`;
  } else {
    action = "not_required";
    urgency = "ok";
    reasoning = `Consolidated revenue is well below the A$100M Modern Slavery threshold (current A$${current.toLocaleString("en-AU", { maximumFractionDigits: 0 })}, projected A$${projected.toLocaleString("en-AU", { maximumFractionDigits: 0 })}). No statement required this period.`;
  }

  return {
    current_period_revenue_aud: Math.round(current),
    projected_full_period_revenue_aud: Math.round(projected),
    last_full_period_revenue_aud: Math.round(lastFy),
    threshold_aud: MODERN_SLAVERY_THRESHOLD_AUD,
    is_reporting_entity: isReportingEntity,
    is_above_threshold: isAbove,
    statement_due_iso: isReportingEntity ? dueIso : undefined,
    days_until_statement_due: isReportingEntity ? daysUntilDue : undefined,
    action_required: action,
    urgency,
    reasoning,
    disclaimer: MODERN_SLAVERY_DISCLAIMER,
  };
}
