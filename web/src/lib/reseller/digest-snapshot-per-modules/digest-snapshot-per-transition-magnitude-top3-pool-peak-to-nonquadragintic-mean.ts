// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NONQUADRAGINTIC-MEAN
// pure-lib (P11.352).
//
// WHOLE-POOL RANGE-AGAINST-NONQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NONQUADRAGINTIC MEAN (a.k.a. power mean of order 49, M_49):
//
//   ptnqm = (max - min) / nonquadragintic_mean
//
// where nonquadragintic_mean = ((sum x_i^49) / n)^(1/49). Reads the
// peak spread against the NONQUADRAGINTIC (power-mean-of-order-49)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.350 PTOQM, because raising to the FORTY-NINTH power
// before averaging lifts the anchor MORE than raising to the
// forty-eighth does, dampening the ratio against the range even harder.
//
// PTNQM's unique DISPERSION-axis contribution: reads range in units
// of the NONQUADRAGINTIC (POWER-MEAN-OF-ORDER-49) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... septquadragintic M_47, octoquadragintic M_48)
// power-mean QUINQUAGINTUPLET into a UNQUINQUAGINTUPLET with the
// M_49 nonquadragintic mean. By Power Mean inequality M_49 >= M_48,
// so nonquadragintic_mean >= octoquadragintic_mean and ptnqm
// <= ptoqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// nonquadragintic_mean approaches x_max / n^(1/49), so ptnqm
// approaches n^(1/49) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/49) ~= 1.0481, for n=11 ~= 1.0502, for n=12 ~= 1.0520, for
// n=13 ~= 1.0537, for n=14 ~= 1.0553, for n=15 ~= 1.0568, for n=16
// ~= 1.0582, for n=17 ~= 1.0595, for n=18 ~= 1.0608, for n=19 ~=
// 1.0619, for n=20 ~= 1.0630, for n=21 ~= 1.0641, for n=22 ~= 1.0651,
// for n=23 ~= 1.0661, for n=24 ~= 1.0670, for n=25 ~= 1.0679, for
// n=26 ~= 1.0688, for n=27 ~= 1.0696, for n=28 ~= 1.0704, for n=29
// ~= 1.0711, for n=30 ~= 1.0719, for n=31 ~= 1.0726, for n=32 ~=
// 1.0733, for n=33 ~= 1.0740, for n=34 ~= 1.0746, for n=35 ~=
// 1.0753, for n=36 ~= 1.0759, for n=37 ~= 1.0765, for n=38 ~=
// 1.0771, for n=39 ~= 1.0776, for n=40 ~= 1.0782, for n=41 ~=
// 1.0787, for n=42 ~= 1.0793, for n=43 ~= 1.0798, for n=44 ~= 1.0803,
// for n=45 ~= 1.0808, for n=46 ~= 1.0813, for n=47 ~= 1.0817, for
// n=48 ~= 1.0822, for n=49 ~= 1.0827, for n=50 ~= 1.0831, for n=51
// ~= 1.0835, for n=52 ~= 1.0840, for n=53 ~= 1.0844, for n=54 ~=
// 1.0848, for n=55 ~= 1.0852, for n=56 ~= 1.0856, for n=57 ~= 1.0860,
// for n=58 ~= 1.0864, for n=59 ~= 1.0868, for n=60 ~= 1.0871, for
// n=61 ~= 1.0875, for n=62 ~= 1.0879, for n=63 ~= 1.0882, for n=64
// ~= 1.0886, for n=65 ~= 1.0889, for n=66 ~= 1.0893, for n=67 ~=
// 1.0896, for n=68 ~= 1.0899 -- still just under wide -- so pools
// with pool_count >= 69 (69^(1/49) ~= 1.0903) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/49) ~= 1.0987, and the pool100 [1x99, 100] reference reads
// 1.0876 spread (further absorbed from PTOQM's 1.0897 spread landing)
// because the asymptote gap at n=100 has narrowed and the [1x99, 100]
// pool sits deeper inside the spread band at M_49.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> nonquadragintic_mean = k,
//                                     range 0, ptnqm 0 (tight).
//   * uniform ramp [1..10]          -> NQM ~= 9.5421, range 9, ptnqm
//                                     ~= 0.9432 (tight).
//   * upper-outlier [1x9, 10]       -> NQM ~= 9.5410, range 9, ptnqm
//                                     ~= 0.9433 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.350
//                                     PTOQM's 0.9442 tight landing).
//   * two-shoulders [1x8, 5x2]      -> NQM ~= 4.8384, range 4, ptnqm
//                                     ~= 0.8267 (tight).
//   * 50/50 split [1x5, 10x5]       -> NQM ~= 9.8595, range 9, ptnqm
//                                     ~= 0.9128 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> NQM ~= 95.4095, range 99,
//                                     ptnqm ~= 1.0376 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/49) ~ 1.0481
//                                     asymptote).
//   * two-partner [1, 9]            -> NQM ~= 8.8736, range 8, ptnqm
//                                     ~= 0.9016 (tight).
//   * two-partner [1, 100]          -> NQM ~= 98.5954, range 99, ptnqm
//                                     ~= 1.0041 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_49; PTOQM's M_48
//                                     landing at 1.0044 already sat below
//                                     tight and PTNQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> NQM ~= 9.7783, range 9, ptnqm
//                                     ~= 0.9204 (tight).
//   * pool_count=100 [1x99, 100]    -> NQM ~= 91.0298, range 99, ptnqm
//                                     ~= 1.0876 (SPREAD -- FURTHER
//                                     ABSORBED from PTOQM M_48's 1.0897
//                                     spread; 100-partner asymptote
//                                     100^(1/49) ~ 1.0987 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//   * pool_count=200 [1x199, 100]   -> NQM ~= 89.7998, range 99, ptnqm
//                                     ~= 1.1030 (WIDE -- RUNAWAY OUTLIER
//                                     requires a wider pool at M_49; the
//                                     wide-band gate has tightened from
//                                     pool_count >= 63 (M_48) to
//                                     pool_count >= 69 (M_49) even for
//                                     the [1xn-1, 100] shape).
//
// Bands on raw ptnqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR nonquadragintic_mean == 0
//   * tight                ptnqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptnqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0481,
//                          11-partner ~ 1.0502, 12-partner ~ 1.0520,
//                          13-partner ~ 1.0537, 14-partner ~ 1.0553,
//                          15-partner ~ 1.0568, 16-partner ~ 1.0582,
//                          17-partner ~ 1.0595, 18-partner ~ 1.0608,
//                          19-partner ~ 1.0619, 20-partner ~ 1.0630,
//                          21-partner ~ 1.0641, 22-partner ~ 1.0651,
//                          23-partner ~ 1.0661, 24-partner ~ 1.0670,
//                          25-partner ~ 1.0679, 26-partner ~ 1.0688,
//                          27-partner ~ 1.0696, 28-partner ~ 1.0704,
//                          29-partner ~ 1.0711, 30-partner ~ 1.0719,
//                          31-partner ~ 1.0726, 32-partner ~ 1.0733,
//                          33-partner ~ 1.0740, 34-partner ~ 1.0746,
//                          35-partner ~ 1.0753, 36-partner ~ 1.0759,
//                          37-partner ~ 1.0765, 38-partner ~ 1.0771,
//                          39-partner ~ 1.0776, 40-partner ~ 1.0782,
//                          41-partner ~ 1.0787, 42-partner ~ 1.0793,
//                          43-partner ~ 1.0798, 44-partner ~ 1.0803,
//                          45-partner ~ 1.0808, 46-partner ~ 1.0813,
//                          47-partner ~ 1.0817, 48-partner ~ 1.0822,
//                          49-partner ~ 1.0827, 50-partner ~ 1.0831,
//                          51-partner ~ 1.0835, 52-partner ~ 1.0840,
//                          53-partner ~ 1.0844, 54-partner ~ 1.0848,
//                          55-partner ~ 1.0852, 56-partner ~ 1.0856,
//                          57-partner ~ 1.0860, 58-partner ~ 1.0864,
//                          59-partner ~ 1.0868, 60-partner ~ 1.0871,
//                          61-partner ~ 1.0875, 62-partner ~ 1.0879,
//                          63-partner ~ 1.0882, 64-partner ~ 1.0886,
//                          65-partner ~ 1.0889, 66-partner ~ 1.0893,
//                          67-partner ~ 1.0896 and 68-partner ~ 1.0899
//                          all cap within spread; pool_count=100
//                          [1x99,100] ~ 1.0876 also caps within spread)
//   * wide                 ptnqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 69)
//
// Both cutoffs are exposed on the envelope as tight_ptnqm_max /
// wide_ptnqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.353):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanSection
// (P11.350) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-nonquadragintic-center
// after the P11.350 range-against-octoquadragintic-center landing.

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
type PtnqmLabel =
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

// Bands on raw ptnqm (fixed cutoffs since nonquadragintic_mean
// scales with cell counts and typical nonquadragintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_49 is 0.9433
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0491 (M_48) to
// 1.0481 (M_49), 11-partner drops from 1.0512 to 1.0502, 12-partner
// drops from 1.0531 to 1.0520, 13-partner drops from 1.0549 to 1.0537,
// 14-partner drops from 1.0565 to 1.0553, 15-partner drops from 1.0580
// to 1.0568, 16-partner drops from 1.0595 to 1.0582, 17-partner drops
// from 1.0608 to 1.0595, 18-partner drops from 1.0621 to 1.0608,
// 19-partner drops from 1.0633 to 1.0619, 20-partner drops from 1.0644
// to 1.0630, 21-partner drops from 1.0655 to 1.0641, 22-partner drops
// from 1.0665 to 1.0651, 23-partner drops from 1.0675 to 1.0661,
// 24-partner drops from 1.0685 to 1.0670, 25-partner drops from 1.0694
// to 1.0679, 26-partner drops from 1.0702 to 1.0688, 27-partner drops
// from 1.0711 to 1.0696, 28-partner drops from 1.0719 to 1.0704,
// 29-partner drops from 1.0727 to 1.0711, 30-partner drops from 1.0734
// to 1.0719, 31-partner drops from 1.0742 to 1.0726, 32-partner drops
// from 1.0749 to 1.0733, 33-partner drops from 1.0756 to 1.0740,
// 34-partner drops from 1.0762 to 1.0746, 35-partner drops from 1.0769
// to 1.0753, 36-partner drops from 1.0775 to 1.0759, 37-partner drops
// from 1.0781 to 1.0765, 38-partner drops from 1.0787 to 1.0771,
// 39-partner drops from 1.0793 to 1.0776, 40-partner drops from 1.0799
// to 1.0782, 41-partner drops from 1.0804 to 1.0787, 42-partner drops
// from 1.0810 to 1.0793, 43-partner drops from 1.0815 to 1.0798,
// 44-partner drops from 1.0820 to 1.0803, 45-partner drops from 1.0825
// to 1.0808, 46-partner drops from 1.0830 to 1.0813, 47-partner drops
// from 1.0835 to 1.0817, 48-partner drops from 1.0840 to 1.0822,
// 49-partner drops from 1.0845 to 1.0827, 50-partner drops from 1.0849
// to 1.0831, 51-partner drops from 1.0854 to 1.0835, 52-partner drops
// from 1.0858 to 1.0840, 53-partner drops from 1.0862 to 1.0844,
// 54-partner drops from 1.0867 to 1.0848, 55-partner drops from 1.0871
// to 1.0852, 56-partner drops from 1.0875 to 1.0856, 57-partner drops
// from 1.0879 to 1.0860, 58-partner drops from 1.0883 to 1.0864,
// 59-partner drops from 1.0887 to 1.0868, 60-partner drops from 1.0890
// to 1.0871, 61-partner drops from 1.0894 to 1.0875, 62-partner drops
// from 1.0898 to 1.0879, 63-partner lands at 1.0882, 64-partner lands
// at 1.0886, 65-partner lands at 1.0889, 66-partner lands at 1.0893,
// 67-partner lands at 1.0896 and 68-partner lands at 1.0899 -- so
// pool_count >= 69 (69^(1/49) ~ 1.0903) is now required to reach wide
// with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTOQM 1.0897 spread to PTNQM 1.0876 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTNQM_MAX = 1.005;
const WIDE_PTNQM_MIN = 1.09;

// PTNQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_nonquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_nonquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnqm_max: number;
  readonly wide_ptnqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanMap;
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

// Peak-to-nonquadragintic-mean of a discrete distribution:
//   PTNQM = (max - min) / nonquadragintic_mean
// where nonquadragintic_mean = ((sum x_i^49) / n)^(1/49). Returns
// null on empty, solo, and degenerate (zero nonquadragintic_mean
// or non-finite forty-ninth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_nonquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_nonquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_nonquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_nonquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortyninthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^49 = (x^8)^6 * x -> oct*oct*oct*oct*oct*oct * v
    fortyninthSum += oct * oct * oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(fortyninthSum) || fortyninthSum <= 0) {
    return { pool_count, pool_cells, peak_to_nonquadragintic_mean: null };
  }
  const nonquadragintic_mean = Math.pow(fortyninthSum / pool_count, 1 / 49);
  if (
    !Number.isFinite(nonquadragintic_mean) ||
    nonquadragintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_nonquadragintic_mean: null };
  }
  const range = max - min;
  const ptnqm = range / nonquadragintic_mean;
  const clamped = ptnqm < 0 ? 0 : ptnqm;
  return {
    pool_count,
    pool_cells,
    peak_to_nonquadragintic_mean: roundTo(clamped, PTNQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_nonquadragintic_mean:
      partner.peak_to_nonquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_nonquadragintic_mean:
      metric.peak_to_nonquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonquadraginticMean {
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
    tight_ptnqm_max: TIGHT_PTNQM_MAX,
    wide_ptnqm_min: WIDE_PTNQM_MIN,
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

function labelForPtnqm(
  pool_count: number,
  pool_cells: number,
  ptnqm: number | null,
  tight_max: number,
  wide_min: number,
): PtnqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnqm === null) return "degenerate";
  if (ptnqm >= wide_min) return "wide";
  if (ptnqm < tight_max) return "tight";
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

function renderPtnqmCell(
  pool_count: number,
  pool_cells: number,
  ptnqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnqm(
    pool_count,
    pool_cells,
    ptnqm,
    tight_max,
    wide_min,
  );
  const ptnqmText = ptnqm === null ? "-" : ptnqm.toFixed(4);
  return `PTNQM ${ptnqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNonquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnqm_max, wide_ptnqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_nonquadragintic_mean, tight_ptnqm_max, wide_ptnqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_nonquadragintic_mean, tight_ptnqm_max, wide_ptnqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NONQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NONQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnqm = (max - min) / nonquadragintic_mean where nonquadragintic_mean = ((sum x_i^49) / n)^(1/49). Reads the pool's total RANGE in units of its NONQUADRAGINTIC (power-mean-of-order-49, M_49) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.350 PTOQM because raising to the FORTY-NINTH power lifts the anchor MORE than raising to the forty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octoquadragintic) power-mean QUINQUAGINTUPLET into a UNQUINQUAGINTUPLET with the M_49 nonquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnqm approaches n^(1/49) so 10-partner pools cap near 1.0481, 11-partner near 1.0502, 12-partner near 1.0520, 13-partner near 1.0537, 14-partner near 1.0553, 15-partner near 1.0568, 16-partner near 1.0582, 17-partner near 1.0595, 18-partner near 1.0608, 19-partner near 1.0619, 20-partner near 1.0630, 21-partner near 1.0641, 22-partner near 1.0651, 23-partner near 1.0661, 24-partner near 1.0670, 25-partner near 1.0679, 26-partner near 1.0688, 27-partner near 1.0696, 28-partner near 1.0704, 29-partner near 1.0711, 30-partner near 1.0719, 31-partner near 1.0726, 32-partner near 1.0733, 33-partner near 1.0740, 34-partner near 1.0746, 35-partner near 1.0753, 36-partner near 1.0759, 37-partner near 1.0765, 38-partner near 1.0771, 39-partner near 1.0776, 40-partner near 1.0782, 41-partner near 1.0787, 42-partner near 1.0793, 43-partner near 1.0798, 44-partner near 1.0803, 45-partner near 1.0808, 46-partner near 1.0813, 47-partner near 1.0817, 48-partner near 1.0822, 49-partner near 1.0827, 50-partner near 1.0831, 51-partner near 1.0835, 52-partner near 1.0840, 53-partner near 1.0844, 54-partner near 1.0848, 55-partner near 1.0852, 56-partner near 1.0856, 57-partner near 1.0860, 58-partner near 1.0864, 59-partner near 1.0868, 60-partner near 1.0871, 61-partner near 1.0875, 62-partner near 1.0879, 63-partner near 1.0882, 64-partner near 1.0886, 65-partner near 1.0889, 66-partner near 1.0893, 67-partner near 1.0896 and 68-partner near 1.0899 (all below the wide floor); pools with pool_count &gt;= 69 (69^(1/49) ~= 1.0903) are required to escape into wide with a modest outlier. Composite regime labels: PTNQM tight + PTOQM tight = MILD OUTLIER absorbed by nonquadragintic ([1x9, 10] reads PTNQM 0.9433 tight); PTNQM spread + PTOQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNQM 1.0376 spread); PTNQM spread + PTOQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_49 ([1x99, 100] reads 1.0876 spread after M_48's 1.0897 spread landing); PTNQM tight + PTOQM tight = ISOLATED HIGH PARTNER already absorbed at M_48 stays absorbed at M_49 ([1, 100] reads 1.0041 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR nonquadragintic_mean == 0 (guarded but unreachable), tight = ptnqm &lt; ${tight_ptnqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptnqm in [${tight_ptnqm_max}, ${wide_ptnqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptnqm &ge; ${wide_ptnqm_min} (runaway-outlier regime with pool_count &gt;= 69). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
