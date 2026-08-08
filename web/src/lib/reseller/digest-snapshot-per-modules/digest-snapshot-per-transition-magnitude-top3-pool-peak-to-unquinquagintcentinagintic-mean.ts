// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.554).
//
// WHOLE-POOL RANGE-AGAINST-UNQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's UNQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 150, M_150):
//
//   ptuqncnm = (max - min) / unquinquagintcentinagintic_mean
//
// where unquinquagintcentinagintic_mean = ((sum x_i^150) / n)^(1/150).
// Reads the peak spread against the UNQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-150) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.552 PTQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTIETH power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-ninth does,
// dampening the ratio against the range even harder. First entry
// in the M_150+ FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTUQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the UNQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-150)
// CENTER. Extends the (harmonic M_-1 .. quinquagintcentinagintic
// M_149) power-mean UNOCTOGINTUPLET into a DUOCTOGINTUPLET with
// the M_150 unquinquagintcentinagintic mean -- first step into the
// FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_150)
// past the fourth dozen (PTQCNM M_140 .. PTQNCNM M_149).
// By the Power Mean inequality M_150 >= M_149, so
// unquinquagintcentinagintic_mean >= quinquagintcentinagintic_mean
// and ptuqncnm <= ptqncnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unquinquagintcentinagintic_mean approaches x_max / n^(1/150),
// so ptuqncnm approaches n^(1/150) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/150) ~= 1.0155, for n=20 ~= 1.0202, for n=30
// ~= 1.0229, for n=40 ~= 1.0249, for n=50 ~= 1.0264, for n=60
// ~= 1.0277, for n=70 ~= 1.0287, for n=80 ~= 1.0296, for n=85
// ~= 1.0301, for n=89 ~= 1.0304, for n=90 ~= 1.0305 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/150) ~= 1.0312) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/150) ~= 1.0312,
// and the pool100 [1x99, 100] reference reads 1.0209 spread
// (further absorbed from PTQNCNM's 1.0211 spread landing -- TWO
// 4-decimal ticks of absorption at M_150) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_150.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unquinquagintcentinagintic_mean = k,
//                                     range 0, ptuqncnm 0 (tight).
//   * uniform ramp [1..10]          -> QNCNM ~= 9.8477, range 9,
//                                     ptuqncnm ~= 0.9139 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQNCNM 0.9140 at M_149).
//   * upper-outlier [1x9, 10]       -> QNCNM ~= 9.8477, range 9,
//                                     ptuqncnm ~= 0.9139 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_150).
//   * two-shoulders [1x8, 5x2]      -> QNCNM ~= 4.9466, range 4,
//                                     ptuqncnm ~= 0.8086 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQNCNM 0.8087 at M_149).
//   * 50/50 split [1x5, 10x5]       -> QNCNM ~= 9.9539, range 9,
//                                     ptuqncnm ~= 0.9042 (tight --
//                                     JOINT with PTQNCNM 0.9042 at
//                                     M_149).
//   * extreme outlier [1x9, 100]    -> QNCNM ~= 98.4767, range 99,
//                                     ptuqncnm ~= 1.0053 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/150) ~ 1.0155 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTQNCNM 1.0054 at M_149).
//   * two-partner [1, 9]            -> QNCNM ~= 8.9585, range 8,
//                                     ptuqncnm ~= 0.8930 (tight --
//                                     JOINT with PTQNCNM 0.8930 at
//                                     M_149).
//   * two-partner [1, 100]          -> QNCNM ~= 99.5390, range 99,
//                                     ptuqncnm ~= 0.9946 (TIGHT --
//                                     JOINT with PTQNCNM 0.9946 at
//                                     M_149).
//   * small [10, 1, 1]              -> QNCNM ~= 9.9270, range 9,
//                                     ptuqncnm ~= 0.9066 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQNCNM 0.9067 at M_149).
//   * pool_count=100 [1x99, 100]    -> QNCNM ~= 96.9765, range 99,
//                                     ptuqncnm ~= 1.0209 (SPREAD --
//                                     FURTHER ABSORBED from PTQNCNM
//                                     M_149's 1.0211 spread; the
//                                     100-partner asymptote
//                                     100^(1/150) ~ 1.0312 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_150).
//
// Bands on raw ptuqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unquinquagintcentinagintic_mean == 0
//   * tight                ptuqncnm < 1.005
//   * spread               ptuqncnm in [1.005, 1.09)
//   * wide                 ptuqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptuqncnm_max /
// wide_ptuqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.555):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanSection
// (P11.553) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unquinquagintcentinagintic-center
// after the P11.553 range-against-quinquagintcentinagintic-center landing.
//
// Naming: unquinquagintcentinagintic = quin (5) + quaginta (50) +
// centinagintic (100) following the quadragintcentinagintic (M_140)
// dozen-boundary pattern; abbreviation PTUQNCNM (P-T-Quin-Quaginta
// [N=nasal marker of the quinquaginta "-N-"]-Centi-Nagintic-M) is
// distinct from PTQCNM (M_140 quadragintcentinagintic) by the added
// 'N' segment (quinquaginta's "-N-" middle), from PTQICNM (M_105
// quincentinagintic) by the added quaginta segment, and from
// PTQNCNM (M_149 quinquagintcentinagintic) by leading Q (quin)
// vs leading N (novem).

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
type PtuqncnmLabel =
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

// Bands on raw ptuqncnm (fixed cutoffs since unquinquagintcentinagintic_mean
// scales with cell counts and typical unquinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_150 is 0.9139
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0156
// (M_149) to 1.0155 (M_150), 20-partner drops from 1.0203 to 1.0202,
// 30-partner drops from 1.0231 to 1.0229, 40-partner drops from
// 1.0251 to 1.0249, 50-partner drops from 1.0266 to 1.0264,
// 60-partner drops from 1.0279 to 1.0277, 70-partner drops from
// 1.0289 to 1.0287, 80-partner drops from 1.0298 to 1.0296,
// 85-partner drops from 1.0303 to 1.0301, 89-partner drops from
// 1.0306 to 1.0304, 90-partner drops from 1.0307 to 1.0305 -- so
// pool_count >= 100 (100^(1/150) ~ 1.0312) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQNCNM 1.0211 spread to PTUQNCNM 1.0209 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTUQNCNM_MAX = 1.005;
const WIDE_PTUQNCNM_MIN = 1.09;

// PTUQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unquinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unquinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptuqncnm_max: number;
  readonly wide_ptuqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanMap;
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

// Peak-to-unquinquagintcentinagintic-mean of a discrete distribution:
//   PTUQNCNM = (max - min) / unquinquagintcentinagintic_mean
// where unquinquagintcentinagintic_mean = ((sum x_i^150) / n)^(1/150).
// Returns null on empty, solo, and degenerate (zero
// unquinquagintcentinagintic_mean or non-finite hundred-and-fiftieth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unquinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFiftiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^150 = x^128 * x^16 * x^4 * x^2 = p128 * p16 * quad * sq --
    // (128 + 16 + 4 + 2) decomposition reuses the p128 rung shared
    // with the M_128..M_149 siblings and multiplies by p16, quad, sq
    // to hit the next order.
    hundredFiftiethSum += p128 * p16 * quad * sq;
  }
  if (
    !Number.isFinite(hundredFiftiethSum) ||
    hundredFiftiethSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquinquagintcentinagintic_mean: null,
    };
  }
  const unquinquagintcentinagintic_mean = Math.pow(
    hundredFiftiethSum / pool_count,
    1 / 150,
  );
  if (
    !Number.isFinite(unquinquagintcentinagintic_mean) ||
    unquinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_unquinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptuqncnm = range / unquinquagintcentinagintic_mean;
  const clamped = ptuqncnm < 0 ? 0 : ptuqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_unquinquagintcentinagintic_mean: roundTo(clamped, PTUQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unquinquagintcentinagintic_mean:
      partner.peak_to_unquinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unquinquagintcentinagintic_mean:
      metric.peak_to_unquinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMean {
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
    tight_ptuqncnm_max: TIGHT_PTUQNCNM_MAX,
    wide_ptuqncnm_min: WIDE_PTUQNCNM_MIN,
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

function labelForPtuqncnm(
  pool_count: number,
  pool_cells: number,
  ptuqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtuqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptuqncnm === null) return "degenerate";
  if (ptuqncnm >= wide_min) return "wide";
  if (ptuqncnm < tight_max) return "tight";
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

function renderPtuqncnmCell(
  pool_count: number,
  pool_cells: number,
  ptuqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuqncnm(
    pool_count,
    pool_cells,
    ptuqncnm,
    tight_max,
    wide_min,
  );
  const ptuqncnmText = ptuqncnm === null ? "-" : ptuqncnm.toFixed(4);
  return `PTUQNCNM ${ptuqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnquinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptuqncnm_max, wide_ptuqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unquinquagintcentinagintic_mean, tight_ptuqncnm_max, wide_ptuqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unquinquagintcentinagintic_mean, tight_ptuqncnm_max, wide_ptuqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptuqncnm = (max - min) / unquinquagintcentinagintic_mean where unquinquagintcentinagintic_mean = ((sum x_i^150) / n)^(1/150). Reads the pool's total RANGE in units of its UNQUINQUAGINTCENTINAGINTIC (power-mean-of-order-150, M_150) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.552 PTQNCNM because raising to the ONE-HUNDRED-AND-FIFTIETH power lifts the anchor MORE than raising to the hundred-and-forty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquagintcentinagintic) power-mean UNOCTOGINTUPLET into a DUOCTOGINTUPLET with the M_150 unquinquagintcentinagintic mean, first step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_150) past the fourth dozen (PTQCNM M_140 .. PTQNCNM M_149). Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptuqncnm approaches n^(1/150) so 10-partner pools cap near 1.0155, 20-partner near 1.0202, 30-partner near 1.0229, 40-partner near 1.0249, 50-partner near 1.0264, 60-partner near 1.0277, 70-partner near 1.0287, 80-partner near 1.0296, 85-partner near 1.0301, 89-partner near 1.0304 and 90-partner near 1.0305 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/150) ~= 1.0312) are required to escape into wide with a modest outlier. Composite regime labels: PTUQNCNM tight + PTQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTUQNCNM 0.9139 tight -- rejoining the uniform ramp's 0.9139); PTUQNCNM spread + PTQNCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUQNCNM 1.0053 spread -- one 4-decimal tick below PTQNCNM's 1.0054); PTUQNCNM spread + PTQNCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_150 ([1x99, 100] reads 1.0209 spread after M_149's 1.0211 spread landing -- two 4-decimal ticks of absorption); PTUQNCNM tight + PTQNCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_149 ([1, 100] reads 0.9946 tight, same as M_149's 0.9946 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unquinquagintcentinagintic_mean == 0 (guarded but unreachable), tight = ptuqncnm &lt; ${tight_ptuqncnm_max}, spread = ptuqncnm in [${tight_ptuqncnm_max}, ${wide_ptuqncnm_min}), wide = ptuqncnm &ge; ${wide_ptuqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptuqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
