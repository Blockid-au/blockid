// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL BOTTOM-2 COMBINED SHARE
// pure-lib (P11.183).
//
// Two-trailer complement to the P11.167 top-2 combined share surface,
// and floor-side pair to the P11.179 single-trailer (bottom-1) share
// surface. Where top-2 names how much the two largest partners /
// KPIs OWN of the pool COMBINED, bottom-2 names what fraction of the
// (transition, band) cell count the two SMALLEST participants own
// COMBINED — the tail-thickness / long-thin-tail signal.
//
// Two cells with an identical bottom-1 share of 0.10 can read very
// differently once the bottom-2 combined share is named:
//
//   • bottom-1 0.10 with bottom-2 combined 0.20 — floor participants
//                                                  cluster (short flat
//                                                  tail).
//   • bottom-1 0.10 with bottom-2 combined 0.12 — floor plus a very
//                                                  small second
//                                                  trailer, then a
//                                                  jump to the head
//                                                  (long thin tail).
//
// The three bottom-K share surfaces now triangulate the tail shape of
// the pool from every-end-then-each-slice:
//   P11.161 pool count       — how MANY partners populate the pool?
//   P11.163 HHI              — how EQUALLY is the pool distributed?
//   P11.165 top-1 share      — how much does the single leader own?
//   P11.167 top-2 share      — how much do the two largest COMBINED own?
//   P11.179 bottom-1 share   — how little does the single trailer own?
//   P11.183 bottom-2 share   — how much do the two smallest COMBINED own?
//   P11.181 range            — leader-to-trailer SPREAD across the pool
//
// Bottom-2 combined share is well-defined for every non-empty pool
// (a solo pool has a well-defined "bottom-2" of 1 — the single
// participant trivially owns the entire bottom-K sum for any K >= 1;
// a two-partner pool has a bottom-2 that spans the whole pool since
// both cells sit in the bottom-2). Empty cells emit null bottom-2
// share.
//
// Cutoffs use plain-language fraction bands rather than an
// external-anchor taxonomy. Mirror the P11.167 top-2 posture at the
// SAME cutoff pair (0.50 / 0.25) since bottom-2 sits on the same
// [0, 1] axis but is read under the evenness framing — a HIGH
// bottom-2 combined share means a FLATTER pool (matching the P11.177
// H_norm / P11.179 bottom-1 evenness framing):
//   • fat_floor      (share >= 0.50) — bottom-2 own the majority of
//                                       the pool; floor is fat, no
//                                       thin tail.
//   • moderate_floor (share >= 0.25) — bottom-2 own at least a
//                                       quarter; tail participants are
//                                       visible.
//   • thin_tail      (share <  0.25) — bottom-2 own under a quarter;
//                                       pool has a long thin tail.
// Both cutoffs are exposed on the envelope as fat_floor_min /
// moderate_floor_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// NOTE ON LABEL ORIENTATION: labels invert from the P11.167 top-2
// sibling (where high share means high leader-pair concentration).
// Here HIGH bottom-2 share means HIGH floor / LOW long-tail
// concentration = FLATTER pool. This matches the P11.177 H_norm and
// P11.179 bottom-1 evenness framing — HIGH value = HIGH evenness =
// LOW inequality — chosen because a bottom-K reader who cares about
// the tail wants "big number = fat floor" to match the direct human
// read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// the P11.161 pool + P11.163 HHI + P11.165 top-1 + P11.167 top-2 +
// P11.169 Gini + P11.171 Theil + P11.173 Atkinson + P11.175 CV +
// P11.177 H_norm + P11.179 bottom-1 + P11.181 range companions; band
// cutoffs re-exported from P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolRangeSection (P11.182) AND
// IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy descends
// per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI (P11.163)
// → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173) → CV
// (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE (P11.165)
// → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE (P11.179) → RANGE
// (P11.181) → BOTTOM-2 SHARE (this module) → per-pair hot-cells
// GRANULAR (P11.139). Whole-pool inequality SEXTET first, then the
// leader slice, then the dominant-pair slice, then the floor slice,
// then the head-to-floor SPREAD scalar, then the dominant-pair floor
// slice — the pool is described from every-end-then-each-slice-then-
// spread-then-tail-slice before the per-pair granular table.

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
type Bottom2ShareLabel =
  | "empty"
  | "solo"
  | "fat_floor"
  | "moderate_floor"
  | "thin_tail";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language fraction bands. Mirrors the P11.167 top-2 posture at
// the SAME 0.50 / 0.25 cutoff pair since bottom-2 sits on the same
// [0, 1] axis, but reads under the evenness framing (HIGH share =
// FLATTER pool). Cutoffs are anchored to what a small-count pool
// naturally emits: perfectly flat pool_count 4 → 2/4 = 0.5 (fat_floor
// exactly on the edge), pool_count 8 → 2/8 = 0.25 (moderate_floor
// exactly on the edge), pool_count 10+ starts slipping into thin_tail
// territory unless the tail participants each carry many cells.
const FAT_FLOOR_MIN = 0.5;
const MODERATE_FLOOR_MIN = 0.25;

// Shares rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.165
// top-1 + P11.167 top-2 + P11.179 bottom-1 surfaces.
const SHARE_DECIMALS = 4;

// How many bottom-K entries this surface sums. Independent of TOP_N
// (the leaderboard display cap) — this scalar always names the
// bottom-2 combined share regardless of how many rows the leaderboard
// shows. Mirrors the P11.167 top-2 TOP_K posture.
const BOTTOM_K = 2;

export interface PerTransitionMagnitudeTop3PoolBottom2ShareBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_bottom2_cells: number;
  readonly partner_bottom2_share: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_bottom2_cells: number;
  readonly metric_bottom2_share: number | null;
}

export interface PerTransitionMagnitudeTop3PoolBottom2ShareBands {
  readonly small: PerTransitionMagnitudeTop3PoolBottom2ShareBand;
  readonly medium: PerTransitionMagnitudeTop3PoolBottom2ShareBand;
  readonly large: PerTransitionMagnitudeTop3PoolBottom2ShareBand;
}

export interface PerTransitionMagnitudeTop3PoolBottom2ShareEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolBottom2ShareBands;
}

export interface PerTransitionMagnitudeTop3PoolBottom2ShareMap {
  readonly improved: PerTransitionMagnitudeTop3PoolBottom2ShareEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolBottom2ShareEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolBottom2ShareEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolBottom2ShareEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly bottom_k: number;
  readonly fat_floor_min: number;
  readonly moderate_floor_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolBottom2ShareMap;
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
  bottom2_cells: number;
  bottom2_share: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, bottom2_cells: 0, bottom2_share: null };
  }
  // Sort asc + take the first BOTTOM_K. A solo pool sums to the single
  // available entry, so bottom2_cells === pool_cells and share === 1;
  // a two-partner pool has bottom_k >= pool_count so bottom2_cells
  // === pool_cells and share === 1 there too.
  const sorted = [...values].sort((a, b) => a - b);
  const bottom2_cells = sorted.slice(0, BOTTOM_K).reduce((a, b) => a + b, 0);
  const bottom2_share = roundTo(bottom2_cells / pool_cells, SHARE_DECIMALS);
  return { pool_count, pool_cells, bottom2_cells, bottom2_share };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolBottom2ShareBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_bottom2_cells: partner.bottom2_cells,
    partner_bottom2_share: partner.bottom2_share,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_bottom2_cells: metric.bottom2_cells,
    metric_bottom2_share: metric.bottom2_share,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolBottom2ShareEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share {
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
    bottom_k: BOTTOM_K,
    fat_floor_min: FAT_FLOOR_MIN,
    moderate_floor_min: MODERATE_FLOOR_MIN,
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
  fat_floor_min: number,
  moderate_floor_min: number,
): Bottom2ShareLabel {
  if (pool_count === 0 || share === null) return "empty";
  if (pool_count === 1) return "solo";
  if (share >= fat_floor_min) return "fat_floor";
  if (share >= moderate_floor_min) return "moderate_floor";
  return "thin_tail";
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
  bottom2_cells: number,
  share: number | null,
  fat_floor_min: number,
  moderate_floor_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForShare(
    pool_count,
    share,
    fat_floor_min,
    moderate_floor_min,
  );
  const shareText = share === null ? "-" : `${(share * 100).toFixed(1)}%`;
  return `bottom2 ${shareText} (${bottom2_cells}/${pool_cells}) / pool ${pool_count} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom2ShareSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolBottom2Share,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { fat_floor_min, moderate_floor_min } = snapshot;
  const fatPct = (fat_floor_min * 100).toFixed(0);
  const moderatePct = (moderate_floor_min * 100).toFixed(0);

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.partner_pool_count, band.partner_pool_cells, band.partner_bottom2_cells, band.partner_bottom2_share, fat_floor_min, moderate_floor_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.metric_pool_count, band.metric_pool_cells, band.metric_bottom2_cells, band.metric_bottom2_share, fat_floor_min, moderate_floor_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool BOTTOM-${snapshot.bottom_k} combined share across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Two-trailer complement to the P11.167 TOP-2 combined share surface, and floor-side pair to the P11.179 BOTTOM-1 share surface &mdash; names the fraction of the FULL pool the two SMALLEST partners / KPIs own COMBINED per (transition, band) cell. Two cells with identical bottom-1 shares can carry very different bottom-2 combined shares (floor participants cluster vs long thin tail). Labels flip orientation from P11.167 top-2 (high bottom-2 = high floor / LOW long-tail concentration = FLATTER pool): solo = pool_count 1 (share=1 by definition), fat_floor = share &ge; ${fatPct}% (bottom-2 own the majority of the pool; floor is fat), moderate_floor = share &ge; ${moderatePct}% (tail participants visible), thin_tail = share &lt; ${moderatePct}% (long thin tail). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + bottom2_share null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner bottom-2</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI bottom-2</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
