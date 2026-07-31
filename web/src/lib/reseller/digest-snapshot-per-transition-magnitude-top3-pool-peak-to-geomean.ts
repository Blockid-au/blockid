// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-GEOMEAN
// pure-lib (P11.248).
//
// WHOLE-POOL RANGE-AGAINST-GEOMETRIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// GEOMETRIC MEAN:
//
//   ptgm = (max - min) / geomean
//
// where geomean = (x_1 * x_2 * ... * x_n) ^ (1/n) computed as
// exp(mean(log(x_i))) for float stability. Reads the peak spread
// against a MULTIPLICATIVE center so a two-cluster pool that the
// P11.246 peak-to-mean surface flags TIGHT (because the arithmetic
// mean sits between the two clusters at 5.5) reads much SPREAD here
// (because the geometric mean is PULLED down toward the low cluster
// by the multiplicative average and elevates the ratio against the
// range).
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                - max - min in raw units.
//   * P11.199 MAD                  - mean(|x_i - mean|).
//   * P11.201 MedAD                - median(|x_i - median|).
//   * P11.145 CV                   - sigma / mean.
//   * P11.211 QCD                  - (Q3 - Q1) / (Q3 + Q1).
//   * P11.213 COEFFICIENT-OF-RANGE - (max - min) / (max + min).
//   * P11.237 STUDENTIZED RANGE    - (max - min) / sigma_population.
//   * P11.238 GMD                  - mean pairwise |x_i - x_j|.
//   * P11.240 PEAK-TO-MEDIAN       - (max - min) / median. Reads
//                                    range in units of the ORDER-
//                                    STATISTIC CENTER.
//   * P11.242 PEAK-TO-Q1           - (max - min) / Q1. Reads range
//                                    in units of the LOWER SHOULDER.
//   * P11.244 PEAK-TO-Q3           - (max - min) / Q3. Reads range
//                                    in units of the UPPER SHOULDER.
//   * P11.246 PEAK-TO-MEAN         - (max - min) / mean. Reads range
//                                    in units of the ARITHMETIC
//                                    CENTER.
//
// PTGM's unique DISPERSION-axis contribution: reads range in units
// of the GEOMETRIC (MULTIPLICATIVE) CENTER. Every other range-based
// DISPERSION surface either scales range against a scale statistic
// (sigma for P11.237 studentized-range), the total span (P11.213
// coefficient-of-range), an order-statistic anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3), or an ARITHMETIC centre (P11.246
// PTMEAN). The GEOMETRIC mean is the ONE centre pulled toward SMALL
// values by the AM-GM inequality (geomean <= mean; equality iff all
// values equal). PTGM's contrast with PTMEAN completes the
// (arithmetic-center, geometric-center) pair of centre-anchor reads
// for the range-based dispersion axis, and lets a reader distinguish
// between:
//
//   * PTGM spread + PTMEAN tight   -> BIMODAL SPLIT (mean sits
//                                     between the two clusters and
//                                     dampens the ratio; geomean is
//                                     pulled DOWN toward the low
//                                     cluster because the low values
//                                     dominate the multiplicative
//                                     average and elevate the ratio
//                                     against the range). Reference:
//                                     [1x5, 10x5] reads PTGM 2.846
//                                     spread, PTMEAN 1.6364 tight.
//   * PTGM wide + PTMEAN tight     -> ISOLATED HIGH PARTNER (the two
//                                     partners sit far apart on the
//                                     arithmetic axis so the mean
//                                     sits mid-range and dampens the
//                                     ratio; the geometric mean of
//                                     the pair is sqrt(low * high)
//                                     which stays close to the low
//                                     partner for large gaps and
//                                     elevates the ratio against the
//                                     range). Reference: [1, 100]
//                                     reads PTGM 9.9 wide, PTMEAN
//                                     1.9604 tight.
//   * PTGM wide + PTMEAN wide      -> EXTREME OUTLIER (both centres
//                                     stay small enough for the range
//                                     to still flag wide). Reference:
//                                     [1x9, 100] reads PTGM 62.4648
//                                     wide, PTMEAN 9.0826 wide.
//   * PTGM tight + PTMEAN tight    -> FLAT / UNIFORM (both centres
//                                     agree and dominate the range).
//                                     Reference: uniform ramp [1..10]
//                                     reads PTGM 1.9873 tight, PTMEAN
//                                     1.6364 tight.
//   * PTGM tight + PTMEAN wide     -> unreachable because geomean is
//                                     ALWAYS <= mean for non-negative
//                                     values (AM-GM inequality), so
//                                     ptgm = range/geomean >= ptmean
//                                     = range/mean by construction.
//                                     Guarded on the reference
//                                     distributions below as a
//                                     documented invariant.
//
// The BIMODAL SPLIT and ISOLATED HIGH PARTNER regimes are the ones
// that PTGM uniquely FLAGS -- P11.246 PTMEAN cannot tell [1x5, 10x5]
// apart from a uniform ramp because both have mean 5.5 and therefore
// both read tight at 1.6364; the shape gap is real but the LABEL is
// the same. PTGM reads them at 1.9873 (tight uniform ramp) and 2.846
// (spread bimodal split) so the LABEL diverges, giving a downstream
// reader the coarser-than-numeric signal that the pool has a MULTI-
// PARTNER DIVIDE rather than a smooth spread.
//
// Well-defined for every pool with pool_count >= 1 and every count
// value >= 1 (guaranteed by the ingest path which only increments
// counters):
//   * pool_count 0                  -> ptgm null (empty pool).
//   * pool_count 1                  -> ptgm null (solo -- range =
//                                     0 and geomean = the sole cell
//                                     so the ratio would trivially
//                                     read 0, but the "solo" label
//                                     conveys more information than
//                                     "tight" for a single-partner
//                                     pool).
//   * pool_count >= 2 and           -> ptgm null (degenerate --
//     pool_cells == 0                 cannot happen for count integers
//                                     >= 1 by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptgm null (degenerate -- any
//     min value <= 0                  non-positive count would make
//                                     log undefined and geomean 0 or
//                                     NaN; unreachable since counts
//                                     are always >= 1 but guarded for
//                                     future upstream robustness).
//   * pool_count >= 2 and           -> ptgm in [0, +Inf) rounded to
//     min > 0                         4 decimals. Zero iff max == min
//                                     (flat pool). Non-negative by
//                                     construction because range >= 0
//                                     and geomean > 0.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> range 0, geomean k, ptgm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> geomean = (10!)^(1/10) =
//                                     3628800^0.1 = 4.5287, range 9,
//                                     ptgm = 9/4.5287 = 1.9873
//                                     (tight -- just under the 2.0
//                                     boundary for the tight/spread
//                                     cutoff).
//   * upper-outlier [1x9, 10]       -> geomean = 10^0.1 = 1.2589,
//                                     range 9, ptgm = 9/1.2589 =
//                                     7.149 (wide -- ISOLATED OUTLIER
//                                     regime flagged wide same as
//                                     P11.240 PTM but with a
//                                     different numeric magnitude
//                                     because the geometric average
//                                     of 9 ones and one ten sits at
//                                     1.2589 rather than the median
//                                     of 1).
//   * two-shoulders [1x8, 5x2]      -> geomean = 5^0.2 = 1.3797,
//                                     range 4, ptgm = 4/1.3797 =
//                                     2.8991 (spread).
//   * 50/50 split [1x5, 10x5]       -> geomean = 10^0.5 = 3.1623,
//                                     range 9, ptgm = 9/3.1623 =
//                                     2.846 (SPREAD -- BIMODAL SPLIT
//                                     regime flagged spread where
//                                     P11.246 PTMEAN reads tight).
//   * extreme outlier [1x9, 100]    -> geomean = 100^0.1 = 1.5849,
//                                     range 99, ptgm = 99/1.5849 =
//                                     62.4648 (wide -- EXTREME
//                                     OUTLIER regime flagged wide
//                                     same as PTMEAN).
//   * two-partner [1, 9]            -> geomean = 3, range 8, ptgm =
//                                     8/3 = 2.6667 (spread).
//   * two-partner [1, 100]          -> geomean = 10, range 99, ptgm
//                                     = 99/10 = 9.9 (WIDE -- ISOLATED
//                                     HIGH PARTNER regime flagged
//                                     wide where P11.246 PTMEAN reads
//                                     tight because the arithmetic
//                                     mean of 50.5 sits mid-range).
//   * small [10, 1, 1]              -> geomean = 10^(1/3) = 2.1544,
//                                     range 9, ptgm = 9/2.1544 =
//                                     4.1774 (spread).
//   * small [1, 1, 10]              -> identical to above (rank-order
//                                     invariant).
//
// Bands on raw ptgm (fixed cutoffs, calibrated against the n=10
// reference distributions so uniform ramp + flat + solo pools land
// in tight, two-shoulders + bimodal-split + two-partner-[1,9] pools
// land in spread, and outlier + isolated-high-partner pools land in
// wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR min <= 0 (guarded but unreachable)
//   * tight                ptgm < 2.0 (flat, uniform ramp regimes)
//   * spread               ptgm in [2.0, 5.0) (two-shoulders +
//                          bimodal-split + two-partner-[1,9] +
//                          small-three-partner regimes)
//   * wide                 ptgm >= 5.0 (single-outlier + isolated-
//                          high-partner + extreme-outlier regimes
//                          where the range dominates the geometric
//                          center)
//
// Both cutoffs are exposed on the envelope as tight_ptgm_max /
// wide_ptgm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptgm = MORE range against geometric centre = MORE
// dispersion; matches P11.199 MAD + P11.201 MedAD + P11.238 GMD +
// P11.240 PTM + P11.242 PTQ1 + P11.244 PTQ3 + P11.246 PTMEAN
// tight/spread/wide vocabulary). Reuses the exact 3-band label set
// so a reader scanning the DISPERSION additive/ratio family sees
// the same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.249):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToMeanSection
// (P11.246) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-geometric-center
// after the P11.246 range-against-arithmetic-center landing. The
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) -> ... -> GMD (P11.238) -> PEAK-TO-MEDIAN (P11.240) ->
// PEAK-TO-Q1 (P11.242) -> PEAK-TO-Q3 (P11.244) -> PEAK-TO-MEAN
// (P11.246) -> PEAK-TO-GEOMEAN (this module) -> per-pair hot-cells
// GRANULAR (P11.139).

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
type PtgmLabel =
  | "empty"
  | "solo"
  | "degenerate"
  | "tight"
  | "spread"
  | "wide";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Bands on raw ptgm (fixed cutoffs since the geomean scales with
// cell counts and typical geometric-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so uniform ramp + flat pools read tight, two-
// shoulders + bimodal-split + small-three-partner pools read spread,
// and outlier + isolated-high-partner pools read wide.
const TIGHT_PTGM_MAX = 2.0;
const WIDE_PTGM_MIN = 5.0;

// PTGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToGeomeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_geomean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_geomean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToGeomeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToGeomeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToGeomeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToGeomeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToGeomeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToGeomeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToGeomeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToGeomeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToGeomeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToGeomeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToGeomeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToGeomean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptgm_max: number;
  readonly wide_ptgm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToGeomeanMap;
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

// Peak-to-geomean of a discrete distribution:
//   PTGM = (max - min) / geomean
// where geomean = (x_1 * x_2 * ... * x_n) ^ (1/n) computed via
// exp(mean(log(x_i))) for float stability so products of large pools
// do not overflow. Returns null on empty, solo, and degenerate (any
// non-positive value) so downstream labels fire from distinct guard
// branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_geomean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_geomean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and geomean = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_geomean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_geomean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  if (min <= 0) {
    // Non-positive value -- unreachable for count integers >= 1
    // (the ingest path only increments counters so map values are
    // always >= 1) but guarded because log(0) = -Infinity and
    // log(<0) = NaN would poison the geometric mean. Report null so
    // the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_geomean: null };
  }
  let logSum = 0;
  for (const v of values) logSum += Math.log(v);
  const geomean = Math.exp(logSum / pool_count);
  if (!Number.isFinite(geomean) || geomean <= 0) {
    // Belt-and-braces: exp of a finite mean of finite logs is always
    // > 0, but any float pathology (NaN, Infinity) that slipped past
    // the min > 0 guard degrades to null so downstream renders the
    // "degenerate" label rather than emitting a poisoned ratio.
    return { pool_count, pool_cells, peak_to_geomean: null };
  }
  const range = max - min;
  const ptgm = range / geomean;
  // Clamp tiny negative float-noise to 0; ptgm is non-negative by
  // construction because range >= 0 and geomean > 0.
  const clamped = ptgm < 0 ? 0 : ptgm;
  return {
    pool_count,
    pool_cells,
    peak_to_geomean: roundTo(clamped, PTGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToGeomeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_geomean: partner.peak_to_geomean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_geomean: metric.peak_to_geomean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToGeomeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToGeomean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToGeomean {
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
    tight_ptgm_max: TIGHT_PTGM_MAX,
    wide_ptgm_min: WIDE_PTGM_MIN,
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

function labelForPtgm(
  pool_count: number,
  pool_cells: number,
  ptgm: number | null,
  tight_max: number,
  wide_min: number,
): PtgmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptgm === null) return "degenerate";
  if (ptgm >= wide_min) return "wide";
  if (ptgm < tight_max) return "tight";
  return "spread";
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

function renderPtgmCell(
  pool_count: number,
  pool_cells: number,
  ptgm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtgm(
    pool_count,
    pool_cells,
    ptgm,
    tight_max,
    wide_min,
  );
  const ptgmText = ptgm === null ? "-" : ptgm.toFixed(4);
  return `PTGM ${ptgmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToGeomeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToGeomean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptgm_max, wide_ptgm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtgmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_geomean, tight_ptgm_max, wide_ptgm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtgmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_geomean, tight_ptgm_max, wide_ptgm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-GEOMEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-GEOMETRIC-CENTER scalar over the P11.161 pool &mdash; ptgm = (max - min) / geomean where geomean = (x_1 * ... * x_n)^(1/n) computed via exp(mean(log(x_i))) for float stability. Reads the pool's total RANGE in units of its GEOMETRIC MEAN so a BIMODAL-SPLIT pool that the P11.246 peak-to-mean surface flags TIGHT (because the arithmetic mean sits between the two clusters) reads SPREAD here (because the geometric mean is PULLED DOWN toward the low cluster by the multiplicative average and elevates the ratio against the range). Unique DISPERSION-axis contribution: reads range in units of the GEOMETRIC (MULTIPLICATIVE) CENTER &mdash; every other range-based DISPERSION surface anchors on a scale statistic (P11.237), the total span (P11.213), an order-statistic anchor (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3), or an ARITHMETIC centre (P11.246 PTMEAN). PTGM's contrast with PTMEAN completes the (arithmetic-center, geometric-center) centre-anchor pair for the range-based dispersion read: PTGM spread + PTMEAN tight = BIMODAL SPLIT (mean sits between clusters, geomean pulled down toward the low cluster); PTGM wide + PTMEAN tight = ISOLATED HIGH PARTNER (arithmetic mean sits mid-range and dampens; geomean of the pair stays close to the low partner); PTGM wide + PTMEAN wide = EXTREME OUTLIER (both centres stay small enough for the range to still flag wide); PTGM tight + PTMEAN tight = FLAT / UNIFORM (both centres agree). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR min &le; 0 (guarded but unreachable), tight = ptgm &lt; ${tight_ptgm_max} (flat, uniform ramp regimes), spread = ptgm in [${tight_ptgm_max}, ${wide_ptgm_min}) (two-shoulders + bimodal-split + two-partner-[1,9] + small-three-partner regimes), wide = ptgm &ge; ${wide_ptgm_min} (single-outlier + isolated-high-partner + extreme-outlier regimes). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptgm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
