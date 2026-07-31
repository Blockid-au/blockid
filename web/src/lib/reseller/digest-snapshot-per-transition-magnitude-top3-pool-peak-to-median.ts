// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-MEDIAN
// pure-lib (P11.240).
//
// WHOLE-POOL RANGE-AGAINST-ROBUST-CENTER dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// own MEDIAN:
//
//   ptm = (max - min) / median
//
// where median is the order-statistic center (odd n -> middle value;
// even n -> mean of the two middle values). Reads the peak spread
// against a ROBUST reference point so a single outlier that would
// distort a mean-anchored ratio (P11.145 CV) does not distort the
// denominator here: the median is the archetypal outlier-robust
// center. Complements the studentized range (P11.237, range against
// sigma) with a range against a location statistic instead of a
// scale statistic, and complements the coefficient-of-range (P11.213,
// (max-min)/(max+min)) with a range against the pool's TYPICAL cell
// rather than the pool's TOTAL span.
//
// Complements the existing DISPERSION-axis family:
//
//   * P11.181 RANGE                - max - min in raw units. Reads
//                                    the ABSOLUTE spread. Unbounded
//                                    above; ENDPOINT-ONLY (ignores
//                                    interior shape).
//   * P11.199 MAD                  - mean(|x_i - mean|). Reads
//                                    MEAN-ANCHORED dispersion.
//   * P11.201 MedAD                - median(|x_i - median|). Reads
//                                    MEDIAN-ANCHORED dispersion.
//                                    Robust to outliers.
//   * P11.145 CV                   - sigma / mean. Reads spread in
//                                    units of the CENTER (non-robust
//                                    -- both sigma and mean pulled by
//                                    outliers).
//   * P11.211 QCD                  - (Q3 - Q1) / (Q3 + Q1). Reads
//                                    INTERIOR-HINGE spread.
//   * P11.213 COEFFICIENT-OF-RANGE - (max - min) / (max + min). Reads
//                                    absolute range in units of the
//                                    total SPAN. Bounded [0, 1].
//   * P11.237 STUDENTIZED RANGE    - (max - min) / sigma_population.
//                                    Reads range in units of SCALE.
//   * P11.238 GMD                  - mean pairwise |x_i - x_j|. Reads
//                                    pairwise difference WITHOUT a
//                                    reference center.
//
// PTM's unique DISPERSION-axis contribution: reads range in units of
// a ROBUST location statistic. Every other range-based DISPERSION
// surface either reports the range raw (P11.181), scales it against
// the pool's dispersion (P11.237 studentized-range against sigma),
// or scales it against the pool's total span (P11.213 coefficient-
// of-range against max + min). PTM scales it against the pool's
// TYPICAL cell (the median) so the resulting ratio reads as "the
// range is X times the typical cell count." This gives a directly
// interpretable dispersion read that is insensitive to a single
// outlier in the denominator: on pool [1x9, 100] the mean = 10.9
// pulls up 10x from the typical partner, so any mean-anchored ratio
// dilutes the outlier signal; but the median = 1 preserves the
// typical partner's scale, so ptm = 99 / 1 = 99 -- an unambiguous
// wide reading that lands the outlier squarely in the wide band.
//
// Known dampening on symmetric bimodal splits: because the median
// of a symmetric bimodal pool falls BETWEEN the two clusters (rather
// than on either one), the denominator lands high and the peak-to-
// median ratio reads MODEST rather than wide. Concretely, pool
// [1x5, 10x5] has range 9, median (1 + 10) / 2 = 5.5, ptm = 1.6364
// (tight). This is not a bug -- it is the intended contrast with
// P11.238 GMD which reads the same 50/50 split at 5.0 exactly (wide
// floor). A reader scanning the DISPERSION trio (studentized-range,
// GMD, PTM) sees complementary reads on bimodal splits: SR + GMD
// flag the split; PTM does not. When PTM reads tight but SR + GMD
// read wide, the pool is bimodal-symmetric rather than outlier-
// dominated -- a first-class regime that no other surface labels.
//
// Well-defined for every pool with pool_count >= 1:
//   * pool_count 0                  -> ptm null (empty pool).
//   * pool_count 1                  -> ptm null (solo -- range = 0
//                                     and median = the sole cell so
//                                     the ratio would trivially read
//                                     0, but the "solo" label conveys
//                                     more information than "tight"
//                                     for a single-partner pool).
//   * pool_count >= 2 and           -> ptm null (degenerate -- cannot
//     pool_cells == 0                 happen for count integers >= 1
//                                     by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptm null (median_zero --
//     median == 0                     unreachable since counts >= 1
//                                     but guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptm in [0, +Inf) rounded to 4
//     median > 0                      decimals. Zero iff max == min
//                                     (flat pool).
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> range 0, median k, ptm 0
//                                     (tight).
//   * uniform ramp [1..10]          -> range 9, median (5+6)/2 = 5.5,
//                                     ptm = 9/5.5 = 1.6364 (tight).
//   * upper-outlier [1x9, 10]       -> range 9, median 1, ptm 9.0
//                                     (wide -- outlier reads clearly
//                                     against robust denominator).
//   * two-shoulders [1x8, 5x2]      -> range 4, median 1, ptm 4.0
//                                     (spread).
//   * 50/50 split [1x5, 10x5]       -> range 9, median 5.5, ptm
//                                     1.6364 (tight -- symmetric
//                                     bimodal split dampened by
//                                     median-between-clusters).
//   * extreme outlier [1x9, 100]    -> range 99, median 1, ptm 99.0
//                                     (wide -- median-robustness
//                                     preserves the full outlier
//                                     signal).
//   * two-partner [1, 9]            -> range 8, median (1+9)/2 = 5,
//                                     ptm = 8/5 = 1.6 (tight).
//   * two-partner [1, 100]          -> range 99, median 50.5, ptm
//                                     1.9604 (tight -- two-partner
//                                     pool always reads tight because
//                                     the median-between-clusters
//                                     rule dampens even extreme
//                                     splits).
//   * small [10, 1, 1]              -> range 9, median 1, ptm 9.0
//                                     (wide -- outlier against
//                                     robust median).
//
// Bands on raw ptm (fixed cutoffs, calibrated against the n=10
// reference distributions so uniform ramp and symmetric-bimodal land
// in tight, mild-outlier and two-shoulders land in spread, and
// upper-outlier + extreme-outlier land in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR median == 0 (guarded but unreachable)
//   * tight                ptm < 2.0 (near-uniform pool and
//                          symmetric bimodal splits that median-
//                          between-clusters dampens)
//   * spread               ptm in [2.0, 5.0) (moderate outlier and
//                          two-shoulders regime)
//   * wide                 ptm >= 5.0 (single-outlier and extreme-
//                          outlier regime; median robustness lands
//                          the ratio well above the spread ceiling)
//
// Both cutoffs are exposed on the envelope as tight_ptm_max /
// wide_ptm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptm = MORE range against typical cell = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD tight/spread/
// wide vocabulary). Reuses the exact 3-band label set so a reader
// scanning the DISPERSION additive/ratio family sees the same
// vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.241):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolGiniMeanDifferenceSection
// (P11.238) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-robust-center after
// the P11.238 GMD pairwise-difference landing. The hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) ->
// ... -> STUDENTIZED RANGE (P11.237) -> GMD (P11.238) ->
// PEAK-TO-MEDIAN (this module) -> per-pair hot-cells GRANULAR
// (P11.139).

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
type PtmLabel =
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

// Bands on raw ptm (fixed cutoffs since median scales with cell
// counts and typical partner emissions land near 1-10 for the
// P11.161 top-3 pool). Calibrated against the n=10 reference
// distributions so uniform ramp + symmetric-bimodal read tight,
// two-shoulders + mild-outlier read spread, and single-outlier +
// extreme-outlier read wide.
const TIGHT_PTM_MAX = 2.0;
const WIDE_PTM_MIN = 5.0;

// PTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToMedianBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_median: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_median: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMedianBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToMedianBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToMedianBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToMedianBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMedianEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToMedianBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToMedianMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToMedianEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToMedianEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToMedianEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToMedianEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMedian {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptm_max: number;
  readonly wide_ptm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToMedianMap;
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

// Peak-to-median of a discrete distribution:
//   PTM = (max - min) / median
// where median follows the standard order-statistic convention (odd
// n -> middle value; even n -> mean of the two middle values).
// Returns null on empty, solo, degenerate, and median_zero so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_median: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_median: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and median = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_median: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_median: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  const median = medianOf(sortedAsc);
  if (median === 0) {
    // Median zero -- unreachable for count integers >= 1 but guarded
    // for future upstream robustness. A zero median would give an
    // undefined ratio; report null so the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_median: null };
  }
  const range = max - min;
  const ptm = range / median;
  // Clamp tiny negative float-noise to 0; ptm is non-negative by
  // construction because range >= 0 and median > 0.
  const clamped = ptm < 0 ? 0 : ptm;
  return {
    pool_count,
    pool_cells,
    peak_to_median: roundTo(clamped, PTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToMedianBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_median: partner.peak_to_median,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_median: metric.peak_to_median,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToMedianEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMedian(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMedian {
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
    tight_ptm_max: TIGHT_PTM_MAX,
    wide_ptm_min: WIDE_PTM_MIN,
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

function labelForPtm(
  pool_count: number,
  pool_cells: number,
  ptm: number | null,
  tight_max: number,
  wide_min: number,
): PtmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptm === null) return "degenerate";
  if (ptm >= wide_min) return "wide";
  if (ptm < tight_max) return "tight";
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

function renderPtmCell(
  pool_count: number,
  pool_cells: number,
  ptm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtm(pool_count, pool_cells, ptm, tight_max, wide_min);
  const ptmText = ptm === null ? "-" : ptm.toFixed(4);
  return `PTM ${ptmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMedianSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMedian,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptm_max, wide_ptm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_median, tight_ptm_max, wide_ptm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_median, tight_ptm_max, wide_ptm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-MEDIAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-ROBUST-CENTER scalar over the P11.161 pool &mdash; ptm = (max - min) / median. Reads the pool's total RANGE in units of the pool's TYPICAL cell count, using the median as an outlier-robust denominator so a single whale that would distort a mean-anchored ratio (P11.145 CV) does not distort the ratio here. Unique DISPERSION-axis contribution: reads range in units of a ROBUST LOCATION statistic &mdash; every other range-based DISPERSION surface either reports range raw (P11.181), scales it against sigma (P11.237 studentized-range), or scales it against the total span (P11.213 coefficient-of-range). Known dampening on SYMMETRIC BIMODAL splits &mdash; the median falls between the two clusters so ptm reads modest on pool [1x5, 10x5] (ptm 1.6364 tight) even though the split is stark; this is the intended contrast with P11.238 GMD which reads the same split at 5.0 exactly (wide floor). When PTM reads tight but SR + GMD read wide the pool is bimodal-symmetric rather than outlier-dominated. Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR median == 0 (guarded but unreachable), tight = ptm &lt; ${tight_ptm_max} (near-uniform pool and symmetric bimodal splits), spread = ptm in [${tight_ptm_max}, ${wide_ptm_min}) (moderate outlier and two-shoulders regime), wide = ptm &ge; ${wide_ptm_min} (single-outlier and extreme-outlier regime; median robustness lands the ratio well above the spread ceiling). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
