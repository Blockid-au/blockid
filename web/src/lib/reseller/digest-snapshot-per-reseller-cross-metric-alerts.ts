// Weekly digest PER-PARTNER CROSS-METRIC alerts pure-lib (P11.135).
//
// The P11.117 / P11.118 pair opened a per-partner surface that collapses
// every partner's KPI portfolio into a SINGLE verdict token (one row per
// reseller_code — the partner is either improving, degrading, rotated,
// stable, or first_classification on their overall persistence scorecard).
// A partner whose portfolio splits half-improving / half-degrading is
// visible in that surface only as `rotated` or `undecidable` — the surface
// answers 'what is this partner's OVERALL persistence-scorecard verdict?'
// but not 'which partners have the loudest cross-KPI signal right now?'.
//
// The P11.129 / P11.130 pair opened a per-(partner × metric) distribution
// surface that folds the ENTIRE roster into a single scalar distribution
// (one envelope across every partner × every KPI). That surface answers
// 'ACROSS the roster, how much changed by how much?' but strips out
// partner identity — a JSONL consumer that wants to rank partners by
// alert-signal has to walk the row-per-pair table (n=partner×13 rows)
// and re-aggregate by reseller_code themselves.
//
// This module closes the ranking gap. Each row aggregates ONE partner's
// per-KPI transitions from the P11.123 per-pair envelope into the SAME
// scalar bucket set the four grain-level distribution modules emit —
// `improved_by_1`, `improved_by_2`, `degraded_by_1`, `degraded_by_2`,
// `improved_by_other`, `degraded_by_other`, `rotated`, `undecidable`,
// `stable`, `first_classification`, `alert_worthy`, `net_delta_rank`.
// Rows are sorted alert_worthy DESC, net_delta_rank ASC (most-negative
// wins so degradations lead ties), reseller_code ASC for stable
// tie-break — so ops reads the loudest partners at the top and can rank
// partners by cross-KPI signal rather than by revenue.
//
// Pure derivation of the P11.123 envelope — no new folds, no scorecard
// replay, no new inputs. The output is the (per-partner, cross-metric)
// dual of the P11.129 per-pair distribution: the P11.129 module answered
// 'ACROSS PAIRS how much changed by how much?'; this module answers
// 'PER PARTNER across the partner's KPI portfolio, how much changed
// by how much?'.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.131 → P11.132 / P11.133 → P11.134 cadence — cron-route wiring
// intentionally deferred to a follow-up tick (P11.136) so the per-partner
// cross-metric row shape can be exercised in isolation before touching
// the hot Monday cron path (already hosting four grains of scorecard +
// four grains of verdict + four grains of transition + four grains of
// transition distribution + cross-grain family-alerts executive summary).
//
// Design notes:
//   • Bucket set matches the four grain-level distribution modules
//     byte-for-byte (P11.107 / P11.115 / P11.117 / P11.119 / ... /
//     P11.129 / P11.131 all share the same ten buckets + alert_worthy +
//     net_delta_rank scalars). Ops learns ONE distribution vocabulary and
//     applies it at every scorecard grain plus this per-partner ranking
//     surface — no new mental model.
//   • `alert_worthy = improved + degraded + rotated + undecidable` per
//     partner. Matches every downstream grain's alert_worthy definition
//     so a caller can grep `alert_worthy=N` at any grain and know it means
//     the same thing.
//   • `net_delta_rank` sums delta_rank across a partner's rows treating
//     null (undecidable + first_classification) as 0. Positive = the
//     partner's KPI portfolio moved UP the ladder on balance this week;
//     negative = moved DOWN; zero = balanced. Coarse per-partner
//     health barometer; ops still reads the per-pair transitions above
//     to see which specific KPIs drove the shift.
//   • Row ordering: alert_worthy DESC then net_delta_rank ASC then
//     reseller_code ASC. alert_worthy DESC puts the loudest partners
//     first; net_delta_rank ASC breaks alert-worthy ties by favouring
//     the more-degraded partner (a degraded_by_2 tie is a louder ops
//     signal than an improved_by_2 tie); reseller_code ASC breaks
//     remaining ties so re-runs on the same input produce identical row
//     ordering.
//   • Rows carry every bucket count even when zero (not a filter list)
//     so a JSONL consumer joining rows by reseller_code across ticks
//     always finds the same key set on every row — no shape drift
//     across weeks when a partner's bucket mix changes.
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `rows.length === 0` OR every row's `alert_worthy === 0` (each
//     row's contribution would render an empty bullet row — the four
//     grain-level distribution captions above already emitted their own
//     quiet-summary suppression so repeating it here would be noise).
//   • Rows themselves do not self-suppress. A row where `alert_worthy
//     === 0` is retained (with all-zero buckets + stable/first counts)
//     so ops can spot 'INFOVISION contributed 13 stable rows this week'
//     rather than being hidden entirely. The formatter emits ONLY rows
//     with `alert_worthy > 0` so the ranked table stays focused on
//     partners with a signal but the JSONL envelope preserves the
//     complete per-partner set.

import type {
  DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  PerResellerMetricPersistenceScorecardVerdictTransitionRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";

export interface PerResellerCrossMetricAlertsRow {
  readonly reseller_code: string;
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

export interface DigestSnapshotPerResellerCrossMetricAlerts {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerCrossMetricAlertsRow[];
}

function emptyBuckets(reseller_code: string): {
  reseller_code: string;
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
} {
  return {
    reseller_code,
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
  bucket: ReturnType<typeof emptyBuckets>,
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
 * a ROW-PER-PARTNER cross-metric alerts summary. Each row carries the
 * same ten bucket counts + alert_worthy + net_delta_rank scalars every
 * grain-level distribution module emits so ops learns ONE distribution
 * vocabulary and applies it at every grain plus this per-partner
 * ranking surface.
 *
 * Rows are sorted alert_worthy DESC (loudest partners first), then
 * net_delta_rank ASC (most-negative wins so degraded partners lead
 * ties), then reseller_code ASC for stable tie-break — the same input
 * always produces the same ordering.
 */
export function computeDigestSnapshotPerResellerCrossMetricAlerts(
  transitions: DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
): DigestSnapshotPerResellerCrossMetricAlerts {
  const byCode = new Map<string, ReturnType<typeof emptyBuckets>>();
  for (const row of transitions.rows) {
    let bucket = byCode.get(row.reseller_code);
    if (!bucket) {
      bucket = emptyBuckets(row.reseller_code);
      byCode.set(row.reseller_code, bucket);
    }
    accumulate(bucket, row);
  }

  const rows: PerResellerCrossMetricAlertsRow[] = Array.from(byCode.values()).map(
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
        reseller_code: b.reseller_code,
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
    return a.reseller_code < b.reseller_code ? -1 : a.reseller_code > b.reseller_code ? 1 : 0;
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
 * Render the per-partner cross-metric alerts summary as a ranked table:
 * one row per partner where alert_worthy > 0, ordered loudest first.
 * Designed to splice ABOVE or BELOW the P11.124 per-(partner × metric)
 * verdict-transition table depending on cron-route splice policy in the
 * follow-up tick (P11.136) — the table exists to answer 'which partners
 * own the loudest cross-KPI signal this week?' rather than the pair-level
 * 'what changed for this specific (partner, KPI)?' question the P11.124
 * table already answers.
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when the envelope has
 * zero rows OR when every row's alert_worthy === 0 (the four grain-level
 * distribution captions above already emitted their own quiet-summary
 * suppression — repeating it as an empty table would be noise).
 *
 * Only rows with alert_worthy > 0 render as table rows so the visual
 * table stays focused on partners with a signal; quiet partners
 * (all-stable / all-first_classification) are retained on the JSONL
 * envelope so a consumer joining rows by reseller_code across ticks
 * always finds the complete set, but they are omitted from the visual
 * table since a row of all zeros just repeats the pair-level table
 * suppression rule with counts.
 */
export function formatDigestSnapshotPerResellerCrossMetricAlertsSection(
  snapshot: DigestSnapshotPerResellerCrossMetricAlerts,
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
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee"><strong>${escapeHtml(r.reseller_code)}</strong></td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.alert_worthy}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${escapeHtml(formatSignedInt(r.net_delta_rank))} ${netMove}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.improved_by_2}/${r.improved_by_1}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.degraded_by_1}/${r.degraded_by_2}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.rotated}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.undecidable}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.stable}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${r.total}</td></tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-partner cross-metric alerts ranking across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Ranks partners by cross-KPI alert-signal so ops can triage the loudest partners first rather than the highest-revenue partners. Each row aggregates ONE partner's per-KPI transitions from the pair-level table into the same distribution vocabulary the grain-level captions emit &mdash; <code>alert_worthy = improved + degraded + rotated + undecidable</code>, <code>net &Delta;rank</code> = signed rank movement across the partner's KPI portfolio (positive = ladder-up on balance, negative = ladder-down). Only partners with <code>alert_worthy &gt; 0</code> render in the table; quiet partners are retained on the JSONL envelope for cross-tick joins but suppressed here to keep the table focused on signal.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">Partner</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">alert_worthy</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">net &Delta;rank</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">imp +2/+1</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">deg &minus;1/&minus;2</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">rotated</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">undecidable</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">stable</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">n</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
