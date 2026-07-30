// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL TOP-1 / BOTTOM-1
// RATIO pure-lib (P11.185).
//
// Palma-style scale-invariant LEADER-TO-FLOOR lens over the P11.161
// pool. Where the P11.181 RANGE surface names the ADDITIVE spread
// (top1_share − bottom1_share) between the leader and the trailer,
// this surface names the MULTIPLICATIVE ratio (top1_share /
// bottom1_share = top1_cells / bottom1_cells). The two surfaces read
// the same head/floor pair but differ in geometry — a stretched pool
// with a big absolute gap can still carry a modest ratio if the floor
// is fat; a nearly-flat pool with a small absolute gap can still carry
// a large ratio if the floor is thin:
//
//   • pool [10, 5, 5]  — top1 10/20=0.50, bottom1 5/20=0.25,
//                        range 0.25 (moderate), ratio 10/5 = 2.0
//                        (unequal).
//   • pool [3, 1, 1]   — top1 3/5=0.60, bottom1 1/5=0.20,
//                        range 0.40 (moderate), ratio 3/1 = 3.0
//                        (unequal).
//   • pool [50, 25, 1] — top1 50/76=0.6579, bottom1 1/76=0.0132,
//                        range 0.6447 (wide), ratio 50/1 = 50.0
//                        (stark — the ratio explodes because the floor
//                        is a single cell).
//   • pool [6, 3, 3]   — top1 6/12=0.50, bottom1 3/12=0.25,
//                        range 0.25 (moderate), ratio 6/3 = 2.0
//                        (unequal — same shape as [10,5,5]).
//
// Ratio is scale-invariant across two pools that share the same
// head-to-floor CELL RATIO regardless of absolute cell counts, so it
// stays comparable across cells whose pool_cells vary widely (e.g. a
// small-band cell with 5 cells vs a large-band cell with 50 cells).
// Range, by contrast, is share-based and shrinks as pool_cells grows
// even if the head/floor cell ratio holds constant.
//
// The pool-shape surfaces now cover the pool from every angle:
//   P11.161 pool count      — how MANY partners populate the pool?
//   P11.163 HHI             — whole-pool concentration (fold all)
//   P11.169 Gini            — whole-pool inequality (fold all)
//   P11.171 Theil           — whole-pool entropy inequality (fold all)
//   P11.173 Atkinson        — whole-pool welfare inequality (fold all)
//   P11.175 CV              — whole-pool coefficient of variation
//   P11.177 H_norm          — whole-pool normalised entropy (evenness)
//   P11.165 top-1 share     — leader's slice of the pool
//   P11.167 top-2 share     — dominant pair's slice of the pool
//   P11.179 bottom-1 share  — floor's slice of the pool
//   P11.183 bottom-2 share  — dominant floor pair's slice
//   P11.181 range           — head-to-floor ADDITIVE spread
//   P11.185 top1/bottom1    — head-to-floor MULTIPLICATIVE ratio
//                             (this module)
//
// Ratio is well-defined for every non-empty pool because the P11.139
// hot-cells envelope only counts (partner, KPI) participants that
// appear at least once, so min(cell_counts) is always >= 1 for a
// non-empty pool and the denominator can never be zero:
//   • pool_count 0 → ratio null (empty pool).
//   • pool_count 1 → ratio 1 by definition (top1 = bottom1 = the sole
//                    cell count → ratio = 1).
//   • pool_count 2 → ratio >= 1 (top1 >= bottom1 by construction).
//   • pool_count >= 3 → ratio can grow arbitrarily (up to
//                       (pool_cells − (pool_count − 1)) / 1 when one
//                       leader owns nearly the whole pool and every
//                       trailer holds exactly one cell).
//
// Cutoffs use plain-language multiplicative bands. Anchored to
// small-pool natural values: pool [2,1] ratio 2 (unequal edge); pool
// [3,1,1] ratio 3 (unequal); pool [5,1,1] ratio 5 (stark edge); pool
// [10,1,1] ratio 10 (stark). Level catches the regime where the
// leader owns less than 2x the floor (a near-flat pool).
//   • level    (ratio <  2) — leader owns less than 2x the floor;
//                              pool is roughly level.
//   • unequal  (ratio >= 2) — leader owns 2-5x the floor; noticeable
//                              multiplicative gap.
//   • stark    (ratio >= 5) — leader owns 5x or more; floor is a
//                              small fraction of the leader.
// Both cutoffs are exposed on the envelope as level_ratio_max /
// stark_ratio_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the inequality-framing convention: a HIGH
// ratio value = HIGH multiplicative inequality (matches P11.163 HHI /
// P11.169 Gini / P11.171 Theil / P11.173 Atkinson / P11.175 CV /
// P11.181 range where the top band names the peakier / more unequal
// pool; inverts the P11.177 H_norm / P11.179 bottom-1 / P11.183
// bottom-2 evenness framing). Chosen because a ratio reader wants
// "big number = big multiplicative gap" for direct human read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolBottom2ShareSection (P11.184)
// AND IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI
// (P11.163) → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173)
// → CV (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE
// (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE (P11.179) →
// RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/BOTTOM1 RATIO
// (this module) → per-pair hot-cells GRANULAR (P11.139). Whole-pool
// inequality SEXTET first, then leader slice, dominant-pair slice,
// floor slice, head-to-floor ADDITIVE SPREAD, dominant-floor-pair
// slice, then head-to-floor MULTIPLICATIVE RATIO — the pool is
// described from every-end-then-each-slice-then-spread-then-tail-
// slice-then-ratio before the per-pair granular table.

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
type RatioLabel = "empty" | "solo" | "level" | "unequal" | "stark";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language multiplicative bands. Anchored to what a small-count
// pool naturally emits: pool [2,1] ratio 2 (unequal edge); pool
// [3,1,1] ratio 3 (unequal); pool [5,1,1] ratio 5 (stark edge); pool
// [10,1,1] ratio 10 (stark). Level catches the near-flat regime where
// the leader owns less than 2x the floor.
const LEVEL_RATIO_MAX = 2;
const STARK_RATIO_MIN = 5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as the P11.163 HHI + P11.181 range surfaces.
const RATIO_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolTop1Bottom1RatioBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top1_cells: number;
  readonly partner_bottom1_cells: number;
  readonly partner_ratio: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top1_cells: number;
  readonly metric_bottom1_cells: number;
  readonly metric_ratio: number | null;
}

export interface PerTransitionMagnitudeTop3PoolTop1Bottom1RatioBands {
  readonly small: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioBand;
  readonly medium: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioBand;
  readonly large: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioBand;
}

export interface PerTransitionMagnitudeTop3PoolTop1Bottom1RatioEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioBands;
}

export interface PerTransitionMagnitudeTop3PoolTop1Bottom1RatioMap {
  readonly improved: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly level_ratio_max: number;
  readonly stark_ratio_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolTop1Bottom1RatioMap;
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
  top1_cells: number;
  bottom1_cells: number;
  ratio: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      top1_cells: 0,
      bottom1_cells: 0,
      ratio: null,
    };
  }
  const top1_cells = Math.max(...values);
  const bottom1_cells = Math.min(...values);
  // Denominator is guaranteed >= 1 because the hot-cells envelope only
  // records participants that appear at least once — min(cell_counts)
  // cannot be zero for a non-empty pool.
  const ratio = roundTo(top1_cells / bottom1_cells, RATIO_DECIMALS);
  return { pool_count, pool_cells, top1_cells, bottom1_cells, ratio };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolTop1Bottom1RatioBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top1_cells: partner.top1_cells,
    partner_bottom1_cells: partner.bottom1_cells,
    partner_ratio: partner.ratio,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top1_cells: metric.top1_cells,
    metric_bottom1_cells: metric.bottom1_cells,
    metric_ratio: metric.ratio,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolTop1Bottom1RatioEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio {
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
    level_ratio_max: LEVEL_RATIO_MAX,
    stark_ratio_min: STARK_RATIO_MIN,
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

function labelForRatio(
  pool_count: number,
  ratio: number | null,
  level_ratio_max: number,
  stark_ratio_min: number,
): RatioLabel {
  if (pool_count === 0 || ratio === null) return "empty";
  if (pool_count === 1) return "solo";
  if (ratio >= stark_ratio_min) return "stark";
  if (ratio < level_ratio_max) return "level";
  return "unequal";
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

function renderRatioCell(
  pool_count: number,
  pool_cells: number,
  top1_cells: number,
  bottom1_cells: number,
  ratio: number | null,
  level_ratio_max: number,
  stark_ratio_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForRatio(
    pool_count,
    ratio,
    level_ratio_max,
    stark_ratio_min,
  );
  const ratioText = ratio === null ? "-" : `${ratio.toFixed(2)}x`;
  return `ratio ${ratioText} (top1 ${top1_cells} / bottom1 ${bottom1_cells}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { level_ratio_max, stark_ratio_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top1_cells, band.partner_bottom1_cells, band.partner_ratio, level_ratio_max, stark_ratio_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top1_cells, band.metric_bottom1_cells, band.metric_ratio, level_ratio_max, stark_ratio_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool TOP-1 / BOTTOM-1 RATIO across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Palma-style MULTIPLICATIVE leader-to-floor lens over the P11.161 pool &mdash; folds the P11.165 TOP-1 and P11.179 BOTTOM-1 cell counts into ONE scale-invariant scalar: ratio = top1_cells / bottom1_cells. Complements the P11.181 RANGE surface which names the ADDITIVE spread on the SAME head/floor pair &mdash; two cells with the same range can carry very different ratios if the floor thickness differs. Labels: solo = pool_count 1 (ratio=1 by definition), level = ratio &lt; ${level_ratio_max}x (leader owns less than ${level_ratio_max}x the floor), unequal = ratio in [${level_ratio_max}x, ${stark_ratio_min}x) (noticeable multiplicative gap), stark = ratio &ge; ${stark_ratio_min}x (leader owns ${stark_ratio_min}x or more &mdash; floor is a thin sliver of the leader). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ratio null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner ratio</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI ratio</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
