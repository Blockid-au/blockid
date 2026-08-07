// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUCENTINAGINTIC-MEAN
// pure-lib (P11.458).
//
// WHOLE-POOL RANGE-AGAINST-DUCENTINAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's DUCENTINAGINTIC MEAN (a.k.a. power mean of order 102, M_102):
//
//   ptdcnm = (max - min) / ducentinagintic_mean
//
// where ducentinagintic_mean = ((sum x_i^102) / n)^(1/102). Reads the
// peak spread against the DUCENTINAGINTIC (power-mean-of-order-102)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.456 PTUCNM, because raising to the ONE-HUNDRED-AND-SECOND
// power before averaging lifts the anchor MORE than raising to the
// hundred-and-first does, dampening the ratio against the range even
// harder.
//
// PTDCNM's unique DISPERSION-axis contribution: reads range in units
// of the DUCENTINAGINTIC (POWER-MEAN-OF-ORDER-102) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... novenonagintic M_99, centinagintic M_100,
// uncentinagintic M_101) power-mean TRETRIGINTASEPTUAGINTUPLET into
// a QUATTUORTRIGINTASEPTUAGINTUPLET with the M_102 ducentinagintic
// mean -- climbing further into the TRIPLE-DIGIT power-mean family
// opened at PTCNM by cracking past the round-hundred threshold. By
// Power Mean inequality M_102 >= M_101, so ducentinagintic_mean >=
// uncentinagintic_mean and ptdcnm <= ptucnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// ducentinagintic_mean approaches x_max / n^(1/102), so ptdcnm
// approaches n^(1/102) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/102) ~= 1.0228, for n=20 ~= 1.0298, for n=30 ~= 1.0339,
// for n=40 ~= 1.0368, for n=50 ~= 1.0391, for n=60 ~= 1.0410,
// for n=70 ~= 1.0425, for n=80 ~= 1.0439, for n=85 ~= 1.0445,
// for n=89 ~= 1.0450, for n=90 ~= 1.0451 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/102) ~= 1.0462)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/102) ~= 1.0462, and the pool100
// [1x99, 100] reference reads 1.0357 spread (further absorbed
// from PTUCNM's 1.0362 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_102.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> ducentinagintic_mean = k,
//                                     range 0, ptdcnm 0 (tight).
//   * uniform ramp [1..10]          -> DCNM ~= 9.7768, range 9,
//                                     ptdcnm ~= 0.9205 (tight --
//                                     ADVANCES three 4-decimal ticks
//                                     from PTUCNM 0.9208 at M_101).
//   * upper-outlier [1x9, 10]       -> DCNM ~= 9.7768, range 9,
//                                     ptdcnm ~= 0.9205 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_102;
//                                     the M_101 joint collapse at
//                                     0.9208 persists at M_102 as a
//                                     joint 0.9205 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/102) ~ 9.7768 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> DCNM ~= 4.9217, range 4,
//                                     ptdcnm ~= 0.8127 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTUCNM 0.8129 at M_101).
//   * 50/50 split [1x5, 10x5]       -> DCNM ~= 9.9323, range 9,
//                                     ptdcnm ~= 0.9061 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUCNM 0.9062 at M_101).
//   * extreme outlier [1x9, 100]    -> DCNM ~= 97.7679, range 99,
//                                     ptdcnm ~= 1.0126 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/102) ~ 1.0228 asymptote;
//                                     ADVANCES from PTUCNM 1.0128 at
//                                     M_101 by two 4-decimal ticks).
//   * two-partner [1, 9]            -> DCNM ~= 8.9390, range 8,
//                                     ptdcnm ~= 0.8949 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUCNM 0.8950 at M_101).
//   * two-partner [1, 100]          -> DCNM ~= 99.3227, range 99,
//                                     ptdcnm ~= 0.9968 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     HOLDS at M_102; stays at the
//                                     same 0.9968 4-decimal bucket
//                                     as PTUCNM at M_101 because the
//                                     ducentinagintic anchor already
//                                     tips well past the range at
//                                     n=2).
//   * small [10, 1, 1]              -> DCNM ~= 9.8929, range 9,
//                                     ptdcnm ~= 0.9097 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTUCNM 0.9098 at M_101).
//   * pool_count=100 [1x99, 100]    -> DCNM ~= 95.5855, range 99,
//                                     ptdcnm ~= 1.0357 (SPREAD --
//                                     FURTHER ABSORBED from PTUCNM
//                                     M_101's 1.0362 spread;
//                                     100-partner asymptote
//                                     100^(1/102) ~ 1.0462 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptdcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR ducentinagintic_mean == 0
//   * tight                ptdcnm < 1.005
//   * spread               ptdcnm in [1.005, 1.09)
//   * wide                 ptdcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdcnm_max /
// wide_ptdcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.459):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUncentinaginticMeanSection
// (P11.457) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-ducentinagintic-center
// after the P11.457 range-against-uncentinagintic-center landing.

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
type PtdcnmLabel =
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

// Bands on raw ptdcnm (fixed cutoffs since ducentinagintic_mean
// scales with cell counts and typical ducentinagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_102 is 0.9205 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0231 (M_101) to
// 1.0228 (M_102), 20-partner drops from 1.0301 to 1.0298, 30-partner
// drops from 1.0342 to 1.0339, 40-partner drops from 1.0372 to
// 1.0368, 50-partner drops from 1.0395 to 1.0391, 60-partner drops
// from 1.0414 to 1.0410, 70-partner drops from 1.0430 to 1.0425,
// 80-partner drops from 1.0443 to 1.0439, 85-partner drops from
// 1.0450 to 1.0445, 89-partner drops from 1.0454 to 1.0450,
// 90-partner drops from 1.0456 to 1.0451 -- so pool_count >= 100
// (100^(1/102) ~ 1.0462) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTUCNM
// 1.0362 spread to PTDCNM 1.0357 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTDCNM_MAX = 1.005;
const WIDE_PTDCNM_MIN = 1.09;

// PTDCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_ducentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_ducentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDucentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdcnm_max: number;
  readonly wide_ptdcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanMap;
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

// Peak-to-ducentinagintic-mean of a discrete distribution:
//   PTDCNM = (max - min) / ducentinagintic_mean
// where ducentinagintic_mean = ((sum x_i^102) / n)^(1/102). Returns
// null on empty, solo, and degenerate (zero ducentinagintic_mean
// or non-finite hundred-and-second-power sum) so downstream labels
// fire from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_ducentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_ducentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_ducentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_ducentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^102 = (x^8)^12 * x^4 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad*sq
    hundredSecondSum +=
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
      sq;
  }
  if (!Number.isFinite(hundredSecondSum) || hundredSecondSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_ducentinagintic_mean: null,
    };
  }
  const ducentinagintic_mean = Math.pow(
    hundredSecondSum / pool_count,
    1 / 102,
  );
  if (!Number.isFinite(ducentinagintic_mean) || ducentinagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_ducentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdcnm = range / ducentinagintic_mean;
  const clamped = ptdcnm < 0 ? 0 : ptdcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_ducentinagintic_mean: roundTo(clamped, PTDCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_ducentinagintic_mean:
      partner.peak_to_ducentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_ducentinagintic_mean: metric.peak_to_ducentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDucentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDucentinaginticMean {
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
    tight_ptdcnm_max: TIGHT_PTDCNM_MAX,
    wide_ptdcnm_min: WIDE_PTDCNM_MIN,
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

function labelForPtdcnm(
  pool_count: number,
  pool_cells: number,
  ptdcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtdcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdcnm === null) return "degenerate";
  if (ptdcnm >= wide_min) return "wide";
  if (ptdcnm < tight_max) return "tight";
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

function renderPtdcnmCell(
  pool_count: number,
  pool_cells: number,
  ptdcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdcnm(
    pool_count,
    pool_cells,
    ptdcnm,
    tight_max,
    wide_min,
  );
  const ptdcnmText = ptdcnm === null ? "-" : ptdcnm.toFixed(4);
  return `PTDCNM ${ptdcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDucentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdcnm_max, wide_ptdcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_ducentinagintic_mean, tight_ptdcnm_max, wide_ptdcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_ducentinagintic_mean, tight_ptdcnm_max, wide_ptdcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdcnm = (max - min) / ducentinagintic_mean where ducentinagintic_mean = ((sum x_i^102) / n)^(1/102). Reads the pool's total RANGE in units of its DUCENTINAGINTIC (power-mean-of-order-102, M_102) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.456 PTUCNM because raising to the ONE-HUNDRED-AND-SECOND power lifts the anchor MORE than raising to the hundred-and-first does. Unique DISPERSION-axis contribution extends the (harmonic..uncentinagintic) power-mean TRETRIGINTASEPTUAGINTUPLET into a QUATTUORTRIGINTASEPTUAGINTUPLET with the M_102 ducentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdcnm approaches n^(1/102) so 10-partner pools cap near 1.0228, 20-partner near 1.0298, 30-partner near 1.0339, 40-partner near 1.0368, 50-partner near 1.0391, 60-partner near 1.0410, 70-partner near 1.0425, 80-partner near 1.0439, 85-partner near 1.0445, 89-partner near 1.0450 and 90-partner near 1.0451 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/102) ~= 1.0462) are required to escape into wide with a modest outlier. Composite regime labels: PTDCNM tight + PTUCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDCNM 0.9205 tight -- rejoining the uniform ramp's 0.9205 for the twenty-first tick in the sequence after PTUCNM's 0.9208 joint bucket at M_101); PTDCNM spread + PTUCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDCNM 1.0126 spread -- two 4-decimal ticks below PTUCNM's 1.0128); PTDCNM spread + PTUCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_102 ([1x99, 100] reads 1.0357 spread after M_101's 1.0362 spread landing); PTDCNM tight + PTUCNM tight = ISOLATED HIGH PARTNER absorption HOLDS at M_102 ([1, 100] stays at 0.9968 tight matching M_101's landing -- ducentinagintic anchor already tipping past the range at n=2 leaves the 4-decimal bucket stable). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR ducentinagintic_mean == 0 (guarded but unreachable), tight = ptdcnm &lt; ${tight_ptdcnm_max}, spread = ptdcnm in [${tight_ptdcnm_max}, ${wide_ptdcnm_min}), wide = ptdcnm &ge; ${wide_ptdcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
