// Weekly digest PORTFOLIO persistence scorecard verdict TRANSITION
// DELTA-RANK DISTRIBUTION scalar-summary (P11.131).
//
// The P11.113 / P11.114 portfolio verdict-transition pair emits ONE discrete
// transition token per Monday describing how the portfolio verdict moved
// week-over-week — improved / degraded / rotated / undecidable / stable /
// first_classification. Ops now reads the token as a badge in the digest.
//
// The sibling per-metric (P11.125/P11.126), per-partner (P11.127/P11.128), and
// per-(partner × metric) (P11.129/P11.130) grains already carry a scalar
// DISTRIBUTION summary — bucket counts split on |delta_rank| plus a derived
// alert_worthy scalar and net_delta_rank barometer — so ops can grep
// 'improved_by_2=1 degraded_by_1=6 net Δrank=-4' out of the JSONL envelope at
// three of four scorecard grains without walking the row-per-KPI or
// row-per-partner grids.
//
// This module CAPSTONES the distribution family at the FOURTH and coarsest
// scorecard grain — the PORTFOLIO. The portfolio transition is a single row
// per week rather than a rows[] envelope, so the resulting distribution is
// degenerate at n=1: every emitted distribution has `total === 1` (excepting
// the pathological empty case that the compute layer never produces). The
// value of exposing it in this shape is not aggregation reduction — it is
// vocabulary consistency. A JSONL consumer iterating the four
// snapshot_*_persistence_scorecard_verdict_transition_distribution envelopes
// finds the SAME bucket set and the SAME alert_worthy / net_delta_rank
// scalars at every grain, so a cross-grain regression alert can read one
// vocabulary rather than four.
//
// Pure derivation of the P11.113 portfolio transition — no new folds, no
// scorecard replay, no new inputs. The scorecard envelope (P11.105) is
// consumed to source the window_size / first_week / last_week / threshold
// envelope fields the sibling distributions carry, since P11.113 emits just
// the transition + delta_rank and does not itself carry a window envelope.
// sustained_p90_threshold is supplied as an argument matching P11.107 / other
// portfolio-family verdict modules; the default matches
// DEFAULT_SUSTAINED_P90_THRESHOLD (=3).
//
// Design notes:
//   • Bucket names, alert_worthy definition, and net_delta_rank semantics
//     mirror the P11.125 per-metric module byte-for-byte so ops learns ONE
//     distribution vocabulary and applies it at ALL FOUR grains without
//     switching mental models.
//   • `first_classification` and `stable` are informational counts — never
//     alert_worthy. Same posture as siblings.
//   • `rotated` and `undecidable` contribute to `alert_worthy` but carry
//     net_delta_rank contribution 0 (rotated has delta_rank === 0 by
//     construction; undecidable has delta_rank === null which the fold
//     skips).
//   • The formatter suppresses on window_size < 3 (matches P11.113/P11.114
//     posture) AND on alert_worthy === 0 (the transition itself is not
//     alert-worthy — the P11.114 caption already suppressed itself and this
//     scalar summary would just repeat that suppression rule with counts).
//     total === 0 cannot occur in practice at this grain (compute always
//     emits total=1) but the guard is kept for consistency with siblings.
//   • Bullet order mirrors P11.125: improved_by_2 → improved_by_1 →
//     degraded_by_1 → degraded_by_2 → rotated → undecidable → *_by_other.
//     At n=1 the bullet list resolves to exactly one bullet.

import type { DigestSnapshotPersistenceScorecard } from "./digest-snapshot-persistence-scorecard";
import type { DigestSnapshotPersistenceScorecardVerdictTransition } from "./digest-snapshot-persistence-scorecard-verdict-transition";

const DEFAULT_SUSTAINED_P90_THRESHOLD = 3;

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

export interface DigestSnapshotPersistenceScorecardVerdictTransitionDistribution {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly distribution: PersistenceScorecardVerdictTransitionDistribution;
}

/**
 * Fold the P11.113 portfolio verdict-transition into the SAME distribution
 * shape the sibling per-metric / per-partner / per-(partner × metric)
 * modules emit. Envelope fields come from the P11.105 portfolio scorecard
 * (window_size / first_week / last_week / threshold) plus the caller-supplied
 * sustainedP90Threshold matching the P11.107 verdict argument.
 *
 * At the portfolio grain n === 1 so the distribution counts are all in
 * {0, 1} — the value is vocabulary consistency across the four grains
 * rather than reduction. A downstream consumer can join transitions to
 * verdicts on the same weekly row aligns by row index without extra keys.
 */
export function computeDigestSnapshotPersistenceScorecardVerdictTransitionDistribution(
  transition: DigestSnapshotPersistenceScorecardVerdictTransition,
  scorecard: DigestSnapshotPersistenceScorecard,
  sustainedP90Threshold: number = DEFAULT_SUSTAINED_P90_THRESHOLD,
): DigestSnapshotPersistenceScorecardVerdictTransitionDistribution {
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

  switch (transition.transition) {
    case "first_classification":
      first_classification = 1;
      break;
    case "undecidable":
      undecidable = 1;
      break;
    case "stable":
      stable = 1;
      break;
    case "rotated":
      rotated = 1;
      break;
    case "improved":
      if (transition.delta_rank === 1) improved_by_1 = 1;
      else if (transition.delta_rank === 2) improved_by_2 = 1;
      else improved_by_other = 1;
      if (transition.delta_rank !== null) net_delta_rank = transition.delta_rank;
      break;
    case "degraded":
      if (transition.delta_rank === -1) degraded_by_1 = 1;
      else if (transition.delta_rank === -2) degraded_by_2 = 1;
      else degraded_by_other = 1;
      if (transition.delta_rank !== null) net_delta_rank = transition.delta_rank;
      break;
  }

  const total = 1;
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
    window_size: scorecard.window_size,
    first_week: scorecard.first_week,
    last_week: scorecard.last_week,
    sustained_p90_threshold: sustainedP90Threshold,
    threshold: scorecard.threshold,
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
 * Render the portfolio verdict-transition delta-rank distribution as a short
 * single-line caption + inline single-bullet list. Splices directly BELOW
 * the P11.114 portfolio verdict-transition badge (in the eventual cron-wire
 * tick) so ops reads the current-week portfolio transition badge above and
 * the SAME vocabulary the three finer grains emit below without switching
 * mental models across grains.
 *
 * Suppression trio matches the sibling formatters:
 *   - window_size < 3 (matches P11.113 / P11.114 short-window guard)
 *   - total === 0    (defensive; compute always emits total=1 at this grain)
 *   - alert_worthy === 0 (transition is first_classification or stable; the
 *     P11.114 caption above already suppressed itself, no need to repeat)
 *
 * At n === 1 the bullet list resolves to exactly ONE bullet (or zero when
 * suppression kicks in), matching the coarsest-grain summary posture.
 */
export function formatDigestSnapshotPersistenceScorecardVerdictTransitionDistributionSection(
  snapshot: DigestSnapshotPersistenceScorecardVerdictTransitionDistribution,
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
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Portfolio verdict-transition distribution across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Scalar summary of the portfolio transition token above using the SAME vocabulary the per-metric / per-partner / per-pair distributions carry. n=<strong>${d.total}</strong> transition classified this week &mdash; <strong>${d.alert_worthy}</strong> alert-worthy, <strong>${d.stable}</strong> stable, <strong>${d.first_classification}</strong> first-classification. Net &Delta;rank across the portfolio = <strong>${escapeHtml(formatSignedInt(d.net_delta_rank))}</strong> (${netMoveLabel}).</p>
    <ul style="font-family:Arial,sans-serif;font-size:13px;margin-top:4px">${bulletsHtml}
    </ul>`;
}
