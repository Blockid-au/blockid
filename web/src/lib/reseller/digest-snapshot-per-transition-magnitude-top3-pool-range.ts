// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL RANGE
// pure-lib (P11.181).
//
// Head-to-floor SPREAD scalar over the P11.161 pool. Where P11.165 top-1
// share names the fraction owned by the SINGLE LARGEST participant and
// P11.179 bottom-1 share names the fraction owned by the SINGLE SMALLEST
// participant, RANGE names the GAP between the two:
//
//   range = top1_share - bottom1_share
//
// The two share surfaces bracket the pool from head and floor; range
// folds the pair into ONE scalar naming the vertical distance from
// leader to trailer. It complements the whole-pool inequality SEXTET
// (HHI / Gini / Theil / Atkinson / CV / H_norm) which fold ALL cells
// into one scalar rather than isolating the head-vs-floor delta.
//
// Two cells with the same pool_count + same HHI can carry very
// different ranges:
//
//   • Cell A: pool [4, 3, 2] — top1 4/9 = 0.4444, bottom1 2/9 =
//                              0.2222, range 0.2222 (moderate).
//   • Cell B: pool [6, 1, 1] — top1 6/8 = 0.75, bottom1 1/8 = 0.125,
//                              range 0.625 (wide — clear leader towers
//                              over the tail).
//   • Cell C: pool [1, 1, 1] — top1 = bottom1 = 1/3, range 0
//                              (compressed — perfectly flat).
//
// Range is well-defined for every non-empty pool:
//   • pool_count 0 → range null (empty).
//   • pool_count 1 → range 0 (solo: top1 = bottom1 = 1 by definition).
//   • pool_count 2 or 3 → range = top1_share - bottom1_share.
//
// Cutoffs use plain-language spread bands rather than an external-
// anchor taxonomy:
//   • compressed (range <  0.20) — leader and floor sit close; pool is
//                                  roughly level.
//   • moderate  (range >= 0.20) — noticeable gap between leader and
//                                  trailer.
//   • wide      (range >= 0.50) — leader towers over the floor; pool
//                                  is markedly stretched.
// Both cutoffs are exposed on the envelope as compressed_range_max /
// wide_range_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the inequality-framing convention: a HIGH
// range value = HIGH spread = HIGH head-to-floor inequality. This
// matches the P11.163 HHI / P11.169 Gini / P11.171 Theil / P11.173
// Atkinson / P11.175 CV vocabulary where the top band names the
// "peakier" pool. It inverts the P11.177 H_norm and P11.179 bottom-1
// vocabularies (which name evenness / floor thickness — "high value =
// flatter"). Range's orientation is chosen because a spread reader
// wants "big number = big gap" for direct human read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// the P11.161 pool + P11.163 HHI + P11.165 top-1 + P11.167 top-2 +
// P11.169 Gini + P11.171 Theil + P11.173 Atkinson + P11.175 CV +
// P11.177 H_norm + P11.179 bottom-1 companions; band cutoffs re-
// exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolBottom1ShareSection (P11.180)
// AND IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI
// (P11.163) → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173)
// → CV (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE
// (P11.165) → TOP-2 COMBINED SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (this module) → per-pair hot-cells GRANULAR
// (P11.139). Whole-pool inequality SEXTET first, then the leader
// slice, then the dominant-pair slice, then the floor slice, then
// the head-to-floor SPREAD scalar — the pool is described from every-
// end-then-each-slice-then-spread before the per-pair granular table.

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
type RangeLabel =
  | "empty"
  | "solo"
  | "compressed"
  | "moderate"
  | "wide";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language spread bands. Anchored to the natural gaps a 3-cell
// pool can emit: perfectly flat [1,1,1] range 0; [2,1,1] range
// 0.5 - 0.25 = 0.25 (moderate); [4,1,1] range 4/6 - 1/6 = 0.5 (wide);
// [3,1] range 0.5 (wide). Compressed catches the near-flat regime
// where a leader-vs-floor delta under a fifth of the pool is unlikely
// to trigger an ops read.
const COMPRESSED_RANGE_MAX = 0.2;
const WIDE_RANGE_MIN = 0.5;

// Shares rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.165
// top-1 + P11.179 bottom-1 surfaces.
const SHARE_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolRangeBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top1_share: number | null;
  readonly partner_bottom1_share: number | null;
  readonly partner_range: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top1_share: number | null;
  readonly metric_bottom1_share: number | null;
  readonly metric_range: number | null;
}

export interface PerTransitionMagnitudeTop3PoolRangeBands {
  readonly small: PerTransitionMagnitudeTop3PoolRangeBand;
  readonly medium: PerTransitionMagnitudeTop3PoolRangeBand;
  readonly large: PerTransitionMagnitudeTop3PoolRangeBand;
}

export interface PerTransitionMagnitudeTop3PoolRangeEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolRangeBands;
}

export interface PerTransitionMagnitudeTop3PoolRangeMap {
  readonly improved: PerTransitionMagnitudeTop3PoolRangeEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolRangeEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolRangeEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolRangeEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolRange {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly compressed_range_max: number;
  readonly wide_range_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolRangeMap;
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
  top1_share: number | null;
  bottom1_share: number | null;
  range: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      top1_share: null,
      bottom1_share: null,
      range: null,
    };
  }
  const top1_cells = Math.max(...values);
  const bottom1_cells = Math.min(...values);
  const top1_share = roundTo(top1_cells / pool_cells, SHARE_DECIMALS);
  const bottom1_share = roundTo(bottom1_cells / pool_cells, SHARE_DECIMALS);
  // Compute the range from RAW cells first, then round, so float drift
  // on the two rounded shares cannot inflate the range by one ulp.
  const rawRange = (top1_cells - bottom1_cells) / pool_cells;
  const range = roundTo(rawRange < 0 ? 0 : rawRange, SHARE_DECIMALS);
  return { pool_count, pool_cells, top1_share, bottom1_share, range };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolRangeBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top1_share: partner.top1_share,
    partner_bottom1_share: partner.bottom1_share,
    partner_range: partner.range,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top1_share: metric.top1_share,
    metric_bottom1_share: metric.bottom1_share,
    metric_range: metric.range,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolRangeEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolRange {
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
    compressed_range_max: COMPRESSED_RANGE_MAX,
    wide_range_min: WIDE_RANGE_MIN,
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

function labelForRange(
  pool_count: number,
  range: number | null,
  compressed_range_max: number,
  wide_range_min: number,
): RangeLabel {
  if (pool_count === 0 || range === null) return "empty";
  if (pool_count === 1) return "solo";
  if (range >= wide_range_min) return "wide";
  if (range < compressed_range_max) return "compressed";
  return "moderate";
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

function renderRangeCell(
  pool_count: number,
  pool_cells: number,
  top1_share: number | null,
  bottom1_share: number | null,
  range: number | null,
  compressed_range_max: number,
  wide_range_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForRange(
    pool_count,
    range,
    compressed_range_max,
    wide_range_min,
  );
  const rangeText = range === null ? "-" : `${(range * 100).toFixed(1)}%`;
  const topText = top1_share === null ? "-" : `${(top1_share * 100).toFixed(1)}%`;
  const bottomText =
    bottom1_share === null ? "-" : `${(bottom1_share * 100).toFixed(1)}%`;
  return `range ${rangeText} (top1 ${topText} &minus; bottom1 ${bottomText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolRange,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { compressed_range_max, wide_range_min } = snapshot;
  const compressedPct = (compressed_range_max * 100).toFixed(0);
  const widePct = (wide_range_min * 100).toFixed(0);

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRangeCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top1_share, band.partner_bottom1_share, band.partner_range, compressed_range_max, wide_range_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRangeCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top1_share, band.metric_bottom1_share, band.metric_range, compressed_range_max, wide_range_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool RANGE across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Head-to-floor SPREAD scalar over the P11.161 pool &mdash; folds the P11.165 TOP-1 SHARE and P11.179 BOTTOM-1 SHARE into ONE scalar naming the vertical distance between the LEADER and the TRAILER: range = top1_share &minus; bottom1_share. Two cells with the same HHI or same pool_count can carry very different ranges (level pool vs stretched pool). Labels: solo = pool_count 1 (range=0 by definition), compressed = range &lt; ${compressedPct}% (leader and floor sit close), moderate = range in [${compressedPct}%, ${widePct}%) (noticeable gap), wide = range &ge; ${widePct}% (leader towers over the floor). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + range null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner range</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI range</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
