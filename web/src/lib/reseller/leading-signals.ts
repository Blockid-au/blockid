// Reseller leading-signal KPIs for the P11 weekly digest.
//
// Customer-Success advisory §24 rec #3 (docs/plans/reviews/plan-review-cs.md)
// flagged that attributed_churn_30d is post-mortem — by the time it fires the
// customer is gone. The weekly digest needs leading indicators CS can action
// BEFORE churn: last-login recency and time-to-first-report.
//
// This module is pure — no DB, no IO. It consumes attributed-customer rows and
// their SVI/report artefacts and returns per-customer signals + a k-anonymised
// portfolio-level rollup ready for the digest CSV/email. Follows the same
// K_ANONYMITY_THRESHOLD=5 pattern from portfolio-aggregates so no digest row
// can point at an individual attributed startup.
//
// Not yet wired to a cron endpoint — P11 weekly digest cron is the next tick.

import {
  applyK,
  K_ANONYMITY_THRESHOLD,
  type KAnonBucket,
} from "./portfolio-aggregates";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------------- */
/* Input shapes                                                              */
/* ------------------------------------------------------------------------- */

export interface AttributedCustomerRow {
  id: string;
  created_at: string;
  last_login_at: string | null;
}

/**
 * One report/artefact row per attributed customer. Matches the subset of
 * svi_analyses the scoped supabase wrapper selects (see supabase.ts). Rows
 * without a `generated_at` timestamp are ignored.
 */
export interface AttributedReportRow {
  user_id: string;
  generated_at: string;
}

/* ------------------------------------------------------------------------- */
/* Per-customer signals (never surfaced to the reseller directly — used by   */
/* the digest cron to derive the rollup)                                     */
/* ------------------------------------------------------------------------- */

export interface CustomerLeadingSignals {
  user_id: string;
  days_since_last_login: number | null; // null when last_login_at missing or unparseable
  first_report_generated_at: string | null; // ISO — earliest generated_at across the customer's reports
  days_to_first_report: number | null; // signup → first_report, null when no report yet
  seven_day_inactive: boolean; // true when days_since_last_login >= 7 (or null → treated as inactive)
  thirty_day_inactive: boolean; // true when days_since_last_login >= 30 (or null → treated as inactive)
}

/**
 * Compute the per-customer leading signals for one reseller's portfolio.
 * Reports are indexed by user_id in one linear scan; unparseable timestamps
 * are silently dropped so a single malformed row cannot poison the rollup.
 */
export function computeCustomerSignals(input: {
  customers: AttributedCustomerRow[];
  reports: AttributedReportRow[];
  now: Date;
}): CustomerLeadingSignals[] {
  const nowMs = input.now.getTime();

  const firstReportByUser = new Map<string, number>();
  for (const r of input.reports) {
    if (!r.user_id) continue;
    const ts = Date.parse(r.generated_at);
    if (!Number.isFinite(ts)) continue;
    const prior = firstReportByUser.get(r.user_id);
    if (prior === undefined || ts < prior) firstReportByUser.set(r.user_id, ts);
  }

  return input.customers.map((c) => {
    const loginMs = c.last_login_at ? Date.parse(c.last_login_at) : NaN;
    const daysSinceLogin = Number.isFinite(loginMs)
      ? Math.floor((nowMs - loginMs) / MS_PER_DAY)
      : null;

    const firstReportMs = firstReportByUser.get(c.id);
    const firstReportIso =
      firstReportMs !== undefined ? new Date(firstReportMs).toISOString() : null;

    const signupMs = Date.parse(c.created_at);
    const daysToFirstReport =
      firstReportMs !== undefined && Number.isFinite(signupMs)
        ? Math.max(0, Math.floor((firstReportMs - signupMs) / MS_PER_DAY))
        : null;

    // Null last-login is treated as inactive so a stranded account still shows
    // up in the CS worklist. This is safer than defaulting to active.
    const inactive7 = daysSinceLogin === null || daysSinceLogin >= 7;
    const inactive30 = daysSinceLogin === null || daysSinceLogin >= 30;

    return {
      user_id: c.id,
      days_since_last_login: daysSinceLogin,
      first_report_generated_at: firstReportIso,
      days_to_first_report: daysToFirstReport,
      seven_day_inactive: inactive7,
      thirty_day_inactive: inactive30,
    };
  });
}

/* ------------------------------------------------------------------------- */
/* Portfolio rollup — k-anonymised                                           */
/* ------------------------------------------------------------------------- */

export interface LeadingSignalSummary {
  attributed_total: KAnonBucket;
  inactive_7d: KAnonBucket;
  inactive_30d: KAnonBucket;
  never_generated_report: KAnonBucket;
  activated_first_report: KAnonBucket; // count of customers with at least one report
  median_days_to_first_report: number | null; // null when < k customers have any report
  activated_first_report_pct: number | null; // null when attributed_total is k-suppressed
}

/**
 * Portfolio-level rollup for the weekly digest. Each counter is k-anonymised
 * independently — a reseller with fewer than K attributed customers sees "<5"
 * for every counter and null for both derived numerics.
 *
 * median_days_to_first_report suppresses when fewer than K customers have a
 * first_report_generated_at (otherwise a low-N median points at individual
 * users). activated_first_report_pct suppresses when the denominator is
 * k-suppressed (the numerator alone would leak the denominator).
 */
export function buildLeadingSignalSummary(input: {
  customers: AttributedCustomerRow[];
  reports: AttributedReportRow[];
  now: Date;
  k?: number;
}): LeadingSignalSummary {
  const k = input.k ?? K_ANONYMITY_THRESHOLD;
  const signals = computeCustomerSignals({
    customers: input.customers,
    reports: input.reports,
    now: input.now,
  });

  let inactive7 = 0;
  let inactive30 = 0;
  let neverReport = 0;
  let activated = 0;
  const daysToFirst: number[] = [];
  for (const s of signals) {
    if (s.seven_day_inactive) inactive7 += 1;
    if (s.thirty_day_inactive) inactive30 += 1;
    if (s.first_report_generated_at) {
      activated += 1;
      if (s.days_to_first_report !== null) daysToFirst.push(s.days_to_first_report);
    } else {
      neverReport += 1;
    }
  }

  const total = signals.length;
  const attributed_total = applyK(total, k);
  const activated_first_report = applyK(activated, k);

  const median =
    daysToFirst.length >= k
      ? computeMedian(daysToFirst)
      : null;

  const activated_first_report_pct =
    attributed_total.suppressed || total === 0
      ? null
      : Math.round((activated / total) * 1000) / 10; // one decimal place

  return {
    attributed_total,
    inactive_7d: applyK(inactive7, k),
    inactive_30d: applyK(inactive30, k),
    never_generated_report: applyK(neverReport, k),
    activated_first_report,
    median_days_to_first_report: median,
    activated_first_report_pct,
  };
}

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }
  return sorted[mid];
}
