// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL MEAN-MEDIAN
// ABSOLUTE GAP pure-lib (P11.197).
//
// ADDITIVE skewness proxy scalar over the P11.161 pool. Where P11.195
// median/mean RATIO named the MULTIPLICATIVE order-statistic asymmetry
// (median divided by mean), this surface names the ADDITIVE version of
// the same primitive: absolute difference between the arithmetic mean
// and the middle-order-statistic median of the pool cell counts:
//
//   gap = |mean_cells - median_cells|
//       = |(pool_cells / pool_count) - median(pool)|
//
// The (P11.195 multiplicative, P11.197 additive) split on the mean vs
// median pair MIRRORS the pool-shape architecture's existing (P11.185
// multiplicative endpoint ratio, P11.181 additive endpoint spread) split
// on the max vs min pair. Both angles are useful for a robust-stats
// reader: multiplicative ratios name relative dominance regardless of
// pool size (a 10x leader is a 10x leader whether the pool holds 15 or
// 150 cells); additive gaps name absolute displacement in raw cell-count
// units (a mean 3 cells above the median is a large asymmetry on a
// 10-cell pool and a small one on a 100-cell pool). Weekly-digest
// readers who ranked pools last week using P11.195 ratios can now
// compare with P11.197 gaps to spot pools where the ratio is small but
// the raw gap is small too (large but proportionally shallow pool) vs
// pools where the ratio is small and the raw gap is large (large AND
// deep peak — the actionable case).
//
// Absolute value chosen so both right-skewed (mean > median) and left-
// skewed (mean < median) pools read a POSITIVE gap magnitude — matches
// how P11.181 range folds max - min without sign since the shape reader
// wants "how far apart is the pool's mean-vs-median center-of-mass"
// without needing to name the direction. The direction is already
// recoverable from P11.195 ratio (< 1 = right-skewed, > 1 = left-
// skewed), so this surface is deliberately direction-agnostic: it names
// magnitude only.
//
// The additive fold produces a genuinely different reading from every
// existing pool-shape scalar because it operates on the SAME order-
// statistic primitive as P11.195 (median vs mean) but on the ADDITIVE
// axis rather than the multiplicative axis. Pool [10,10,1] reads:
//   • P11.181 range          = 10 - 1 = 9 STARK
//   • P11.185 top1/bottom1   = 10 / 1 = 10 STARK
//   • P11.195 median/mean    = 10 / 7 ≈ 1.43 SYMMETRIC (left-skewed)
//   • P11.197 mean-median gap = |7 - 10| = 3 LOPSIDED (this module)
// The pool is dominated by two equal leaders and one tail — the endpoint
// pair P11.181/P11.185 correctly names it as spread wide, but P11.195
// misleadingly renders SYMMETRIC because the median coincides with the
// leader (median = 10, mean = 7; ratio > 0.9). P11.197 correctly names
// the pool as LOPSIDED because the additive gap between mean and median
// is 3 cells, a substantial displacement. The multiplicative and
// additive views on the mean-vs-median pair thus disagree on shape
// verdicts in the same way P11.181 and P11.185 disagree — a shallow
// pool [3,2,1] reads range 2 (additive-modest) and top1/bottom1 3
// (multiplicative-modest), agreeing; a peaked pool [10,1,1] reads range
// 9 (additive-large) and top1/bottom1 10 (multiplicative-large),
// agreeing; but [10,10,1] disagrees (additive-large, multiplicative-
// symmetric via median). Same pattern here: [10,10,1] reads gap 3
// (additive-lopsided) and ratio 1.43 (multiplicative-symmetric).
//
// Well-defined for every non-empty pool:
//   • pool_count 0 → gap null (empty pool).
//   • pool_count 1 → gap = |value - value| = 0 by definition (solo — no
//                    notion of skewness).
//   • pool_count 2 → gap = |(a + b) / 2 - (a + b) / 2| = 0 by definition
//                    (solo — median coincides with mean for 2-slot).
//   • pool_count >= 3 → gap = |mean - median| in raw cell-count units;
//                       rounded to 4 decimals.
//
// Cutoffs use plain-language additive-displacement bands. Anchored to
// what small pools naturally emit under the |mean - median| fold:
//   • pool [1,1,1]  → gap 0    (balanced; flat pool)
//   • pool [4,3,2]  → gap 0    (balanced; symmetric non-flat)
//   • pool [2,1,1]  → gap 0.33 (balanced — mean fractionally above
//                              median but well under 0.5-cell threshold)
//   • pool [3,1,1]  → gap 0.67 (leaning — mean ~0.7 cells above median)
//   • pool [5,3,2]  → gap 0.33 (balanced — median is the middle-order
//                              statistic 3, mean is 10/3 ≈ 3.33)
//   • pool [10,1,1] → gap 3    (lopsided — mean is 3 cells above median)
//   • pool [10,10,1]→ gap 3    (lopsided — mean is 3 cells BELOW median)
// Cutoffs 0.5 / 2.0 chosen because pool [3,1,1] reads 0.667 (leaning
// edge; mean less than one whole cell above median but noticeable) and
// pool [10,1,1] reads exactly 3 (lopsided; mean 3 whole cells above
// median = extreme).
//   • balanced (gap < 0.5)         — mean within half a cell of median;
//                                    nearly symmetric distribution.
//   • leaning  (gap in [0.5, 2.0)) — mean 0.5-2 cells from median;
//                                    noticeable asymmetry but not
//                                    extreme.
//   • lopsided (gap >= 2.0)        — mean 2+ cells from median; extreme
//                                    asymmetry (peaked or fat-tailed).
// Both cutoffs are exposed on the envelope as balanced_gap_max /
// lopsided_gap_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows an INEQUALITY framing (HIGH gap = MORE
// asymmetric = LESS balanced; matches P11.163/P11.169/P11.171/P11.173/
// P11.175 SEXTET + P11.181 range + P11.185/P11.187/P11.191/P11.193
// ratio-grid inequality framing; inverts P11.177 H_norm / P11.179 /
// P11.183 / P11.189 / P11.195 evenness framing). Chosen because the
// additive gap is a magnitude read: "how many cells apart" is naturally
// larger when the pool is more asymmetric, so "high value = more
// asymmetric" is the direct reading.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. No TOP_K / BOTTOM_K parameters — the median
// is a k=1 slice at the middle-order-statistic which the classical
// definition already pins.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.198):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMedianMeanRatioSection
// (P11.195) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177) →
// TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (P11.191) → TOP2/BOTTOM1 RATIO
// (P11.193) → MEDIAN/MEAN RATIO (P11.195) → MEAN-MEDIAN ABSOLUTE GAP
// (this module) → per-pair hot-cells GRANULAR (P11.139). The
// multiplicative median/mean ratio and the additive mean-median gap
// stay adjacent so the reader sees both angles on the same primitive
// side-by-side, matching how P11.181 range (additive endpoint spread)
// and P11.185 top1/bottom1 (multiplicative endpoint ratio) share the
// endpoint primitive.

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
type GapLabel = "empty" | "solo" | "balanced" | "leaning" | "lopsided";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language additive-displacement bands anchored to what small
// pools emit under the |mean - median| fold. Pool [1,1,1] gap 0
// (balanced); pool [2,1,1] gap 0.33 (balanced — mean less than half a
// cell above median); pool [3,1,1] gap 0.67 (leaning — mean under one
// whole cell above median but noticeable); pool [10,1,1] gap 3
// (lopsided — mean 3 whole cells above median).
const BALANCED_GAP_MAX = 0.5;
const LOPSIDED_GAP_MIN = 2.0;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as the P11.195 sibling ratio surface.
const GAP_DECIMALS = 4;

// Threshold below which a pool has no meaningful skewness distinction
// (median coincides with mean by definition for pool_count <= 2).
const SOLO_MAX_POOL_COUNT = 2;

export interface PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_median_cells: number | null;
  readonly partner_mean_cells: number | null;
  readonly partner_gap: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_median_cells: number | null;
  readonly metric_mean_cells: number | null;
  readonly metric_gap: number | null;
}

export interface PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapBands {
  readonly small: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapBand;
  readonly medium: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapBand;
  readonly large: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapBand;
}

export interface PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapBands;
}

export interface PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapMap {
  readonly improved: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly balanced_gap_max: number;
  readonly lopsided_gap_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapMap;
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
  gap: number | null;
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
      gap: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const median_cells = medianOf(sortedAsc);
  const mean_cells = pool_cells / pool_count;
  // For pool_count <= SOLO_MAX_POOL_COUNT the median coincides with the
  // mean by definition (single slot: both = the value; two slots:
  // median = (a+b)/2 = mean). Pin gap 0 and let the label render as
  // "solo" so downstream readers know the value is structural, not a
  // computed balanced verdict. For pool_count >= 3 the gap is a genuine
  // additive order-statistic asymmetry read.
  const gap =
    pool_count <= SOLO_MAX_POOL_COUNT
      ? 0
      : roundTo(Math.abs(mean_cells - median_cells), GAP_DECIMALS);
  return {
    pool_count,
    pool_cells,
    median_cells: roundTo(median_cells, GAP_DECIMALS),
    mean_cells: roundTo(mean_cells, GAP_DECIMALS),
    gap,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_median_cells: partner.median_cells,
    partner_mean_cells: partner.mean_cells,
    partner_gap: partner.gap,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_median_cells: metric.median_cells,
    metric_mean_cells: metric.mean_cells,
    metric_gap: metric.gap,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap {
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
    balanced_gap_max: BALANCED_GAP_MAX,
    lopsided_gap_min: LOPSIDED_GAP_MIN,
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

function labelForGap(
  pool_count: number,
  gap: number | null,
  balanced_gap_max: number,
  lopsided_gap_min: number,
): GapLabel {
  if (pool_count === 0 || gap === null) return "empty";
  // pool_count <= SOLO_MAX_POOL_COUNT collapses the order-statistic
  // asymmetry distinction (median coincides with mean by definition).
  // Surface it as "solo" so downstream readers know the gap=0 is
  // structural, not a computed balanced verdict.
  if (pool_count <= SOLO_MAX_POOL_COUNT) return "solo";
  if (gap >= lopsided_gap_min) return "lopsided";
  if (gap < balanced_gap_max) return "balanced";
  return "leaning";
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

function renderGapCell(
  pool_count: number,
  pool_cells: number,
  median_cells: number | null,
  mean_cells: number | null,
  gap: number | null,
  balanced_gap_max: number,
  lopsided_gap_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForGap(
    pool_count,
    gap,
    balanced_gap_max,
    lopsided_gap_min,
  );
  const gapText = gap === null ? "-" : gap.toFixed(2);
  const medianText = median_cells === null ? "-" : median_cells.toFixed(2);
  const meanText = mean_cells === null ? "-" : mean_cells.toFixed(2);
  return `gap ${gapText} (|mean ${meanText} - median ${medianText}|) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { balanced_gap_max, lopsided_gap_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGapCell(band.partner_pool_count, band.partner_pool_cells, band.partner_median_cells, band.partner_mean_cells, band.partner_gap, balanced_gap_max, lopsided_gap_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderGapCell(band.metric_pool_count, band.metric_pool_cells, band.metric_median_cells, band.metric_mean_cells, band.metric_gap, balanced_gap_max, lopsided_gap_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool MEAN-MEDIAN ABSOLUTE GAP across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">ADDITIVE order-statistic asymmetry scalar over the P11.161 pool &mdash; folds the absolute difference between the arithmetic mean and the middle-order-statistic median of pool cell counts into ONE non-negative gap: gap = |mean_cells - median_cells|. Additive companion to the P11.195 MULTIPLICATIVE median/mean ratio &mdash; the (P11.195 multiplicative, P11.197 additive) split on the mean-vs-median pair MIRRORS the pool-shape architecture's existing (P11.181 additive, P11.185 multiplicative) split on the max-vs-min endpoint pair. Direction-agnostic (both right-skewed and left-skewed pools read positive magnitude; direction is recoverable from P11.195 ratio direction: &lt; 1 = right, &gt; 1 = left). A pool like [10,10,1] where P11.195 median/mean reads 10/7 &asymp; 1.43 SYMMETRIC (median coincides with the two leaders) reads gap |7 - 10| = 3 LOPSIDED under this surface &mdash; the additive view correctly names the pool as displaced, complementing the multiplicative view that saw the median coincide with the leader-pair. Values in [0, &infin;) in raw cell-count units. Labels: solo = pool_count &le; ${SOLO_MAX_POOL_COUNT} (median coincides with mean by definition), balanced = gap &lt; ${balanced_gap_max} (mean within half a cell of median; nearly symmetric), leaning = gap in [${balanced_gap_max}, ${lopsided_gap_min}) (mean 0.5-2 cells from median; noticeable asymmetry), lopsided = gap &ge; ${lopsided_gap_min} (mean 2+ cells from median; extreme asymmetry &mdash; peaked or fat-tailed). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + gap null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner gap</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI gap</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
