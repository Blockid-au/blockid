// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.552).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's NOVEMQUADRAGINTCENTINAGINTIC MEAN (power mean of
// order 149, M_149):
//
//   ptnqcnm = (max - min) / novemquadragintcentinagintic_mean
//
// where novemquadragintcentinagintic_mean = ((sum x_i^149) / n)^(1/149).
// Reads the peak spread against the NOVEMQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-149) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.550 PTOQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-NINTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-eighth does,
// dampening the ratio against the range even harder. Ninth entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTNQCNM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-149)
// CENTER. Extends the (harmonic M_-1 .. octoquadragintcentinagintic
// M_148) power-mean OCTOGINTUPLET into an UNOCTOGINTUPLET with
// the M_149 novemquadragintcentinagintic mean -- ninth step into the
// FOURTH DOZEN of the triple-digit family opened at PTQCNM (M_140).
// By the Power Mean inequality M_149 >= M_148, so
// novemquadragintcentinagintic_mean >= octoquadragintcentinagintic_mean
// and ptnqcnm <= ptoqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemquadragintcentinagintic_mean approaches x_max / n^(1/149),
// so ptnqcnm approaches n^(1/149) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/149) ~= 1.0156, for n=20 ~= 1.0203, for n=30
// ~= 1.0231, for n=40 ~= 1.0251, for n=50 ~= 1.0266, for n=60
// ~= 1.0279, for n=70 ~= 1.0289, for n=80 ~= 1.0298, for n=85
// ~= 1.0303, for n=89 ~= 1.0306, for n=90 ~= 1.0307 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/149) ~= 1.0314) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/149) ~= 1.0314,
// and the pool100 [1x99, 100] reference reads 1.0211 spread
// (further absorbed from PTOQCNM's 1.0213 spread landing -- TWO
// 4-decimal ticks of absorption at M_149) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_149.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemquadragintcentinagintic_mean = k,
//                                     range 0, ptnqcnm 0 (tight).
//   * uniform ramp [1..10]          -> NQCNM ~= 9.8467, range 9,
//                                     ptnqcnm ~= 0.9140 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOQCNM 0.9141 at M_148).
//   * upper-outlier [1x9, 10]       -> NQCNM ~= 9.8467, range 9,
//                                     ptnqcnm ~= 0.9140 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_149).
//   * two-shoulders [1x8, 5x2]      -> NQCNM ~= 4.9463, range 4,
//                                     ptnqcnm ~= 0.8087 (tight --
//                                     JOINT with PTOQCNM 0.8087 at
//                                     M_148).
//   * 50/50 split [1x5, 10x5]       -> NQCNM ~= 9.9536, range 9,
//                                     ptnqcnm ~= 0.9042 (tight --
//                                     JOINT with PTOQCNM 0.9042 at
//                                     M_148).
//   * extreme outlier [1x9, 100]    -> NQCNM ~= 98.4665, range 99,
//                                     ptnqcnm ~= 1.0054 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/149) ~ 1.0156 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTOQCNM 1.0055 at M_148).
//   * two-partner [1, 9]            -> NQCNM ~= 8.9582, range 8,
//                                     ptnqcnm ~= 0.8930 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTOQCNM 0.8931 at M_148).
//   * two-partner [1, 100]          -> NQCNM ~= 99.5359, range 99,
//                                     ptnqcnm ~= 0.9946 (TIGHT --
//                                     JOINT with PTOQCNM 0.9946 at
//                                     M_148).
//   * small [10, 1, 1]              -> NQCNM ~= 9.9265, range 9,
//                                     ptnqcnm ~= 0.9067 (tight --
//                                     JOINT with PTOQCNM 0.9067 at
//                                     M_148).
//   * pool_count=100 [1x99, 100]    -> NQCNM ~= 96.9566, range 99,
//                                     ptnqcnm ~= 1.0211 (SPREAD --
//                                     FURTHER ABSORBED from PTOQCNM
//                                     M_148's 1.0213 spread; the
//                                     100-partner asymptote
//                                     100^(1/149) ~ 1.0314 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_149).
//
// Bands on raw ptnqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemquadragintcentinagintic_mean == 0
//   * tight                ptnqcnm < 1.005
//   * spread               ptnqcnm in [1.005, 1.09)
//   * wide                 ptnqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptnqcnm_max /
// wide_ptnqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.553):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanSection
// (P11.551) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemquadragintcentinagintic-center
// after the P11.551 range-against-octoquadragintcentinagintic-center landing.
//
// Naming: novemquadragintcentinagintic = novem (9) + quadragint (40) +
// centinagintic (100) following the novemvigintcentinagintic (M_129) +
// novemtrigintcentinagintic (M_139) systematic pattern; abbreviation
// PTNQCNM (P-T-Novem-Quadragint-Centi-Nagintic-M) is distinct from
// PTNVCNM (M_129 novemvigintcentinagintic) by the 'Q' (quadragint) vs
// 'V' (vigint) segment and from PTNTCNM (M_139 novemtrigintcentinagintic)
// by the 'Q' (quadragint) vs 'T' (trigint) segment.

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
type PtnqcnmLabel =
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

// Bands on raw ptnqcnm (fixed cutoffs since novemquadragintcentinagintic_mean
// scales with cell counts and typical novemquadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_149 is 0.9140
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0157
// (M_148) to 1.0156 (M_149), 20-partner drops from 1.0204 to 1.0203,
// 30-partner drops from 1.0232 to 1.0231, 40-partner drops from
// 1.0252 to 1.0251, 50-partner drops from 1.0268 to 1.0266,
// 60-partner drops from 1.0281 to 1.0279, 70-partner drops from
// 1.0291 to 1.0289, 80-partner drops from 1.0301 to 1.0298,
// 85-partner drops from 1.0305 to 1.0303, 89-partner drops from
// 1.0308 to 1.0306, 90-partner drops from 1.0309 to 1.0307 -- so
// pool_count >= 100 (100^(1/149) ~ 1.0314) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTOQCNM 1.0213 spread to PTNQCNM 1.0211 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTNQCNM_MAX = 1.005;
const WIDE_PTNQCNM_MIN = 1.09;

// PTNQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemquadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemquadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnqcnm_max: number;
  readonly wide_ptnqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanMap;
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

// Peak-to-novemquadragintcentinagintic-mean of a discrete distribution:
//   PTNQCNM = (max - min) / novemquadragintcentinagintic_mean
// where novemquadragintcentinagintic_mean = ((sum x_i^149) / n)^(1/149).
// Returns null on empty, solo, and degenerate (zero
// novemquadragintcentinagintic_mean or non-finite hundred-and-forty-ninth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemquadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortyNinthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^149 = x^128 * x^16 * x^4 * x = p128 * p16 * quad * v --
    // (128 + 16 + 4 + 1) decomposition reuses the p128 rung shared
    // with the M_128..M_148 siblings and multiplies by p16, quad, v
    // to hit the next order.
    hundredFortyNinthSum += p128 * p16 * quad * v;
  }
  if (
    !Number.isFinite(hundredFortyNinthSum) ||
    hundredFortyNinthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquadragintcentinagintic_mean: null,
    };
  }
  const novemquadragintcentinagintic_mean = Math.pow(
    hundredFortyNinthSum / pool_count,
    1 / 149,
  );
  if (
    !Number.isFinite(novemquadragintcentinagintic_mean) ||
    novemquadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptnqcnm = range / novemquadragintcentinagintic_mean;
  const clamped = ptnqcnm < 0 ? 0 : ptnqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemquadragintcentinagintic_mean: roundTo(clamped, PTNQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemquadragintcentinagintic_mean:
      partner.peak_to_novemquadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemquadragintcentinagintic_mean:
      metric.peak_to_novemquadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMean {
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
    tight_ptnqcnm_max: TIGHT_PTNQCNM_MAX,
    wide_ptnqcnm_min: WIDE_PTNQCNM_MIN,
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

function labelForPtnqcnm(
  pool_count: number,
  pool_cells: number,
  ptnqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtnqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnqcnm === null) return "degenerate";
  if (ptnqcnm >= wide_min) return "wide";
  if (ptnqcnm < tight_max) return "tight";
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

function renderPtnqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptnqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnqcnm(
    pool_count,
    pool_cells,
    ptnqcnm,
    tight_max,
    wide_min,
  );
  const ptnqcnmText = ptnqcnm === null ? "-" : ptnqcnm.toFixed(4);
  return `PTNQCNM ${ptnqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnqcnm_max, wide_ptnqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemquadragintcentinagintic_mean, tight_ptnqcnm_max, wide_ptnqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemquadragintcentinagintic_mean, tight_ptnqcnm_max, wide_ptnqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnqcnm = (max - min) / novemquadragintcentinagintic_mean where novemquadragintcentinagintic_mean = ((sum x_i^149) / n)^(1/149). Reads the pool's total RANGE in units of its NOVEMQUADRAGINTCENTINAGINTIC (power-mean-of-order-149, M_149) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.550 PTOQCNM because raising to the ONE-HUNDRED-AND-FORTY-NINTH power lifts the anchor MORE than raising to the hundred-and-forty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octoquadragintcentinagintic) power-mean OCTOGINTUPLET into an UNOCTOGINTUPLET with the M_149 novemquadragintcentinagintic mean, ninth step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnqcnm approaches n^(1/149) so 10-partner pools cap near 1.0156, 20-partner near 1.0203, 30-partner near 1.0231, 40-partner near 1.0251, 50-partner near 1.0266, 60-partner near 1.0279, 70-partner near 1.0289, 80-partner near 1.0298, 85-partner near 1.0303, 89-partner near 1.0306 and 90-partner near 1.0307 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/149) ~= 1.0314) are required to escape into wide with a modest outlier. Composite regime labels: PTNQCNM tight + PTOQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNQCNM 0.9140 tight -- rejoining the uniform ramp's 0.9140); PTNQCNM spread + PTOQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNQCNM 1.0054 spread -- one 4-decimal tick below PTOQCNM's 1.0055); PTNQCNM spread + PTOQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_149 ([1x99, 100] reads 1.0211 spread after M_148's 1.0213 spread landing -- two 4-decimal ticks of absorption); PTNQCNM tight + PTOQCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_148 ([1, 100] reads 0.9946 tight, same as M_148's 0.9946 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemquadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptnqcnm &lt; ${tight_ptnqcnm_max}, spread = ptnqcnm in [${tight_ptnqcnm_max}, ${wide_ptnqcnm_min}), wide = ptnqcnm &ge; ${wide_ptnqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
