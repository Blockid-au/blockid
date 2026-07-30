// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL TOP-2 COMBINED SHARE
// pure-lib (P11.167).
//
// Two-leader complement to the P11.165 single-leader (top-1) share
// surface. Where top-1 names how much the single largest partner /
// KPI owns of the pool, this surface names what fraction of the
// (transition, band) cell count the two largest participants own
// COMBINED — the oligopoly / duopoly signal.
//
// Two cells with an identical top-1 share of 0.35 can read very
// differently once the top-2 combined share is named:
//
//   • top-1 0.35 with top-2 combined 0.55 — a leader + a runner-up
//                                            with a long tail; ops
//                                            escalates to the pair.
//   • top-1 0.35 with top-2 combined 0.42 — a leader plus a very
//                                            similar spread across
//                                            many others (broad
//                                            competitive pool).
//
// The three top-K share surfaces now triangulate the leadership
// shape of the pool:
//   P11.161 pool count       — how MANY partners populate the pool?
//   P11.161 tail_share       — what share sits OUTSIDE top-3?
//   P11.163 HHI              — how EQUALLY is the pool distributed?
//   P11.165 top-1 share      — how much does the single leader own?
//   P11.167 top-2 share      — how much do the two largest COMBINED own?
//
// Top-2 combined share is well-defined for every non-empty pool
// (a solo pool has a well-defined "top-2" of 1 — the single participant
// trivially owns the entire top-N sum for any N >= 1). Empty cells
// emit null top-2 share.
//
// Cutoffs use plain-language fraction bands rather than an
// external-anchor taxonomy:
//   • oligopoly (share >= 0.75) — top-2 own three-quarters of the pool
//   • leading   (share >= 0.50) — top-2 own the majority
//   • contested (share <  0.50) — no dominant pair; pool is contested
// Both cutoffs are exposed on the envelope as oligopoly_share_min /
// leading_share_min so downstream JSONL consumers can render the
// label vocabulary without importing the TS module.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool module + P11.163 HHI module + P11.165 top-1
// share module; band cutoffs re-exported from P11.145 so band edges
// cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolTop1ShareSection (P11.166) AND
// IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy descends
// per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI (P11.163)
// → TOP-1 SHARE (P11.165) → TOP-2 SHARE (this module) → per-pair
// hot-cells GRANULAR. Top-1 names the single-leader slice; top-2
// names the dominant-pair combined slice.

import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
  type BandThresholds,
} from "./digest-snapshot-per-transition-magnitude-drilldown";
import { TOP_N } from "./digest-snapshot-per-transition-magnitude-top3-leaderboard";

export { TOP_N };

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";
type MagnitudeBandKey = "small" | "medium" | "large";
type Top2ShareLabel = "empty" | "oligopoly" | "leading" | "contested";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language fraction bands. Top-2 combined crossing 50 or 75 is
// a directly readable duopoly / oligopoly signal — no external-anchor
// taxonomy required (mirrors the P11.165 top-1 share posture, whose
// 40/60 thresholds are similarly plain-language).
const OLIGOPOLY_SHARE_MIN = 0.75;
const LEADING_SHARE_MIN = 0.5;

// Shares rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.165
// top-1 share surfaces.
const SHARE_DECIMALS = 4;

// How many top-K entries this surface sums. Independent of TOP_N (the
// leaderboard display cap) — this scalar always names the top-2
// combined share regardless of how many rows the leaderboard shows.
const TOP_K = 2;

export interface PerTransitionMagnitudeTop3PoolTop2ShareBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top2_cells: number;
  readonly partner_top2_share: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top2_cells: number;
  readonly metric_top2_share: number | null;
}

export interface PerTransitionMagnitudeTop3PoolTop2ShareBands {
  readonly small: PerTransitionMagnitudeTop3PoolTop2ShareBand;
  readonly medium: PerTransitionMagnitudeTop3PoolTop2ShareBand;
  readonly large: PerTransitionMagnitudeTop3PoolTop2ShareBand;
}

export interface PerTransitionMagnitudeTop3PoolTop2ShareEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolTop2ShareBands;
}

export interface PerTransitionMagnitudeTop3PoolTop2ShareMap {
  readonly improved: PerTransitionMagnitudeTop3PoolTop2ShareEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolTop2ShareEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolTop2ShareEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolTop2ShareEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly top_k: number;
  readonly oligopoly_share_min: number;
  readonly leading_share_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolTop2ShareMap;
}

interface BandBuckets {
  partners: Map<string, number>;
  metrics: Map<string, number>;
}

interface TransitionBuckets {
  small: BandBuckets;
  medium: BandBuckets;
  large: BandBuckets;
}

function emptyBandBuckets(): BandBuckets {
  return { partners: new Map(), metrics: new Map() };
}

function emptyTransitionBuckets(): TransitionBuckets {
  return {
    small: emptyBandBuckets(),
    medium: emptyBandBuckets(),
    large: emptyBandBuckets(),
  };
}

function bandForScore(score: number): MagnitudeBandKey {
  if (score <= MAGNITUDE_SMALL_MAX) return "small";
  if (score <= MAGNITUDE_MEDIUM_MAX) return "medium";
  return "large";
}

function isTransitionKey(
  t: PerPairHotCellRow["transition"],
): t is TransitionBucketKey {
  return (
    t === "improved" ||
    t === "degraded" ||
    t === "rotated" ||
    t === "undecidable"
  );
}

function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  top2_cells: number;
  top2_share: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, top2_cells: 0, top2_share: null };
  }
  // Sort desc + take the first TOP_K. A solo pool sums to the single
  // available entry, so top2_cells === pool_cells and share === 1.
  const sorted = [...values].sort((a, b) => b - a);
  const top2_cells = sorted.slice(0, TOP_K).reduce((a, b) => a + b, 0);
  const top2_share = roundTo(top2_cells / pool_cells, SHARE_DECIMALS);
  return { pool_count, pool_cells, top2_cells, top2_share };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolTop2ShareBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top2_cells: partner.top2_cells,
    partner_top2_share: partner.top2_share,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top2_cells: metric.top2_cells,
    metric_top2_share: metric.top2_share,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolTop2ShareEntry {
  return {
    bands: {
      small: finaliseBand(buckets.small),
      medium: finaliseBand(buckets.medium),
      large: finaliseBand(buckets.large),
    },
  };
}

function ingest(
  buckets: BandBuckets,
  code: string,
  key: PerPairHotCellRow["key"],
): void {
  buckets.partners.set(code, (buckets.partners.get(code) ?? 0) + 1);
  buckets.metrics.set(key, (buckets.metrics.get(key) ?? 0) + 1);
}

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share {
  const buckets: Record<TransitionBucketKey, TransitionBuckets> = {
    improved: emptyTransitionBuckets(),
    degraded: emptyTransitionBuckets(),
    rotated: emptyTransitionBuckets(),
    undecidable: emptyTransitionBuckets(),
  };

  let total_hot_cells = 0;

  for (const r of hotCells.rows) {
    if (!isTransitionKey(r.transition)) continue;
    total_hot_cells += 1;
    const band = buckets[r.transition][bandForScore(r.hot_score)];
    ingest(band, r.reseller_code, r.key);
  }

  return {
    window_size: hotCells.window_size,
    first_week: hotCells.first_week,
    last_week: hotCells.last_week,
    sustained_p90_threshold: hotCells.sustained_p90_threshold,
    threshold: hotCells.threshold,
    total_hot_cells,
    top_n: TOP_N,
    top_k: TOP_K,
    oligopoly_share_min: OLIGOPOLY_SHARE_MIN,
    leading_share_min: LEADING_SHARE_MIN,
    band_thresholds: {
      small_max: MAGNITUDE_SMALL_MAX,
      medium_max: MAGNITUDE_MEDIUM_MAX,
    },
    transitions: {
      improved: finaliseTransition(buckets.improved),
      degraded: finaliseTransition(buckets.degraded),
      rotated: finaliseTransition(buckets.rotated),
      undecidable: finaliseTransition(buckets.undecidable),
    },
  };
}

function labelForShare(
  pool_count: number,
  share: number | null,
  oligopoly_share_min: number,
  leading_share_min: number,
): Top2ShareLabel {
  if (pool_count === 0 || share === null) return "empty";
  if (share >= oligopoly_share_min) return "oligopoly";
  if (share >= leading_share_min) return "leading";
  return "contested";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function transitionLabel(k: TransitionBucketKey): string {
  if (k === "improved") return "improved &uarr;";
  if (k === "degraded") return "degraded &darr;";
  if (k === "rotated") return "rotated &harr;";
  return "undecidable ?";
}

function bandRangeLabel(
  k: MagnitudeBandKey,
  small_max: number,
  medium_max: number,
): string {
  if (k === "small") return `small (1..${small_max})`;
  if (k === "medium") return `medium (${small_max + 1}..${medium_max})`;
  return `large (${medium_max + 1}+)`;
}

function renderShareCell(
  pool_count: number,
  pool_cells: number,
  top2_cells: number,
  share: number | null,
  oligopoly_share_min: number,
  leading_share_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForShare(
    pool_count,
    share,
    oligopoly_share_min,
    leading_share_min,
  );
  const shareText = share === null ? "-" : `${(share * 100).toFixed(1)}%`;
  return `top2 ${shareText} (${top2_cells}/${pool_cells}) / pool ${pool_count} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { oligopoly_share_min, leading_share_min } = snapshot;
  const oligopolyPct = (oligopoly_share_min * 100).toFixed(0);
  const leadingPct = (leading_share_min * 100).toFixed(0);

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top2_cells, band.partner_top2_share, oligopoly_share_min, leading_share_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top2_cells, band.metric_top2_share, oligopoly_share_min, leading_share_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool TOP-${snapshot.top_k} combined share across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Two-leader complement to the P11.165 single-leader (top-1) share surface — names the fraction of the full pool the two largest partners / KPIs own COMBINED per (transition, band) cell. Two cells with identical top-1 shares can carry very different top-2 combined shares (leader + runner-up vs leader + long tail). Labels: oligopoly = share &ge; ${oligopolyPct}% (top-2 own three-quarters of the pool), leading = share &ge; ${leadingPct}% (top-2 own the majority), contested = share &lt; ${leadingPct}% (no dominant pair; pool is broadly split). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + top2_share null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner top-2</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI top-2</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
