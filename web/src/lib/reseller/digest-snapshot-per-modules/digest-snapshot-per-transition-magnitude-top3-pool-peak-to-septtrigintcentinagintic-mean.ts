// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTTRIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.528).
//
// WHOLE-POOL RANGE-AGAINST-SEPTTRIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SEPTTRIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 137, M_137):
//
//   ptsptcnm = (max - min) / septtrigintcentinagintic_mean
//
// where septtrigintcentinagintic_mean = ((sum x_i^137) / n)^(1/137).
// Reads the peak spread against the SEPTTRIGINTCENTINAGINTIC
// (power-mean-of-order-137) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.526 PTSTCNM, because raising to
// the ONE-HUNDRED-AND-THIRTY-SEVENTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-thirty-sixth does,
// dampening the ratio against the range even harder.
//
// PTSPTCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTTRIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-137) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108, novecentinagintic M_109,
// decicentinagintic M_110, undecicentinagintic M_111,
// duodecicentinagintic M_112, tredecicentinagintic M_113,
// quattuordecicentinagintic M_114, quindecicentinagintic M_115,
// sedecicentinagintic M_116, septdecicentinagintic M_117,
// octodecicentinagintic M_118, novedecicentinagintic M_119,
// vigintcentinagintic M_120, unvigintcentinagintic M_121,
// duovigintcentinagintic M_122, trevigintcentinagintic M_123,
// quattuorvigintcentinagintic M_124, quinvigintcentinagintic M_125,
// sesvigintcentinagintic M_126, septvigintcentinagintic M_127,
// octvigintcentinagintic M_128, novemvigintcentinagintic M_129,
// trigintcentinagintic M_130, untrigintcentinagintic M_131,
// duotrigintcentinagintic M_132, tretrigintcentinagintic M_133,
// quattuortrigintcentinagintic M_134,
// quintrigintcentinagintic M_135,
// sestrigintcentinagintic M_136) power-mean
// OCTOSEXAGINTASEPTUAGINTUPLET into a
// NOVEMSEXAGINTASEPTUAGINTUPLET with the M_137
// septtrigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_137 >= M_136, so
// septtrigintcentinagintic_mean >= sestrigintcentinagintic_mean
// and ptsptcnm <= ptstcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septtrigintcentinagintic_mean approaches x_max / n^(1/137), so
// ptsptcnm approaches n^(1/137) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/137) ~= 1.0169, for n=20 ~= 1.0221, for n=30 ~= 1.0251,
// for n=40 ~= 1.0273, for n=50 ~= 1.0290, for n=60 ~= 1.0303,
// for n=70 ~= 1.0315, for n=80 ~= 1.0325, for n=85 ~= 1.0330,
// for n=89 ~= 1.0333, for n=90 ~= 1.0334 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/137) ~= 1.0342)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/137) ~= 1.0342, and the pool100
// [1x99, 100] reference reads 1.0238 spread (further absorbed
// from PTSTCNM's 1.0241 spread landing -- THREE 4-decimal ticks of
// absorption) because the asymptote gap at n=100 has narrowed further
// and the [1x99, 100] pool sits deeper inside the spread band at
// M_137.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septtrigintcentinagintic_mean = k,
//                                     range 0, ptsptcnm 0 (tight).
//   * uniform ramp [1..10]          -> SPTCNM ~= 9.8333, range 9,
//                                     ptsptcnm ~= 0.9153 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSTCNM 0.9154 at M_136).
//   * upper-outlier [1x9, 10]       -> SPTCNM ~= 9.8333, range 9,
//                                     ptsptcnm ~= 0.9153 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_137;
//                                     the M_136 joint collapse at
//                                     0.9154 persists at M_137 as a
//                                     joint 0.9153 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/137) ~ 9.8333 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> SPTCNM ~= 4.9416, range 4,
//                                     ptsptcnm ~= 0.8095 (tight --
//                                     JOINT with PTSTCNM 0.8095 at
//                                     M_136).
//   * 50/50 split [1x5, 10x5]       -> SPTCNM ~= 9.9495, range 9,
//                                     ptsptcnm ~= 0.9046 (tight --
//                                     JOINT with PTSTCNM 0.9046 at
//                                     M_136).
//   * extreme outlier [1x9, 100]    -> SPTCNM ~= 98.3333, range 99,
//                                     ptsptcnm ~= 1.0068 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/137) ~ 1.0169 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTSTCNM 1.0069 at M_136).
//   * two-partner [1, 9]            -> SPTCNM ~= 8.9546, range 8,
//                                     ptsptcnm ~= 0.8934 (tight --
//                                     JOINT with PTSTCNM 0.8934 at
//                                     M_136).
//   * two-partner [1, 100]          -> SPTCNM ~= 99.4953, range 99,
//                                     ptsptcnm ~= 0.9950 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal tick from
//                                     PTSTCNM 0.9951 at M_136).
//   * small [10, 1, 1]              -> SPTCNM ~= 9.9201, range 9,
//                                     ptsptcnm ~= 0.9072 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTSTCNM 0.9073 at M_136).
//   * pool_count=100 [1x99, 100]    -> SPTCNM ~= 96.6944, range 99,
//                                     ptsptcnm ~= 1.0238 (SPREAD --
//                                     FURTHER ABSORBED from PTSTCNM
//                                     M_136's 1.0241 spread; the
//                                     100-partner asymptote
//                                     100^(1/137) ~ 1.0342 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_137 extends
//                                     the compression trend landed at
//                                     pool_count=100 across the recent
//                                     triple-digit family).
//
// Bands on raw ptsptcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septtrigintcentinagintic_mean == 0
//   * tight                ptsptcnm < 1.005
//   * spread               ptsptcnm in [1.005, 1.09)
//   * wide                 ptsptcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsptcnm_max /
// wide_ptsptcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.529):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSestrigintcentinaginticMeanSection
// (P11.527) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septtrigintcentinagintic-center
// after the P11.527 range-against-sestrigintcentinagintic-center landing.
//
// Naming: septtrigintcentinagintic = sept (7) + trigint (30) +
// centinagintic (100) following the septvigintcentinagintic (M_127)
// systematic pattern; abbreviation PTSPTCNM (P-T-Sept-Trigint-Centi-
// Nagintic-M) is distinct from PTSTCNM (M_136 sestrigintcentinagintic)
// by the extra 'P' for the 'sept' prefix (matching PTSPVCNM at M_127
// vs PTSVCNM at M_126).

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
type PtsptcnmLabel =
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

// Bands on raw ptsptcnm (fixed cutoffs since septtrigintcentinagintic_mean
// scales with cell counts and typical septtrigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_137 is 0.9153
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0171
// (M_136) to 1.0169 (M_137), 20-partner drops from 1.0223 to 1.0221,
// 30-partner drops from 1.0253 to 1.0251, 40-partner drops from
// 1.0275 to 1.0273, 50-partner drops from 1.0292 to 1.0290,
// 60-partner drops from 1.0306 to 1.0303, 70-partner drops from
// 1.0317 to 1.0315, 80-partner drops from 1.0327 to 1.0325,
// 85-partner drops from 1.0332 to 1.0330, 89-partner drops from
// 1.0336 to 1.0333, 90-partner drops from 1.0336 to 1.0334 -- so
// pool_count >= 100 (100^(1/137) ~ 1.0342) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSTCNM 1.0241 spread to PTSPTCNM 1.0238 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSPTCNM_MAX = 1.005;
const WIDE_PTSPTCNM_MIN = 1.09;

// PTSPTCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPTCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septtrigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septtrigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsptcnm_max: number;
  readonly wide_ptsptcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanMap;
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

// Peak-to-septtrigintcentinagintic-mean of a discrete distribution:
//   PTSPTCNM = (max - min) / septtrigintcentinagintic_mean
// where septtrigintcentinagintic_mean = ((sum x_i^137) / n)^(1/137).
// Returns null on empty, solo, and degenerate (zero
// septtrigintcentinagintic_mean or non-finite hundred-and-thirty-seventh-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septtrigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septtrigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septtrigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septtrigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredThirtySeventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^137 = x^128 * x^8 * x = p128 * oct * v -- (128 + 8 + 1)
    // decomposition so the fold reuses the p128 rung shared with the
    // M_128..M_136 siblings and multiplies by oct * v to hit the next
    // order.
    hundredThirtySeventhSum += p128 * oct * v;
  }
  if (
    !Number.isFinite(hundredThirtySeventhSum) ||
    hundredThirtySeventhSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septtrigintcentinagintic_mean: null,
    };
  }
  const septtrigintcentinagintic_mean = Math.pow(
    hundredThirtySeventhSum / pool_count,
    1 / 137,
  );
  if (
    !Number.isFinite(septtrigintcentinagintic_mean) ||
    septtrigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septtrigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsptcnm = range / septtrigintcentinagintic_mean;
  const clamped = ptsptcnm < 0 ? 0 : ptsptcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_septtrigintcentinagintic_mean: roundTo(clamped, PTSPTCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septtrigintcentinagintic_mean:
      partner.peak_to_septtrigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septtrigintcentinagintic_mean:
      metric.peak_to_septtrigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMean {
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
    tight_ptsptcnm_max: TIGHT_PTSPTCNM_MAX,
    wide_ptsptcnm_min: WIDE_PTSPTCNM_MIN,
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

function labelForPtsptcnm(
  pool_count: number,
  pool_cells: number,
  ptsptcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtsptcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsptcnm === null) return "degenerate";
  if (ptsptcnm >= wide_min) return "wide";
  if (ptsptcnm < tight_max) return "tight";
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

function renderPtsptcnmCell(
  pool_count: number,
  pool_cells: number,
  ptsptcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsptcnm(
    pool_count,
    pool_cells,
    ptsptcnm,
    tight_max,
    wide_min,
  );
  const ptsptcnmText = ptsptcnm === null ? "-" : ptsptcnm.toFixed(4);
  return `PTSPTCNM ${ptsptcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSepttrigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsptcnm_max, wide_ptsptcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsptcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septtrigintcentinagintic_mean, tight_ptsptcnm_max, wide_ptsptcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsptcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septtrigintcentinagintic_mean, tight_ptsptcnm_max, wide_ptsptcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTTRIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTTRIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsptcnm = (max - min) / septtrigintcentinagintic_mean where septtrigintcentinagintic_mean = ((sum x_i^137) / n)^(1/137). Reads the pool's total RANGE in units of its SEPTTRIGINTCENTINAGINTIC (power-mean-of-order-137, M_137) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.526 PTSTCNM because raising to the ONE-HUNDRED-AND-THIRTY-SEVENTH power lifts the anchor MORE than raising to the hundred-and-thirty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sestrigintcentinagintic) power-mean OCTOSEXAGINTASEPTUAGINTUPLET into a NOVEMSEXAGINTASEPTUAGINTUPLET with the M_137 septtrigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsptcnm approaches n^(1/137) so 10-partner pools cap near 1.0169, 20-partner near 1.0221, 30-partner near 1.0251, 40-partner near 1.0273, 50-partner near 1.0290, 60-partner near 1.0303, 70-partner near 1.0315, 80-partner near 1.0325, 85-partner near 1.0330, 89-partner near 1.0333 and 90-partner near 1.0334 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/137) ~= 1.0342) are required to escape into wide with a modest outlier. Composite regime labels: PTSPTCNM tight + PTSTCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPTCNM 0.9153 tight -- rejoining the uniform ramp's 0.9153 for the fifty-sixth tick in the sequence after PTSTCNM's 0.9154 joint bucket at M_136); PTSPTCNM spread + PTSTCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPTCNM 1.0068 spread -- one 4-decimal tick below PTSTCNM's 1.0069); PTSPTCNM spread + PTSTCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_137 ([1x99, 100] reads 1.0238 spread after M_136's 1.0241 spread landing); PTSPTCNM tight + PTSTCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one tick at M_137 ([1, 100] reads 0.9950 tight one tick below M_136's 0.9951 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septtrigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptsptcnm &lt; ${tight_ptsptcnm_max}, spread = ptsptcnm in [${tight_ptsptcnm_max}, ${wide_ptsptcnm_min}), wide = ptsptcnm &ge; ${wide_ptsptcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsptcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPTCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPTCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
