// Weekly digest per-(reseller × metric) persistence scorecard verdict classifier (P11.121).
//
// The P11.107 / P11.108 portfolio, P11.109 / P11.110 per-metric, and
// P11.111 / P11.112 per-partner persistence scorecard verdict pairs already
// closed the interpretation gap at the three coarser grains — each Monday
// digest carries a collapsed six-token verdict badge alongside the twin-block
// direction+magnitude scalar row so ops stops running the "is p90=3 sustained?"
// ladder in their head per row. The finest grain — per-(metric × reseller_code)
// — was capstoned in scalar form at P11.119 / P11.120 (side-by-side direction
// and magnitude longest-run table) but STILL leaves ops running the verdict
// ladder mentally PER PAIR (INFOVISION × attributed_mrr, ACME × clawback_exposure,
// ZEBRA × attributed_churn_30d, …) to answer "which pairs churn direction-
// persistently AND magnitude-persistently, or one axis only, or neither?"
//
// This module closes that per-(reseller × metric) interpretation gap by
// applying the SAME P11.107 verdict ladder to every row of the P11.119
// scorecard, emitting one verdict per pair plus an envelope with window
// metadata. Pure derivation of the P11.119 scorecard — no new folds, no new
// inputs — so the per-pair verdicts CANNOT diverge from the per-pair twin-block
// scalar row they classify. Uses the same DEFAULT_SUSTAINED_P90_THRESHOLD = 3
// (imported from the P11.107 module) so ALL FOUR grains (portfolio / per-metric
// / per-partner / per-pair) speak the same "sustained means length ≥ 3 weeks"
// language.
//
// Key difference vs. the coarser grains: the P11.119 scorecard row does not
// carry p90_length / total_streaks scalars because each (metric × reseller_code)
// pair has n=1 sample per axis (the SINGLE longest streak the underlying
// P11.32 / P11.51 detector emits) — a percentile reduction would degenerate to
// the sample itself. The verdict ladder therefore compares row.direction.length
// and row.magnitude.length DIRECTLY against sustainedP90Threshold rather than
// the .p90_length scalar the P11.107 / P11.109 / P11.111 classifiers use. Same
// semantic — a length-3 run reads as trend rather than noise — but one hop
// closer to the raw detector output because there is no distribution to
// percentile at this grain.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.30 → P11.31 / P11.65 → P11.66 /
// P11.67 → P11.68 / ... / P11.101 → P11.102 / P11.103 → P11.104 / P11.105 →
// P11.106 / P11.107 → P11.108 / P11.109 → P11.110 / P11.111 → P11.112 /
// P11.113 → P11.114 / P11.115 → P11.116 / P11.117 → P11.118 / P11.119 →
// P11.120 cadence. Cron-route wiring intentionally deferred to a follow-up
// tick (P11.122) so the per-pair verdict ladder can be exercised in isolation
// before touching the hot Monday cron path (already hosting four grains of
// scorecard + three grains of verdict caption + three grains of transition
// caption).
//
// Design notes:
//   • Rows preserved in the input HEADLINE_METRICS spec order primary +
//     reseller_code asc secondary — no re-sort, no filter. A pair already
//     omitted from the P11.119 scorecard (skipped from BOTH axes) is
//     transitively absent here. A pair whose input row has zero-filled BOTH
//     axes (impossible via computeDigestSnapshotPerResellerMetricPersistence-
//     Scorecard which skips both-omitted pairs — reachable only via hand-
//     constructed inputs) resolves to `flat` here — matches P11.107 / P11.109 /
//     P11.111 "both zero → flat" branches — and its caption is suppressed by
//     the formatter below.
//   • Sustained threshold defaults to DEFAULT_SUSTAINED_P90_THRESHOLD (3),
//     imported from digest-snapshot-persistence-scorecard-verdict so ALL FOUR
//     grains share the same "sustained" definition. Callable-override for
//     stricter/looser interpretation across the whole scorecard.
//   • Envelope shape mirrors the P11.119 scorecard envelope (window_size /
//     first_week / last_week / threshold) so a JSONL consumer joining verdicts
//     to scorecards on the same weekly row can align them by row index without
//     extra keys.
//   • sustained_p90_threshold surfaces on the envelope root (not per-row) so
//     JSONL consumers can grep the threshold once — the threshold applies
//     uniformly to every row in the same envelope.
//   • Insufficient-window branch fires at the ENVELOPE level (short window
//     applies to all rows) rather than per-row: if window_size < 3 the entire
//     rows[] resolves to `insufficient_window` verdicts. Matches P11.107 /
//     P11.109 / P11.111 posture.
//   • Empty rows[] input yields empty rows[] output — no synthetic row is
//     invented. Matches P11.119 posture on zero qualifying pairs.

import type {
  DigestSnapshotPerResellerMetricPersistenceScorecard,
  PerResellerMetricPersistenceScorecardRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard";
import {
  DEFAULT_SUSTAINED_P90_THRESHOLD,
  type PersistenceScorecardVerdictToken,
} from "./digest-snapshot-persistence-scorecard-verdict";
import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type { KnownKpiSection } from "./digest-snapshot";

export { DEFAULT_SUSTAINED_P90_THRESHOLD } from "./digest-snapshot-persistence-scorecard-verdict";
export type { PersistenceScorecardVerdictToken } from "./digest-snapshot-persistence-scorecard-verdict";

export interface PerResellerMetricPersistenceScorecardVerdictRow {
  readonly reseller_code: string;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly verdict: PersistenceScorecardVerdictToken;
  readonly direction_sustained: boolean;
  readonly magnitude_sustained: boolean;
  readonly summary: string;
}

export interface DigestSnapshotPerResellerMetricPersistenceScorecardVerdict {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly rows: readonly PerResellerMetricPersistenceScorecardVerdictRow[];
}

function classifyRow(
  row: PerResellerMetricPersistenceScorecardRow,
  threshold: number,
  windowSize: number,
  magnitudeThreshold: number,
): PerResellerMetricPersistenceScorecardVerdictRow {
  const label = `${row.reseller_code} × ${row.metric_name}`;

  if (windowSize < 3) {
    return {
      reseller_code: row.reseller_code,
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "insufficient_window",
      direction_sustained: false,
      magnitude_sustained: false,
      summary: `Insufficient window (${windowSize} < 3 weeks) — no persistence classification for ${label}.`,
    };
  }

  const dirLen = row.direction.length;
  const magLen = row.magnitude.length;

  if (dirLen === 0 && magLen === 0) {
    return {
      reseller_code: row.reseller_code,
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "flat",
      direction_sustained: false,
      magnitude_sustained: false,
      summary: `${label} flat across the ${windowSize}-week window — no qualifying streaks on either axis.`,
    };
  }

  const dirSustained = dirLen >= threshold;
  const magSustained = magLen >= threshold;

  const thresholdPct = (magnitudeThreshold * 100).toFixed(1);

  if (dirSustained && magSustained) {
    return {
      reseller_code: row.reseller_code,
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "sustained_both_axes",
      direction_sustained: true,
      magnitude_sustained: true,
      summary: `${label} sustained on BOTH axes across the ${windowSize}-week window (direction length=${dirLen}, magnitude length=${magLen} at the ${thresholdPct}% threshold).`,
    };
  }

  if (dirSustained) {
    return {
      reseller_code: row.reseller_code,
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "sustained_direction_only",
      direction_sustained: true,
      magnitude_sustained: false,
      summary: `${label} sustained on the DIRECTION axis only (length=${dirLen}) — magnitude persistence is below the ${threshold}-week bar at the ${thresholdPct}% threshold (magnitude length=${magLen}).`,
    };
  }

  if (magSustained) {
    return {
      reseller_code: row.reseller_code,
      key: row.key,
      metric_name: row.metric_name,
      unit: row.unit,
      verdict: "sustained_magnitude_only",
      direction_sustained: false,
      magnitude_sustained: true,
      summary: `${label} sustained on the MAGNITUDE axis only (|Δ%| length=${magLen} at the ${thresholdPct}% threshold) — direction persistence is below the ${threshold}-week bar (direction length=${dirLen}).`,
    };
  }

  return {
    reseller_code: row.reseller_code,
    key: row.key,
    metric_name: row.metric_name,
    unit: row.unit,
    verdict: "volatile",
    direction_sustained: false,
    magnitude_sustained: false,
    summary: `${label} volatile across the ${windowSize}-week window — streaks exist (direction length=${dirLen}, magnitude length=${magLen}) but neither axis clears the ${threshold}-week sustained bar.`,
  };
}

/**
 * Classify every row of the P11.119 per-(reseller × metric) persistence
 * scorecard into a discrete verdict token plus per-axis sustained flags and a
 * short human-readable summary. Pure derivation of the P11.119 scorecard —
 * walks the same ladder as the portfolio-grain P11.107, per-metric-grain
 * P11.109, and per-partner-grain P11.111 verdicts but PER PAIR, so each
 * (metric × reseller_code) pair carries its own verdict rather than being
 * folded into a coarser-grain aggregate.
 *
 * sustainedP90Threshold defaults to DEFAULT_SUSTAINED_P90_THRESHOLD (3) — the
 * same "top-decile streak length ≥ 3 weeks reads as trend rather than noise"
 * threshold the coarser grains use — and can be overridden per-call for
 * stricter/looser interpretation across the whole scorecard.
 */
export function computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
  scorecard: DigestSnapshotPerResellerMetricPersistenceScorecard,
  sustainedP90Threshold: number = DEFAULT_SUSTAINED_P90_THRESHOLD,
): DigestSnapshotPerResellerMetricPersistenceScorecardVerdict {
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
 * Render the per-(reseller × metric) persistence scorecard verdicts as a
 * compact table with one row per qualifying pair (Partner, Metric, verdict
 * badge, summary). Splices directly BELOW the P11.119 / P11.120 per-pair
 * scorecard table so ops sees the twin-block scalar row above and the
 * collapsed per-pair verdict badges immediately below without redoing the
 * ladder mentally for INFOVISION × attributed_mrr, ACME × clawback_exposure, etc.
 *
 * Returns "" when window_size < 3 (matches P11.119 scorecard formatter
 * suppression on the same short-window guard) OR when zero rows would carry
 * a rendered verdict — a scorecard whose rows all resolve to `flat` or
 * `insufficient_window` produces no table so the digest stays quiet on quiet
 * weeks, matching the P11.107 / P11.109 / P11.111 caption-suppression posture
 * at the three coarser grains.
 *
 * In the P11.122 cron wiring this lands directly BELOW the P11.120
 * perResellerMetricPersistenceScorecardSection — the capstone verdict caption
 * at the FINEST grain in the scorecard ladder so a reader who already saw the
 * per-partner scorecard + verdict rows above can drill straight into the
 * per-pair verdict badges without reconciling every twin-block row in their
 * head.
 */
export function formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection(
  verdict: DigestSnapshotPerResellerMetricPersistenceScorecardVerdict,
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
          <td>${escapeHtml(row.reseller_code)}</td>
          <td>${escapeHtml(row.metric_name)}</td>
          <td><span style="padding:2px 8px;border-radius:4px;font-family:Menlo,monospace;font-size:12px;${badgeStyle}">${token}</span></td>
          <td>${summary}</td>
        </tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-(partner &times; metric) persistence verdict across the ${verdict.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar length &ge; ${verdict.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Collapses the P11.119 per-(partner &times; metric) twin-block scalar row above into ONE verdict token per pair so ops stops running the &ldquo;is direction length=3 sustained?&rdquo; ladder mentally per row. Same ladder the P11.107 portfolio verdict, P11.109 per-metric verdict, and P11.111 per-partner verdict use; same DEFAULT_SUSTAINED_P90_THRESHOLD (${verdict.sustained_p90_threshold}) so all four grains speak the same &ldquo;sustained means length &ge; ${verdict.sustained_p90_threshold}&rdquo; language. Rows resolving to <code>flat</code> or <code>insufficient_window</code> are suppressed so the digest stays quiet on quiet pairs.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Partner</th>
          <th>Metric</th>
          <th>Verdict</th>
          <th>Summary</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
