// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOQUADRAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.550).
//
// WHOLE-POOL RANGE-AGAINST-OCTOQUADRAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's OCTOQUADRAGINTCENTINAGINTIC MEAN (power mean of
// order 148, M_148):
//
//   ptoqcnm = (max - min) / octoquadragintcentinagintic_mean
//
// where octoquadragintcentinagintic_mean = ((sum x_i^148) / n)^(1/148).
// Reads the peak spread against the OCTOQUADRAGINTCENTINAGINTIC
// (power-mean-of-order-148) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.548 PTSPQCNM, because raising to
// the ONE-HUNDRED-AND-FORTY-EIGHTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-seventh does,
// dampening the ratio against the range even harder. Eighth entry
// in the M_140+ FOURTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quadraginta prefix boundary above the trigint dozen).
//
// PTOQCNM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOQUADRAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-148)
// CENTER. Extends the (harmonic M_-1 .. septquadragintcentinagintic
// M_147) power-mean NOVEMSEPTUAGINTUPLET into an OCTOGINTUPLET with
// the M_148 octoquadragintcentinagintic mean -- eighth step into the
// FOURTH DOZEN of the triple-digit family opened at PTQCNM (M_140).
// By the Power Mean inequality M_148 >= M_147, so
// octoquadragintcentinagintic_mean >= septquadragintcentinagintic_mean
// and ptoqcnm <= ptspqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octoquadragintcentinagintic_mean approaches x_max / n^(1/148),
// so ptoqcnm approaches n^(1/148) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/148) ~= 1.0157, for n=20 ~= 1.0204, for n=30
// ~= 1.0232, for n=40 ~= 1.0252, for n=50 ~= 1.0268, for n=60
// ~= 1.0281, for n=70 ~= 1.0291, for n=80 ~= 1.0301, for n=85
// ~= 1.0305, for n=89 ~= 1.0308, for n=90 ~= 1.0309 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/148) ~= 1.0316) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/148) ~= 1.0316,
// and the pool100 [1x99, 100] reference reads 1.0213 spread
// (further absorbed from PTSPQCNM's 1.0215 spread landing -- TWO
// 4-decimal ticks of absorption at M_148) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_148.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octoquadragintcentinagintic_mean = k,
//                                     range 0, ptoqcnm 0 (tight).
//   * uniform ramp [1..10]          -> OQCNM ~= 9.8456, range 9,
//                                     ptoqcnm ~= 0.9141 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPQCNM 0.9142 at M_147).
//   * upper-outlier [1x9, 10]       -> OQCNM ~= 9.8456, range 9,
//                                     ptoqcnm ~= 0.9141 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_148).
//   * two-shoulders [1x8, 5x2]      -> OQCNM ~= 4.9459, range 4,
//                                     ptoqcnm ~= 0.8087 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPQCNM 0.8088 at M_147).
//   * 50/50 split [1x5, 10x5]       -> OQCNM ~= 9.9533, range 9,
//                                     ptoqcnm ~= 0.9042 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPQCNM 0.9043 at M_147).
//   * extreme outlier [1x9, 100]    -> OQCNM ~= 98.4562, range 99,
//                                     ptoqcnm ~= 1.0055 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/148) ~ 1.0157 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPQCNM 1.0056 at M_147).
//   * two-partner [1, 9]            -> OQCNM ~= 8.9579, range 8,
//                                     ptoqcnm ~= 0.8931 (tight --
//                                     JOINT with PTSPQCNM 0.8931 at
//                                     M_147).
//   * two-partner [1, 100]          -> OQCNM ~= 99.5328, range 99,
//                                     ptoqcnm ~= 0.9946 (TIGHT --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPQCNM 0.9947 at M_147).
//   * small [10, 1, 1]              -> OQCNM ~= 9.9260, range 9,
//                                     ptoqcnm ~= 0.9067 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSPQCNM 0.9068 at M_147).
//   * pool_count=100 [1x99, 100]    -> OQCNM ~= 96.9363, range 99,
//                                     ptoqcnm ~= 1.0213 (SPREAD --
//                                     FURTHER ABSORBED from PTSPQCNM
//                                     M_147's 1.0215 spread; the
//                                     100-partner asymptote
//                                     100^(1/148) ~ 1.0316 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_148).
//
// Bands on raw ptoqcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octoquadragintcentinagintic_mean == 0
//   * tight                ptoqcnm < 1.005
//   * spread               ptoqcnm in [1.005, 1.09)
//   * wide                 ptoqcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptoqcnm_max /
// wide_ptoqcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.551):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptquadragintcentinaginticMeanSection
// (P11.549) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octoquadragintcentinagintic-center
// after the P11.549 range-against-septquadragintcentinagintic-center landing.
//
// Naming: octoquadragintcentinagintic = octo (8) + quadragint (40) +
// centinagintic (100) following the octvigintcentinagintic (M_128) +
// octotrigintcentinagintic (M_138) systematic pattern; abbreviation
// PTOQCNM (P-T-Octo-Quadragint-Centi-Nagintic-M) is distinct from
// PTOVCNM (M_128 octvigintcentinagintic) by the 'Q' (quadragint) vs
// 'V' (vigint) segment and from PTOTCNM (M_138 octotrigintcentinagintic)
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
type PtoqcnmLabel =
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

// Bands on raw ptoqcnm (fixed cutoffs since octoquadragintcentinagintic_mean
// scales with cell counts and typical octoquadragintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_148 is 0.9141
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0158
// (M_147) to 1.0157 (M_148), 20-partner drops from 1.0206 to 1.0204,
// 30-partner drops from 1.0234 to 1.0232, 40-partner drops from
// 1.0254 to 1.0252, 50-partner drops from 1.0270 to 1.0268,
// 60-partner drops from 1.0282 to 1.0281, 70-partner drops from
// 1.0293 to 1.0291, 80-partner drops from 1.0303 to 1.0301,
// 85-partner drops from 1.0307 to 1.0305, 89-partner drops from
// 1.0310 to 1.0308, 90-partner drops from 1.0311 to 1.0309 -- so
// pool_count >= 100 (100^(1/148) ~ 1.0316) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSPQCNM 1.0215 spread to PTOQCNM 1.0213 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTOQCNM_MAX = 1.005;
const WIDE_PTOQCNM_MIN = 1.09;

// PTOQCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOQCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octoquadragintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octoquadragintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptoqcnm_max: number;
  readonly wide_ptoqcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanMap;
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

// Peak-to-octoquadragintcentinagintic-mean of a discrete distribution:
//   PTOQCNM = (max - min) / octoquadragintcentinagintic_mean
// where octoquadragintcentinagintic_mean = ((sum x_i^148) / n)^(1/148).
// Returns null on empty, solo, and degenerate (zero
// octoquadragintcentinagintic_mean or non-finite hundred-and-forty-eighth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octoquadragintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquadragintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquadragintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquadragintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFortyEighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^148 = x^128 * x^16 * x^4 = p128 * p16 * quad --
    // (128 + 16 + 4) decomposition reuses the p128 rung shared
    // with the M_128..M_147 siblings and multiplies by p16 and quad
    // to hit the next order.
    hundredFortyEighthSum += p128 * p16 * quad;
  }
  if (
    !Number.isFinite(hundredFortyEighthSum) ||
    hundredFortyEighthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquadragintcentinagintic_mean: null,
    };
  }
  const octoquadragintcentinagintic_mean = Math.pow(
    hundredFortyEighthSum / pool_count,
    1 / 148,
  );
  if (
    !Number.isFinite(octoquadragintcentinagintic_mean) ||
    octoquadragintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octoquadragintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptoqcnm = range / octoquadragintcentinagintic_mean;
  const clamped = ptoqcnm < 0 ? 0 : ptoqcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_octoquadragintcentinagintic_mean: roundTo(clamped, PTOQCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octoquadragintcentinagintic_mean:
      partner.peak_to_octoquadragintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octoquadragintcentinagintic_mean:
      metric.peak_to_octoquadragintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMean {
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
    tight_ptoqcnm_max: TIGHT_PTOQCNM_MAX,
    wide_ptoqcnm_min: WIDE_PTOQCNM_MIN,
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

function labelForPtoqcnm(
  pool_count: number,
  pool_cells: number,
  ptoqcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtoqcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptoqcnm === null) return "degenerate";
  if (ptoqcnm >= wide_min) return "wide";
  if (ptoqcnm < tight_max) return "tight";
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

function renderPtoqcnmCell(
  pool_count: number,
  pool_cells: number,
  ptoqcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtoqcnm(
    pool_count,
    pool_cells,
    ptoqcnm,
    tight_max,
    wide_min,
  );
  const ptoqcnmText = ptoqcnm === null ? "-" : ptoqcnm.toFixed(4);
  return `PTOQCNM ${ptoqcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadragintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptoqcnm_max, wide_ptoqcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoqcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octoquadragintcentinagintic_mean, tight_ptoqcnm_max, wide_ptoqcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoqcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octoquadragintcentinagintic_mean, tight_ptoqcnm_max, wide_ptoqcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOQUADRAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOQUADRAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptoqcnm = (max - min) / octoquadragintcentinagintic_mean where octoquadragintcentinagintic_mean = ((sum x_i^148) / n)^(1/148). Reads the pool's total RANGE in units of its OCTOQUADRAGINTCENTINAGINTIC (power-mean-of-order-148, M_148) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.548 PTSPQCNM because raising to the ONE-HUNDRED-AND-FORTY-EIGHTH power lifts the anchor MORE than raising to the hundred-and-forty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septquadragintcentinagintic) power-mean NOVEMSEPTUAGINTUPLET into an OCTOGINTUPLET with the M_148 octoquadragintcentinagintic mean, eighth step into the FOURTH DOZEN of the triple-digit family opened at PTQCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptoqcnm approaches n^(1/148) so 10-partner pools cap near 1.0157, 20-partner near 1.0204, 30-partner near 1.0232, 40-partner near 1.0252, 50-partner near 1.0268, 60-partner near 1.0281, 70-partner near 1.0291, 80-partner near 1.0301, 85-partner near 1.0305, 89-partner near 1.0308 and 90-partner near 1.0309 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/148) ~= 1.0316) are required to escape into wide with a modest outlier. Composite regime labels: PTOQCNM tight + PTSPQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTOQCNM 0.9141 tight -- rejoining the uniform ramp's 0.9141); PTOQCNM spread + PTSPQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOQCNM 1.0055 spread -- one 4-decimal tick below PTSPQCNM's 1.0056); PTOQCNM spread + PTSPQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_148 ([1x99, 100] reads 1.0213 spread after M_147's 1.0215 spread landing -- two 4-decimal ticks of absorption); PTOQCNM tight + PTSPQCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one tick from M_147 ([1, 100] reads 0.9946 tight, down from M_147's 0.9947 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octoquadragintcentinagintic_mean == 0 (guarded but unreachable), tight = ptoqcnm &lt; ${tight_ptoqcnm_max}, spread = ptoqcnm in [${tight_ptoqcnm_max}, ${wide_ptoqcnm_min}), wide = ptoqcnm &ge; ${wide_ptoqcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptoqcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOQCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOQCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
