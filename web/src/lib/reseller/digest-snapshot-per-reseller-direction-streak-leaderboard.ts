// Weekly digest per-reseller sustained-direction streak leaderboard (P11.73).
//
// The direction-streak family already carries five surfaces at increasing
// grain:
//   • P11.30 → portfolio spotlight (per metric): which KPIs moved in the same
//     direction portfolio-wide for 2+ consecutive point-to-point transitions.
//   • P11.32 → per-(metric × reseller) spotlight: which (metric × partner)
//     pairs share a sustained-direction run.
//   • P11.57 / P11.59 / P11.61 → coverage toplines at portfolio / per-reseller
//     / per-metric grains: how many KPIs / partners are on a run right now,
//     split up vs. down.
//   • P11.65 → matrix-flat top-N leaderboard: of ALL streaks anywhere in the
//     (metric × reseller) matrix, which are the deepest / longest.
//   • P11.69 → per-metric top-N leaderboard: for each KPI, which are the
//     deepest partner runs on that KPI (equal footing per metric so a churn
//     leader is not crowded out by MRR volatility).
//
// Both leaderboard axes so far bucket by KPI — the flat board is length-
// sorted across all (metric × reseller) pairs, and the per-metric board fixes
// the "volatile KPI crowds out the top-N" failure mode by partitioning by
// KPI. Ops still asks the reciprocal question: "for THIS partner, which of
// their KPIs have the longest sustained runs?" — a per-metric or flat board
// can't answer that without scrolling into the P11.32 drill-down and mentally
// regrouping by partner.
//
// This module lands the per-reseller analogue of P11.69: for each partner
// with at least one qualifying streak, render an independent top-N
// leaderboard of the deepest KPI runs on that partner's own book. The result
// is an executive strip that gives every partner an at-a-glance answer to
// "where is this partner most persistent right now?" — a small partner
// riding a length-3 churn recovery ranks #1 in their own group even if their
// MRR magnitude wouldn't crack the flat or per-metric top-N. This closes the
// leaderboard family's symmetry along the reseller axis, mirroring how the
// coverage family already splits at portfolio (P11.57), per-metric (P11.61),
// AND per-reseller (P11.59) grains.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.20 → P11.21 / P11.22 → P11.23 /
// P11.24 → P11.25 / P11.26 → P11.27 / P11.28 → P11.29 / P11.30 → P11.31 /
// P11.32 → P11.33 / P11.34 → P11.35 / P11.37 → P11.38 / P11.39 → P11.40 /
// P11.41 → P11.42 / P11.43 → P11.44 / P11.45 → P11.46 / P11.47 → P11.48 /
// P11.49 → P11.50 / P11.51 → P11.52 / P11.53 → P11.54 / P11.55 → P11.56 /
// P11.57 → P11.58 / P11.59 → P11.60 / P11.61 → P11.62 / P11.63 → P11.64 /
// P11.65 → P11.66 / P11.67 → P11.68 / P11.69 → P11.70 / P11.71 → P11.72
// pattern. Cron-route wiring intentionally deferred to a follow-up tick
// (P11.74) so this shape can be exercised in isolation before touching the
// hot Monday cron path.
//
// Design notes:
//   • Consumes DigestSnapshotPerResellerRollingTrend directly and delegates
//     to computeDigestSnapshotPerResellerDirectionStreaks so leaderboard
//     entries cannot diverge from the P11.32 spotlight rows they summarise.
//   • DEFAULT_PER_RESELLER_TOP_N = 5 mirrors the P11.69 per-metric cap so
//     both per-partition strips share the same tightness. The flat P11.65
//     board uses 10 across all metrics; per-partner-per-KPI at 5 across ~10
//     headline metrics × N partners could otherwise explode into a dense
//     table. Caller can widen or narrow via the topN arg. topN < 1 coerces
//     to DEFAULT_PER_RESELLER_TOP_N; fractional values floor.
//   • Group ordering: reseller_code asc (deterministic + alphabetical) —
//     partners have no canonical spec order the way HEADLINE_METRICS does
//     for KPIs. Only partners with at least one qualifying row emit a group.
//   • Each group carries its own top_n / total_qualified pair so the caption
//     "top 3 of 8 KPIs for ACME" tells ops how many other KPIs on that
//     partner's book also have qualifying streaks.
//   • Sort within each group: length desc primary (matches P11.32 posture),
//     |cumulative_delta| desc secondary (steeper runs rank higher within the
//     same length band), key spec-order tertiary (canonical HEADLINE_METRICS
//     order for deterministic ties within a partner group — since partner is
//     group-invariant, the KPI key becomes the natural tiebreak).
//   • Formatter returns "" when window_size < 3 (a 2-week window cannot host
//     a length-2 streak — matches P11.30 / P11.32 posture) OR when zero
//     groups qualify.

import {
  HEADLINE_METRICS,
  type HeadlineMetricUnit,
} from "./digest-snapshot-metric-delta";
import type { DigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerDirectionStreaks,
  type StreakDirection,
} from "./digest-snapshot-per-reseller-direction-streaks";
import type { KnownKpiSection } from "./digest-snapshot";

export const DEFAULT_PER_RESELLER_TOP_N = 5;

const SPEC_ORDER = new Map<KnownKpiSection, number>(
  HEADLINE_METRICS.map((spec, idx) => [spec.key, idx]),
);

export interface PerResellerDirectionStreakLeaderboardEntry {
  readonly rank: number;
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly unit: HeadlineMetricUnit;
  readonly direction: StreakDirection;
  readonly length: number;
  readonly first_week: string;
  readonly last_week: string;
  readonly start_total: number;
  readonly end_total: number;
  readonly cumulative_delta: number;
}

export interface PerResellerDirectionStreakLeaderboardGroup {
  readonly reseller_code: string;
  readonly top_n: number;
  readonly total_qualified: number;
  readonly rows: readonly PerResellerDirectionStreakLeaderboardEntry[];
}

export interface DigestSnapshotPerResellerDirectionStreakLeaderboard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly min_streak_length: number;
  readonly top_n_per_reseller: number;
  readonly groups: readonly PerResellerDirectionStreakLeaderboardGroup[];
}

/**
 * Fold a DigestSnapshotPerResellerRollingTrend into a per-reseller top-N
 * leaderboard of the deepest sustained-direction streaks. For each partner
 * with at least one qualifying streak, emits an independent top-N ranking of
 * their own KPI runs so a small partner leading on churn recovery is #1 on
 * their own book even if their MRR magnitude wouldn't crack the flat or
 * per-metric top-N. Reuses computeDigestSnapshotPerResellerDirectionStreaks
 * so entries cannot diverge from the P11.32 spotlight rows they summarise.
 *
 * Sort within each group: length desc primary, |cumulative_delta| desc
 * secondary (steeper runs rank higher within the same length band), key
 * HEADLINE_METRICS spec-order tertiary. Group ordering: reseller_code asc.
 *
 * topN < 1 coerces to DEFAULT_PER_RESELLER_TOP_N. Fractional inputs floor to
 * integer. minStreakLength is forwarded to the detector; the detector
 * handles its own coercion (< 1 → DEFAULT_MIN_STREAK_LENGTH).
 */
export function computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
  trend: DigestSnapshotPerResellerRollingTrend,
  topN: number = DEFAULT_PER_RESELLER_TOP_N,
  minStreakLength: number = DEFAULT_MIN_STREAK_LENGTH,
): DigestSnapshotPerResellerDirectionStreakLeaderboard {
  const cap =
    Number.isFinite(topN) && topN >= 1
      ? Math.floor(topN)
      : DEFAULT_PER_RESELLER_TOP_N;

  const streaks = computeDigestSnapshotPerResellerDirectionStreaks(
    trend,
    minStreakLength,
  );

  const byReseller = new Map<
    string,
    {
      reseller_code: string;
      rows: (typeof streaks.rows)[number][];
    }
  >();

  for (const row of streaks.rows) {
    let group = byReseller.get(row.reseller_code);
    if (!group) {
      group = { reseller_code: row.reseller_code, rows: [] };
      byReseller.set(row.reseller_code, group);
    }
    group.rows.push(row);
  }

  const sortedCodes = Array.from(byReseller.keys()).sort((a, b) =>
    a.localeCompare(b),
  );

  const groups: PerResellerDirectionStreakLeaderboardGroup[] = [];
  for (const code of sortedCodes) {
    const bucket = byReseller.get(code);
    if (!bucket || bucket.rows.length === 0) continue;
    const sorted = bucket.rows.slice().sort((a, b) => {
      if (a.length !== b.length) return b.length - a.length;
      const magA = Math.abs(a.cumulative_delta);
      const magB = Math.abs(b.cumulative_delta);
      if (magA !== magB) return magB - magA;
      const specA = SPEC_ORDER.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const specB = SPEC_ORDER.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      return specA - specB;
    });
    const rows: PerResellerDirectionStreakLeaderboardEntry[] = sorted
      .slice(0, cap)
      .map((r, i) => ({
        rank: i + 1,
        key: r.key,
        metric_name: r.metric_name,
        unit: r.unit,
        direction: r.direction,
        length: r.length,
        first_week: r.first_week,
        last_week: r.last_week,
        start_total: r.start_total,
        end_total: r.end_total,
        cumulative_delta: r.cumulative_delta,
      }));
    groups.push({
      reseller_code: bucket.reseller_code,
      top_n: cap,
      total_qualified: bucket.rows.length,
      rows,
    });
  }

  return {
    window_size: streaks.window_size,
    first_week: streaks.first_week,
    last_week: streaks.last_week,
    min_streak_length: streaks.min_streak_length,
    top_n_per_reseller: cap,
    groups,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAud(cents: number): string {
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}A$${whole}.${String(frac).padStart(2, "0")}`;
}

function formatCell(unit: HeadlineMetricUnit, n: number): string {
  if (unit === "cents" || unit === "signed_cents") return formatAud(n);
  return String(n);
}

function formatCumulativeDelta(unit: HeadlineMetricUnit, n: number): string {
  if (unit === "cents" || unit === "signed_cents") {
    const sign = n > 0 ? "+" : n < 0 ? "-" : "";
    const abs = Math.abs(n);
    return `${sign}${formatAud(abs).replace(/^-/, "")}`;
  }
  if (n > 0) return `+${n}`;
  return String(n);
}

/**
 * Render a per-reseller top-N leaderboard HTML section of the deepest
 * sustained-direction streaks per partner. In the P11.74 cron wiring this
 * lands directly ABOVE the P11.32 per-(metric × reseller) spotlight and
 * BELOW the P11.70 per-metric leaderboard so ops reads the partner-by-partner
 * top-of-fold strip after the metric-by-metric strip before drilling into the
 * full per-partner table. This closes the leaderboard family's per-partner
 * axis symmetric with the P11.59 per-reseller coverage topline.
 *
 * Returns "" when window_size < 3 (a 2-week window cannot host a length-2
 * streak — matches P11.32 posture) OR when zero groups qualify.
 */
export function formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(
  board: DigestSnapshotPerResellerDirectionStreakLeaderboard,
): string {
  if (board.window_size < 3) return "";
  if (board.groups.length === 0) return "";

  const firstWeek = board.first_week ? escapeHtml(board.first_week) : "";
  const lastWeek = board.last_week ? escapeHtml(board.last_week) : "";

  const groupsHtml = board.groups
    .map((group) => {
      const body = group.rows
        .map((r) => {
          const arrow = r.direction === "up" ? "&uarr;" : "&darr;";
          const dirColor = r.direction === "up" ? "#065f46" : "#991b1b";
          return `
      <tr>
        <td style="text-align:right">${r.rank}</td>
        <td>${escapeHtml(r.key)} / ${escapeHtml(r.metric_name)}</td>
        <td style="text-align:center;color:${dirColor}">${arrow} ${r.direction}</td>
        <td style="text-align:right">${r.length}</td>
        <td>${escapeHtml(r.first_week)} &rarr; ${escapeHtml(r.last_week)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.start_total)}</td>
        <td style="text-align:right">${formatCell(r.unit, r.end_total)}</td>
        <td style="text-align:right">${formatCumulativeDelta(r.unit, r.cumulative_delta)}</td>
      </tr>`;
        })
        .join("");
      const shown = group.rows.length;
      const total = group.total_qualified;
      const caption =
        total > shown
          ? `Top ${shown} of ${total} KPIs for ${escapeHtml(group.reseller_code)}`
          : `Top ${shown} KPI${shown === 1 ? "" : "s"} for ${escapeHtml(group.reseller_code)}`;
      return `
    <h4 style="margin-top:16px;font-family:Arial,sans-serif;font-size:13px">${caption}</h4>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>#</th>
          <th>KPI</th>
          <th>Direction</th>
          <th>Length</th>
          <th>Window</th>
          <th>Start</th>
          <th>End</th>
          <th>Cumulative delta</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
    })
    .join("");

  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Per-partner sustained-direction streak leaderboards across the ${board.window_size}-week window (${firstWeek} &rarr; ${lastWeek})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">One top-${board.top_n_per_reseller} leaderboard per partner so ops can answer "where is this partner most persistent right now?" at a glance &mdash; a small partner riding a churn recovery ranks #1 on their own book even if their MRR magnitude wouldn't crack the flat matrix leaderboard or the per-metric strip above. Ranked within each partner by length (weeks of same-direction persistence) then by |cumulative delta| (steepness within the same length band). Every entry appears in the per-(metric &times; partner) spotlight table below with matching direction / length / cumulative delta &mdash; this strip surfaces the ${board.min_streak_length}+ point-to-point transition runs ops should scan per-partner before drilling into the full table.</p>${groupsHtml}`;
}
