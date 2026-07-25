// Weekly digest per-metric persistence scorecard verdict TRANSITION tracker
// (P11.115).
//
// The P11.113 / P11.114 portfolio verdict-TRANSITION pair closed the
// week-over-week regression-detection gap at the PORTFOLIO grain — ops now
// reads a single transition token (improved / degraded / rotated / undecidable
// / stable / first_classification) beneath the P11.108 portfolio verdict badge
// in the Monday digest. But the same regression-detection gap still exists one
// grain DOWN: the P11.109 / P11.110 per-metric verdict emits one verdict token
// per HEADLINE_METRICS KPI, and every reader now has to keep last week's
// per-metric verdict table in their head to spot 'attributed_mrr flipped from
// sustained_both_axes → volatile week-over-week' — a very different story from
// 'attributed_mrr has been volatile for six weeks running'.
//
// This module closes that per-metric regression-detection gap by classifying
// the (previous per-metric verdict, current per-metric verdict) pair PER ROW
// using the SAME ladder the P11.113 portfolio-grain transition module walks,
// so ops can grep 'attributed_mrr=degraded attributed_churn_30d=stable' out of
// the JSONL envelope or eyeball a colour-coded per-KPI transition table in the
// digest email without diffing two per-metric verdict tables in their head.
//
// The transition is a pure derivation of the two P11.109 verdict envelopes —
// no new folds, no new inputs, no scorecard replay. Rows are joined by KPI
// key: for each KPI present in the current envelope, the previous envelope is
// consulted for the same key; a KPI without a previous row emits
// `first_classification` (fresh baseline for that specific KPI, most commonly
// a KPI that appeared this week for the first time). Rows in the previous
// envelope missing from the current envelope are dropped — the output tracks
// the CURRENT scorecard row set, not the union.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / ... / P11.107 →
// P11.108 / P11.109 → P11.110 / P11.111 → P11.112 / P11.113 → P11.114 cadence
// — cron-route wiring intentionally deferred to a follow-up tick (P11.116) so
// the per-metric transition ladder can be exercised in isolation before
// touching the hot Monday cron path.
//
// Design notes:
//   • The ladder mirrors P11.113 exactly — same six transition tokens, same
//     VERDICT_RANK table, same rank-tie-→rotated resolution — so ops learn ONE
//     transition vocabulary and apply it at portfolio + per-metric grains
//     without switching mental models between grains. Rank table is duplicated
//     locally rather than imported to keep the pure-lib module standalone (a
//     shared table would coupled the two files at the exported-symbol level;
//     a token-level helper on P11.113 would force per-KPI summary strings to
//     be assembled remotely). Matches the P11.109 / P11.111 posture of
//     duplicating the classifyRow ladder from P11.107 for the same reason.
//   • Rows preserved in the input current-verdict row order — no re-sort, no
//     filter. Consumers joining transitions to verdicts by row index align
//     without extra keys.
//   • A KPI present in `current` but absent from `previous` emits
//     `first_classification` for that KPI ONLY — the other KPIs still resolve
//     against their previous rows. Matches P11.113 posture that a null
//     previous baseline yields `first_classification` rather than being
//     folded into `stable` or `undecidable`.
//   • A KPI whose current verdict is `insufficient_window` OR whose previous
//     verdict is `insufficient_window` emits `undecidable` — the ladder cannot
//     compare axis-count against an undecidable side without inventing
//     meaning. Matches P11.113 posture.
//   • Envelope shape mirrors the P11.109 per-metric verdict envelope
//     (window_size / first_week / last_week / sustained_p90_threshold /
//     threshold / rows) so a JSONL consumer joining transitions to verdicts on
//     the same weekly row aligns them without extra keys.
//   • The formatter suppresses `first_classification` and `stable` rows so the
//     digest stays quiet on KPIs that carry no new information week-over-week
//     — no orphan 'attributed_mrr: stable' row repeating what the verdict
//     caption above already said. Matches P11.113 formatter suppression.

import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerMetricPersistenceScorecardVerdict,
  PerMetricPersistenceScorecardVerdictRow,
} from "./digest-snapshot-per-metric-persistence-scorecard-verdict";
import type {
  PersistenceScorecardVerdictToken,
} from "./digest-snapshot-persistence-scorecard-verdict";
import type {
  PersistenceScorecardVerdictTransitionToken,
} from "./digest-snapshot-persistence-scorecard-verdict-transition";

export type {
  PersistenceScorecardVerdictTransitionToken,
} from "./digest-snapshot-persistence-scorecard-verdict-transition";

const VERDICT_RANK: Record<PersistenceScorecardVerdictToken, number> = {
  insufficient_window: -1,
  flat: 0,
  volatile: 0,
  sustained_magnitude_only: 1,
  sustained_direction_only: 1,
  sustained_both_axes: 2,
};

export interface PerMetricPersistenceScorecardVerdictTransitionRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly transition: PersistenceScorecardVerdictTransitionToken;
  readonly from_verdict: PersistenceScorecardVerdictToken | null;
  readonly to_verdict: PersistenceScorecardVerdictToken;
  readonly from_rank: number | null;
  readonly to_rank: number;
  readonly delta_rank: number | null;
  readonly summary: string;
}

export interface DigestSnapshotPerMetricPersistenceScorecardVerdictTransition {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly rows: readonly PerMetricPersistenceScorecardVerdictTransitionRow[];
}

function classifyRow(
  current: PerMetricPersistenceScorecardVerdictRow,
  previous: PerMetricPersistenceScorecardVerdictRow | null,
): PerMetricPersistenceScorecardVerdictTransitionRow {
  const toRank = VERDICT_RANK[current.verdict];
  const metricName = current.metric_name;

  if (previous === null) {
    return {
      key: current.key,
      metric_name: metricName,
      unit: current.unit,
      transition: "first_classification",
      from_verdict: null,
      to_verdict: current.verdict,
      from_rank: null,
      to_rank: toRank,
      delta_rank: null,
      summary: `${metricName} first verdict (${current.verdict}) — no prior baseline to diff against.`,
    };
  }

  const fromRank = VERDICT_RANK[previous.verdict];

  if (toRank === -1 || fromRank === -1) {
    return {
      key: current.key,
      metric_name: metricName,
      unit: current.unit,
      transition: "undecidable",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: null,
      summary: `${metricName} undecidable transition (${previous.verdict} → ${current.verdict}) — at least one side has insufficient_window.`,
    };
  }

  if (current.verdict === previous.verdict) {
    return {
      key: current.key,
      metric_name: metricName,
      unit: current.unit,
      transition: "stable",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: 0,
      summary: `${metricName} stable verdict (${current.verdict}) — no week-over-week change.`,
    };
  }

  const deltaRank = toRank - fromRank;

  if (deltaRank > 0) {
    return {
      key: current.key,
      metric_name: metricName,
      unit: current.unit,
      transition: "improved",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: deltaRank,
      summary: `${metricName} improved week-over-week (${previous.verdict} → ${current.verdict}, rank ${fromRank} → ${toRank}).`,
    };
  }

  if (deltaRank < 0) {
    return {
      key: current.key,
      metric_name: metricName,
      unit: current.unit,
      transition: "degraded",
      from_verdict: previous.verdict,
      to_verdict: current.verdict,
      from_rank: fromRank,
      to_rank: toRank,
      delta_rank: deltaRank,
      summary: `${metricName} degraded week-over-week (${previous.verdict} → ${current.verdict}, rank ${fromRank} → ${toRank}).`,
    };
  }

  return {
    key: current.key,
    metric_name: metricName,
    unit: current.unit,
    transition: "rotated",
    from_verdict: previous.verdict,
    to_verdict: current.verdict,
    from_rank: fromRank,
    to_rank: toRank,
    delta_rank: 0,
    summary: `${metricName} rotated week-over-week (${previous.verdict} → ${current.verdict}) — axis-count unchanged but the specific axis flipped.`,
  };
}

/**
 * Classify the (previous per-metric verdict, current per-metric verdict) pair
 * PER ROW using the SAME ladder as the P11.113 portfolio-grain transition
 * module, so ops sees the same six transition tokens (first_classification /
 * undecidable / stable / improved / degraded / rotated) at portfolio AND
 * per-metric grains.
 *
 * Rows are joined by KPI key: for each KPI in the CURRENT envelope, the
 * PREVIOUS envelope is consulted for the same key; a KPI absent from previous
 * emits `first_classification` (fresh per-KPI baseline). Rows only present in
 * previous are dropped — the output tracks the current scorecard's row set,
 * not the union.
 *
 * When `previous` is null the entire output is a first-classification pass —
 * matches P11.113 posture at the portfolio grain.
 */
export function computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
  current: DigestSnapshotPerMetricPersistenceScorecardVerdict,
  previous: DigestSnapshotPerMetricPersistenceScorecardVerdict | null,
): DigestSnapshotPerMetricPersistenceScorecardVerdictTransition {
  const previousByKey = new Map<
    KnownKpiSection,
    PerMetricPersistenceScorecardVerdictRow
  >();
  if (previous !== null) {
    for (const row of previous.rows) previousByKey.set(row.key, row);
  }

  const rows = current.rows.map((row) =>
    classifyRow(row, previousByKey.get(row.key) ?? null),
  );

  return {
    window_size: current.window_size,
    first_week: current.first_week,
    last_week: current.last_week,
    sustained_p90_threshold: current.sustained_p90_threshold,
    threshold: current.threshold,
    rows,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TRANSITION_BADGE_STYLE: Record<
  PersistenceScorecardVerdictTransitionToken,
  string
> = {
  first_classification: "background:#e5e7eb;color:#374151",
  undecidable: "background:#e5e7eb;color:#374151",
  stable: "background:#1f2937;color:#f9fafb",
  improved: "background:#065f46;color:#ecfdf5",
  degraded: "background:#7f1d1d;color:#fef2f2",
  rotated: "background:#7c2d12;color:#fff7ed",
};

/**
 * Render the per-metric persistence scorecard verdict transitions as a
 * compact table with one row per KPI whose transition is alert-worthy (KPI
 * key, metric name, transition badge, summary). Splices directly BELOW the
 * P11.110 per-metric verdict table so ops reads the current-week per-KPI
 * verdict badges above and the week-over-week per-KPI transition badges
 * inline below without diffing two per-metric verdict tables in their head.
 *
 * Returns "" when window_size < 3 (matches the P11.109/P11.110 formatter
 * suppression on the same short-window guard) OR when zero rows carry an
 * alert-worthy transition — a run where every KPI resolves to
 * `first_classification` or `stable` produces no table so the digest stays
 * quiet on quiet weeks. Matches the P11.113 formatter suppression posture at
 * the portfolio grain.
 *
 * In the P11.116 cron wiring this lands directly BELOW the P11.110
 * perMetricPersistenceScorecardVerdictSection — the transition caption at
 * the bottom of the per-metric ladder so a reader who already saw the
 * per-KPI verdict badges can immediately read the collapsed per-KPI
 * transitions without reconciling every verdict row in their head.
 */
export function formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
  transitions: DigestSnapshotPerMetricPersistenceScorecardVerdictTransition,
): string {
  if (transitions.window_size < 3) return "";
  const renderable = transitions.rows.filter(
    (r) => r.transition !== "first_classification" && r.transition !== "stable",
  );
  if (renderable.length === 0) return "";

  const firstWeek = transitions.first_week
    ? escapeHtml(transitions.first_week)
    : "";
  const lastWeek = transitions.last_week
    ? escapeHtml(transitions.last_week)
    : "";
  const thresholdPct = (transitions.threshold * 100).toFixed(1);

  const rowsHtml = renderable
    .map((row) => {
      const token = escapeHtml(row.transition);
      const summary = escapeHtml(row.summary);
      const badgeStyle = TRANSITION_BADGE_STYLE[row.transition];
      return `
        <tr>
          <td>${escapeHtml(row.key)}</td>
          <td>${escapeHtml(row.metric_name)}</td>
          <td><span style="padding:2px 8px;border-radius:4px;font-family:Menlo,monospace;font-size:12px;${badgeStyle}">${token}</span></td>
          <td>${summary}</td>
        </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-metric persistence verdict transition across the ${transitions.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${transitions.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Collapses each KPI&rsquo;s (previous verdict, current verdict) pair into ONE transition token using the same ladder as the P11.113 portfolio-grain transition module. Rows resolving to <code>first_classification</code> (fresh baseline for that KPI) or <code>stable</code> (verdict badge above already fully describes the state) are suppressed so the digest stays quiet on quiet KPIs &mdash; only alert-worthy transitions (<code>improved</code>, <code>degraded</code>, <code>rotated</code>, <code>undecidable</code>) render.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>KPI</th>
          <th>Metric</th>
          <th>Transition</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
