// Weekly digest per-metric persistence scorecard verdict classifier (P11.109).
//
// The P11.107 / P11.108 portfolio persistence scorecard verdict pair closed
// the interpretation gap at the PORTFOLIO grain — the twin-block scalar row
// from P11.105 (direction total/p50/p90/mean/max side-by-side with magnitude
// total/p50/p90/mean/max) got collapsed into a single verdict token so ops
// stopped redoing the mental "is direction p90=3 sustained?" ladder each
// Monday. But the same interpretation gap still exists one grain DOWN: the
// P11.101 / P11.102 per-metric scorecard exposes the raw direction + magnitude
// scalars per HEADLINE_METRICS KPI, and every reader now has to run the same
// verdict ladder in their head PER ROW — attributed_mrr, attributed_churn_30d,
// clawback_exposure, etc. — to answer "which KPIs are persistent on BOTH axes
// vs one axis only vs volatile vs flat?"
//
// This module closes that per-metric interpretation gap by applying the
// P11.107 verdict ladder to every row of a DigestSnapshotPerMetricPersistence-
// Scorecard, emitting one verdict per KPI plus an envelope with window
// metadata. Pure derivation of the P11.101 scorecard — no new folds, no new
// inputs — so the per-metric verdicts CANNOT diverge from the per-metric
// scalar row they classify. Uses the same DEFAULT_SUSTAINED_P90_THRESHOLD = 3
// (imported from the P11.107 module) so the portfolio and per-metric verdicts
// speak the same "sustained means p90 ≥ 3" language.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72 /
// P11.73 → P11.74 / P11.75 → P11.76 / P11.77 → P11.78 / P11.79 → P11.80 /
// P11.81 → P11.82 / P11.83 → P11.84 / P11.85 → P11.86 / P11.87 → P11.88 /
// P11.89 → P11.90 / P11.91 → P11.92 / P11.93 → P11.94 / P11.95 → P11.96 /
// P11.97 → P11.98 / P11.99 → P11.100 / P11.101 → P11.102 / P11.103 → P11.104 /
// P11.105 → P11.106 / P11.107 → P11.108 cadence. Cron-route wiring intentionally
// deferred to a follow-up tick (P11.110) so the per-metric verdict ladder can
// be exercised in isolation before touching the hot Monday cron path.
//
// Design notes:
//   • Rows preserved in the input HEADLINE_METRICS spec order — no re-sort,
//     no filter. A KPI already omitted from the P11.101 scorecard (no data on
//     either axis) is transitively absent here. A KPI whose input row has
//     zero-filled BOTH axes (P11.101 emits a row when EITHER axis qualifies;
//     the other axis is zero-filled) resolves to `flat` here — matches the
//     P11.107 "both zero → flat" branch — and its caption is suppressed by
//     the formatter below just like the portfolio-grain flat caption.
//   • Sustained threshold defaults to DEFAULT_SUSTAINED_P90_THRESHOLD (3),
//     imported from digest-snapshot-persistence-scorecard-verdict so the
//     portfolio and per-metric grains share the same "sustained" definition.
//     Callable-override for stricter/looser interpretation per-KPI grid.
//   • Envelope shape mirrors the scorecard envelope (window_size / first_week
//     / last_week / threshold) so a JSONL consumer joining verdicts to
//     scorecards on the same weekly row can align them without extra keys.
//   • sustained_p90_threshold surfaces on the envelope root (not per-row) so
//     JSONL consumers can grep the threshold once — the threshold applies
//     uniformly to every row in the same envelope.
//   • Insufficient-window branch fires at the ENVELOPE level (short window
//     applies to all rows) rather than per-row: if window_size < 3 the entire
//     rows[] resolves to `insufficient_window` verdicts. Matches P11.107
//     posture where a short window makes every verdict undecidable.
//   • Empty rows[] input yields empty rows[] output — no synthetic row is
//     invented. Matches P11.101 posture on zero qualifying groups.

import type {
  DigestSnapshotPerMetricPersistenceScorecard,
  PerMetricPersistenceScorecardRow,
} from "./digest-snapshot-per-metric-persistence-scorecard";
import {
  DEFAULT_SUSTAINED_P90_THRESHOLD,
  type PersistenceScorecardVerdictToken,
} from "./digest-snapshot-persistence-scorecard-verdict";
import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type { KnownKpiSection } from "./digest-snapshot";

export { DEFAULT_SUSTAINED_P90_THRESHOLD } from "./digest-snapshot-persistence-scorecard-verdict";
export type { PersistenceScorecardVerdictToken } from "./digest-snapshot-persistence-scorecard-verdict";

export interface PerMetricPersistenceScorecardVerdictRow {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly verdict: PersistenceScorecardVerdictToken;
  readonly direction_sustained: boolean;
  readonly magnitude_sustained: boolean;
  readonly summary: string;
}

export interface DigestSnapshotPerMetricPersistenceScorecardVerdict {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly rows: readonly PerMetricPersistenceScorecardVerdictRow[];
}

function classifyRow(
  row: PerMetricPersistenceScorecardRow,
  threshold: number,
  windowSize: number,
  magnitudeThreshold: number,
): PerMetricPersistenceScorecardVerdictRow {
  if (windowSize < 3) {
    return {
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "insufficient_window",
      direction_sustained: false,
      magnitude_sustained: false,
      summary: `Insufficient window (${windowSize} < 3 weeks) — no persistence classification for ${row.metric_name}.`,
    };
  }

  const dirStreaks = row.direction.total_streaks;
  const magStreaks = row.magnitude.total_streaks;

  if (dirStreaks === 0 && magStreaks === 0) {
    return {
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "flat",
      direction_sustained: false,
      magnitude_sustained: false,
      summary: `${row.metric_name} flat across the ${windowSize}-week window — no qualifying streaks on either axis.`,
    };
  }

  const dirSustained =
    dirStreaks > 0 && row.direction.p90_length >= threshold;
  const magSustained =
    magStreaks > 0 && row.magnitude.p90_length >= threshold;

  const thresholdPct = (magnitudeThreshold * 100).toFixed(1);

  if (dirSustained && magSustained) {
    return {
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "sustained_both_axes",
      direction_sustained: true,
      magnitude_sustained: true,
      summary: `${row.metric_name} sustained on BOTH axes across the ${windowSize}-week window (direction p90=${row.direction.p90_length}, magnitude p90=${row.magnitude.p90_length} at the ${thresholdPct}% threshold).`,
    };
  }

  if (dirSustained) {
    return {
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "sustained_direction_only",
      direction_sustained: true,
      magnitude_sustained: false,
      summary: `${row.metric_name} sustained on the DIRECTION axis only (p90=${row.direction.p90_length}) — magnitude persistence is below the ${threshold}-week bar at the ${thresholdPct}% threshold (magnitude p90=${row.magnitude.p90_length}).`,
    };
  }

  if (magSustained) {
    return {
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "sustained_magnitude_only",
      direction_sustained: false,
      magnitude_sustained: true,
      summary: `${row.metric_name} sustained on the MAGNITUDE axis only (|Δ%| p90=${row.magnitude.p90_length} at the ${thresholdPct}% threshold) — direction persistence is below the ${threshold}-week bar (direction p90=${row.direction.p90_length}).`,
    };
  }

  return {
    key: row.key,
    metric_name: row.metric_name,
    unit: row.unit,
    verdict: "volatile",
    direction_sustained: false,
    magnitude_sustained: false,
    summary: `${row.metric_name} volatile across the ${windowSize}-week window — streaks exist (direction=${dirStreaks}, magnitude=${magStreaks}) but neither axis p90 clears the ${threshold}-week sustained bar.`,
  };
}

/**
 * Classify every row of a per-metric persistence scorecard into a discrete
 * verdict token plus per-axis sustained flags and a short human-readable
 * summary. Pure derivation of the P11.101 scorecard — walks the same ladder
 * as the portfolio-grain P11.107 verdict but PER-ROW, so each HEADLINE_METRICS
 * KPI carries its own verdict rather than being folded into a single portfolio
 * verdict.
 *
 * sustainedP90Threshold defaults to DEFAULT_SUSTAINED_P90_THRESHOLD (3) — the
 * same "top-decile streak length ≥ 3 weeks reads as trend rather than noise"
 * threshold the portfolio grain uses — and can be overridden per-call for
 * stricter/looser interpretation across the whole scorecard.
 */
export function computeDigestSnapshotPerMetricPersistenceScorecardVerdict(
  scorecard: DigestSnapshotPerMetricPersistenceScorecard,
  sustainedP90Threshold: number = DEFAULT_SUSTAINED_P90_THRESHOLD,
): DigestSnapshotPerMetricPersistenceScorecardVerdict {
  const threshold = sustainedP90Threshold;
  const rows = scorecard.rows.map((row) =>
    classifyRow(row, threshold, scorecard.window_size, scorecard.threshold),
  );

  return {
    window_size: scorecard.window_size,
    first_week: scorecard.first_week,
    last_week: scorecard.last_week,
    sustained_p90_threshold: threshold,
    threshold: scorecard.threshold,
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

const VERDICT_BADGE_STYLE: Record<PersistenceScorecardVerdictToken, string> = {
  insufficient_window: "background:#e5e7eb;color:#374151",
  flat: "background:#e5e7eb;color:#374151",
  sustained_both_axes: "background:#065f46;color:#ecfdf5",
  sustained_direction_only: "background:#1e3a8a;color:#eff6ff",
  sustained_magnitude_only: "background:#7c2d12;color:#fff7ed",
  volatile: "background:#7f1d1d;color:#fef2f2",
};

/**
 * Render the per-metric persistence scorecard verdicts as a compact table
 * with one row per qualifying KPI (KPI key, metric name, verdict badge,
 * summary). Splices directly BELOW the P11.101 / P11.102 per-metric scorecard
 * table so ops sees the twin-block scalar row above and the collapsed
 * per-KPI verdict badges immediately below without redoing the ladder mentally.
 *
 * Returns "" when window_size < 3 (matches P11.101 scorecard formatter
 * suppression on the same short-window guard) OR when zero rows would carry
 * a rendered verdict — a scorecard whose rows all resolve to `flat` or
 * `insufficient_window` produces no table so the digest stays quiet on quiet
 * weeks, matching the P11.107 caption suppression posture at the portfolio
 * grain.
 *
 * In the P11.110 cron wiring this lands directly BELOW the P11.102
 * perMetricPersistenceScorecardSection — the capstone verdict caption at the
 * bottom of the per-metric ladder so a reader who already saw the direction
 * and magnitude scalar rows can immediately read the collapsed per-KPI
 * verdicts without reconciling every twin-block row in their head.
 */
export function formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection(
  verdict: DigestSnapshotPerMetricPersistenceScorecardVerdict,
): string {
  if (verdict.window_size < 3) return "";
  const renderable = verdict.rows.filter(
    (r) => r.verdict !== "insufficient_window" && r.verdict !== "flat",
  );
  if (renderable.length === 0) return "";

  const firstWeek = verdict.first_week ? escapeHtml(verdict.first_week) : "";
  const lastWeek = verdict.last_week ? escapeHtml(verdict.last_week) : "";
  const thresholdPct = (verdict.threshold * 100).toFixed(1);

  const rowsHtml = renderable
    .map((row) => {
      const token = escapeHtml(row.verdict);
      const summary = escapeHtml(row.summary);
      const badgeStyle = VERDICT_BADGE_STYLE[row.verdict];
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
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-metric persistence verdict across the ${verdict.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${verdict.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Collapses the P11.101 per-metric twin-block scalar row above into ONE verdict token per KPI so ops stops running the &ldquo;is direction p90=3 sustained?&rdquo; ladder mentally per row. Same ladder the P11.107 portfolio verdict uses; same DEFAULT_SUSTAINED_P90_THRESHOLD (${verdict.sustained_p90_threshold}) so portfolio and per-metric verdicts speak the same &ldquo;sustained means p90 &ge; ${verdict.sustained_p90_threshold}&rdquo; language. Rows resolving to <code>flat</code> or <code>insufficient_window</code> are suppressed so the digest stays quiet on quiet KPIs.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>KPI</th>
          <th>Metric</th>
          <th>Verdict</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
