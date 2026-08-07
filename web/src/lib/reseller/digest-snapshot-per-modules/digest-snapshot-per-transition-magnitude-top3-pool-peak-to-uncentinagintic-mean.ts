// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNCENTINAGINTIC-MEAN
// pure-lib (P11.456).
//
// WHOLE-POOL RANGE-AGAINST-UNCENTINAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNCENTINAGINTIC MEAN (a.k.a. power mean of order 101, M_101):
//
//   ptucnm = (max - min) / uncentinagintic_mean
//
// where uncentinagintic_mean = ((sum x_i^101) / n)^(1/101). Reads the
// peak spread against the UNCENTINAGINTIC (power-mean-of-order-101)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.454 PTCNM, because raising to the ONE-HUNDRED-AND-FIRST
// power before averaging lifts the anchor MORE than raising to the
// hundredth does, dampening the ratio against the range even harder.
//
// PTUCNM's unique DISPERSION-axis contribution: reads range in units
// of the UNCENTINAGINTIC (POWER-MEAN-OF-ORDER-101) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... octononagintic M_98, novenonagintic M_99,
// centinagintic M_100) power-mean DUOTRIGINTASEPTUAGINTUPLET into
// a TRETRIGINTASEPTUAGINTUPLET with the M_101 uncentinagintic mean --
// climbing further into the TRIPLE-DIGIT power-mean family opened at
// PTCNM by cracking past the round-hundred threshold. By Power Mean
// inequality M_101 >= M_100, so uncentinagintic_mean >=
// centinagintic_mean and ptucnm <= ptcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// uncentinagintic_mean approaches x_max / n^(1/101), so ptucnm
// approaches n^(1/101) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/101) ~= 1.0231, for n=20 ~= 1.0301, for n=30 ~= 1.0342,
// for n=40 ~= 1.0372, for n=50 ~= 1.0395, for n=60 ~= 1.0414,
// for n=70 ~= 1.0430, for n=80 ~= 1.0443, for n=85 ~= 1.0450,
// for n=89 ~= 1.0454, for n=90 ~= 1.0456 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/101) ~= 1.0466)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/101) ~= 1.0466, and the pool100
// [1x99, 100] reference reads 1.0362 spread (further absorbed
// from PTCNM's 1.0367 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_101.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> uncentinagintic_mean = k,
//                                     range 0, ptucnm 0 (tight).
//   * uniform ramp [1..10]          -> UCNM ~= 9.7746, range 9,
//                                     ptucnm ~= 0.9208 (tight).
//   * upper-outlier [1x9, 10]       -> UCNM ~= 9.7746, range 9,
//                                     ptucnm ~= 0.9208 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_101;
//                                     the M_100 joint collapse at
//                                     0.9210 persists at M_101 as a
//                                     joint 0.9208 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/101) ~ 9.7746 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> UCNM ~= 4.9210, range 4,
//                                     ptucnm ~= 0.8129 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTCNM 0.8130 at M_100).
//   * 50/50 split [1x5, 10x5]       -> UCNM ~= 9.9316, range 9,
//                                     ptucnm ~= 0.9062 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTCNM 0.9063 at M_100).
//   * extreme outlier [1x9, 100]    -> UCNM ~= 97.7460, range 99,
//                                     ptucnm ~= 1.0128 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/101) ~ 1.0231 asymptote;
//                                     ADVANCES from PTCNM 1.0131 at
//                                     M_100 by three 4-decimal ticks).
//   * two-partner [1, 9]            -> UCNM ~= 8.9384, range 8,
//                                     ptucnm ~= 0.8950 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTCNM 0.8951 at M_100).
//   * two-partner [1, 100]          -> UCNM ~= 99.3161, range 99,
//                                     ptucnm ~= 0.9968 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES at M_101; drops from
//                                     PTCNM 0.9969 to 0.9968 as the
//                                     uncentinagintic anchor tips
//                                     further past the range).
//   * small [10, 1, 1]              -> UCNM ~= 9.8918, range 9,
//                                     ptucnm ~= 0.9098 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTCNM 0.9099 at M_100).
//   * pool_count=100 [1x99, 100]    -> UCNM ~= 95.5428, range 99,
//                                     ptucnm ~= 1.0362 (SPREAD --
//                                     FURTHER ABSORBED from PTCNM
//                                     M_100's 1.0367 spread;
//                                     100-partner asymptote
//                                     100^(1/101) ~ 1.0466 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptucnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR uncentinagintic_mean == 0
//   * tight                ptucnm < 1.005
//   * spread               ptucnm in [1.005, 1.09)
//   * wide                 ptucnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptucnm_max /
// wide_ptucnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.457):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToCentinaginticMeanSection
// (P11.455) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-uncentinagintic-center
// after the P11.455 range-against-centinagintic-center landing.

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
type PtucnmLabel =
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

// Bands on raw ptucnm (fixed cutoffs since uncentinagintic_mean
// scales with cell counts and typical uncentinagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_101 is 0.9208 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0233 (M_100) to
// 1.0231 (M_101), 20-partner drops from 1.0304 to 1.0301, 30-partner
// drops from 1.0346 to 1.0342, 40-partner drops from 1.0376 to
// 1.0372, 50-partner drops from 1.0399 to 1.0395, 60-partner drops
// from 1.0418 to 1.0414, 70-partner drops from 1.0434 to 1.0430,
// 80-partner drops from 1.0448 to 1.0443, 85-partner drops from
// 1.0454 to 1.0450, 89-partner drops from 1.0459 to 1.0454,
// 90-partner drops from 1.0460 to 1.0456 -- so pool_count >= 100
// (100^(1/101) ~ 1.0466) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTCNM
// 1.0367 spread to PTUCNM 1.0362 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTUCNM_MAX = 1.005;
const WIDE_PTUCNM_MIN = 1.09;

// PTUCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_uncentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_uncentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUncentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptucnm_max: number;
  readonly wide_ptucnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanMap;
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

// Peak-to-uncentinagintic-mean of a discrete distribution:
//   PTUCNM = (max - min) / uncentinagintic_mean
// where uncentinagintic_mean = ((sum x_i^101) / n)^(1/101). Returns
// null on empty, solo, and degenerate (zero uncentinagintic_mean
// or non-finite hundred-and-first-power sum) so downstream labels
// fire from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_uncentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_uncentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_uncentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_uncentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^101 = (x^8)^12 * x^4 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad*v
    hundredFirstSum +=
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      quad *
      v;
  }
  if (!Number.isFinite(hundredFirstSum) || hundredFirstSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_uncentinagintic_mean: null,
    };
  }
  const uncentinagintic_mean = Math.pow(
    hundredFirstSum / pool_count,
    1 / 101,
  );
  if (!Number.isFinite(uncentinagintic_mean) || uncentinagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_uncentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptucnm = range / uncentinagintic_mean;
  const clamped = ptucnm < 0 ? 0 : ptucnm;
  return {
    pool_count,
    pool_cells,
    peak_to_uncentinagintic_mean: roundTo(clamped, PTUCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_uncentinagintic_mean:
      partner.peak_to_uncentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_uncentinagintic_mean: metric.peak_to_uncentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUncentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUncentinaginticMean {
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
    tight_ptucnm_max: TIGHT_PTUCNM_MAX,
    wide_ptucnm_min: WIDE_PTUCNM_MIN,
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

function labelForPtucnm(
  pool_count: number,
  pool_cells: number,
  ptucnm: number | null,
  tight_max: number,
  wide_min: number,
): PtucnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptucnm === null) return "degenerate";
  if (ptucnm >= wide_min) return "wide";
  if (ptucnm < tight_max) return "tight";
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

function renderPtucnmCell(
  pool_count: number,
  pool_cells: number,
  ptucnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtucnm(
    pool_count,
    pool_cells,
    ptucnm,
    tight_max,
    wide_min,
  );
  const ptucnmText = ptucnm === null ? "-" : ptucnm.toFixed(4);
  return `PTUCNM ${ptucnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUncentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptucnm_max, wide_ptucnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtucnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_uncentinagintic_mean, tight_ptucnm_max, wide_ptucnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtucnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_uncentinagintic_mean, tight_ptucnm_max, wide_ptucnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptucnm = (max - min) / uncentinagintic_mean where uncentinagintic_mean = ((sum x_i^101) / n)^(1/101). Reads the pool's total RANGE in units of its UNCENTINAGINTIC (power-mean-of-order-101, M_101) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.454 PTCNM because raising to the ONE-HUNDRED-AND-FIRST power lifts the anchor MORE than raising to the hundredth does. Unique DISPERSION-axis contribution extends the (harmonic..centinagintic) power-mean DUOTRIGINTASEPTUAGINTUPLET into a TRETRIGINTASEPTUAGINTUPLET with the M_101 uncentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptucnm approaches n^(1/101) so 10-partner pools cap near 1.0231, 20-partner near 1.0301, 30-partner near 1.0342, 40-partner near 1.0372, 50-partner near 1.0395, 60-partner near 1.0414, 70-partner near 1.0430, 80-partner near 1.0443, 85-partner near 1.0450, 89-partner near 1.0454 and 90-partner near 1.0456 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/101) ~= 1.0466) are required to escape into wide with a modest outlier. Composite regime labels: PTUCNM tight + PTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTUCNM 0.9208 tight -- rejoining the uniform ramp's 0.9208 for the twentieth tick in the sequence after PTCNM's 0.9210 joint bucket at M_100); PTUCNM spread + PTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUCNM 1.0128 spread -- three 4-decimal ticks below PTCNM's 1.0131); PTUCNM spread + PTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_101 ([1x99, 100] reads 1.0362 spread after M_100's 1.0367 spread landing); PTUCNM tight + PTCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_101 ([1, 100] drops to 0.9968 tight from M_100's 0.9969 landing -- one 4-decimal bucket further as the M_101 fold tips further past the range). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR uncentinagintic_mean == 0 (guarded but unreachable), tight = ptucnm &lt; ${tight_ptucnm_max}, spread = ptucnm in [${tight_ptucnm_max}, ${wide_ptucnm_min}), wide = ptucnm &ge; ${wide_ptucnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptucnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
