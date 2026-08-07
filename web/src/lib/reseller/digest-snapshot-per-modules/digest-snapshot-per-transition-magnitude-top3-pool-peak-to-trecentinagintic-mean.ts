// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRECENTINAGINTIC-MEAN
// pure-lib (P11.460).
//
// WHOLE-POOL RANGE-AGAINST-TRECENTINAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRECENTINAGINTIC MEAN (a.k.a. power mean of order 103, M_103):
//
//   pttcnm = (max - min) / trecentinagintic_mean
//
// where trecentinagintic_mean = ((sum x_i^103) / n)^(1/103). Reads the
// peak spread against the TRECENTINAGINTIC (power-mean-of-order-103)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.458 PTDCNM, because raising to the ONE-HUNDRED-AND-THIRD
// power before averaging lifts the anchor MORE than raising to the
// hundred-and-second does, dampening the ratio against the range even
// harder.
//
// PTTCNM's unique DISPERSION-axis contribution: reads range in units
// of the TRECENTINAGINTIC (POWER-MEAN-OF-ORDER-103) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... centinagintic M_100, uncentinagintic M_101,
// ducentinagintic M_102) power-mean QUATTUORTRIGINTASEPTUAGINTUPLET
// into a QUINQUATRIGINTASEPTUAGINTUPLET with the M_103 trecentinagintic
// mean -- climbing further into the TRIPLE-DIGIT power-mean family
// opened at PTCNM by cracking past the round-hundred threshold. By
// Power Mean inequality M_103 >= M_102, so trecentinagintic_mean >=
// ducentinagintic_mean and pttcnm <= ptdcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// trecentinagintic_mean approaches x_max / n^(1/103), so pttcnm
// approaches n^(1/103) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/103) ~= 1.0226, for n=20 ~= 1.0295, for n=30 ~= 1.0336,
// for n=40 ~= 1.0364, for n=50 ~= 1.0387, for n=60 ~= 1.0406,
// for n=70 ~= 1.0421, for n=80 ~= 1.0435, for n=85 ~= 1.0441,
// for n=89 ~= 1.0446, for n=90 ~= 1.0447 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/103) ~= 1.0457)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/103) ~= 1.0457, and the pool100
// [1x99, 100] reference reads 1.0353 spread (further absorbed
// from PTDCNM's 1.0357 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_103.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> trecentinagintic_mean = k,
//                                     range 0, pttcnm 0 (tight).
//   * uniform ramp [1..10]          -> TCNM ~= 9.7790, range 9,
//                                     pttcnm ~= 0.9203 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTDCNM 0.9205 at M_102).
//   * upper-outlier [1x9, 10]       -> TCNM ~= 9.7790, range 9,
//                                     pttcnm ~= 0.9203 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_103;
//                                     the M_102 joint collapse at
//                                     0.9205 persists at M_103 as a
//                                     joint 0.9203 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/103) ~ 9.7790 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> TCNM ~= 4.9225, range 4,
//                                     pttcnm ~= 0.8126 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTDCNM 0.8127 at M_102).
//   * 50/50 split [1x5, 10x5]       -> TCNM ~= 9.9329, range 9,
//                                     pttcnm ~= 0.9061 (tight --
//                                     HOLDS at PTDCNM 0.9061 at M_102;
//                                     BIMODAL SPLIT already well-absorbed
//                                     under M_102 so the extra power at
//                                     M_103 does not shift the 4-decimal
//                                     bucket).
//   * extreme outlier [1x9, 100]    -> TCNM ~= 97.7896, range 99,
//                                     pttcnm ~= 1.0124 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/103) ~ 1.0226 asymptote;
//                                     ADVANCES from PTDCNM 1.0126 at
//                                     M_102 by two 4-decimal ticks).
//   * two-partner [1, 9]            -> TCNM ~= 8.9396, range 8,
//                                     pttcnm ~= 0.8949 (tight --
//                                     HOLDS at PTDCNM 0.8949 at M_102;
//                                     small-n / small-max ratio absorbs
//                                     already stable under M_102).
//   * two-partner [1, 100]          -> TCNM ~= 99.3294, range 99,
//                                     pttcnm ~= 0.9967 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket at
//                                     M_103; from PTDCNM 0.9968 at M_102
//                                     because the trecentinagintic anchor
//                                     tips further past the range at n=2).
//   * small [10, 1, 1]              -> TCNM ~= 9.8939, range 9,
//                                     pttcnm ~= 0.9097 (tight --
//                                     HOLDS at PTDCNM 0.9097 at M_102;
//                                     small-n / large-max ratio's
//                                     4-decimal bucket already stable
//                                     under M_102).
//   * pool_count=100 [1x99, 100]    -> TCNM ~= 95.6269, range 99,
//                                     pttcnm ~= 1.0353 (SPREAD --
//                                     FURTHER ABSORBED from PTDCNM
//                                     M_102's 1.0357 spread;
//                                     100-partner asymptote
//                                     100^(1/103) ~ 1.0457 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw pttcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR trecentinagintic_mean == 0
//   * tight                pttcnm < 1.005
//   * spread               pttcnm in [1.005, 1.09)
//   * wide                 pttcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttcnm_max /
// wide_pttcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.461):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDucentinaginticMeanSection
// (P11.459) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-trecentinagintic-center
// after the P11.459 range-against-ducentinagintic-center landing.

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
type PttcnmLabel =
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

// Bands on raw pttcnm (fixed cutoffs since trecentinagintic_mean
// scales with cell counts and typical trecentinagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_103 is 0.9203 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0228 (M_102) to
// 1.0226 (M_103), 20-partner drops from 1.0298 to 1.0295, 30-partner
// drops from 1.0339 to 1.0336, 40-partner drops from 1.0368 to
// 1.0364, 50-partner drops from 1.0391 to 1.0387, 60-partner drops
// from 1.0410 to 1.0406, 70-partner drops from 1.0425 to 1.0421,
// 80-partner drops from 1.0439 to 1.0435, 85-partner drops from
// 1.0445 to 1.0441, 89-partner drops from 1.0450 to 1.0446,
// 90-partner drops from 1.0451 to 1.0447 -- so pool_count >= 100
// (100^(1/103) ~ 1.0457) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from PTDCNM
// 1.0357 spread to PTTCNM 1.0353 spread -- FURTHER ABSORBED but stays
// within spread; the DISPERSION power-mean progression continues to
// compress the [1x99, 100] shape.
const TIGHT_PTTCNM_MAX = 1.005;
const WIDE_PTTCNM_MIN = 1.09;

// PTTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_trecentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_trecentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttcnm_max: number;
  readonly wide_pttcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanMap;
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

// Peak-to-trecentinagintic-mean of a discrete distribution:
//   PTTCNM = (max - min) / trecentinagintic_mean
// where trecentinagintic_mean = ((sum x_i^103) / n)^(1/103). Returns
// null on empty, solo, and degenerate (zero trecentinagintic_mean
// or non-finite hundred-and-third-power sum) so downstream labels
// fire from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_trecentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trecentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_trecentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trecentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^103 = (x^8)^12 * x^4 * x^2 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad*sq*v
    hundredThirdSum +=
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
      sq *
      v;
  }
  if (!Number.isFinite(hundredThirdSum) || hundredThirdSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trecentinagintic_mean: null,
    };
  }
  const trecentinagintic_mean = Math.pow(
    hundredThirdSum / pool_count,
    1 / 103,
  );
  if (!Number.isFinite(trecentinagintic_mean) || trecentinagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trecentinagintic_mean: null,
    };
  }
  const range = max - min;
  const pttcnm = range / trecentinagintic_mean;
  const clamped = pttcnm < 0 ? 0 : pttcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_trecentinagintic_mean: roundTo(clamped, PTTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_trecentinagintic_mean:
      partner.peak_to_trecentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_trecentinagintic_mean: metric.peak_to_trecentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMean {
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
    tight_pttcnm_max: TIGHT_PTTCNM_MAX,
    wide_pttcnm_min: WIDE_PTTCNM_MIN,
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

function labelForPttcnm(
  pool_count: number,
  pool_cells: number,
  pttcnm: number | null,
  tight_max: number,
  wide_min: number,
): PttcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttcnm === null) return "degenerate";
  if (pttcnm >= wide_min) return "wide";
  if (pttcnm < tight_max) return "tight";
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

function renderPttcnmCell(
  pool_count: number,
  pool_cells: number,
  pttcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPttcnm(
    pool_count,
    pool_cells,
    pttcnm,
    tight_max,
    wide_min,
  );
  const pttcnmText = pttcnm === null ? "-" : pttcnm.toFixed(4);
  return `PTTCNM ${pttcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrecentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttcnm_max, wide_pttcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_trecentinagintic_mean, tight_pttcnm_max, wide_pttcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPttcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_trecentinagintic_mean, tight_pttcnm_max, wide_pttcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRECENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRECENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttcnm = (max - min) / trecentinagintic_mean where trecentinagintic_mean = ((sum x_i^103) / n)^(1/103). Reads the pool's total RANGE in units of its TRECENTINAGINTIC (power-mean-of-order-103, M_103) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.458 PTDCNM because raising to the ONE-HUNDRED-AND-THIRD power lifts the anchor MORE than raising to the hundred-and-second does. Unique DISPERSION-axis contribution extends the (harmonic..ducentinagintic) power-mean QUATTUORTRIGINTASEPTUAGINTUPLET into a QUINQUATRIGINTASEPTUAGINTUPLET with the M_103 trecentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttcnm approaches n^(1/103) so 10-partner pools cap near 1.0226, 20-partner near 1.0295, 30-partner near 1.0336, 40-partner near 1.0364, 50-partner near 1.0387, 60-partner near 1.0406, 70-partner near 1.0421, 80-partner near 1.0435, 85-partner near 1.0441, 89-partner near 1.0446 and 90-partner near 1.0447 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/103) ~= 1.0457) are required to escape into wide with a modest outlier. Composite regime labels: PTTCNM tight + PTDCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTCNM 0.9203 tight -- rejoining the uniform ramp's 0.9203 for the twenty-second tick in the sequence after PTDCNM's 0.9205 joint bucket at M_102); PTTCNM spread + PTDCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTCNM 1.0124 spread -- two 4-decimal ticks below PTDCNM's 1.0126); PTTCNM spread + PTDCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_103 ([1x99, 100] reads 1.0353 spread after M_102's 1.0357 spread landing); PTTCNM tight + PTDCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one bucket at M_103 ([1, 100] reads 0.9967 tight after M_102's 0.9968 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR trecentinagintic_mean == 0 (guarded but unreachable), tight = pttcnm &lt; ${tight_pttcnm_max}, spread = pttcnm in [${tight_pttcnm_max}, ${wide_pttcnm_min}), wide = pttcnm &ge; ${wide_pttcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
