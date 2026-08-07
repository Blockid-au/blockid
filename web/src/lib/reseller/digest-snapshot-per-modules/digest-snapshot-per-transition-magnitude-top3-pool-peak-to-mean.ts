// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-MEAN
// pure-lib (P11.246).
//
// WHOLE-POOL RANGE-AGAINST-ARITHMETIC-CENTER dispersion scalar over
// the P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// ARITHMETIC MEAN:
//
//   ptmean = (max - min) / mean
//
// where mean is the arithmetic average of the per-partner (or per-
// KPI) cell counts. Reads the peak spread against an ARITHMETIC
// center so a SINGLE-OUTLIER pool that the P11.240 peak-to-median
// surface flags WIDE (because the median is anchored on the flat
// floor and never moves) reads much SPREAD here (because the mean
// is PULLED toward the outlier and dampens the ratio).
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
//
// PTMEAN's unique DISPERSION-axis contribution: reads range in
// units of the ARITHMETIC CENTER. Every other range-based
// DISPERSION surface either scales range against a scale statistic
// (sigma for P11.237 studentized-range), the total span (P11.213
// coefficient-of-range), or an ORDER-STATISTIC anchor (P11.240 PTM,
// P11.242 PTQ1, P11.244 PTQ3). The arithmetic mean is the ONE
// centre that is pulled by extreme values -- so PTMEAN's contrast
// with PTM completes the (arithmetic-center, order-statistic-
// center) pair of centre-anchor reads for the range-based
// dispersion axis, and lets a reader distinguish between:
//
//   * PTMEAN spread + PTM wide     -> MILD SINGLE OUTLIER (mean
//                                    pulled toward the outlier so
//                                    the range is DAMPED against a
//                                    lifted centre; median stays
//                                    anchored on the flat floor).
//                                    Reference: [1x9, 10] reads
//                                    PTMEAN 4.7368 spread, PTM 9.0
//                                    wide.
//   * PTMEAN wide + PTM wide       -> EXTREME OUTLIER (even the
//                                    pulled mean stays SMALL enough
//                                    relative to the enormous range
//                                    that PTMEAN also flags wide).
//                                    Reference: [1x9, 100] reads
//                                    PTMEAN 9.0826 wide, PTM 99.0
//                                    wide.
//   * PTMEAN tight + PTM tight     -> FLAT / BALANCED (both centres
//                                    agree and dominate the range).
//   * PTMEAN tight + PTM wide      -> unreachable for non-negative
//                                    counts because the mean is
//                                    always >= median for right-
//                                    skewed count data, so PTMEAN
//                                    <= PTM by construction. Guarded
//                                    on the reference distributions
//                                    below as a documented invariant.
//
// The MILD SINGLE OUTLIER regime is the one that PTMEAN uniquely
// FLAGS (as spread rather than wide) -- P11.240 PTM cannot tell
// [1x9, 10] apart from [1x9, 100] because both have median 1 and
// therefore both read wide at 9.0 and 99.0 respectively; the
// magnitude gap is real but the LABEL is the same. PTMEAN reads
// them at 4.7368 (spread) and 9.0826 (wide) so the LABEL diverges,
// giving a downstream reader the coarser-than-numeric signal that
// the outlier is a mild pull-away from a flat floor rather than an
// extreme-scale departure.
//
// Well-defined for every pool with pool_count >= 1:
//   * pool_count 0                  -> ptmean null (empty pool).
//   * pool_count 1                  -> ptmean null (solo -- range =
//                                     0 and mean = the sole cell so
//                                     the ratio would trivially read
//                                     0, but the "solo" label conveys
//                                     more information than "tight"
//                                     for a single-partner pool).
//   * pool_count >= 2 and           -> ptmean null (degenerate --
//     pool_cells == 0                 cannot happen for count integers
//                                     >= 1 by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptmean null (mean_zero --
//     mean == 0                       unreachable since counts >= 1 so
//                                     the mean is >= 1 but guarded for
//                                     future upstream robustness).
//   * pool_count >= 2 and           -> ptmean in [0, +Inf) rounded to
//     mean > 0                        4 decimals. Zero iff max == min
//                                     (flat pool).
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> range 0, mean k, ptmean 0
//                                     (tight).
//   * uniform ramp [1..10]          -> mean = 5.5, range 9, ptmean =
//                                     9/5.5 = 1.6364 (tight).
//   * upper-outlier [1x9, 10]       -> mean = 19/10 = 1.9, range 9,
//                                     ptmean = 9/1.9 = 4.7368
//                                     (SPREAD -- MILD SINGLE OUTLIER
//                                     regime flagged spread where PTM
//                                     reads wide).
//   * two-shoulders [1x8, 5x2]      -> mean = 18/10 = 1.8, range 4,
//                                     ptmean = 4/1.8 = 2.2222
//                                     (spread).
//   * 50/50 split [1x5, 10x5]       -> mean = 5.5, range 9, ptmean =
//                                     9/5.5 = 1.6364 (tight -- mean
//                                     equals median for the symmetric
//                                     split so PTMEAN == PTM).
//   * extreme outlier [1x9, 100]    -> mean = 109/10 = 10.9, range
//                                     99, ptmean = 99/10.9 = 9.0826
//                                     (wide -- EXTREME OUTLIER regime
//                                     flagged wide same as PTM).
//   * two-partner [1, 9]            -> mean = 10/2 = 5, range 8,
//                                     ptmean = 8/5 = 1.6 (tight).
//   * two-partner [1, 100]          -> mean = 101/2 = 50.5, range 99,
//                                     ptmean = 99/50.5 = 1.9604
//                                     (tight).
//   * small [10, 1, 1]              -> mean = 12/3 = 4, range 9,
//                                     ptmean = 9/4 = 2.25 (spread).
//   * small [1, 1, 10]              -> identical to above (rank-order
//                                     invariant).
//
// Bands on raw ptmean (fixed cutoffs, calibrated against the n=10
// reference distributions so uniform ramp + bimodal + two-partner
// pools land in tight, two-shoulders + mild-outlier land in spread,
// and extreme-outlier lands in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR mean == 0 (guarded but unreachable)
//   * tight                ptmean < 2.0 (flat, uniform ramp, bimodal-
//                          symmetric, two-partner regimes)
//   * spread               ptmean in [2.0, 5.0) (two-shoulders +
//                          mild-single-outlier regimes)
//   * wide                 ptmean >= 5.0 (extreme-outlier regime
//                          where even the pulled mean stays small
//                          enough relative to the enormous range)
//
// Both cutoffs are exposed on the envelope as tight_ptmean_max /
// wide_ptmean_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptmean = MORE range against arithmetic centre = MORE
// dispersion; matches P11.199 MAD + P11.201 MedAD + P11.238 GMD +
// P11.240 PTM + P11.242 PTQ1 + P11.244 PTQ3 tight/spread/wide
// vocabulary). Reuses the exact 3-band label set so a reader
// scanning the DISPERSION additive/ratio family sees the same
// vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.247):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQ3Section
// (P11.244) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-arithmetic-center
// after the P11.244 range-against-upper-hinge landing. The
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) -> ... -> GMD (P11.238) -> PEAK-TO-MEDIAN (P11.240) ->
// PEAK-TO-Q1 (P11.242) -> PEAK-TO-Q3 (P11.244) -> PEAK-TO-MEAN
// (this module) -> per-pair hot-cells GRANULAR (P11.139).

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
type PtmeanLabel =
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

// Bands on raw ptmean (fixed cutoffs since the mean scales with
// cell counts and typical arithmetic-center emissions land near 1-10
// for the P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so uniform ramp + bimodal-symmetric + two-partner
// pools read tight, two-shoulders + mild-single-outlier read spread,
// and extreme-outlier reads wide.
const TIGHT_PTMEAN_MAX = 2.0;
const WIDE_PTMEAN_MIN = 5.0;

// PTMEAN rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTMEAN_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptmean_max: number;
  readonly wide_ptmean_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToMeanMap;
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

// Peak-to-mean of a discrete distribution:
//   PTMEAN = (max - min) / mean
// Returns null on empty, solo, degenerate, and mean_zero so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_mean: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and mean = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_mean: null };
  }
  const mean = pool_cells / pool_count;
  if (mean === 0) {
    // Mean zero -- unreachable for count integers >= 1 (the mean of
    // positive integers is >= 1) but guarded for future upstream
    // robustness. A zero mean would give an undefined ratio; report
    // null so the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  const range = max - min;
  const ptmean = range / mean;
  // Clamp tiny negative float-noise to 0; ptmean is non-negative by
  // construction because range >= 0 and mean > 0.
  const clamped = ptmean < 0 ? 0 : ptmean;
  return {
    pool_count,
    pool_cells,
    peak_to_mean: roundTo(clamped, PTMEAN_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_mean: partner.peak_to_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_mean: metric.peak_to_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean {
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
    tight_ptmean_max: TIGHT_PTMEAN_MAX,
    wide_ptmean_min: WIDE_PTMEAN_MIN,
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

function labelForPtmean(
  pool_count: number,
  pool_cells: number,
  ptmean: number | null,
  tight_max: number,
  wide_min: number,
): PtmeanLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptmean === null) return "degenerate";
  if (ptmean >= wide_min) return "wide";
  if (ptmean < tight_max) return "tight";
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

function renderPtmeanCell(
  pool_count: number,
  pool_cells: number,
  ptmean: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtmean(
    pool_count,
    pool_cells,
    ptmean,
    tight_max,
    wide_min,
  );
  const ptmeanText = ptmean === null ? "-" : ptmean.toFixed(4);
  return `PTMEAN ${ptmeanText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptmean_max, wide_ptmean_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtmeanCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_mean, tight_ptmean_max, wide_ptmean_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtmeanCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_mean, tight_ptmean_max, wide_ptmean_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-ARITHMETIC-CENTER scalar over the P11.161 pool &mdash; ptmean = (max - min) / mean where mean is the arithmetic average of the per-partner (or per-KPI) cell counts. Reads the pool's total RANGE in units of its ARITHMETIC MEAN so a SINGLE-OUTLIER pool that the P11.240 peak-to-median surface flags WIDE (because the median stays anchored on the flat floor) reads SPREAD here (because the mean is PULLED toward the outlier and dampens the ratio). Unique DISPERSION-axis contribution: reads range in units of the ARITHMETIC CENTER &mdash; every other range-based DISPERSION surface anchors on a scale statistic (P11.237), the total span (P11.213), or an order-statistic anchor (P11.240 PTM, P11.242 PTQ1, P11.244 PTQ3). PTMEAN's contrast with PTM completes the (arithmetic-center, order-statistic-center) centre-anchor pair for the range-based dispersion read: PTMEAN spread + PTM wide = MILD SINGLE OUTLIER (mean pulled toward the outlier); PTMEAN wide + PTM wide = EXTREME OUTLIER (even the pulled mean is small enough for the range to still flag wide); PTMEAN tight + PTM tight = FLAT / BALANCED (both centres agree). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR mean == 0 (guarded but unreachable), tight = ptmean &lt; ${tight_ptmean_max} (flat, uniform ramp, bimodal-symmetric, two-partner regimes), spread = ptmean in [${tight_ptmean_max}, ${wide_ptmean_min}) (two-shoulders + mild-single-outlier regimes), wide = ptmean &ge; ${wide_ptmean_min} (extreme-outlier regime). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptmean null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTMEAN</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTMEAN</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
