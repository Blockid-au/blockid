// Weekly digest PER-METRIC CROSS-PARTNER alerts pure-lib (P11.137).
//
// The P11.135 / P11.136 pair opened the per-partner cross-metric ranking
// surface — one row per reseller_code aggregating that partner's KPI
// portfolio into the same ten-bucket distribution vocabulary the four
// grain-level distribution modules emit. That surface answers 'WHICH
// PARTNERS own the loudest cross-KPI signal this week?' but leaves the
// dual question — 'WHICH KPIs own the loudest cross-partner signal
// this week?' — unanswered without the reader manually pivoting the
// pair-level table (n=partner×13 rows) by metric_key.
//
// This module closes that dual gap. Each row aggregates ONE metric's
// per-partner transitions from the P11.123 per-pair envelope into the
// SAME scalar bucket set every grain-level distribution module emits —
// `improved_by_1`, `improved_by_2`, `improved_by_other`, `degraded_by_1`,
// `degraded_by_2`, `degraded_by_other`, `rotated`, `undecidable`,
// `stable`, `first_classification`, `alert_worthy`, `net_delta_rank`.
// Rows are sorted alert_worthy DESC, net_delta_rank ASC (most-negative
// wins so degraded KPIs lead ties), key ASC for stable tie-break — so
// ops reads the loudest KPIs at the top and can rank KPIs by cross-
// partner signal rather than by variance.
//
// Pure derivation of the P11.123 envelope — no new folds, no scorecard
// replay, no new inputs. The output is the (per-metric, cross-partner)
// dual of the P11.135 per-partner ranking: the P11.135 module answered
// 'PER PARTNER across the partner's KPI portfolio, how much changed by
// how much?'; this module answers 'PER KPI across the roster of
// partners, how much changed by how much?'.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.133 → P11.134 / P11.135 → P11.136 cadence — cron-route wiring
// intentionally deferred to a follow-up tick (P11.138) so the per-metric
// cross-partner row shape can be exercised in isolation before touching
// the hot Monday cron path (already hosting four grains of scorecard +
// four grains of verdict + four grains of transition + four grains of
// transition distribution + cross-grain family-alerts executive summary
// + per-partner cross-metric ranking).
//
// Design notes:
//   • Bucket set matches the four grain-level distribution modules and
//     the P11.135 per-partner ranking byte-for-byte — ops learns ONE
//     distribution vocabulary and applies it at every scorecard grain
//     plus both cross-cut ranking surfaces.
//   • `alert_worthy = undecidable + rotated + improved_* + degraded_*`
//     per metric. Matches every downstream grain's alert_worthy so a
//     caller can grep `alert_worthy=N` at any grain and know it means
//     the same thing.
//   • `net_delta_rank` sums delta_rank across a metric's rows treating
//     null (undecidable + first_classification) as 0. Positive = the
//     KPI moved UP the ladder on balance across partners this week;
//     negative = moved DOWN; zero = balanced. Coarse per-metric health
//     barometer; ops still reads the per-pair transitions above to see
//     which specific partners drove the shift.
//   • Row ordering: alert_worthy DESC then net_delta_rank ASC then key
//     ASC. alert_worthy DESC puts the loudest KPIs first; net_delta_rank
//     ASC breaks alert-worthy ties by favouring the more-degraded KPI
//     (a degraded_by_2 tie is a louder ops signal than an improved_by_2
//     tie); key ASC breaks remaining ties so re-runs on the same input
//     produce identical row ordering.
//   • Rows carry every bucket count even when zero (not a filter list)
//     so a JSONL consumer joining rows by key across ticks always finds
//     the same key set on every row — no shape drift across weeks when
//     a KPI's bucket mix changes.
//   • metric_name + unit are carried through from the first-seen input
//     row for that metric so the visual table can label rows with the
//     human-readable KPI name without a lookup table. Every input row
//     for a given key is guaranteed to have the same metric_name+unit
//     since it flows from the same HEADLINE_METRICS spec, so first-seen
//     is safe.
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `rows.length === 0` OR every row's `alert_worthy === 0` (each
//     row's contribution would render an empty bullet row — the four
//     grain-level distribution captions above already emitted their own
//     quiet-summary suppression so repeating it here would be noise).
//   • Rows themselves do not self-suppress. A row where `alert_worthy
//     === 0` is retained (with all-zero buckets + stable/first counts)
//     so ops can spot 'tier_mix contributed 5 stable rows this week'
//     rather than being hidden entirely. The formatter emits ONLY rows
//     with `alert_worthy > 0` so the ranked table stays focused on
//     KPIs with a signal but the JSONL envelope preserves the complete
//     per-metric set.

import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  PerResellerMetricPersistenceScorecardVerdictTransitionRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";

export interface PerMetricCrossPartnerAlertsRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
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

export interface DigestSnapshotPerMetricCrossPartnerAlerts {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly rows: readonly PerMetricCrossPartnerAlertsRow[];
}

interface Bucket {
  key: KnownKpiSection;
  metric_name: string;
  unit: HeadlineMetricUnit;
  total: number;
  first_classification: number;
  undecidable: number;
  stable: number;
  rotated: number;
  improved_by_1: number;
  improved_by_2: number;
  improved_by_other: number;
  degraded_by_1: number;
  degraded_by_2: number;
  degraded_by_other: number;
  net_delta_rank: number;
}

function emptyBucket(
  key: KnownKpiSection,
  metric_name: string,
  unit: HeadlineMetricUnit,
): Bucket {
  return {
    key,
    metric_name,
    unit,
    total: 0,
    first_classification: 0,
    undecidable: 0,
    stable: 0,
    rotated: 0,
    improved_by_1: 0,
    improved_by_2: 0,
    improved_by_other: 0,
    degraded_by_1: 0,
    degraded_by_2: 0,
    degraded_by_other: 0,
    net_delta_rank: 0,
  };
}

function accumulate(
  bucket: Bucket,
  row: PerResellerMetricPersistenceScorecardVerdictTransitionRow,
): void {
  bucket.total += 1;
  switch (row.transition) {
    case "first_classification":
      bucket.first_classification += 1;
      break;
    case "undecidable":
      bucket.undecidable += 1;
      break;
    case "stable":
      bucket.stable += 1;
      break;
    case "rotated":
      bucket.rotated += 1;
      break;
    case "improved":
      if (row.delta_rank === 1) bucket.improved_by_1 += 1;
      else if (row.delta_rank === 2) bucket.improved_by_2 += 1;
      else bucket.improved_by_other += 1;
      if (row.delta_rank !== null) bucket.net_delta_rank += row.delta_rank;
      break;
    case "degraded":
      if (row.delta_rank === -1) bucket.degraded_by_1 += 1;
      else if (row.delta_rank === -2) bucket.degraded_by_2 += 1;
      else bucket.degraded_by_other += 1;
      if (row.delta_rank !== null) bucket.net_delta_rank += row.delta_rank;
      break;
  }
}

/**
 * Fold the P11.123 per-(partner × metric) verdict-transition envelope into
 * a ROW-PER-METRIC cross-partner alerts summary. Each row carries the
 * same ten bucket counts + alert_worthy + net_delta_rank scalars every
 * grain-level distribution module emits so ops learns ONE distribution
 * vocabulary and applies it at every grain plus both cross-cut ranking
 * surfaces.
 *
 * Rows are sorted alert_worthy DESC (loudest KPIs first), then
 * net_delta_rank ASC (most-negative wins so degraded KPIs lead ties),
 * then key ASC for stable tie-break — the same input always produces
 * the same ordering.
 */
export function computeDigestSnapshotPerMetricCrossPartnerAlerts(
  transitions: DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
): DigestSnapshotPerMetricCrossPartnerAlerts {
  const byKey = new Map<KnownKpiSection, Bucket>();
  for (const row of transitions.rows) {
    let bucket = byKey.get(row.key);
    if (!bucket) {
      bucket = emptyBucket(row.key, row.metric_name, row.unit);
      byKey.set(row.key, bucket);
    }
    accumulate(bucket, row);
  }

  const rows: PerMetricCrossPartnerAlertsRow[] = Array.from(byKey.values()).map(
    (b) => {
      const alert_worthy =
        b.undecidable +
        b.rotated +
        b.improved_by_1 +
        b.improved_by_2 +
        b.improved_by_other +
        b.degraded_by_1 +
        b.degraded_by_2 +
        b.degraded_by_other;
      return {
        key: b.key,
        metric_name: b.metric_name,
        unit: b.unit,
        total: b.total,
        first_classification: b.first_classification,
        undecidable: b.undecidable,
        stable: b.stable,
        rotated: b.rotated,
        improved_by_1: b.improved_by_1,
        improved_by_2: b.improved_by_2,
        improved_by_other: b.improved_by_other,
        degraded_by_1: b.degraded_by_1,
        degraded_by_2: b.degraded_by_2,
        degraded_by_other: b.degraded_by_other,
        alert_worthy,
        net_delta_rank: b.net_delta_rank,
      };
    },
  );

  rows.sort((a, b) => {
    if (a.alert_worthy !== b.alert_worthy) return b.alert_worthy - a.alert_worthy;
    if (a.net_delta_rank !== b.net_delta_rank) return a.net_delta_rank - b.net_delta_rank;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  return {
    window_size: transitions.window_size,
    first_week: transitions.first_week,
    last_week: transitions.last_week,
    sustained_p90_threshold: transitions.sustained_p90_threshold,
    threshold: transitions.threshold,
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

function formatSignedInt(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Render the per-metric cross-partner alerts summary as a ranked table:
 * one row per KPI where alert_worthy > 0, ordered loudest first.
 * Designed to splice IMMEDIATELY BELOW the P11.135/P11.136 per-partner
 * cross-metric ranking so the hierarchy descends pair-rows (P11.124) →
 * per-partner ranking (P11.135) → per-metric ranking (P11.137) →
 * per-pair scalar distribution (P11.130) — both cross-cut rankings sit
 * adjacent so ops can pivot from 'loudest partners' to 'loudest KPIs' in
 * a single glance.
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when the envelope has
 * zero rows OR when every row's alert_worthy === 0 (the four grain-level
 * distribution captions above already emitted their own quiet-summary
 * suppression — repeating it as an empty table would be noise).
 *
 * Only rows with alert_worthy > 0 render as table rows so the visual
 * table stays focused on KPIs with a signal; quiet KPIs (all-stable /
 * all-first_classification) are retained on the JSONL envelope so a
 * consumer joining rows by key across ticks always finds the complete
 * set, but they are omitted from the visual table since a row of all
 * zeros just repeats the pair-level table suppression rule with counts.
 */
export function formatDigestSnapshotPerMetricCrossPartnerAlertsSection(
  snapshot: DigestSnapshotPerMetricCrossPartnerAlerts,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.rows.length === 0) return "";
  const alertingRows = snapshot.rows.filter((r) => r.alert_worthy > 0);
  if (alertingRows.length === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);

  const rowsHtml = alertingRows
    .map((r) => {
      const netMove =
        r.net_delta_rank > 0
          ? "&uarr;"
          : r.net_delta_rank < 0
            ? "&darr;"
            : "&harr;";
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee"><strong>${escapeHtml(r.metric_name)}</strong></td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.alert_worthy}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatSignedInt(r.net_delta_rank))} ${netMove}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.improved_by_2}/${r.improved_by_1}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.degraded_by_1}/${r.degraded_by_2}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.rotated}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.undecidable}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.stable}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.total}</td></tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-metric cross-partner alerts ranking across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Ranks KPIs by cross-partner alert-signal so ops can triage the loudest KPIs first rather than the highest-variance KPIs. Each row aggregates ONE metric's per-partner transitions from the pair-level table into the same distribution vocabulary the grain-level captions emit &mdash; <code>alert_worthy = improved + degraded + rotated + undecidable</code>, <code>net &Delta;rank</code> = signed rank movement across the KPI's per-partner distribution (positive = ladder-up on balance, negative = ladder-down). Only KPIs with <code>alert_worthy &gt; 0</code> render in the table; quiet KPIs are retained on the JSONL envelope for cross-tick joins but suppressed here to keep the table focused on signal.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">alert_worthy</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">net &Delta;rank</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">imp +2/+1</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">deg &minus;1/&minus;2</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">rotated</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">undecidable</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">stable</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">n</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
