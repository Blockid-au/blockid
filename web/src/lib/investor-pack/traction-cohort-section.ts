// Traction / weekly-cohort retention section for the investor pack.
//
// Closes the P5-cohort-wire follow-up in
// docs/plans/atlassian-standard-mapping-goal.md §P5: the cohort chart
// module shipped by P5-cohort (`web/src/lib/traction/cohort-chart.ts`)
// needs to surface in an investor-facing pack alongside the ESOP-
// eligibility and exit-benchmark sections so a founder at Chapter 5
// (PMF / Early Traction) — and every later phase reading the pack — sees
// a defensible retention anchor next to the SVI Traction dimension score.
//
// Pure — takes the founder's signup + activity event streams (the
// assembler's loader is responsible for reading `app_users.created_at`
// and any activity source that exists) and returns the JSON shape the
// pack renders. Never hits Supabase / network. Empty inputs return an
// empty-state envelope so the pack can render "log at least 4 weeks of
// signups" without a special-case branch upstream.
//
// Legal: cohort retention is a self-reported signal, not audited
// financial data. Investors will cross-check against Stripe / product
// analytics before term-sheet, so the disclaimer stays fixed on every
// render surface — same pattern as the AU comparable-exits and ESOP
// eligibility sections use.

import {
  computeWeeklyCohortRetention,
  renderCohortRetentionSvg,
  MIN_COHORT_BUCKETS,
  DEFAULT_COHORT_COUNT,
  DEFAULT_WEEK_COUNT,
  type ActivityEvent,
  type CohortMatrix,
  type ComputeCohortOptions,
  type SignupEvent,
} from "@/lib/traction/cohort-chart";

export const TRACTION_COHORT_DISCLAIMER =
  "Cohort retention is a self-reported signal derived from the signup and activity events supplied. It is not audited financial data — investors will typically cross-check against Stripe or product analytics before term-sheet, so keep the source events current.";

/**
 * PMF investor-signal floor for week-1 retention. Anchored on the
 * Sean Ellis / Rahul Vohra weekly-active-user retention curves that
 * Australian seed-stage investors (Blackbird / AirTree / Square Peg)
 * typically reference during diligence. Below this, the cohort chart
 * still renders but `investor_grade` flips to false.
 */
export const INVESTOR_GRADE_WEEK1_MIN = 0.4;

export interface TractionCohortSummary {
  /** Number of cohort rows in the matrix (post-drop-empty-weeks). */
  cohorts_present: number;
  /** Width of the retention grid (0..N-1). */
  weeks_covered: number;
  /** True when cohorts_present >= MIN_COHORT_BUCKETS (=4). */
  meets_min_buckets: boolean;
  /**
   * Average retention at week N across all cohorts that have data at
   * that week. Null when no cohort has reached week N yet (young
   * cohorts render as truncated rows — the average follows that rule).
   * Indices align with the retention grid: [W0, W1, W2, ...].
   */
  average_week_retention: Array<number | null>;
  /** Cohort with the highest W1 retention (fallback: highest W0). Null on empty input. */
  best_cohort_iso: string | null;
  /** Best W1 retention across cohorts with W1 data. Null when no cohort has reached W1. */
  best_week1_retention: number | null;
}

export interface TractionCohortSection {
  matrix: CohortMatrix;
  /** Self-contained SVG heatmap (inline-safe). */
  svg: string;
  summary: TractionCohortSummary;
  /** True when both signup and activity inputs were empty. */
  empty_state: boolean;
  /** True when meets_min_buckets && best_week1_retention >= INVESTOR_GRADE_WEEK1_MIN. */
  investor_grade: boolean;
  disclaimer: string;
}

export interface BuildTractionCohortSectionOptions {
  signups?: ReadonlyArray<SignupEvent>;
  activities?: ReadonlyArray<ActivityEvent>;
  /** Passed through to computeWeeklyCohortRetention — same defaults. */
  cohort_options?: ComputeCohortOptions;
  /** Passed through to renderCohortRetentionSvg. */
  svg_options?: Parameters<typeof renderCohortRetentionSvg>[1];
}

export function buildTractionCohortSection(
  opts: BuildTractionCohortSectionOptions = {},
): TractionCohortSection {
  const signups = opts.signups ?? [];
  const activities = opts.activities ?? [];
  const emptyState = signups.length === 0 && activities.length === 0;

  const matrix = computeWeeklyCohortRetention(signups, activities, {
    cohort_count: opts.cohort_options?.cohort_count ?? DEFAULT_COHORT_COUNT,
    week_count: opts.cohort_options?.week_count ?? DEFAULT_WEEK_COUNT,
    reference_date: opts.cohort_options?.reference_date,
  });

  const svg = renderCohortRetentionSvg(matrix, opts.svg_options);
  const summary = summariseMatrix(matrix);
  const investorGrade =
    matrix.meets_min_buckets &&
    typeof summary.best_week1_retention === "number" &&
    summary.best_week1_retention >= INVESTOR_GRADE_WEEK1_MIN;

  return {
    matrix,
    svg,
    summary,
    empty_state: emptyState,
    investor_grade: investorGrade,
    disclaimer: TRACTION_COHORT_DISCLAIMER,
  };
}

function summariseMatrix(matrix: CohortMatrix): TractionCohortSummary {
  const weeks = matrix.week_count;
  const rows = matrix.cohorts;
  const averages: Array<number | null> = [];
  for (let w = 0; w < weeks; w += 1) {
    let sum = 0;
    let count = 0;
    for (const row of rows) {
      const val = row.retention[w];
      if (typeof val === "number" && Number.isFinite(val)) {
        sum += val;
        count += 1;
      }
    }
    averages.push(count === 0 ? null : Math.round((sum / count) * 1000) / 1000);
  }

  let bestIso: string | null = null;
  let bestW1: number | null = null;
  for (const row of rows) {
    const w1 = row.retention[1];
    if (typeof w1 === "number" && Number.isFinite(w1)) {
      if (bestW1 === null || w1 > bestW1) {
        bestW1 = w1;
        bestIso = row.cohort_week_iso;
      }
    }
  }
  if (bestIso === null) {
    // No cohort has reached W1 yet — fall back to the highest W0
    // (cohort size proxy) so the pack still names a "best" cohort.
    let bestW0: number | null = null;
    for (const row of rows) {
      const w0 = row.retention[0];
      if (typeof w0 === "number" && Number.isFinite(w0)) {
        if (bestW0 === null || w0 > bestW0) {
          bestW0 = w0;
          bestIso = row.cohort_week_iso;
        }
      }
    }
  }

  return {
    cohorts_present: rows.length,
    weeks_covered: weeks,
    meets_min_buckets: matrix.meets_min_buckets,
    average_week_retention: averages,
    best_cohort_iso: bestIso,
    best_week1_retention: bestW1,
  };
}

export { MIN_COHORT_BUCKETS };
