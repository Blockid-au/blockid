// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL pure-lib (P11.161).
//
// Population-size complement to the P11.149 TOP-3 leaderboard. Every
// existing per-(transition, band) TOP-3 surface (leaderboard / concentration
// / tie-count / runner-up gap / tail gap / middle gap) describes ONLY the
// top-3 winners inside each cell. None of them answer the follow-up ops
// question that closes the loop on 'is the loud cell a small or large
// pool?': 'how many partners / KPIs live in this (transition, band) OUTSIDE
// the top-3, and what share of the total cell count do they carry?'.
//
// This module folds the P11.139 per-pair hot-cells envelope into per-
// (transition, band) POOL scalars:
//
//   • partner_pool_count      — distinct partners with any cells in the
//                                combination (integer >= 0).
//   • partner_pool_cells      — sum of cells across ALL partners (equals
//                                the P11.145 per-band cells count; carried
//                                here so a JSONL consumer of the pool
//                                surface can compute tail_share without
//                                joining envelopes).
//   • partner_tail_beyond_top3 — max(0, partner_pool_count - TOP_N).
//   • partner_tail_cells      — pool_cells - top3_cells (0 when pool
//                                fits inside TOP_N).
//   • partner_tail_share      — partner_tail_cells / partner_pool_cells
//                                (null when pool_cells === 0). Reads as
//                                fraction 0..1; higher = more noise
//                                outside the top-3, ops widens the
//                                investigation beyond the ranked list.
//
// Same shape mirrored for metrics via the parallel `metric_*` scalars so
// the surface has no partner/metric asymmetry.
//
// Uses TOP_N re-exported from the P11.149 leaderboard so the top-N cap
// cannot drift across surfaces. Uses band cutoffs re-exported from the
// P11.145 drilldown so band edges cannot drift either.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3MiddleGapSection (P11.160) AND
// IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy descends
// per-transition MAGNITUDE TOP-3 gap suite (runner-up / tail / middle)
// → per-transition MAGNITUDE TOP-3 POOL (this module) → per-pair hot-
// cells GRANULAR. The gap suite describes the SHAPE of the top-3; this
// module describes the SIZE of the pool the top-3 was drawn from.

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
type PoolLabel = "empty" | "compact" | "modest_tail" | "wide_tail";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Fraction of pool cells sitting OUTSIDE the top-3 that flips a cell from
// "modest_tail" to "wide_tail". Chosen at 0.25 so cells where the tail
// carries a full quarter of the aggregate get called out; anything below
// stays in the modest bucket. Exposed on the envelope so a JSONL consumer
// can render the cutoff without re-declaring it.
const WIDE_TAIL_SHARE_MIN = 0.25;

export interface PerTransitionMagnitudeTop3PoolBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_tail_beyond_top3: number;
  readonly partner_tail_cells: number;
  readonly partner_tail_share: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_tail_beyond_top3: number;
  readonly metric_tail_cells: number;
  readonly metric_tail_share: number | null;
}

export interface PerTransitionMagnitudeTop3PoolBands {
  readonly small: PerTransitionMagnitudeTop3PoolBand;
  readonly medium: PerTransitionMagnitudeTop3PoolBand;
  readonly large: PerTransitionMagnitudeTop3PoolBand;
}

export interface PerTransitionMagnitudeTop3PoolEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolBands;
}

export interface PerTransitionMagnitudeTop3PoolMap {
  readonly improved: PerTransitionMagnitudeTop3PoolEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3Pool {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly wide_tail_share_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolMap;
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

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  tail_beyond_top3: number;
  tail_cells: number;
  tail_share: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count: 0,
      pool_cells: 0,
      tail_beyond_top3: 0,
      tail_cells: 0,
      tail_share: null,
    };
  }
  values.sort((a, b) => b - a);
  const top3_cells = values.slice(0, TOP_N).reduce((a, b) => a + b, 0);
  const tail_cells = pool_cells - top3_cells;
  const tail_beyond_top3 = Math.max(0, pool_count - TOP_N);
  const tail_share = pool_cells > 0 ? tail_cells / pool_cells : null;
  return { pool_count, pool_cells, tail_beyond_top3, tail_cells, tail_share };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_tail_beyond_top3: partner.tail_beyond_top3,
    partner_tail_cells: partner.tail_cells,
    partner_tail_share: partner.tail_share,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_tail_beyond_top3: metric.tail_beyond_top3,
    metric_tail_cells: metric.tail_cells,
    metric_tail_share: metric.tail_share,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3Pool {
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
    wide_tail_share_min: WIDE_TAIL_SHARE_MIN,
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

function labelForPool(
  pool_count: number,
  tail_share: number | null,
  wide_tail_share_min: number,
): PoolLabel {
  if (pool_count === 0) return "empty";
  if (pool_count <= TOP_N || tail_share === null) return "compact";
  if (tail_share >= wide_tail_share_min) return "wide_tail";
  return "modest_tail";
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

function renderPoolCell(
  pool_count: number,
  tail_beyond_top3: number,
  tail_cells: number,
  pool_cells: number,
  tail_share: number | null,
  wide_tail_share_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPool(pool_count, tail_share, wide_tail_share_min);
  const sharePct = tail_share === null ? "-" : `${(tail_share * 100).toFixed(1)}%`;
  return `pool ${pool_count} / cells ${pool_cells}; tail ${tail_beyond_top3} (+${tail_cells} cells, ${sharePct}) (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3Pool,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { wide_tail_share_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPoolCell(band.partner_pool_count, band.partner_tail_beyond_top3, band.partner_tail_cells, band.partner_pool_cells, band.partner_tail_share, wide_tail_share_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPoolCell(band.metric_pool_count, band.metric_tail_beyond_top3, band.metric_tail_cells, band.metric_pool_cells, band.metric_tail_share, wide_tail_share_min)}</td></tr>`;
    });
  }).join("");

  const wideTailPct = (wide_tail_share_min * 100).toFixed(0);

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool size across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Population size of each (transition, band) cell and how much noise sits OUTSIDE the top-${snapshot.top_n} ranked list. Reads as pool ${'{count}'} / cells ${'{cells}'}; tail ${'{extras beyond top-'}${snapshot.top_n}${'}'} (+${'{tail cells}'}, ${'{share%}'}). Labels: compact = pool fits inside top-${snapshot.top_n}, modest_tail = tail carries under ${wideTailPct}% of pool cells, wide_tail = tail carries ${wideTailPct}%+ (ops widens investigation beyond the ranked list). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner pool</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI pool</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
