// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL BOTTOM-1 SHARE
// pure-lib (P11.179).
//
// Floor complement to the P11.165 TOP-1 SHARE surface. Where top-1
// share names the fraction of the pool owned by the SINGLE LARGEST
// partner / KPI, bottom-1 share names the fraction owned by the
// SINGLE SMALLEST participant. Together the two surfaces bracket the
// pool from both ends:
//
//   P11.165 top-1 share      — HOW MUCH does the single leader own?
//   P11.179 bottom-1 share   — HOW LITTLE does the single tail owner
//                              have?
//
// Two cells with identical pool_count + identical top-1 share can
// carry very different bottom-1 shares:
//
//   • Cell A: pool_count 5, cells [6, 1, 1, 1, 1]. Top-1 share 0.6
//     (runaway), bottom-1 share 0.1 (moderate_floor — the tail
//     participants are visible but small).
//   • Cell B: pool_count 5, cells [6, 3, 1, 0.5, 0.5] (illustrative;
//     our counts are integers so read as [12, 6, 2, 1, 1]). Top-1
//     share 0.5 (leading), bottom-1 share 1/22 ≈ 0.045 (thin_tail —
//     the smallest owner is only 4.5% of the pool).
//
// The two scalars therefore triangulate the pool-shape read from the
// two ends rather than the middle: HHI + Gini + Theil + Atkinson + CV
// + H_norm all fold the WHOLE distribution to a single scalar; top-1
// share names ONE thing at the top; bottom-1 share names ONE thing
// at the bottom. Both scalars are cheap, plainly readable, and
// ops-actionable — top-1 says "who owns the pool?" and bottom-1 says
// "how thin is the tail?".
//
// Bottom-1 share is well-defined for every non-empty pool (like the
// top-1 mirror). Empty cells emit null bottom-1 share.
//
// Cutoffs use plain-language fraction bands rather than an
// external-anchor taxonomy:
//   • flat_floor    (share >= 0.15) — smallest participant owns at
//                                     least 15%; pool is broadly flat
//                                     with no thin tail (max
//                                     pool_count is ~6-7 at this
//                                     floor).
//   • moderate_floor (share >= 0.05) — smallest participant owns at
//                                     least 5%; tail participants are
//                                     visible.
//   • thin_tail     (share <  0.05) — smallest participant owns
//                                     under 5%; pool has a long thin
//                                     tail.
// Cutoffs exposed on the envelope as flat_floor_min /
// moderate_floor_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// NOTE ON LABEL ORIENTATION: labels invert from the top-1 sibling
// (where high share means high leader concentration). Here HIGH
// bottom-1 share means HIGH floor / LOW long-tail concentration =
// FLATTER pool. Labels are: solo (n=1), flat_floor (share >=
// flat_floor_min), moderate_floor (share >= moderate_floor_min),
// thin_tail (share < moderate_floor_min). This is the same evenness-
// framing orientation the P11.177 H_norm surface uses — a HIGH value
// = HIGH evenness = LOW inequality — chosen because a bottom-1
// reader who cares about the tail wants "big number = fat floor" to
// match the direct human read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with the P11.161 pool + P11.163 HHI + P11.165 top-1 + P11.167
// top-2 + P11.169 Gini + P11.171 Theil + P11.173 Atkinson + P11.175
// CV + P11.177 H_norm companions; band cutoffs re-exported from
// P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolTop2ShareSection (P11.168) AND
// IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy descends
// per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI (P11.163)
// → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173) → CV
// (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE (P11.165)
// → TOP-2 COMBINED SHARE (P11.167) → BOTTOM-1 SHARE (this module) →
// per-pair hot-cells GRANULAR (P11.139). Whole-pool inequality
// SEXTET first, then the leader slice, then the dominant-pair slice,
// then the floor slice — the pool is described from every-end-then-
// each-slice, walking the head down through the floor before the
// per-pair granular table.

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
type Bottom1ShareLabel =
  | "empty"
  | "solo"
  | "flat_floor"
  | "moderate_floor"
  | "thin_tail";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language fraction bands. Owns its own vocabulary since the
// smallest-share read wants an evenness-framing orientation (bigger
// number = fatter floor = flatter pool) rather than the inequality-
// framing top-1 orientation. Cutoffs are anchored to what a 5-6
// participant pool naturally emits: perfectly flat pool_count 6 = 1/6
// = 0.167 (above flat_floor_min), pool_count 10 = 0.10 (above
// moderate_floor_min), pool_count 25+ starts to slip below the
// moderate floor into thin_tail territory.
const FLAT_FLOOR_MIN = 0.15;
const MODERATE_FLOOR_MIN = 0.05;

// Shares rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as the P11.163 HHI + P11.165
// top-1 surfaces.
const SHARE_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolBottom1ShareBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_bottom1_cells: number;
  readonly partner_bottom1_share: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_bottom1_cells: number;
  readonly metric_bottom1_share: number | null;
}

export interface PerTransitionMagnitudeTop3PoolBottom1ShareBands {
  readonly small: PerTransitionMagnitudeTop3PoolBottom1ShareBand;
  readonly medium: PerTransitionMagnitudeTop3PoolBottom1ShareBand;
  readonly large: PerTransitionMagnitudeTop3PoolBottom1ShareBand;
}

export interface PerTransitionMagnitudeTop3PoolBottom1ShareEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolBottom1ShareBands;
}

export interface PerTransitionMagnitudeTop3PoolBottom1ShareMap {
  readonly improved: PerTransitionMagnitudeTop3PoolBottom1ShareEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolBottom1ShareEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolBottom1ShareEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolBottom1ShareEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly flat_floor_min: number;
  readonly moderate_floor_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolBottom1ShareMap;
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
  bottom1_cells: number;
  bottom1_share: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return { pool_count, pool_cells, bottom1_cells: 0, bottom1_share: null };
  }
  const bottom1_cells = Math.min(...values);
  const bottom1_share = roundTo(bottom1_cells / pool_cells, SHARE_DECIMALS);
  return { pool_count, pool_cells, bottom1_cells, bottom1_share };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolBottom1ShareBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_bottom1_cells: partner.bottom1_cells,
    partner_bottom1_share: partner.bottom1_share,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_bottom1_cells: metric.bottom1_cells,
    metric_bottom1_share: metric.bottom1_share,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolBottom1ShareEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share {
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
    flat_floor_min: FLAT_FLOOR_MIN,
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
  flat_floor_min: number,
  moderate_floor_min: number,
): Bottom1ShareLabel {
  if (pool_count === 0 || share === null) return "empty";
  if (pool_count === 1) return "solo";
  if (share >= flat_floor_min) return "flat_floor";
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
  bottom1_cells: number,
  share: number | null,
  flat_floor_min: number,
  moderate_floor_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForShare(
    pool_count,
    share,
    flat_floor_min,
    moderate_floor_min,
  );
  const shareText = share === null ? "-" : `${(share * 100).toFixed(1)}%`;
  return `bottom1 ${shareText} (${bottom1_cells}/${pool_cells}) / pool ${pool_count} (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { flat_floor_min, moderate_floor_min } = snapshot;
  const flatPct = (flat_floor_min * 100).toFixed(0);
  const moderatePct = (moderate_floor_min * 100).toFixed(0);

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.partner_pool_count, band.partner_pool_cells, band.partner_bottom1_cells, band.partner_bottom1_share, flat_floor_min, moderate_floor_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderShareCell(band.metric_pool_count, band.metric_pool_cells, band.metric_bottom1_cells, band.metric_bottom1_share, flat_floor_min, moderate_floor_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool BOTTOM-1 share across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Floor complement to the P11.165 TOP-1 SHARE surface &mdash; names the fraction of the FULL pool the SINGLE SMALLEST partner / KPI owns per (transition, band) cell. Where top-1 says "who owns the pool?", bottom-1 says "how thin is the tail?". Two cells with identical pool_count + top-1 share can carry very different bottom-1 shares (visible tail participants vs long thin tail). Labels flip orientation from top-1 (high bottom-1 = high floor / LOW long-tail concentration): solo = pool_count 1 (share=1 by definition), flat_floor = share &ge; ${flatPct}% (pool broadly flat, no thin tail), moderate_floor = share &ge; ${moderatePct}% (tail participants visible), thin_tail = share &lt; ${moderatePct}% (long thin tail). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + bottom1_share null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner bottom-1</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI bottom-1</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
