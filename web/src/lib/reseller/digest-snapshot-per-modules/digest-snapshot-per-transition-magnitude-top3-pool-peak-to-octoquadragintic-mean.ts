// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOQUADRAGINTIC-MEAN
// pure-lib (P11.350).
//
// WHOLE-POOL RANGE-AGAINST-OCTOQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTOQUADRAGINTIC MEAN (a.k.a. power mean of order 48, M_48):
//
//   ptoqm = (max - min) / octoquadragintic_mean
//
// where octoquadragintic_mean = ((sum x_i^48) / n)^(1/48). Reads the
// peak spread against the OCTOQUADRAGINTIC (power-mean-of-order-48)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.348 PTSPQM, because raising to the FORTY-EIGHTH power
// before averaging lifts the anchor MORE than raising to the
// forty-seventh does, dampening the ratio against the range even harder.
//
// PTOQM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOQUADRAGINTIC (POWER-MEAN-OF-ORDER-48) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... sexquadragintic M_46, septquadragintic M_47)
// power-mean NONQUADRAGINTUPLET into a QUINQUAGINTUPLET with the
// M_48 octoquadragintic mean. By Power Mean inequality M_48 >= M_47,
// so octoquadragintic_mean >= septquadragintic_mean and ptoqm
// <= ptspqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octoquadragintic_mean approaches x_max / n^(1/48), so ptoqm
// approaches n^(1/48) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/48) ~= 1.0491, for n=11 ~= 1.0512, for n=12 ~= 1.0531, for
// n=13 ~= 1.0549, for n=14 ~= 1.0565, for n=15 ~= 1.0580, for n=16
// ~= 1.0595, for n=17 ~= 1.0608, for n=18 ~= 1.0621, for n=19 ~=
// 1.0633, for n=20 ~= 1.0644, for n=21 ~= 1.0655, for n=22 ~= 1.0665,
// for n=23 ~= 1.0675, for n=24 ~= 1.0685, for n=25 ~= 1.0694, for
// n=26 ~= 1.0702, for n=27 ~= 1.0711, for n=28 ~= 1.0719, for n=29
// ~= 1.0727, for n=30 ~= 1.0734, for n=31 ~= 1.0742, for n=32 ~=
// 1.0749, for n=33 ~= 1.0756, for n=34 ~= 1.0762, for n=35 ~=
// 1.0769, for n=36 ~= 1.0775, for n=37 ~= 1.0781, for n=38 ~=
// 1.0787, for n=39 ~= 1.0793, for n=40 ~= 1.0799, for n=41 ~=
// 1.0804, for n=42 ~= 1.0810, for n=43 ~= 1.0815, for n=44 ~= 1.0820,
// for n=45 ~= 1.0825, for n=46 ~= 1.0830, for n=47 ~= 1.0835, for
// n=48 ~= 1.0840, for n=49 ~= 1.0845, for n=50 ~= 1.0849, for n=51
// ~= 1.0854, for n=52 ~= 1.0858, for n=53 ~= 1.0862, for n=54 ~=
// 1.0867, for n=55 ~= 1.0871, for n=56 ~= 1.0875, for n=57 ~= 1.0879,
// for n=58 ~= 1.0883, for n=59 ~= 1.0887, for n=60 ~= 1.0890, for
// n=61 ~= 1.0894, for n=62 ~= 1.0898 -- still just under wide -- so
// pools with pool_count >= 63 (63^(1/48) ~= 1.0901) are required to
// escape into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/48) ~= 1.1007, but the pool100 [1x99, 100] reference now
// reads 1.0897 spread (NEWLY ABSORBED from PTSPQM's 1.0919 wide at
// M_47) because the asymptote gap at n=100 has narrowed to just
// above the 1.09 wide boundary; the 100-partner [1x99,100] pool
// finally CROSSED BACK BELOW the wide boundary at M_48.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octoquadragintic_mean = k,
//                                     range 0, ptoqm 0 (tight).
//   * uniform ramp [1..10]          -> OQM ~= 9.5329, range 9, ptoqm
//                                     ~= 0.9441 (tight).
//   * upper-outlier [1x9, 10]       -> OQM ~= 9.5316, range 9, ptoqm
//                                     ~= 0.9442 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.348
//                                     PTSPQM's 0.9452 tight landing).
//   * two-shoulders [1x8, 5x2]      -> OQM ~= 4.8351, range 4, ptoqm
//                                     ~= 0.8273 (tight).
//   * 50/50 split [1x5, 10x5]       -> OQM ~= 9.8566, range 9, ptoqm
//                                     ~= 0.9131 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> OQM ~= 95.3162, range 99,
//                                     ptoqm ~= 1.0386 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/48) ~ 1.0491
//                                     asymptote).
//   * two-partner [1, 9]            -> OQM ~= 8.8710, range 8, ptoqm
//                                     ~= 0.9018 (tight).
//   * two-partner [1, 100]          -> OQM ~= 98.5663, range 99, ptoqm
//                                     ~= 1.0044 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_48; PTSPQM's M_47
//                                     landing at 1.0047 already crossed
//                                     below tight, and PTOQM continues
//                                     that absorption trend).
//   * small [10, 1, 1]              -> OQM ~= 9.7737, range 9, ptoqm
//                                     ~= 0.9208 (tight).
//   * pool_count=100 [1x99, 100]    -> OQM ~= 90.8518, range 99, ptoqm
//                                     ~= 1.0897 (SPREAD -- NEWLY ABSORBED
//                                     from PTSPQM M_47's 1.0919 wide;
//                                     100-partner asymptote 100^(1/48)
//                                     ~ 1.1007 barely clears the wide
//                                     floor so a modest outlier no longer
//                                     reaches wide at n=100).
//   * pool_count=200 [1x199, 100]   -> OQM ~= 89.5492, range 99, ptoqm
//                                     ~= 1.1055 (WIDE -- RUNAWAY OUTLIER
//                                     requires a wider pool at M_48; the
//                                     wide-band gate has tightened from
//                                     pool_count >= 58 (M_47) to
//                                     pool_count >= 63 (M_48) even for
//                                     the [1xn-1, 100] shape).
//
// Bands on raw ptoqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octoquadragintic_mean == 0
//   * tight                ptoqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptoqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0491,
//                          11-partner ~ 1.0512, 12-partner ~ 1.0531,
//                          13-partner ~ 1.0549, 14-partner ~ 1.0565,
//                          15-partner ~ 1.0580, 16-partner ~ 1.0595,
//                          17-partner ~ 1.0608, 18-partner ~ 1.0621,
//                          19-partner ~ 1.0633, 20-partner ~ 1.0644,
//                          21-partner ~ 1.0655, 22-partner ~ 1.0665,
//                          23-partner ~ 1.0675, 24-partner ~ 1.0685,
//                          25-partner ~ 1.0694, 26-partner ~ 1.0702,
//                          27-partner ~ 1.0711, 28-partner ~ 1.0719,
//                          29-partner ~ 1.0727, 30-partner ~ 1.0734,
//                          31-partner ~ 1.0742, 32-partner ~ 1.0749,
//                          33-partner ~ 1.0756, 34-partner ~ 1.0762,
//                          35-partner ~ 1.0769, 36-partner ~ 1.0775,
//                          37-partner ~ 1.0781, 38-partner ~ 1.0787,
//                          39-partner ~ 1.0793, 40-partner ~ 1.0799,
//                          41-partner ~ 1.0804, 42-partner ~ 1.0810,
//                          43-partner ~ 1.0815, 44-partner ~ 1.0820,
//                          45-partner ~ 1.0825, 46-partner ~ 1.0830,
//                          47-partner ~ 1.0835, 48-partner ~ 1.0840,
//                          49-partner ~ 1.0845, 50-partner ~ 1.0849,
//                          51-partner ~ 1.0854, 52-partner ~ 1.0858,
//                          53-partner ~ 1.0862, 54-partner ~ 1.0867,
//                          55-partner ~ 1.0871, 56-partner ~ 1.0875,
//                          57-partner ~ 1.0879, 58-partner ~ 1.0883,
//                          59-partner ~ 1.0887, 60-partner ~ 1.0890,
//                          61-partner ~ 1.0894 and 62-partner ~ 1.0898
//                          all cap within spread; pool_count=100
//                          [1x99,100] ~ 1.0897 also cap within spread
//                          NEWLY ABSORBED from PTSPQM's wide landing)
//   * wide                 ptoqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 63)
//
// Both cutoffs are exposed on the envelope as tight_ptoqm_max /
// wide_ptoqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.351):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection
// (P11.348) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octoquadragintic-center
// after the P11.348 range-against-septquadragintic-center landing.

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
type PtoqmLabel =
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

// Bands on raw ptoqm (fixed cutoffs since octoquadragintic_mean
// scales with cell counts and typical octoquadragintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_48 is 0.9442
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0502 (M_47) to
// 1.0491 (M_48), 11-partner drops from 1.0523 to 1.0512, 12-partner
// drops from 1.0543 to 1.0531, 13-partner drops from 1.0561 to 1.0549,
// 14-partner drops from 1.0578 to 1.0565, 15-partner drops from 1.0593
// to 1.0580, 16-partner drops from 1.0608 to 1.0595, 17-partner drops
// from 1.0621 to 1.0608, 18-partner drops from 1.0634 to 1.0621,
// 19-partner drops from 1.0647 to 1.0633, 20-partner drops from 1.0658
// to 1.0644, 21-partner drops from 1.0669 to 1.0655, 22-partner drops
// from 1.0680 to 1.0665, 23-partner drops from 1.0690 to 1.0675,
// 24-partner drops from 1.0700 to 1.0685, 25-partner drops from 1.0709
// to 1.0694, 26-partner drops from 1.0718 to 1.0702, 27-partner drops
// from 1.0726 to 1.0711, 28-partner drops from 1.0735 to 1.0719,
// 29-partner drops from 1.0743 to 1.0727, 30-partner drops from 1.0750
// to 1.0734, 31-partner drops from 1.0758 to 1.0742, 32-partner drops
// from 1.0765 to 1.0749, 33-partner drops from 1.0772 to 1.0756,
// 34-partner drops from 1.0779 to 1.0762, 35-partner drops from 1.0786
// to 1.0769, 36-partner drops from 1.0792 to 1.0775, 37-partner drops
// from 1.0799 to 1.0781, 38-partner drops from 1.0805 to 1.0787,
// 39-partner drops from 1.0811 to 1.0793, 40-partner drops from 1.0816
// to 1.0799, 41-partner drops from 1.0822 to 1.0804, 42-partner drops
// from 1.0828 to 1.0810, 43-partner drops from 1.0833 to 1.0815,
// 44-partner drops from 1.0838 to 1.0820, 45-partner drops from 1.0844
// to 1.0825, 46-partner drops from 1.0849 to 1.0830, 47-partner drops
// from 1.0854 to 1.0835, 48-partner drops from 1.0859 to 1.0840,
// 49-partner drops from 1.0863 to 1.0845, 50-partner drops from 1.0868
// to 1.0849, 51-partner drops from 1.0873 to 1.0854, 52-partner drops
// from 1.0877 to 1.0858, 53-partner drops from 1.0881 to 1.0862,
// 54-partner drops from 1.0886 to 1.0867, 55-partner drops from 1.0890
// to 1.0871, 56-partner drops from 1.0894 to 1.0875, 57-partner drops
// from 1.0898 to 1.0879, 58-partner lands at 1.0883, 59-partner lands
// at 1.0887, 60-partner lands at 1.0890, 61-partner lands at 1.0894
// and 62-partner lands at 1.0898 -- so pool_count >= 63 (63^(1/48) ~
// 1.0901) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTSPQM 1.0919 wide
// to PTOQM 1.0897 spread -- FIRST NEWLY-ABSORBED WIDE-BAND CROSSING
// in the DISPERSION power-mean progression.
const TIGHT_PTOQM_MAX = 1.005;
const WIDE_PTOQM_MIN = 1.09;

// PTOQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octoquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octoquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptoqm_max: number;
  readonly wide_ptoqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanMap;
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

// Peak-to-octoquadragintic-mean of a discrete distribution:
//   PTOQM = (max - min) / octoquadragintic_mean
// where octoquadragintic_mean = ((sum x_i^48) / n)^(1/48). Returns
// null on empty, solo, and degenerate (zero octoquadragintic_mean
// or non-finite forty-eighth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octoquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_octoquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_octoquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_octoquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortyeighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^48 = (x^8)^6 -> oct*oct*oct*oct*oct*oct
    fortyeighthSum += oct * oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(fortyeighthSum) || fortyeighthSum <= 0) {
    return { pool_count, pool_cells, peak_to_octoquadragintic_mean: null };
  }
  const octoquadragintic_mean = Math.pow(fortyeighthSum / pool_count, 1 / 48);
  if (
    !Number.isFinite(octoquadragintic_mean) ||
    octoquadragintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_octoquadragintic_mean: null };
  }
  const range = max - min;
  const ptoqm = range / octoquadragintic_mean;
  const clamped = ptoqm < 0 ? 0 : ptoqm;
  return {
    pool_count,
    pool_cells,
    peak_to_octoquadragintic_mean: roundTo(clamped, PTOQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octoquadragintic_mean:
      partner.peak_to_octoquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octoquadragintic_mean:
      metric.peak_to_octoquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMean {
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
    tight_ptoqm_max: TIGHT_PTOQM_MAX,
    wide_ptoqm_min: WIDE_PTOQM_MIN,
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

function labelForPtoqm(
  pool_count: number,
  pool_cells: number,
  ptoqm: number | null,
  tight_max: number,
  wide_min: number,
): PtoqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptoqm === null) return "degenerate";
  if (ptoqm >= wide_min) return "wide";
  if (ptoqm < tight_max) return "tight";
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

function renderPtoqmCell(
  pool_count: number,
  pool_cells: number,
  ptoqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtoqm(
    pool_count,
    pool_cells,
    ptoqm,
    tight_max,
    wide_min,
  );
  const ptoqmText = ptoqm === null ? "-" : ptoqm.toFixed(4);
  return `PTOQM ${ptoqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptoqm_max, wide_ptoqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octoquadragintic_mean, tight_ptoqm_max, wide_ptoqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtoqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octoquadragintic_mean, tight_ptoqm_max, wide_ptoqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptoqm = (max - min) / octoquadragintic_mean where octoquadragintic_mean = ((sum x_i^48) / n)^(1/48). Reads the pool's total RANGE in units of its OCTOQUADRAGINTIC (power-mean-of-order-48, M_48) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.348 PTSPQM because raising to the FORTY-EIGHTH power lifts the anchor MORE than raising to the forty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septquadragintic) power-mean NONQUADRAGINTUPLET into a QUINQUAGINTUPLET with the M_48 octoquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptoqm approaches n^(1/48) so 10-partner pools cap near 1.0491, 11-partner near 1.0512, 12-partner near 1.0531, 13-partner near 1.0549, 14-partner near 1.0565, 15-partner near 1.0580, 16-partner near 1.0595, 17-partner near 1.0608, 18-partner near 1.0621, 19-partner near 1.0633, 20-partner near 1.0644, 21-partner near 1.0655, 22-partner near 1.0665, 23-partner near 1.0675, 24-partner near 1.0685, 25-partner near 1.0694, 26-partner near 1.0702, 27-partner near 1.0711, 28-partner near 1.0719, 29-partner near 1.0727, 30-partner near 1.0734, 31-partner near 1.0742, 32-partner near 1.0749, 33-partner near 1.0756, 34-partner near 1.0762, 35-partner near 1.0769, 36-partner near 1.0775, 37-partner near 1.0781, 38-partner near 1.0787, 39-partner near 1.0793, 40-partner near 1.0799, 41-partner near 1.0804, 42-partner near 1.0810, 43-partner near 1.0815, 44-partner near 1.0820, 45-partner near 1.0825, 46-partner near 1.0830, 47-partner near 1.0835, 48-partner near 1.0840, 49-partner near 1.0845, 50-partner near 1.0849, 51-partner near 1.0854, 52-partner near 1.0858, 53-partner near 1.0862, 54-partner near 1.0867, 55-partner near 1.0871, 56-partner near 1.0875, 57-partner near 1.0879, 58-partner near 1.0883, 59-partner near 1.0887, 60-partner near 1.0890, 61-partner near 1.0894 and 62-partner near 1.0898 (all below the wide floor); pools with pool_count &gt;= 63 (63^(1/48) ~= 1.0901) are required to escape into wide with a modest outlier. Composite regime labels: PTOQM tight + PTSPQM tight = MILD OUTLIER absorbed by octoquadragintic ([1x9, 10] reads PTOQM 0.9442 tight); PTOQM spread + PTSPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOQM 1.0386 spread); PTOQM spread + PTSPQM wide = 100-PARTNER RUNAWAY OUTLIER NEWLY ABSORBED at M_48 ([1x99, 100] reads 1.0897 spread after M_47's 1.0919 wide landing); PTOQM tight + PTSPQM tight = ISOLATED HIGH PARTNER already absorbed at M_47 stays absorbed at M_48 ([1, 100] reads 1.0044 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octoquadragintic_mean == 0 (guarded but unreachable), tight = ptoqm &lt; ${tight_ptoqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptoqm in [${tight_ptoqm_max}, ${wide_ptoqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] NEWLY ABSORBED), wide = ptoqm &ge; ${wide_ptoqm_min} (runaway-outlier regime with pool_count &gt;= 63). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptoqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
