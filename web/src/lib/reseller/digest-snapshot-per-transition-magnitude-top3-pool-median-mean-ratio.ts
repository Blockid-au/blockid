// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL MEDIAN / MEAN
// RATIO pure-lib (P11.195).
//
// Robust SKEWNESS proxy scalar over the P11.161 pool. Where the SEXTET
// (HHI P11.163 / GINI P11.169 / THEIL P11.171 / ATKINSON P11.173 / CV
// P11.175 / H_norm P11.177) folds the WHOLE distribution into a single
// inequality/entropy number, the share family (P11.165/P11.167/P11.179/
// P11.183) names the ENDPOINT slice sizes, the P11.181 range names the
// ADDITIVE spread, the P11.185/P11.187/P11.191/P11.193 (top_k, bottom_k)
// 2x2 grid names the MULTIPLICATIVE endpoint ratios, and the P11.189
// mid-mass share names the middle-mass EVENNESS complement — this
// surface names ORDER-STATISTIC ASYMMETRY: median of pool cell counts
// divided by the arithmetic mean:
//
//   ratio = median_cells / mean_cells
//         = median(pool) / (pool_cells / pool_count)
//
// The median/mean ratio is a canonical skewness proxy (Pearson's
// second skewness coefficient uses (mean - median) / stdev; the plain
// ratio is the same shape idea without the stdev normalisation). Values
// in (0, 1]: 1 = symmetric distribution (median coincides with mean);
// below 1 = right-skewed (mean pulled above median by dominant leaders
// or long right tail); the smaller the value, the more the mean over-
// states the middle of the distribution. Values above 1 are possible
// only for left-skewed pools where the mean is BELOW the median — this
// requires a fat left tail with a sparse right tail, a shape the P11.139
// hot-cells envelope cannot emit because cell counts are >= 1 with no
// upper bound (a pool [1,1,10] is right-skewed; a pool [10,10,1] is
// LEFT-skewed and reads ratio 10/7 = 1.43 > 1 — so > 1 is a live
// possibility, unlike some Pearson definitions clamped to [0, 1]).
//
// The order-statistic fold gives a genuinely different reading from
// every existing pool-shape scalar because it names WHERE the middle
// of the distribution sits relative to the mean, not the endpoints,
// not the whole-pool variance, and not the middle-mass share. A pool
// [4,3,2] reads:
//   • P11.185 top1/bottom1 = 4/2 = 2.0 UNEQUAL
//   • P11.187 top2/bottom2 = 7/5 = 1.4 LEVEL
//   • P11.191 top1/bottom2 = 4/5 = 0.8 LEVEL
//   • P11.193 top2/bottom1 = 7/2 = 3.5 UNEQUAL
//   • P11.189 mid-mass    = 3/9 = 0.33 FAT
//   • P11.195 median/mean = 3/3 = 1.0 SYMMETRIC (this module)
// The P11.195 SYMMETRIC verdict on [4,3,2] is load-bearing — the ratio
// grid can disagree on unequal-vs-level in either direction (P11.185
// says unequal, P11.191 says level) but median/mean names the pool as
// perfectly balanced around its center, which is what a robust-stats
// reader wants to know. Contrast with pool [10,1,1] where every ratio
// surface reads stark AND median/mean reads 1/4 = 0.25 PEAKED — all
// six scalars agree the pool is dominated by one slot.
//
// The pool-shape surfaces now cover the pool from every angle: whole-
// pool concentration (SEXTET), endpoint slices (share family), additive
// endpoint spread (range), multiplicative endpoint ratios (2x2 grid),
// middle-mass evenness (mid-mass share), and now ORDER-STATISTIC
// asymmetry (this module).
//
// Median well-defined for every non-empty pool:
//   • pool_count 0 → median null → ratio null (empty pool).
//   • pool_count 1 → median = the single value; mean = the single
//                    value; ratio 1 by definition (solo — no notion of
//                    skewness in a single-slot pool).
//   • pool_count 2 → median = (a + b) / 2 = mean; ratio 1 by definition
//                    (solo — any 2-slot pool is symmetric around its
//                    average; ratio=1 always).
//   • pool_count >= 3 → median = middle-order statistic (index
//                       floor(n/2) after ascending sort for odd n;
//                       average of the two middle values for even n);
//                       ratio = median / mean, rounded to 4 decimals.
//
// Cutoffs use plain-language skewness bands. Anchored to what small
// pools naturally emit under order-statistic folds: pool [1,1,1] ratio
// 1.0 (symmetric on flat pool by construction); pool [2,1,1] ratio
// 1/(4/3) = 0.75 (skewed edge — mean 33% above median); pool [3,1,1]
// ratio 1/(5/3) = 0.6 (skewed — mean 67% above median); pool [10,1,1]
// ratio 1/4 = 0.25 (peaked — mean 4x median). Symmetric catches the
// balanced regime where the median is within 10% of the mean (a mildly
// right-skewed pool like [3,2,2] reads 2/(7/3) = 0.857 ≈ SKEWED, but
// [3,3,2] reads 3/(8/3) = 1.125 > 1 which we treat as SYMMETRIC since
// the LEFT-skewed direction is symmetric-in-verdict for our purposes).
//   • symmetric (ratio >= 0.9)          — median within 10% of mean;
//                                          balanced or nearly balanced
//                                          distribution around its
//                                          center (INCLUDES left-skewed
//                                          pools with ratio > 1).
//   • skewed    (ratio in [0.5, 0.9))   — median 10-50% BELOW mean;
//                                          noticeable right skew from
//                                          a dominant leader or long
//                                          right tail.
//   • peaked    (ratio < 0.5)           — median below half the mean;
//                                          extreme right skew — the
//                                          leader over-masses the mean
//                                          far above the middle.
// Both cutoffs are exposed on the envelope as symmetric_ratio_min /
// peaked_ratio_max so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows an EVENNESS framing (HIGH ratio = MORE
// symmetric = MORE even center, LOW ratio = MORE right-skew = LESS
// even center; matches P11.177 H_norm / P11.179 bottom-1 / P11.183
// bottom-2 / P11.189 mid-mass evenness framing; inverts the P11.163
// HHI / P11.169 Gini / P11.171 Theil / P11.173 Atkinson / P11.175 CV /
// P11.181 range / P11.185/P11.187/P11.191/P11.193 ratio-grid inequality
// framing). Chosen because a "skewness = asymmetry" reading is more
// natural for a robust-stats reader: symmetric distributions are the
// baseline and the interesting news is asymmetry.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — the median
// is a k=1 slice at the middle-order-statistic which the classical
// definition already pins.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.196):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolTop2Bottom1RatioSection
// (P11.194) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177) →
// TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1 RATIO
// (P11.193) → MEDIAN/MEAN RATIO (this module) → per-pair hot-cells
// GRANULAR (P11.139). Whole-pool inequality SEXTET first, then leader
// slice, dominant-pair slice, floor slice, head-to-floor SPREAD, floor-
// pair slice, single-slot RATIO, two-slot RATIO, middle-mass complement,
// then ASYMMETRIC head-to-floor-pair RATIO, then MIRROR-ASYMMETRIC
// dominant-pair-to-floor-slot RATIO, then ORDER-STATISTIC asymmetry —
// the pool is described from every-end-then-each-slice-then-spread-
// then-tail-slice-then-symmetric-ratios-then-middle-then-asymmetric-
// ratios-then-order-statistic-skewness before the per-pair granular
// table.

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
type SkewLabel = "empty" | "solo" | "symmetric" | "skewed" | "peaked";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language skewness bands anchored to what small pools emit under
// the median/mean fold. Pool [1,1,1] ratio 1.0 (symmetric on flat pool
// by construction); pool [2,1,1] ratio 0.75 (skewed edge); pool [3,1,1]
// ratio 0.6 (skewed); pool [10,1,1] ratio 0.25 (peaked). Symmetric
// catches the balanced regime where the median is within 10% of the
// mean — the natural inflection point below which a mildly right-skewed
// distribution begins to be worth naming.
const SYMMETRIC_RATIO_MIN = 0.9;
const PEAKED_RATIO_MAX = 0.5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as the P11.185/P11.187/P11.191/P11.193
// sibling ratio surfaces.
const RATIO_DECIMALS = 4;

// Threshold below which a pool has no meaningful skewness distinction
// (median coincides with mean by definition for pool_count <= 2).
const SOLO_MAX_POOL_COUNT = 2;

export interface PerTransitionMagnitudeTop3PoolMedianMeanRatioBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_median_cells: number | null;
  readonly partner_mean_cells: number | null;
  readonly partner_ratio: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_median_cells: number | null;
  readonly metric_mean_cells: number | null;
  readonly metric_ratio: number | null;
}

export interface PerTransitionMagnitudeTop3PoolMedianMeanRatioBands {
  readonly small: PerTransitionMagnitudeTop3PoolMedianMeanRatioBand;
  readonly medium: PerTransitionMagnitudeTop3PoolMedianMeanRatioBand;
  readonly large: PerTransitionMagnitudeTop3PoolMedianMeanRatioBand;
}

export interface PerTransitionMagnitudeTop3PoolMedianMeanRatioEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolMedianMeanRatioBands;
}

export interface PerTransitionMagnitudeTop3PoolMedianMeanRatioMap {
  readonly improved: PerTransitionMagnitudeTop3PoolMedianMeanRatioEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolMedianMeanRatioEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolMedianMeanRatioEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolMedianMeanRatioEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly symmetric_ratio_min: number;
  readonly peaked_ratio_max: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolMedianMeanRatioMap;
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

function medianOf(sortedAsc: readonly number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sortedAsc[mid];
  return (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  median_cells: number | null;
  mean_cells: number | null;
  ratio: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      median_cells: null,
      mean_cells: null,
      ratio: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const median_cells = medianOf(sortedAsc);
  const mean_cells = pool_cells / pool_count;
  // For pool_count <= SOLO_MAX_POOL_COUNT the median coincides with the
  // mean by definition (single slot: both = the value; two slots:
  // median = (a+b)/2 = mean). Pin ratio 1 and let the label render as
  // "solo" so downstream readers know the value is structural, not a
  // computed symmetric verdict. For pool_count >= 3 the ratio is a
  // genuine order-statistic asymmetry read.
  const ratio =
    pool_count <= SOLO_MAX_POOL_COUNT
      ? 1
      : roundTo(median_cells / mean_cells, RATIO_DECIMALS);
  return {
    pool_count,
    pool_cells,
    median_cells: roundTo(median_cells, RATIO_DECIMALS),
    mean_cells: roundTo(mean_cells, RATIO_DECIMALS),
    ratio,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolMedianMeanRatioBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_median_cells: partner.median_cells,
    partner_mean_cells: partner.mean_cells,
    partner_ratio: partner.ratio,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_median_cells: metric.median_cells,
    metric_mean_cells: metric.mean_cells,
    metric_ratio: metric.ratio,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolMedianMeanRatioEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio {
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
    symmetric_ratio_min: SYMMETRIC_RATIO_MIN,
    peaked_ratio_max: PEAKED_RATIO_MAX,
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
  symmetric_ratio_min: number,
  peaked_ratio_max: number,
): SkewLabel {
  if (pool_count === 0 || ratio === null) return "empty";
  // pool_count <= SOLO_MAX_POOL_COUNT collapses the order-statistic
  // asymmetry distinction (median coincides with mean by definition).
  // Surface it as "solo" so downstream readers know the ratio=1 is
  // structural, not a computed symmetric verdict.
  if (pool_count <= SOLO_MAX_POOL_COUNT) return "solo";
  if (ratio < peaked_ratio_max) return "peaked";
  if (ratio >= symmetric_ratio_min) return "symmetric";
  return "skewed";
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
  median_cells: number | null,
  mean_cells: number | null,
  ratio: number | null,
  symmetric_ratio_min: number,
  peaked_ratio_max: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForRatio(
    pool_count,
    ratio,
    symmetric_ratio_min,
    peaked_ratio_max,
  );
  const ratioText = ratio === null ? "-" : ratio.toFixed(2);
  const medianText = median_cells === null ? "-" : median_cells.toFixed(2);
  const meanText = mean_cells === null ? "-" : mean_cells.toFixed(2);
  return `ratio ${ratioText} (median ${medianText} / mean ${meanText}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { symmetric_ratio_min, peaked_ratio_max } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.partner_pool_count, band.partner_pool_cells, band.partner_median_cells, band.partner_mean_cells, band.partner_ratio, symmetric_ratio_min, peaked_ratio_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.metric_pool_count, band.metric_pool_cells, band.metric_median_cells, band.metric_mean_cells, band.metric_ratio, symmetric_ratio_min, peaked_ratio_max)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool MEDIAN / MEAN RATIO across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Order-statistic ASYMMETRY scalar over the P11.161 pool &mdash; folds the median of pool cell counts divided by the arithmetic mean into ONE ratio: ratio = median_cells / mean_cells. Canonical robust-stats skewness proxy (Pearson second skewness shape). Complements the P11.181 additive spread + P11.185/P11.187/P11.191/P11.193 (top_k, bottom_k) 2x2 multiplicative ratio grid + P11.189 middle-mass evenness by naming WHERE the middle of the distribution sits relative to the mean, not the endpoints, not the whole-pool variance. A pool like [4,3,2] where the P11.185 top1/bottom1 ratio reads 2.0 UNEQUAL and the P11.191 top1/bottom2 ratio reads 0.8 LEVEL disagrees on the endpoint story &mdash; this median/mean surface names the pool as median 3.0 / mean 3.0 = 1.0 SYMMETRIC, which is the robust-stats verdict a reader wants. Contrast with pool [10,1,1] where every ratio surface reads stark AND median/mean reads 1/4 = 0.25 PEAKED &mdash; all six scalars agree the pool is dominated by one slot. Values in (0, 1] for right-skewed distributions with above-1 possible for left-skewed shapes like [10,10,1] which reads 10/7 &asymp; 1.43. Labels: solo = pool_count &le; ${SOLO_MAX_POOL_COUNT} (median coincides with mean by definition), symmetric = ratio &ge; ${symmetric_ratio_min} (median within 10% of mean; balanced), skewed = ratio in [${peaked_ratio_max}, ${symmetric_ratio_min}) (median 10-50% below mean; noticeable right skew), peaked = ratio &lt; ${peaked_ratio_max} (median below half the mean; extreme right skew &mdash; leader over-masses the mean far above the middle). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ratio null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner ratio</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI ratio</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
