// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL INTERQUARTILE
// RATIO pure-lib (P11.209).
//
// MULTIPLICATIVE robust-stats INTERIOR-MASS dispersion scalar over the
// P11.161 pool. Names the ratio of the pool's upper hinge to its lower
// hinge:
//
//   iqr_ratio = Q3 / Q1
//     where Q1 = 25th percentile (Tukey exclusive hinge)
//           Q3 = 75th percentile (Tukey exclusive hinge)
//
// Closes the (additive, multiplicative) x (endpoint, interior,
// whole-pool) dispersion grid opened by P11.207 IQR:
//   • P11.175 CV        = std_cells / mean_cells       (MULTIPLICATIVE
//                                                       whole-pool)
//   • P11.181 range     = max_cells - min_cells        (ADDITIVE
//                                                       endpoint-only)
//   • P11.185 top1/bot1 = max_cells / min_cells        (MULTIPLICATIVE
//                                                       endpoint-only)
//   • P11.199 MAD       = mean(|xi - mean(x)|)         (ADDITIVE
//                                                       whole-pool,
//                                                       MEAN-anchored)
//   • P11.201 MADm      = mean(|xi - median(x)|)       (ADDITIVE
//                                                       whole-pool,
//                                                       MEDIAN-anchored)
//   • P11.207 IQR       = Q3 - Q1                      (ADDITIVE
//                                                       INTERIOR-MASS)
//   • P11.209 IQR RATIO = Q3 / Q1                      (MULTIPLICATIVE
//                                                       INTERIOR-MASS,
//                                                       this module)
//
// The (P11.181 range, P11.185 top1/bot1) endpoint pair and the
// (P11.207 IQR, P11.209 IQR RATIO) interior pair sandwich the
// dispersion axis on both sides — the reader gets ADDITIVE and
// MULTIPLICATIVE reads at BOTH endpoint-only and interior-only
// geometries, plus the whole-pool CV/MAD/MADm middle ground. A reader
// scanning a digest row can compare P11.181 range (endpoint additive)
// against P11.207 IQR (interior additive) to see how much of the
// additive spread lives at the extremes vs the middle, and compare
// P11.185 top1/bot1 ratio (endpoint multiplicative) against this
// module's IQR RATIO (interior multiplicative) to see the same
// contrast on a scale-invariant multiplicative axis.
//
// Robust to single outliers the same way P11.207 IQR is: a pool like
// [10,1,1,1,1,1] (n=6) reads P11.181 range 9, P11.185 top1/bot1 10.0
// (stark), but IQR 0 and IQR RATIO 1.0 (level) because both hinges
// land on the interior cluster of 1s. Two-outlier pools cross the
// hinge boundary and stretch both hinges — [10,10,1,1,1,1] reads IQR
// 9 and IQR RATIO 10.0 (stark).
//
// Uses TUKEY EXCLUSIVE hinges (Method 1 in every intro-stats text):
// sort the pool, exclude the middle value on odd n, then take the
// median of each half. Same convention as P11.207 IQR so the two
// surfaces read the same Q1/Q3 pair and only differ in fold operator
// (subtraction vs division).
//
// Well-defined for every pool with pool_count >= 4 (the same natural
// threshold as P11.207 IQR):
//   • pool_count 0            → iqr_ratio null, q1/q3 null
//                               (empty pool).
//   • pool_count 1..3         → iqr_ratio null, q1/q3 null.
//                               Distinct "small_pool" label so the
//                               reader knows the value is
//                               structurally-undefined rather than a
//                               computed level verdict — quartiles
//                               don't have a stable meaning below n=4
//                               and would collapse to the P11.185
//                               top1/bottom1 ratio surface anyway
//                               (Tukey exclusive on n=2 gives Q1=x0,
//                               Q3=x1 which is max/min in raw cells,
//                               and n=3 gives Q1=x0, Q3=x2 which is
//                               max/min as well — redundant surface).
//   • pool_count >= 4         → iqr_ratio = Q3 / Q1 (dimensionless);
//                               rounded to 4 decimals. Denominator is
//                               guaranteed >= 1 because Q1 is the
//                               median of the lower half of a sorted
//                               cell-count pool where every value is
//                               >= 1 (hot-cells envelope only counts
//                               participants that appear at least
//                               once) — so Q1 >= 1 for pool_count >= 4
//                               and division-by-zero can never fire.
//
// Cutoffs use plain-language multiplicative bands. Same 2 / 5 anchors
// as P11.185 top1/bot1 ratio (endpoint multiplicative) so the
// vocabulary transfers cleanly across every MULTIPLICATIVE dispersion
// surface — a reader who has internalised the P11.185 "stark >= 5x"
// mental anchor inherits the IQR RATIO interpretation for free:
//   • level    (ratio <  2) — Q3 is less than 2x Q1; interior 50% is
//                              roughly flat.
//   • unequal  (ratio >= 2) — Q3 is 2-5x Q1; noticeable interior
//                              multiplicative spread.
//   • stark    (ratio >= 5) — Q3 is 5x or more; interior 50% carries
//                              extreme multiplicative dispersion.
// Both cutoffs are exposed on the envelope as level_ratio_max /
// stark_ratio_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the same INEQUALITY framing as P11.185
// top1/bottom1 ratio (HIGH ratio = MORE multiplicative dispersion).
// The choice to report Q3 / Q1 rather than log(Q3/Q1) or
// (Q3-Q1)/median is picked because the raw multiplicative ratio keeps
// the surface directly comparable to P11.185 top1/bot1 ratio in the
// same digest row — a reader can scan the two MULTIPLICATIVE surfaces
// side by side and compare magnitudes without a scale conversion.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. No TOP_K / BOTTOM_K parameters
// — IQR RATIO is a pool-wide fold that consumes every cell to compute
// the two hinges.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.210):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolIqrSection (P11.207)
// AND IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI
// (P11.163) → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173)
// → CV (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE
// (P11.165) → TOP-2 COMBINED SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 COMBINED SHARE (P11.183) →
// TOP1/BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) →
// MID-MASS SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) →
// TOP2/BOTTOM1 RATIO (P11.193) → MEDIAN/MEAN RATIO (P11.195) →
// MEAN-MEDIAN ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE DEVIATION
// (P11.199) → MEDIAN ABSOLUTE DEVIATION (P11.201) → SKEWNESS
// (P11.203) → EXCESS KURTOSIS (P11.205) → IQR (P11.207) → IQR RATIO
// (this module) → per-pair hot-cells GRANULAR (P11.139). IQR RATIO
// sits IMMEDIATELY BELOW the ADDITIVE IQR sibling because the two
// surfaces share the same Q1/Q3 hinge pair and only differ in fold
// operator — grouping them adjacent lets the reader spot the
// additive-vs-multiplicative contrast on the same interior mass in
// one glance.

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
type IqrRatioLabel =
  | "empty"
  | "small_pool"
  | "level"
  | "unequal"
  | "stark";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language multiplicative bands. Same 2 / 5 anchors as P11.185
// top1/bottom1 ratio so the vocabulary transfers cleanly across every
// MULTIPLICATIVE dispersion surface.
const LEVEL_RATIO_MAX = 2;
const STARK_RATIO_MIN = 5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const IQR_RATIO_DECIMALS = 4;

// Threshold below which Tukey exclusive hinges collapse to endpoints
// which duplicates the P11.185 top1/bottom1 ratio surface. Bumped to
// 4 so the IQR RATIO surface is a distinct interior-mass read rather
// than an endpoint ratio clone.
const MIN_POOL_COUNT_FOR_IQR_RATIO = 4;

export interface PerTransitionMagnitudeTop3PoolIqrRatioBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_q1_cells: number | null;
  readonly partner_q3_cells: number | null;
  readonly partner_iqr_ratio: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_q1_cells: number | null;
  readonly metric_q3_cells: number | null;
  readonly metric_iqr_ratio: number | null;
}

export interface PerTransitionMagnitudeTop3PoolIqrRatioBands {
  readonly small: PerTransitionMagnitudeTop3PoolIqrRatioBand;
  readonly medium: PerTransitionMagnitudeTop3PoolIqrRatioBand;
  readonly large: PerTransitionMagnitudeTop3PoolIqrRatioBand;
}

export interface PerTransitionMagnitudeTop3PoolIqrRatioEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolIqrRatioBands;
}

export interface PerTransitionMagnitudeTop3PoolIqrRatioMap {
  readonly improved: PerTransitionMagnitudeTop3PoolIqrRatioEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolIqrRatioEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolIqrRatioEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolIqrRatioEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_iqr_ratio: number;
  readonly level_ratio_max: number;
  readonly stark_ratio_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolIqrRatioMap;
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

// Median of a sorted slice using arithmetic-midpoint for even n. Same
// convention as P11.195 median/mean ratio + P11.197 mean-median
// absolute gap + P11.201 MADm + P11.207 IQR so the median definition
// is shared across every median-consuming sibling.
function medianOfSorted(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q1/Q3 hinges: for odd n exclude the central value
// then take the median of each half; for even n split at the midpoint
// and take the median of each half. Standard "Method 1" from every
// intro-stats text (also matches R quantile type=1 default). Shared
// convention with P11.207 IQR.
function tukeyHinges(sorted: number[]): { q1: number; q3: number } {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  const upper = n % 2 === 1 ? sorted.slice(half + 1) : sorted.slice(half);
  return {
    q1: medianOfSorted(lower),
    q3: medianOfSorted(upper),
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  q1_cells: number | null;
  q3_cells: number | null;
  iqr_ratio: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_IQR_RATIO || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      q1_cells: null,
      q3_cells: null,
      iqr_ratio: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { q1, q3 } = tukeyHinges(sorted);
  // Q1 is guaranteed >= 1 because hot-cells envelope only records
  // participants that appear at least once — the sorted lower half is
  // drawn from a >=1 pool, so its median is >=1 and division-by-zero
  // cannot fire.
  return {
    pool_count,
    pool_cells,
    q1_cells: roundTo(q1, IQR_RATIO_DECIMALS),
    q3_cells: roundTo(q3, IQR_RATIO_DECIMALS),
    iqr_ratio: roundTo(q3 / q1, IQR_RATIO_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolIqrRatioBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_q1_cells: partner.q1_cells,
    partner_q3_cells: partner.q3_cells,
    partner_iqr_ratio: partner.iqr_ratio,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_q1_cells: metric.q1_cells,
    metric_q3_cells: metric.q3_cells,
    metric_iqr_ratio: metric.iqr_ratio,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolIqrRatioEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio {
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
    min_pool_count_for_iqr_ratio: MIN_POOL_COUNT_FOR_IQR_RATIO,
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

function labelForIqrRatio(
  pool_count: number,
  iqr_ratio: number | null,
  min_pool_count_for_iqr_ratio: number,
  level_ratio_max: number,
  stark_ratio_min: number,
): IqrRatioLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_iqr_ratio || iqr_ratio === null) {
    return "small_pool";
  }
  if (iqr_ratio >= stark_ratio_min) return "stark";
  if (iqr_ratio < level_ratio_max) return "level";
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

function renderIqrRatioCell(
  pool_count: number,
  pool_cells: number,
  q1_cells: number | null,
  q3_cells: number | null,
  iqr_ratio: number | null,
  min_pool_count_for_iqr_ratio: number,
  level_ratio_max: number,
  stark_ratio_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForIqrRatio(
    pool_count,
    iqr_ratio,
    min_pool_count_for_iqr_ratio,
    level_ratio_max,
    stark_ratio_min,
  );
  const ratioText = iqr_ratio === null ? "-" : `${iqr_ratio.toFixed(2)}x`;
  const q1Text = q1_cells === null ? "-" : q1_cells.toFixed(2);
  const q3Text = q3_cells === null ? "-" : q3_cells.toFixed(2);
  return `iqr_ratio ${ratioText} (Q1 ${q1Text}, Q3 ${q3Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_iqr_ratio,
    level_ratio_max,
    stark_ratio_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderIqrRatioCell(band.partner_pool_count, band.partner_pool_cells, band.partner_q1_cells, band.partner_q3_cells, band.partner_iqr_ratio, min_pool_count_for_iqr_ratio, level_ratio_max, stark_ratio_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderIqrRatioCell(band.metric_pool_count, band.metric_pool_cells, band.metric_q1_cells, band.metric_q3_cells, band.metric_iqr_ratio, min_pool_count_for_iqr_ratio, level_ratio_max, stark_ratio_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool INTERQUARTILE RATIO across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">MULTIPLICATIVE robust-stats INTERIOR-MASS dispersion scalar over the P11.161 pool &mdash; Tukey exclusive hinges name the multiplicative spread of the pool's middle 50% into ONE scale-invariant scalar: iqr_ratio = Q3 / Q1. Multiplicative INTERIOR-MASS analog of P11.207 IQR (additive interior) and multiplicative INTERIOR complement of P11.185 top1/bottom1 ratio (multiplicative endpoint). Closes the (additive, multiplicative) &times; (endpoint, interior, whole-pool) dispersion grid. Values in [1, &infin;) &mdash; Q3 &ge; Q1 by construction. Labels: small_pool = pool_count &lt; ${min_pool_count_for_iqr_ratio} (Tukey exclusive hinges collapse to endpoints below n=4 which duplicates the P11.185 top1/bottom1 ratio surface; iqr_ratio null structurally), level = iqr_ratio &lt; ${level_ratio_max}x (Q3 is less than ${level_ratio_max}x Q1; interior 50% roughly flat), unequal = iqr_ratio in [${level_ratio_max}x, ${stark_ratio_min}x) (Q3 is ${level_ratio_max}-${stark_ratio_min}x Q1; noticeable interior multiplicative spread), stark = iqr_ratio &ge; ${stark_ratio_min}x (Q3 is ${stark_ratio_min}x or more Q1; extreme interior multiplicative dispersion). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + iqr_ratio null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner iqr_ratio</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI iqr_ratio</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
