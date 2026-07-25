// Weekly digest per-(partner × metric) persistence scorecard verdict
// TRANSITION DELTA-RANK DISTRIBUTION scalar-summary (P11.129).
//
// The P11.123 / P11.124 per-(partner × metric) verdict-transition pair opened
// the week-over-week regression-detection surface at the FINEST scorecard
// grain — every (reseller_code, KPI key) pair now carries a single transition
// token (improved / degraded / rotated / undecidable / stable /
// first_classification) beneath the P11.121 per-pair verdict badge each
// Monday. But ops reading the per-pair transition table still had to eyeball
// the entire grid to answer the roster-level question 'across THIS week, how
// many pairs improved by 2 ranks vs 1, and how many degraded?'. A 3-partner
// × 13-KPI roster is 39 rows; a 10-partner × 13-KPI roster is 130 rows.
//
// This module closes that per-grain aggregation gap by folding the P11.123
// per-pair transition envelope into a scalar-summary DISTRIBUTION over the
// six transition tokens with a further split on delta_rank magnitude for
// `improved` (+1 vs +2) and `degraded` (-1 vs -2). Ops can grep
// 'improved_by_2=3 degraded_by_2=1' out of the JSONL envelope or read a
// single-line caption in the digest email without walking the per-pair
// transition table row-by-row.
//
// Pure derivation of the P11.123 envelope — no new folds, no scorecard
// replay, no new inputs. The distribution is the (input, aggregation)
// duality: the P11.123 module answered 'PER PAIR, what changed?'; this
// module answers 'ACROSS PAIRS, how much changed by how much?' — the
// natural scalar summary that lives beneath the row-per-pair table AND
// capstones the DISTRIBUTION family at all four scorecard grains (portfolio
// pending → per-metric P11.125/P11.126 → per-partner P11.127/P11.128 →
// per-pair THIS TICK pure-lib + P11.130 cron-wiring).
//
// Mirrors the P11.125 per-metric-grain and P11.127 per-partner-grain
// distribution modules exactly — same bucket set (first_classification /
// undecidable / stable / rotated / improved_by_1 / improved_by_2 /
// improved_by_other / degraded_by_1 / degraded_by_2 / degraded_by_other),
// same alert_worthy scalar, same net_delta_rank barometer, same formatter
// suppression trio, same fixed bullet order — so ops learn ONE distribution
// vocabulary and apply it at per-metric, per-partner, AND per-pair grains
// without switching mental models between grains.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / ... / P11.125 →
// P11.126 / P11.127 → P11.128 cadence — cron-route wiring intentionally
// deferred to a follow-up tick (P11.130) so the distribution shape can be
// exercised in isolation before touching the hot Monday cron path (already
// hosting four grains of scorecard + four grains of verdict caption + four
// grains of transition caption + two grains of transition distribution
// caption).
//
// Design notes:
//   • Buckets are named for direct grep-ability: `improved_by_1`,
//     `improved_by_2`, `degraded_by_1`, `degraded_by_2` split by
//     |delta_rank| so ops distinguishes 'INFOVISION × attributed_mrr clawed
//     back from sustained_direction_only → sustained_both_axes' (+1) from
//     'ZEBRA × clawback_exposure leapt from volatile → sustained_both_axes'
//     (+2). The rank table only spans [-1, 2] (see P11.123 VERDICT_RANK),
//     so the maximum absolute delta_rank is 2 and no further buckets are
//     needed. Rows with |delta_rank| outside this range are impossible from
//     valid P11.123 inputs but classified into `improved_by_other` /
//     `degraded_by_other` defensively so a hand-edited envelope cannot
//     silently drop rows.
//   • `rotated` collapses direction↔magnitude axis flips and flat↔volatile
//     zero-rank flips together — matches P11.123 posture that a rotation
//     within the same axis-count is one thing, not two.
//   • `stable` counts include all rows whose current + previous verdicts
//     match; `first_classification` counts include all rows without a
//     previous entry. Both are informational counts (no signal to alert on)
//     but retained on the envelope so ops can spot 'the roster added 12 new
//     (partner × KPI) pairs this week' (first_classification=12) or 'the
//     roster is fully described by the per-pair verdict block above'
//     (stable=all).
//   • `alert_worthy = improved + degraded + rotated + undecidable` — matches
//     the formatter suppression on the underlying P11.123 module (which
//     suppresses first_classification + stable rows) so a caller can check
//     ONE scalar to decide whether the caption is worth rendering.
//   • `net_delta_rank` sums delta_rank across rows treating null (undecidable
//     + first_classification) as 0 — a positive integer means the per-pair
//     roster moved UP the ladder on balance, a negative integer means it
//     moved DOWN. This is a coarse roster-health barometer; ops still reads
//     the per-pair transitions above to see which specific pairs drove
//     the shift.
//   • Envelope carries window_size / first_week / last_week / threshold /
//     sustained_p90_threshold verbatim from the input transition envelope so
//     a JSONL consumer joining the distribution to the per-pair transition
//     envelope on the same weekly row aligns by row index without extra
//     keys.
//   • Formatter suppresses on window_size < 3 (matches P11.123 formatter
//     suppression) AND on total == 0 (empty envelope) AND on alert_worthy ==
//     0 (every row is first_classification or stable — the per-pair
//     transition table above already suppressed itself). Renders a single-
//     line caption + inline bullet list of the non-zero buckets so the
//     scalar summary consumes at most three lines in the digest email.

import type { DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition } from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";

export interface PerResellerMetricPersistenceScorecardVerdictTransitionDistribution {
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

export interface DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly distribution: PerResellerMetricPersistenceScorecardVerdictTransitionDistribution;
}

/**
 * Fold the P11.123 per-(partner × metric) verdict-transition envelope into a
 * scalar DISTRIBUTION over the six transition tokens with a further split on
 * |delta_rank| for improved (+1 / +2 / other) and degraded (-1 / -2 / other).
 *
 * Pure derivation — no new folds, no scorecard replay, no new inputs. The
 * output distribution is the aggregation dual of the input row-per-pair
 * envelope: 'ACROSS PAIRS, how much changed by how much?' vs. the input's
 * 'PER PAIR, what changed?'.
 *
 * A caller who only needs the alert-worthy count can read
 * `output.distribution.alert_worthy` rather than re-summing the individual
 * bucket counts; a caller who wants the coarse roster-health barometer
 * can read `output.distribution.net_delta_rank` (positive = ladder-up on
 * balance; negative = ladder-down; zero = balanced).
 */
export function computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution(
  transitions: DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
): DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution {
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
 * Render the per-(partner × metric) verdict-transition delta-rank
 * distribution as a single-line caption + inline bullet list of the non-zero
 * buckets. Splices directly BELOW the P11.124 per-pair verdict-transition
 * table so ops reads the row-per-pair transitions above and the collapsed
 * scalar summary inline below without re-summing rows in their head.
 *
 * Returns "" when window_size < 3 (matches the P11.123 / P11.124 formatter
 * suppression on the same short-window guard) OR when total == 0 (empty
 * envelope) OR when alert_worthy == 0 (every row resolves to
 * first_classification or stable — the per-pair transition table above
 * already suppressed itself and this scalar summary would just repeat the
 * suppression rule with counts).
 *
 * The bullet list only renders non-zero buckets in a fixed spec order
 * (improved_by_2, improved_by_1, degraded_by_1, degraded_by_2, rotated,
 * undecidable, plus improved_by_other / degraded_by_other defensively at
 * the tail) so a run with only rotated + undecidable resolves to two
 * bullets rather than eight zero-count noise bullets.
 */
export function formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistributionSection(
  snapshot: DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionDistribution,
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
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-(partner &times; metric) verdict-transition distribution across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Scalar summary of the per-pair transition table above. Aggregates the row-per-pair transitions into bucket counts split by <code>|delta_rank|</code> so ops distinguishes a single-rank claw-back (<code>improved_by_1</code>) from a two-rank leap (<code>improved_by_2</code>) without walking the row grid. n=<strong>${d.total}</strong> pairs classified this week &mdash; <strong>${d.alert_worthy}</strong> alert-worthy, <strong>${d.stable}</strong> stable, <strong>${d.first_classification}</strong> first-classification. Net &Delta;rank across the roster = <strong>${escapeHtml(formatSignedInt(d.net_delta_rank))}</strong> (${netMoveLabel}).</p>
    <ul style="font-family:Arial,sans-serif;font-size:13px;margin-top:4px">${bulletsHtml}
    </ul>`;
}
