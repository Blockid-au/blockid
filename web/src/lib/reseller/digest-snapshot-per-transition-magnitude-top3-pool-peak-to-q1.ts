// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-Q1
// pure-lib (P11.242).
//
// WHOLE-POOL RANGE-AGAINST-LOWER-HINGE dispersion scalar over the
// P11.161 pool. Folds every cell into ONE dispersion read that
// reports the pool's total RANGE (max - min) in units of the pool's
// own LOWER TUKEY HINGE (Q1):
//
//   ptq1 = (max - min) / Q1
//
// where Q1 is the Tukey EXCLUSIVE lower hinge (median of the lower
// half after excluding the central value for odd n). Reads the peak
// spread against a lower-shoulder anchor so a BIMODAL SYMMETRIC
// split -- which the P11.240 peak-to-median surface dampens because
// its denominator falls BETWEEN the two clusters -- reads WIDE here
// because Q1 sits IN the lower cluster where the typical partner
// lives.
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
//   * P11.240 PEAK-TO-MEDIAN       - (max - min) / median. Reads
//                                    range in units of the ORDER-
//                                    STATISTIC CENTER. Dampens
//                                    symmetric bimodal splits.
//
// PTQ1's unique DISPERSION-axis contribution: reads range in units
// of a LOWER-SHOULDER anchor. Every other range-based DISPERSION
// surface either reports the range raw (P11.181), scales it against
// the pool's dispersion (P11.237 studentized-range against sigma),
// scales it against the pool's total span (P11.213 coefficient-of-
// range against max + min), or scales it against the pool's ORDER-
// STATISTIC CENTER (P11.240 peak-to-median against the middle
// value). PTQ1 scales it against the pool's LOWER SHOULDER (Q1) so
// the resulting ratio reads as "the range is X times the typical
// LOWER-HALF cell count." This gives the FIRST DISPERSION surface
// that flags BIMODAL-SYMMETRIC splits wide -- the split that the
// P11.240 peak-to-median surface uniquely dampens.
//
// Concretely, on pool [1x5, 10x5] the median = 5.5 falls between
// the two clusters so PTM reads 9 / 5.5 = 1.6364 (tight), but Q1
// (the median of the lower half [1,1,1,1,1]) = 1 sits IN the lower
// cluster so PTQ1 reads 9 / 1 = 9.0 (wide). When PTQ1 reads wide
// but PTM reads tight the pool is bimodal-symmetric rather than
// outlier-dominated -- and the DISPERSION trio (PTM, GMD, PTQ1)
// now differentiates the regime by BOTH the tight PTM AND the wide
// PTQ1 sitting on the same pool. This gives a reader scanning the
// DISPERSION axis a first-class LABEL for the regime: PTM tight +
// PTQ1 wide + GMD wide = symmetric bimodal.
//
// Well-defined for every pool with pool_count >= 1:
//   * pool_count 0                  -> ptq1 null (empty pool).
//   * pool_count 1                  -> ptq1 null (solo -- range = 0
//                                     and Q1 = the sole cell so the
//                                     ratio would trivially read 0,
//                                     but the "solo" label conveys
//                                     more information than "tight"
//                                     for a single-partner pool).
//   * pool_count >= 2 and           -> ptq1 null (degenerate --
//     pool_cells == 0                 cannot happen for count integers
//                                     >= 1 by construction, but guarded
//                                     for future upstream robustness).
//   * pool_count >= 2 and           -> ptq1 null (q1_zero --
//     Q1 == 0                         unreachable since counts >= 1 so
//                                     the lower-half median is >= 1
//                                     but guarded for future upstream
//                                     robustness).
//   * pool_count >= 2 and           -> ptq1 in [0, +Inf) rounded to 4
//     Q1 > 0                          decimals. Zero iff max == min
//                                     (flat pool).
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> range 0, Q1 k, ptq1 0
//                                     (tight).
//   * uniform ramp [1..10]          -> sorted [1..10], lower half
//                                     [1..5], Q1 = median([1,2,3,4,5])
//                                     = 3, range 9, ptq1 = 9/3 = 3.0
//                                     (spread).
//   * upper-outlier [1x9, 10]       -> sorted lower half [1,1,1,1,1],
//                                     Q1 = 1, range 9, ptq1 9.0
//                                     (wide).
//   * two-shoulders [1x8, 5x2]      -> sorted [1x8, 5, 5], lower half
//                                     [1,1,1,1,1], Q1 = 1, range 4,
//                                     ptq1 4.0 (spread).
//   * 50/50 split [1x5, 10x5]       -> sorted [1x5, 10x5], lower half
//                                     [1,1,1,1,1], Q1 = 1, range 9,
//                                     ptq1 9.0 (wide -- BIMODAL
//                                     SYMMETRIC split flagged wide
//                                     where PTM reads tight).
//   * extreme outlier [1x9, 100]    -> Q1 = 1, range 99, ptq1 99.0
//                                     (wide).
//   * two-partner [1, 9]            -> sorted [1, 9], lower half [1],
//                                     Q1 = 1, range 8, ptq1 8.0
//                                     (wide).
//   * two-partner [1, 100]          -> Q1 = 1, range 99, ptq1 99.0
//                                     (wide).
//   * small [10, 1, 1]              -> sorted [1, 1, 10], lower half
//                                     [1], Q1 = 1, range 9, ptq1 9.0
//                                     (wide).
//
// Bands on raw ptq1 (fixed cutoffs, calibrated against the n=10
// reference distributions so uniform ramp lands in spread, two-
// shoulders lands in spread, and every outlier + bimodal + two-
// partner pool lands in wide):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 (guarded but unreachable)
//                          OR Q1 == 0 (guarded but unreachable)
//   * tight                ptq1 < 2.0 (flat and near-uniform pool)
//   * spread               ptq1 in [2.0, 5.0) (uniform ramp and
//                          two-shoulders regime)
//   * wide                 ptq1 >= 5.0 (single-outlier, extreme-
//                          outlier, bimodal-symmetric, and two-partner
//                          regimes)
//
// Both cutoffs are exposed on the envelope as tight_ptq1_max /
// wide_ptq1_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the range-based DISPERSION framing
// (HIGH ptq1 = MORE range against lower-shoulder = MORE dispersion;
// matches P11.199 MAD + P11.201 MedAD + P11.238 GMD + P11.240 PTM
// tight/spread/wide vocabulary). Reuses the exact 3-band label set
// so a reader scanning the DISPERSION additive/ratio family sees the
// same vocabulary across every surface.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.243):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToMedianSection
// (P11.240) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-lower-hinge after
// the P11.240 range-against-order-statistic-center landing. The
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) -> ... -> GMD (P11.238) -> PEAK-TO-MEDIAN (P11.240) ->
// PEAK-TO-Q1 (this module) -> per-pair hot-cells GRANULAR (P11.139).

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
type Ptq1Label =
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

// Bands on raw ptq1 (fixed cutoffs since Q1 scales with cell counts
// and typical lower-shoulder emissions land near 1-5 for the P11.161
// top-3 pool). Calibrated against the n=10 reference distributions
// so uniform ramp + two-shoulders read spread and every outlier +
// bimodal-symmetric + two-partner pool reads wide.
const TIGHT_PTQ1_MAX = 2.0;
const WIDE_PTQ1_MIN = 5.0;

// PTQ1 rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape
// sibling.
const PTQ1_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQ1Band {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_q1: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_q1: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQ1Bands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQ1Band;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQ1Band;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQ1Band;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQ1Entry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQ1Bands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQ1Map {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQ1Entry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQ1Entry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQ1Entry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQ1Entry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ1 {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptq1_max: number;
  readonly wide_ptq1_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQ1Map;
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

// Median of a sorted slice using arithmetic-midpoint for even n.
// Same convention as every other median-consuming pool-shape sibling
// (P11.195, P11.197, P11.201, P11.207, P11.209, P11.240).
function medianOfSorted(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q1 hinge: for odd n exclude the central value then
// take the median of the lower half; for even n split at the midpoint
// and take the median of the lower half. Standard "Method 1" from
// every intro-stats text (also matches R quantile type=1 default).
// Shared convention with P11.207 IQR + P11.209 IQR RATIO.
function tukeyQ1(sorted: readonly number[]): number {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  return medianOfSorted(lower);
}

// Peak-to-Q1 of a discrete distribution:
//   PTQ1 = (max - min) / Q1
// where Q1 is the Tukey EXCLUSIVE lower hinge. Returns null on empty,
// solo, degenerate, and q1_zero so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_q1: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_q1: null };
  }
  if (pool_count === 1) {
    // Solo -- range = 0 and Q1 = the sole cell. The ratio would
    // trivially read 0 but the "solo" label conveys more information
    // than "tight" for a single-partner pool.
    return { pool_count, pool_cells, peak_to_q1: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_q1: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  const q1 = tukeyQ1(sortedAsc);
  if (q1 === 0) {
    // Q1 zero -- unreachable for count integers >= 1 (the lower-half
    // median of positive integers is >= 1) but guarded for future
    // upstream robustness. A zero Q1 would give an undefined ratio;
    // report null so the "degenerate" label fires.
    return { pool_count, pool_cells, peak_to_q1: null };
  }
  const range = max - min;
  const ptq1 = range / q1;
  // Clamp tiny negative float-noise to 0; ptq1 is non-negative by
  // construction because range >= 0 and Q1 > 0.
  const clamped = ptq1 < 0 ? 0 : ptq1;
  return {
    pool_count,
    pool_cells,
    peak_to_q1: roundTo(clamped, PTQ1_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQ1Band {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_q1: partner.peak_to_q1,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_q1: metric.peak_to_q1,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQ1Entry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ1(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ1 {
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
    tight_ptq1_max: TIGHT_PTQ1_MAX,
    wide_ptq1_min: WIDE_PTQ1_MIN,
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

function labelForPtq1(
  pool_count: number,
  pool_cells: number,
  ptq1: number | null,
  tight_max: number,
  wide_min: number,
): Ptq1Label {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptq1 === null) return "degenerate";
  if (ptq1 >= wide_min) return "wide";
  if (ptq1 < tight_max) return "tight";
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

function renderPtq1Cell(
  pool_count: number,
  pool_cells: number,
  ptq1: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtq1(pool_count, pool_cells, ptq1, tight_max, wide_min);
  const ptq1Text = ptq1 === null ? "-" : ptq1.toFixed(4);
  return `PTQ1 ${ptq1Text} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ1Section(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ1,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptq1_max, wide_ptq1_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtq1Cell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_q1, tight_ptq1_max, wide_ptq1_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtq1Cell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_q1, tight_ptq1_max, wide_ptq1_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-Q1 across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-LOWER-HINGE scalar over the P11.161 pool &mdash; ptq1 = (max - min) / Q1 where Q1 is the Tukey EXCLUSIVE lower hinge. Reads the pool's total RANGE in units of the pool's TYPICAL LOWER-HALF cell count, using Q1 as a lower-shoulder anchor so a BIMODAL SYMMETRIC split that the P11.240 peak-to-median surface uniquely DAMPENS (because its denominator falls between the two clusters) reads WIDE here (because Q1 sits IN the lower cluster). Unique DISPERSION-axis contribution: reads range in units of a LOWER-SHOULDER anchor &mdash; every other range-based DISPERSION surface either reports range raw (P11.181), scales it against sigma (P11.237 studentized-range), scales it against the total span (P11.213 coefficient-of-range), or scales it against the ORDER-STATISTIC CENTER (P11.240 peak-to-median). When PTQ1 reads wide AND PTM reads tight AND GMD reads wide the pool is bimodal-symmetric rather than outlier-dominated &mdash; a first-class labelled regime that no single surface can flag alone. Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR Q1 == 0 (guarded but unreachable), tight = ptq1 &lt; ${tight_ptq1_max} (flat and near-uniform pool), spread = ptq1 in [${tight_ptq1_max}, ${wide_ptq1_min}) (uniform ramp and two-shoulders regime), wide = ptq1 &ge; ${wide_ptq1_min} (single-outlier, extreme-outlier, bimodal-symmetric, and two-partner regimes). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptq1 null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQ1</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQ1</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
