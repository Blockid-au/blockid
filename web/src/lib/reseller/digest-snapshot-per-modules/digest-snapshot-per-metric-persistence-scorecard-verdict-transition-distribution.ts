// Weekly digest per-metric persistence scorecard verdict TRANSITION
// DELTA-RANK DISTRIBUTION scalar-summary (P11.125).
//
// The P11.115 / P11.116 per-metric verdict-transition pair opened the
// week-over-week regression-detection surface at the per-KPI grain — every
// HEADLINE_METRICS KPI now carries a single transition token (improved /
// degraded / rotated / undecidable / stable / first_classification) beneath
// the P11.110 per-metric verdict badge each Monday. But ops reading the
// per-metric transition table still had to eyeball each row to answer the
// portfolio-level question 'across THIS week, how many KPIs improved by 2
// ranks vs 1, and how many degraded?'. A three-KPI grid answers itself; a
// thirteen-KPI grid (attributed_mrr, attributed_churn_30d, clawback_exposure,
// contribution_margin_pct, commission_cleared_mtd, credit_budget_utilization,
// sandbox_share_of_budget, tier_mix, ledger_drift_events, gst_reconciliation_delta,
// cohort_velocity, ltv_cac_per_reseller, attributed_net_contribution) does not.
//
// This module closes that per-grain aggregation gap by folding the P11.115
// per-metric transition envelope into a scalar-summary DISTRIBUTION over the
// six transition tokens with a further split on delta_rank magnitude for
// `improved` (+1 vs +2) and `degraded` (-1 vs -2). Ops can grep
// 'improved_by_2=1 degraded_by_2=3' out of the JSONL envelope or read a
// single-line caption in the digest email without walking the per-metric
// transition table row-by-row.
//
// Pure derivation of the P11.115 envelope — no new folds, no scorecard
// replay, no new inputs. The distribution is the (input, aggregation)
// duality: the P11.115 module answered 'PER KPI, what changed?'; this module
// answers 'ACROSS KPIs, how much changed by how much?' — the natural scalar
// summary that lives beneath the row-per-KPI table.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / ... / P11.115 →
// P11.116 / P11.117 → P11.118 / P11.123 → P11.124 cadence — cron-route
// wiring intentionally deferred to a follow-up tick (P11.126) so the
// distribution shape can be exercised in isolation before touching the hot
// Monday cron path (already hosting four grains of scorecard + four grains
// of verdict caption + four grains of transition caption).
//
// Design notes:
//   • Buckets are named for direct grep-ability: `improved_by_1`,
//     `improved_by_2`, `degraded_by_1`, `degraded_by_2` split by
//     |delta_rank| so ops distinguishes 'one KPI clawed back from
//     sustained_direction_only → sustained_both_axes' (+1) from
//     'one KPI leapt from volatile → sustained_both_axes' (+2). The rank
//     table only spans [-1, 2] (see P11.113 VERDICT_RANK), so the maximum
//     absolute delta_rank is 2 and no further buckets are needed. Rows with
//     |delta_rank| outside this range are impossible from valid P11.115
//     inputs but classified into `improved_by_other` / `degraded_by_other`
//     defensively so a hand-edited envelope cannot silently drop rows.
//   • `rotated` collapses direction↔magnitude axis flips and flat↔volatile
//     zero-rank flips together — matches P11.113 posture that a rotation
//     within the same axis-count is one thing, not two.
//   • `stable` counts include all rows whose current + previous verdicts
//     match; `first_classification` counts include all rows without a
//     previous entry. Both are informational counts (no signal to alert on)
//     but retained on the envelope so ops can spot 'the KPI grid grew from
//     10 → 13 this week' (first_classification=3) or 'the KPI grid is fully
//     described by the per-metric verdict block above' (stable=all).
//   • `alert_worthy = improved + degraded + rotated + undecidable` — matches
//     the formatter suppression on the underlying P11.115 module (which
//     suppresses first_classification + stable rows) so a caller can check
//     ONE scalar to decide whether the caption is worth rendering.
//   • `net_delta_rank` sums delta_rank across rows treating null (undecidable
//     + first_classification) as 0 — a positive integer means the per-metric
//     grid moved UP the ladder on balance, a negative integer means it moved
//     DOWN. This is a coarse portfolio-health barometer; ops still reads the
//     per-KPI transitions above to see which specific KPIs drove the shift.
//   • Envelope carries window_size / first_week / last_week / threshold /
//     sustained_p90_threshold verbatim from the input transition envelope so
//     a JSONL consumer joining the distribution to the per-metric transition
//     envelope on the same weekly row aligns by row index without extra keys.
//   • Formatter suppresses on window_size < 3 (matches P11.115 formatter
//     suppression) AND on total == 0 (empty envelope) AND on alert_worthy ==
//     0 (every row is first_classification or stable — the per-metric
//     transition table above already suppressed itself). Renders a single-
//     line caption + inline bullet list of the non-zero buckets so the
//     scalar summary consumes at most three lines in the digest email.

import type { DigestSnapshotPerMetricPersistenceScorecardVerdictTransition } from "./digest-snapshot-per-metric-persistence-scorecard-verdict-transition";

export interface PersistenceScorecardVerdictTransitionDistribution {
  readonly total: number;
  readonly first_classification: number;
  readonly undecidable: number;
  readonly stable: number;
  readonly rotated: number;
  readonly improved_by_1: number;
  readonly improved_by_2: number;
  readonly improved_by_other: number;
  readonly degraded_by_1: number;
  readonly degraded_by_2: number;
  readonly degraded_by_other: number;
  readonly alert_worthy: number;
  readonly net_delta_rank: number;
}

export interface DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly distribution: PersistenceScorecardVerdictTransitionDistribution;
}

/**
 * Fold the P11.115 per-metric verdict-transition envelope into a scalar
 * DISTRIBUTION over the six transition tokens with a further split on
 * |delta_rank| for improved (+1 / +2 / other) and degraded (-1 / -2 / other).
 *
 * Pure derivation — no new folds, no scorecard replay, no new inputs. The
 * output distribution is the aggregation dual of the input row-per-KPI
 * envelope: 'ACROSS KPIs, how much changed by how much?' vs. the input's
 * 'PER KPI, what changed?'.
 *
 * A caller who only needs the alert-worthy count can read
 * `output.distribution.alert_worthy` rather than re-summing the individual
 * bucket counts; a caller who wants the coarse portfolio-health barometer
 * can read `output.distribution.net_delta_rank` (positive = ladder-up on
 * balance; negative = ladder-down; zero = balanced).
 */
export function computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution(
  transitions: DigestSnapshotPerMetricPersistenceScorecardVerdictTransition,
): DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution {
  let first_classification = 0;
  let undecidable = 0;
  let stable = 0;
  let rotated = 0;
  let improved_by_1 = 0;
  let improved_by_2 = 0;
  let improved_by_other = 0;
  let degraded_by_1 = 0;
  let degraded_by_2 = 0;
  let degraded_by_other = 0;
  let net_delta_rank = 0;

  for (const row of transitions.rows) {
    switch (row.transition) {
      case "first_classification":
        first_classification += 1;
        break;
      case "undecidable":
        undecidable += 1;
        break;
      case "stable":
        stable += 1;
        break;
      case "rotated":
        rotated += 1;
        break;
      case "improved":
        if (row.delta_rank === 1) improved_by_1 += 1;
        else if (row.delta_rank === 2) improved_by_2 += 1;
        else improved_by_other += 1;
        if (row.delta_rank !== null) net_delta_rank += row.delta_rank;
        break;
      case "degraded":
        if (row.delta_rank === -1) degraded_by_1 += 1;
        else if (row.delta_rank === -2) degraded_by_2 += 1;
        else degraded_by_other += 1;
        if (row.delta_rank !== null) net_delta_rank += row.delta_rank;
        break;
    }
  }

  const total = transitions.rows.length;
  const alert_worthy =
    undecidable +
    rotated +
    improved_by_1 +
    improved_by_2 +
    improved_by_other +
    degraded_by_1 +
    degraded_by_2 +
    degraded_by_other;

  return {
    window_size: transitions.window_size,
    first_week: transitions.first_week,
    last_week: transitions.last_week,
    sustained_p90_threshold: transitions.sustained_p90_threshold,
    threshold: transitions.threshold,
    distribution: {
      total,
      first_classification,
      undecidable,
      stable,
      rotated,
      improved_by_1,
      improved_by_2,
      improved_by_other,
      degraded_by_1,
      degraded_by_2,
      degraded_by_other,
      alert_worthy,
      net_delta_rank,
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSignedInt(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Render the per-metric verdict-transition delta-rank distribution as a
 * single-line caption + inline bullet list of the non-zero buckets. Splices
 * directly BELOW the P11.116 per-metric verdict-transition table so ops
 * reads the row-per-KPI transitions above and the collapsed scalar summary
 * inline below without re-summing thirteen rows in their head.
 *
 * Returns "" when window_size < 3 (matches the P11.115/P11.116 formatter
 * suppression on the same short-window guard) OR when total == 0 (empty
 * envelope) OR when alert_worthy == 0 (every row resolves to
 * first_classification or stable — the per-metric transition table above
 * already suppressed itself and this scalar summary would just repeat the
 * suppression rule with counts).
 *
 * The bullet list only renders non-zero buckets in a fixed spec order
 * (improved_by_2, improved_by_1, degraded_by_1, degraded_by_2, rotated,
 * undecidable, plus improved_by_other / degraded_by_other defensively at
 * the tail) so a run with only rotated + undecidable resolves to two
 * bullets rather than eight zero-count noise bullets.
 */
export function formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistributionSection(
  snapshot: DigestSnapshotPerMetricPersistenceScorecardVerdictTransitionDistribution,
): string {
  if (snapshot.window_size < 3) return "";
  const d = snapshot.distribution;
  if (d.total === 0) return "";
  if (d.alert_worthy === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);

  const buckets: Array<{ label: string; count: number }> = [
    { label: "improved by +2 rank", count: d.improved_by_2 },
    { label: "improved by +1 rank", count: d.improved_by_1 },
    { label: "degraded by −1 rank", count: d.degraded_by_1 },
    { label: "degraded by −2 rank", count: d.degraded_by_2 },
    { label: "rotated (axis flipped, rank unchanged)", count: d.rotated },
    { label: "undecidable (insufficient_window on either side)", count: d.undecidable },
    { label: "improved by other rank delta", count: d.improved_by_other },
    { label: "degraded by other rank delta", count: d.degraded_by_other },
  ];

  const bulletsHtml = buckets
    .filter((b) => b.count > 0)
    .map(
      (b) =>
        `<li><strong>${b.count}</strong> &times; ${escapeHtml(b.label)}</li>`,
    )
    .join("");

  const netMoveLabel =
    d.net_delta_rank > 0
      ? "ladder-up on balance"
      : d.net_delta_rank < 0
        ? "ladder-down on balance"
        : "balanced";

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-metric verdict-transition distribution across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Scalar summary of the per-metric transition table above. Aggregates the row-per-KPI transitions into bucket counts split by <code>|delta_rank|</code> so ops distinguishes a single-rank claw-back (<code>improved_by_1</code>) from a two-rank leap (<code>improved_by_2</code>) without walking the row grid. n=<strong>${d.total}</strong> KPIs classified this week &mdash; <strong>${d.alert_worthy}</strong> alert-worthy, <strong>${d.stable}</strong> stable, <strong>${d.first_classification}</strong> first-classification. Net &Delta;rank across the grid = <strong>${escapeHtml(formatSignedInt(d.net_delta_rank))}</strong> (${netMoveLabel}).</p>
    <ul style="font-family:Arial,sans-serif;font-size:13px;margin-top:4px">${bulletsHtml}
    </ul>`;
}
