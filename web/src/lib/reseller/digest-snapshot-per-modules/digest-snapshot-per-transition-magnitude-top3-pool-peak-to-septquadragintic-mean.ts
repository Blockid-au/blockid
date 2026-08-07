// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTQUADRAGINTIC-MEAN
// pure-lib (P11.348).
//
// WHOLE-POOL RANGE-AGAINST-SEPTQUADRAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTQUADRAGINTIC MEAN (a.k.a. power mean of order 47, M_47):
//
//   ptspqm = (max - min) / septquadragintic_mean
//
// where septquadragintic_mean = ((sum x_i^47) / n)^(1/47). Reads the
// peak spread against the SEPTQUADRAGINTIC (power-mean-of-order-47)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.346 PTSXQM, because raising to the FORTY-SEVENTH power
// before averaging lifts the anchor MORE than raising to the
// forty-sixth does, dampening the ratio against the range even harder.
//
// PTSPQM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTQUADRAGINTIC (POWER-MEAN-OF-ORDER-47) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quinquaquadragintic M_45, sexquadragintic M_46)
// power-mean OCTOQUADRAGINTUPLET into a NONQUADRAGINTUPLET with the
// M_47 septquadragintic mean. By Power Mean inequality M_47 >= M_46,
// so septquadragintic_mean >= sexquadragintic_mean and ptspqm
// <= ptsxqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septquadragintic_mean approaches x_max / n^(1/47), so ptspqm
// approaches n^(1/47) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/47) ~= 1.0502, for n=11 ~= 1.0523, for n=12 ~= 1.0543, for
// n=13 ~= 1.0561, for n=14 ~= 1.0578, for n=15 ~= 1.0593, for n=16
// ~= 1.0608, for n=17 ~= 1.0621, for n=18 ~= 1.0634, for n=19 ~=
// 1.0647, for n=20 ~= 1.0658, for n=21 ~= 1.0669, for n=22 ~= 1.0680,
// for n=23 ~= 1.0690, for n=24 ~= 1.0700, for n=25 ~= 1.0709, for
// n=26 ~= 1.0718, for n=27 ~= 1.0726, for n=28 ~= 1.0735, for n=29
// ~= 1.0743, for n=30 ~= 1.0750, for n=31 ~= 1.0758, for n=32 ~=
// 1.0765, for n=33 ~= 1.0772, for n=34 ~= 1.0779, for n=35 ~=
// 1.0786, for n=36 ~= 1.0792, for n=37 ~= 1.0799, for n=38 ~=
// 1.0805, for n=39 ~= 1.0811, for n=40 ~= 1.0816, for n=41 ~=
// 1.0822, for n=42 ~= 1.0828, for n=43 ~= 1.0833, for n=44 ~= 1.0838,
// for n=45 ~= 1.0844, for n=46 ~= 1.0849, for n=47 ~= 1.0854, for
// n=48 ~= 1.0859, for n=49 ~= 1.0863, for n=50 ~= 1.0868, for n=51
// ~= 1.0873, for n=52 ~= 1.0877, for n=53 ~= 1.0881, for n=54 ~=
// 1.0886, for n=55 ~= 1.0890, for n=56 ~= 1.0894, for n=57 ~= 1.0898
// -- still just under wide -- so pools with pool_count >= 58
// (58^(1/47) ~= 1.0902) are required to escape into wide with a
// modest outlier. For n=100 the ceiling climbs to 100^(1/47) ~=
// 1.1029, so a large pool with a dominant outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septquadragintic_mean = k,
//                                     range 0, ptspqm 0 (tight).
//   * uniform ramp [1..10]          -> SPQM ~= 9.5233, range 9, ptspqm
//                                     ~= 0.9450 (tight).
//   * upper-outlier [1x9, 10]       -> SPQM ~= 9.5219, range 9, ptspqm
//                                     ~= 0.9452 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.346
//                                     PTSXQM's 0.9462 tight landing).
//   * two-shoulders [1x8, 5x2]      -> SPQM ~= 4.8317, range 4, ptspqm
//                                     ~= 0.8279 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPQM ~= 9.8536, range 9, ptspqm
//                                     ~= 0.9134 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPQM ~= 95.2190, range 99,
//                                     ptspqm ~= 1.0397 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/47) ~ 1.0502
//                                     asymptote).
//   * two-partner [1, 9]            -> SPQM ~= 8.8682, range 8, ptspqm
//                                     ~= 0.9021 (tight).
//   * two-partner [1, 100]          -> SPQM ~= 98.5360, range 99, ptspqm
//                                     ~= 1.0047 (TIGHT -- ISOLATED HIGH
//                                     PARTNER has CROSSED BACK BELOW the
//                                     1.005 tight boundary at M_47; the
//                                     M_46 boundary landing at 1.0050 has
//                                     been absorbed by the forty-seventh
//                                     power lift, so PTSPQM is the first
//                                     dispersion surface in the septuplet
//                                     to READ THE ISOLATED HIGH PARTNER
//                                     AS TIGHT).
//   * small [10, 1, 1]              -> SPQM ~= 9.7690, range 9, ptspqm
//                                     ~= 0.9213 (tight).
//   * pool_count=100 [1x99, 100]    -> SPQM ~= 90.6665, range 99, ptspqm
//                                     ~= 1.0919 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septquadragintic_mean == 0
//   * tight                ptspqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100] --
//                          NEWLY ABSORBED HERE -- small regimes)
//   * spread               ptspqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0502,
//                          11-partner ~ 1.0523, 12-partner ~ 1.0543,
//                          13-partner ~ 1.0561, 14-partner ~ 1.0578,
//                          15-partner ~ 1.0593, 16-partner ~ 1.0608,
//                          17-partner ~ 1.0621, 18-partner ~ 1.0634,
//                          19-partner ~ 1.0647, 20-partner ~ 1.0658,
//                          21-partner ~ 1.0669, 22-partner ~ 1.0680,
//                          23-partner ~ 1.0690, 24-partner ~ 1.0700,
//                          25-partner ~ 1.0709, 26-partner ~ 1.0718,
//                          27-partner ~ 1.0726, 28-partner ~ 1.0735,
//                          29-partner ~ 1.0743, 30-partner ~ 1.0750,
//                          31-partner ~ 1.0758, 32-partner ~ 1.0765,
//                          33-partner ~ 1.0772, 34-partner ~ 1.0779,
//                          35-partner ~ 1.0786, 36-partner ~ 1.0792,
//                          37-partner ~ 1.0799, 38-partner ~ 1.0805,
//                          39-partner ~ 1.0811, 40-partner ~ 1.0816,
//                          41-partner ~ 1.0822, 42-partner ~ 1.0828,
//                          43-partner ~ 1.0833, 44-partner ~ 1.0838,
//                          45-partner ~ 1.0844, 46-partner ~ 1.0849,
//                          47-partner ~ 1.0854, 48-partner ~ 1.0859,
//                          49-partner ~ 1.0863, 50-partner ~ 1.0868,
//                          51-partner ~ 1.0873, 52-partner ~ 1.0877,
//                          53-partner ~ 1.0881, 54-partner ~ 1.0886,
//                          55-partner ~ 1.0890, 56-partner ~ 1.0894
//                          and 57-partner ~ 1.0898 all cap within
//                          spread)
//   * wide                 ptspqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 58)
//
// Both cutoffs are exposed on the envelope as tight_ptspqm_max /
// wide_ptspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.349):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSexquadraginticMeanSection
// (P11.346) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septquadragintic-center
// after the P11.346 range-against-sexquadragintic-center landing.

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
type PtspqmLabel =
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

// Bands on raw ptspqm (fixed cutoffs since septquadragintic_mean
// scales with cell counts and typical septquadragintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_47 is 0.9452
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0513 (M_46) to
// 1.0502 (M_47), 11-partner drops from 1.0535 to 1.0523, 12-partner
// drops from 1.0555 to 1.0543, 13-partner drops from 1.0573 to 1.0561,
// 14-partner drops from 1.0590 to 1.0578, 15-partner drops from 1.0606
// to 1.0593, 16-partner drops from 1.0621 to 1.0608, 17-partner drops
// from 1.0635 to 1.0621, 18-partner drops from 1.0649 to 1.0634,
// 19-partner drops from 1.0661 to 1.0647, 20-partner drops from 1.0673
// to 1.0658, 21-partner drops from 1.0684 to 1.0669, 22-partner drops
// from 1.0695 to 1.0680, 23-partner drops from 1.0705 to 1.0690,
// 24-partner drops from 1.0715 to 1.0700, 25-partner drops from 1.0725
// to 1.0709, 26-partner drops from 1.0734 to 1.0718, 27-partner drops
// from 1.0743 to 1.0726, 28-partner drops from 1.0751 to 1.0735,
// 29-partner drops from 1.0759 to 1.0743, 30-partner drops from 1.0767
// to 1.0750, 31-partner drops from 1.0775 to 1.0758, 32-partner drops
// from 1.0783 to 1.0765, 33-partner drops from 1.0790 to 1.0772,
// 34-partner drops from 1.0797 to 1.0779, 35-partner drops from 1.0804
// to 1.0786, 36-partner drops from 1.0810 to 1.0792, 37-partner drops
// from 1.0817 to 1.0799, 38-partner drops from 1.0823 to 1.0805,
// 39-partner drops from 1.0829 to 1.0811, 40-partner drops from 1.0835
// to 1.0816, 41-partner drops from 1.0841 to 1.0822, 42-partner drops
// from 1.0846 to 1.0828, 43-partner drops from 1.0852 to 1.0833,
// 44-partner drops from 1.0857 to 1.0838, 45-partner drops from 1.0863
// to 1.0844, 46-partner drops from 1.0868 to 1.0849, 47-partner drops
// from 1.0873 to 1.0854, 48-partner drops from 1.0878 to 1.0859,
// 49-partner drops from 1.0883 to 1.0863, 50-partner drops from 1.0888
// to 1.0868, 51-partner drops from 1.0892 to 1.0873, 52-partner drops
// from 1.0897 to 1.0877, 53-partner lands at 1.0881, 54-partner lands
// at 1.0886, 55-partner lands at 1.0890, 56-partner lands at 1.0894
// and 57-partner lands at 1.0898 -- so pool_count >= 58 (58^(1/47) ~
// 1.0902) is now required to reach wide with a modest outlier.
const TIGHT_PTSPQM_MAX = 1.005;
const WIDE_PTSPQM_MIN = 1.09;

// PTSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septquadragintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septquadragintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspqm_max: number;
  readonly wide_ptspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanMap;
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

// Peak-to-septquadragintic-mean of a discrete distribution:
//   PTSPQM = (max - min) / septquadragintic_mean
// where septquadragintic_mean = ((sum x_i^47) / n)^(1/47). Returns
// null on empty, solo, and degenerate (zero septquadragintic_mean
// or non-finite forty-seventh-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septquadragintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_septquadragintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_septquadragintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_septquadragintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fortyseventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^47 = (x^8)^5 * x^4 * x^2 * x -> oct*oct*oct*oct*oct * quad * sq * v
    fortyseventhSum += oct * oct * oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(fortyseventhSum) || fortyseventhSum <= 0) {
    return { pool_count, pool_cells, peak_to_septquadragintic_mean: null };
  }
  const septquadragintic_mean = Math.pow(fortyseventhSum / pool_count, 1 / 47);
  if (
    !Number.isFinite(septquadragintic_mean) ||
    septquadragintic_mean <= 0
  ) {
    return { pool_count, pool_cells, peak_to_septquadragintic_mean: null };
  }
  const range = max - min;
  const ptspqm = range / septquadragintic_mean;
  const clamped = ptspqm < 0 ? 0 : ptspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_septquadragintic_mean: roundTo(clamped, PTSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septquadragintic_mean:
      partner.peak_to_septquadragintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septquadragintic_mean:
      metric.peak_to_septquadragintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean {
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
    tight_ptspqm_max: TIGHT_PTSPQM_MAX,
    wide_ptspqm_min: WIDE_PTSPQM_MIN,
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

function labelForPtspqm(
  pool_count: number,
  pool_cells: number,
  ptspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspqm === null) return "degenerate";
  if (ptspqm >= wide_min) return "wide";
  if (ptspqm < tight_max) return "tight";
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

function renderPtspqmCell(
  pool_count: number,
  pool_cells: number,
  ptspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspqm(
    pool_count,
    pool_cells,
    ptspqm,
    tight_max,
    wide_min,
  );
  const ptspqmText = ptspqm === null ? "-" : ptspqm.toFixed(4);
  return `PTSPQM ${ptspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspqm_max, wide_ptspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septquadragintic_mean, tight_ptspqm_max, wide_ptspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septquadragintic_mean, tight_ptspqm_max, wide_ptspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTQUADRAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTQUADRAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspqm = (max - min) / septquadragintic_mean where septquadragintic_mean = ((sum x_i^47) / n)^(1/47). Reads the pool's total RANGE in units of its SEPTQUADRAGINTIC (power-mean-of-order-47, M_47) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.346 PTSXQM because raising to the FORTY-SEVENTH power lifts the anchor MORE than raising to the forty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sexquadragintic) power-mean OCTOQUADRAGINTUPLET into a NONQUADRAGINTUPLET with the M_47 septquadragintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspqm approaches n^(1/47) so 10-partner pools cap near 1.0502, 11-partner near 1.0523, 12-partner near 1.0543, 13-partner near 1.0561, 14-partner near 1.0578, 15-partner near 1.0593, 16-partner near 1.0608, 17-partner near 1.0621, 18-partner near 1.0634, 19-partner near 1.0647, 20-partner near 1.0658, 21-partner near 1.0669, 22-partner near 1.0680, 23-partner near 1.0690, 24-partner near 1.0700, 25-partner near 1.0709, 26-partner near 1.0718, 27-partner near 1.0726, 28-partner near 1.0735, 29-partner near 1.0743, 30-partner near 1.0750, 31-partner near 1.0758, 32-partner near 1.0765, 33-partner near 1.0772, 34-partner near 1.0779, 35-partner near 1.0786, 36-partner near 1.0792, 37-partner near 1.0799, 38-partner near 1.0805, 39-partner near 1.0811, 40-partner near 1.0816, 41-partner near 1.0822, 42-partner near 1.0828, 43-partner near 1.0833, 44-partner near 1.0838, 45-partner near 1.0844, 46-partner near 1.0849, 47-partner near 1.0854, 48-partner near 1.0859, 49-partner near 1.0863, 50-partner near 1.0868, 51-partner near 1.0873, 52-partner near 1.0877, 53-partner near 1.0881, 54-partner near 1.0886, 55-partner near 1.0890, 56-partner near 1.0894 and 57-partner near 1.0898 (all below the wide floor); pools with pool_count &gt;= 58 (58^(1/47) ~= 1.0902) are required to escape into wide with a modest outlier. Composite regime labels: PTSPQM tight + PTSXQM tight = MILD OUTLIER absorbed by septquadragintic ([1x9, 10] reads PTSPQM 0.9452 tight); PTSPQM spread + PTSXQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPQM 1.0397 spread); PTSPQM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.0919 wide); PTSPQM tight + PTSXQM spread = ISOLATED HIGH PARTNER NEWLY ABSORBED at M_47 ([1, 100] reads 1.0047 tight after M_46 boundary landing at 1.0050). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septquadragintic_mean == 0 (guarded but unreachable), tight = ptspqm &lt; ${tight_ptspqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100] NEWLY ABSORBED, small regimes), spread = ptspqm in [${tight_ptspqm_max}, ${wide_ptspqm_min}) (extreme-outlier regime), wide = ptspqm &ge; ${wide_ptspqm_min} (runaway-outlier regime with pool_count &gt;= 58). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
