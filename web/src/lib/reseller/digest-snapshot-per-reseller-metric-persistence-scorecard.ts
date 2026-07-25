// Weekly digest per-(reseller × metric) direction+magnitude persistence scorecard (P11.119).
//
// The persistence-scorecard family already lands the direction+magnitude twin-
// block reduction at three grains:
//   • P11.105 / P11.106 → portfolio scorecard (one row: aggregate p50 / p90
//     scalars for both axes).
//   • P11.101 / P11.102 → per-metric scorecard (one row per HEADLINE_METRICS
//     KPI: metric-scoped p50 / p90 scalars for both axes).
//   • P11.103 / P11.104 → per-partner scorecard (one row per reseller_code:
//     partner-scoped p50 / p90 scalars for both axes).
//
// The finest grain — one row per (metric × reseller_code) — is missing. Ops
// reading the P11.32 per-(metric × reseller) direction spotlight sees a
// sustained-direction row for INFOVISION × attributed_mrr, and, further down,
// the P11.51 per-(metric × reseller) |pct|-material spotlight for the same
// pair. The two rows sit in DIFFERENT tables walked by DIFFERENT source folds,
// so answering "for THIS partner-metric pair, does it churn direction-
// persistently AND magnitude-persistently, or one axis only?" still requires
// cross-referencing two sections and joining on (key, reseller_code) in ops's
// head. The P11.32 direction spotlight and P11.51 magnitude spotlight each
// emit AT MOST ONE longest run per (metric × reseller_code) pair — the
// scorecard here is therefore a JOIN of those two folds by (key, reseller_code)
// rather than a percentile reduction the way the coarser grains at
// P11.101/P11.103 are (a single length + a single |pct| per pair means each
// group has n=1 sample; percentile scalars degenerate to the sample itself).
//
// Union semantics: emit a row when EITHER axis qualifies. When one axis
// qualifies and the other does not, the missing-axis block is zero-filled so
// ops can see the asymmetry visually (fat direction block beside a zero
// magnitude block ⇒ sustained direction inside the amber band; opposite ⇒
// materially volatile |Δ%| but flips direction each week). Rows omitted from
// both axes are silently skipped — matches P11.101 / P11.103 posture.
//
// Pure-lib-first per the P11.14→P11.15 / P11.20→P11.21 / P11.22→P11.23 /
// P11.24→P11.25 / P11.26→P11.27 / P11.28→P11.29 / P11.30→P11.31 /
// P11.32→P11.33 / P11.34→P11.35 / P11.37→P11.38 / P11.39→P11.40 /
// P11.41→P11.42 / P11.43→P11.44 / P11.45→P11.46 / P11.47→P11.48 /
// P11.49→P11.50 / P11.51→P11.52 / ... / P11.101→P11.102 / P11.103→P11.104 /
// ... / P11.117→P11.118 cadence. Cron-route wiring intentionally deferred to
// a follow-up tick (P11.120) so this cross-axis finest-grain synthesis can be
// exercised in isolation before touching the hot Monday cron path.
//
// Formatter docblock explicit placement rule: the P11.120 cron wiring should
// splice the per-(reseller × metric) persistence scorecard section IMMEDIATELY
// BELOW the P11.104 perResellerPersistenceScorecardSection (the last per-
// partner summary in the current ladder) and ABOVE the P11.32 per-(metric ×
// partner) spotlight section so ops walks per-partner coverage (P11.55/P11.59)
// → per-partner top-N (P11.73/P11.75) → per-partner shape (P11.81/P11.83) →
// per-partner scalar (P11.93/P11.95) → per-partner BOTH-AXES scorecard
// (P11.103) → per-(reseller × metric) BOTH-AXES scorecard (THIS MODULE) →
// per-(metric × partner) spotlight detail (P11.32). Mirrors the P11.101 /
// P11.103 placement rule one grain finer so the finest-grain scorecard lands
// at the bottom of the scorecard ladder before the P11.32 spotlight detail.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to BOTH computeDigestSnapshotPerResellerDirectionStreaks (P11.32) and
//     computeDigestSnapshotPerResellerPctChangeStreaks (P11.51). Scorecard
//     rows cannot diverge from the two spotlight rows they side-by-side
//     because they ARE the same folds joined by (key, reseller_code).
//   • Threshold from the source envelope is carried through so JSONL
//     consumers can distinguish "INFOVISION × attributed_mrr magnitude
//     persistence increased at the SAME 25% threshold" (real pair shape
//     change) from "same pair persistence appeared to increase because the
//     threshold widened to 40%" (apparent shift). Matches
//     P11.91/P11.95/P11.99/P11.101/P11.103 threshold-passthrough posture.
//   • Row ordering: HEADLINE_METRICS spec order primary (canonical KPI
//     ladder — matches P11.32/P11.51 tertiary tie-break), reseller_code asc
//     secondary (deterministic alphabetical — matches P11.32/P11.51
//     secondary tie-break). A reader scanning the table reads the canonical
//     KPI ladder top-to-bottom with partner alphabetical within each metric,
//     mirroring how ops already walks the P11.32 / P11.51 spotlight rows.
//   • Pairs are included when EITHER axis qualifies (direction OR magnitude).
//     A pair omitted from both axes is silently skipped. When one axis
//     qualifies and the other does not, the missing-axis block is zero-filled
//     (length=0, cumulative_delta=0 for direction; length=0, max_abs_pct=0,
//     min_abs_pct=0 for magnitude) so ops can visually see the asymmetry.
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.32/P11.51/P11.101/P11.103 posture) OR
//     when zero rows qualify.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerDirectionStreaks,
  type StreakDirection,
} from "./digest-snapshot-per-reseller-direction-streaks";
import { computeDigestSnapshotPerResellerPctChangeStreaks } from "./digest-snapshot-per-reseller-pct-change-streaks";
import type { KnownKpiSection } from "./digest-snapshot";

export interface PerResellerMetricPersistenceScorecardDirection {
  readonly length: number;
  readonly streak_direction: StreakDirection | null;
  readonly first_week: string;
  readonly last_week: string;
  readonly cumulative_delta: number;
}

export interface PerResellerMetricPersistenceScorecardMagnitude {
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly max_abs_pct: number;
  readonly min_abs_pct: number;
}

export interface PerResellerMetricPersistenceScorecardRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly direction: PerResellerMetricPersistenceScorecardDirection;
  readonly magnitude: PerResellerMetricPersistenceScorecardMagnitude;
}

export interface DigestSnapshotPerResellerMetricPersistenceScorecard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerMetricPersistenceScorecardRow[];
}

const EMPTY_DIRECTION: PerResellerMetricPersistenceScorecardDirection = {
  length: 0,
  streak_direction: null,
  first_week: "",
  last_week: "",
  cumulative_delta: 0,
};

const EMPTY_MAGNITUDE: PerResellerMetricPersistenceScorecardMagnitude = {
  length: 0,
  first_week: "",
  last_week: "",
  max_abs_pct: 0,
  min_abs_pct: 0,
};

const SPEC_ORDER_INDEX = new Map<KnownKpiSection, number>(
  HEADLINE_METRICS.map((m, i) => [m.key, i]),
);

function specOrderIndex(key: KnownKpiSection): number {
  const idx = SPEC_ORDER_INDEX.get(key);
  return idx === undefined ? HEADLINE_METRICS.length : idx;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pairKey(reseller_code: string, key: KnownKpiSection): string {
  return `${reseller_code} ${key}`;
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-(reseller × metric)
 * persistence scorecard that side-by-sides the direction and |pct|-material
 * spotlight rows joined by (key, reseller_code). For each pair that qualifies
 * on at least one axis, emits a row with two side-by-side blocks (direction +
 * magnitude); each block carries the SINGLE longest streak the underlying
 * P11.32 / P11.51 detector emits for that pair (no percentile reduction —
 * each pair has n=1 sample per axis so p50/p90 would degenerate to the sample
 * itself).
 *
 * Row ordering: HEADLINE_METRICS spec order primary + reseller_code asc
 * secondary. Pairs omitted from BOTH axes are silently skipped. When one axis
 * qualifies and the other does not, the missing-axis block is zero-filled so
 * ops can see the asymmetry visually. minStreakLength + threshold are
 * forwarded to the respective detectors; each detector handles its own
 * coercion.
 */
export function computeDigestSnapshotPerResellerMetricPersistenceScorecard(
  trend: DigestSnapshotPerResellerRollingTrend,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
  threshold: number = PCT_CHANGE_MATERIAL_THRESHOLD,
): DigestSnapshotPerResellerMetricPersistenceScorecard {
  const direction = computeDigestSnapshotPerResellerDirectionStreaks(
    trend,
    minStreakLength,
  );
  const magnitude = computeDigestSnapshotPerResellerPctChangeStreaks(
    trend,
    minStreakLength,
    threshold,
  );

  interface Meta {
    reseller_code: string;
    key: KnownKpiSection;
    metric_name: string;
    unit: HeadlineMetricUnit;
  }
  const metaByPair = new Map<string, Meta>();
  const directionByPair = new Map<
    string,
    PerResellerMetricPersistenceScorecardDirection
  >();
  const magnitudeByPair = new Map<
    string,
    PerResellerMetricPersistenceScorecardMagnitude
  >();

  for (const row of direction.rows) {
    const pk = pairKey(row.reseller_code, row.key);
    metaByPair.set(pk, {
      reseller_code: row.reseller_code,
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
    });
    directionByPair.set(pk, {
      length: row.length,
      streak_direction: row.direction,
      first_week: row.first_week,
      last_week: row.last_week,
      cumulative_delta: row.cumulative_delta,
    });
  }
  for (const row of magnitude.rows) {
    const pk = pairKey(row.reseller_code, row.key);
    if (!metaByPair.has(pk)) {
      metaByPair.set(pk, {
        reseller_code: row.reseller_code,
        key: row.key,
        metric_name: row.metric_name,
        unit: row.unit,
      });
    }
    magnitudeByPair.set(pk, {
      length: row.length,
      first_week: row.first_week,
      last_week: row.last_week,
      max_abs_pct: row.max_abs_pct,
      min_abs_pct: row.min_abs_pct,
    });
  }

  const rows: PerResellerMetricPersistenceScorecardRow[] = [];
  for (const [pk, meta] of metaByPair) {
    rows.push({
      reseller_code: meta.reseller_code,
      key: meta.key,
      metric_name: meta.metric_name,
      unit: meta.unit,
      direction: directionByPair.get(pk) ?? EMPTY_DIRECTION,
      magnitude: magnitudeByPair.get(pk) ?? EMPTY_MAGNITUDE,
    });
  }

  rows.sort((a, b) => {
    const specA = specOrderIndex(a.key);
    const specB = specOrderIndex(b.key);
    if (specA !== specB) return specA - specB;
    return a.reseller_code.localeCompare(b.reseller_code);
  });

  return {
    window_size: direction.window_size,
    first_week: direction.first_week,
    last_week: direction.last_week,
    min_streak_length: direction.min_streak_length,
    threshold: magnitude.threshold,
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

function formatCumulativeDelta(
  cumulative: number,
  unit: HeadlineMetricUnit,
): string {
  if (unit === "cents" || unit === "signed_cents") {
    const dollars = cumulative / 100;
    const sign = dollars > 0 ? "+" : dollars < 0 ? "-" : "";
    return `${sign}A$${Math.abs(dollars).toFixed(2)}`;
  }
  const sign = cumulative > 0 ? "+" : cumulative < 0 ? "-" : "";
  return `${sign}${Math.abs(cumulative)}`;
}

/**
 * Render the per-(reseller × metric) direction+magnitude persistence
 * scorecard as a single consolidated table with one row per qualifying pair
 * and TWO side-by-side blocks per row (direction axis on the left, magnitude
 * axis on the right). The one-table-many-rows shape mirrors P11.32 / P11.51;
 * the twin-block shape mirrors P11.101 / P11.103 capstone scorecards because
 * the whole point at this grain is direct cross-axis comparison per (metric ×
 * reseller_code) pair.
 *
 * The caption embeds the magnitude threshold percent so a reader sees at a
 * glance which amber band the |Δ%| block is scored against — matches P11.51 /
 * P11.101 / P11.103 caption pattern on the magnitude axis. The direction
 * block has no tunable threshold (a direction streak is any run of same-sign
 * transitions) so no direction-side threshold is embedded.
 *
 * In the P11.120 cron wiring this lands directly BELOW the P11.104
 * perResellerPersistenceScorecardSection — the capstone position at the
 * finest grain in the scorecard ladder so a reader who already saw the
 * per-partner scorecard above can drill straight into the per-pair rows
 * without scrolling back to the P11.32 / P11.51 spotlight tables further down
 * the digest.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.32/P11.51/P11.101/P11.103 posture) OR when zero rows
 * qualify.
 */
export function formatDigestSnapshotPerResellerMetricPersistenceScorecardSection(
  scorecard: DigestSnapshotPerResellerMetricPersistenceScorecard,
): string {
  if (scorecard.window_size < 3) return "";
  if (scorecard.rows.length === 0) return "";

  const firstWeek = scorecard.first_week ? escapeHtml(scorecard.first_week) : "";
  const lastWeek = scorecard.last_week ? escapeHtml(scorecard.last_week) : "";
  const thresholdPct = round1(scorecard.threshold * 100).toFixed(1);

  const rowsHtml = scorecard.rows
    .map(
      (row) => `
        <tr>
          <td>${escapeHtml(row.reseller_code)}</td>
          <td>${escapeHtml(row.metric_name)}</td>
          <td style="text-align:right">${row.direction.length}</td>
          <td>${escapeHtml(row.direction.streak_direction ?? "")}</td>
          <td>${escapeHtml(row.direction.first_week)}</td>
          <td>${escapeHtml(row.direction.last_week)}</td>
          <td style="text-align:right">${formatCumulativeDelta(row.direction.cumulative_delta, row.unit)}</td>
          <td style="text-align:right">${row.magnitude.length}</td>
          <td>${escapeHtml(row.magnitude.first_week)}</td>
          <td>${escapeHtml(row.magnitude.last_week)}</td>
          <td style="text-align:right">${row.magnitude.max_abs_pct.toFixed(1)}%</td>
          <td style="text-align:right">${row.magnitude.min_abs_pct.toFixed(1)}%</td>
        </tr>`,
    )
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-(partner &times; metric) direction &plus; magnitude persistence scorecard across the ${scorecard.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Finest-grain side-by-side join of the P11.32 direction-axis and P11.51 magnitude-axis per-(metric &times; partner) spotlight rows so ops can answer &ldquo;for THIS partner-metric pair, does it churn direction-persistently AND magnitude-persistently, or one axis only, or neither?&rdquo; without cross-referencing the two upstream spotlight tables further down the digest. Two pairs with identical direction length can differ sharply on the magnitude axis (fat direction column beside a zero magnitude column &rArr; sustained direction inside the amber band; opposite &rArr; materially volatile |&Delta;%| but flips direction each week). Threshold carried alongside the magnitude block so a shift from magnitude length 2 to length 3 at the SAME threshold reads differently from an apparent shift caused by widening the threshold band. Extends the P11.101 (per-metric) and P11.103 (per-partner) capstone scorecards one grain finer to the finest (metric &times; partner) grain — one row per pair with the single longest streak each detector emits (no percentile reduction because each pair has n=1 sample per axis).</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th rowspan="2">Partner</th>
          <th rowspan="2">Metric</th>
          <th colspan="5" style="text-align:center">Direction axis (P11.32)</th>
          <th colspan="4" style="text-align:center">Magnitude axis (P11.51)</th>
        </tr>
        <tr>
          <th>Length</th>
          <th>Dir</th>
          <th>First</th>
          <th>Last</th>
          <th>Cum &Delta;</th>
          <th>Length</th>
          <th>First</th>
          <th>Last</th>
          <th>Max |&Delta;%|</th>
          <th>Min |&Delta;%|</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
