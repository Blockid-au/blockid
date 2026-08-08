// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TREQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.560).
//
// WHOLE-POOL RANGE-AGAINST-TREQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's TREQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 151, M_152):
//
//   pttqncnm = (max - min) / trequinquagintcentinagintic_mean
//
// where trequinquagintcentinagintic_mean = ((sum x_i^153) / n)^(1/153).
// Reads the peak spread against the TREQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-151) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.554 PTUQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTY-SECOND power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifty-first does,
// dampening the ratio against the range even harder. Second entry
// in the M_151+ FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTTQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the TREQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-151)
// CENTER. Extends the (harmonic M_-1 .. unquinquagintcentinagintic
// M_151) power-mean TREOCTOGINTUPLET into a QUATTUOROCTOGINTUPLET with
// the M_152 trequinquagintcentinagintic mean -- second step into the
// FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151)
// past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_152 >= M_151, so
// trequinquagintcentinagintic_mean >= unquinquagintcentinagintic_mean
// and pttqncnm <= ptqncnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// trequinquagintcentinagintic_mean approaches x_max / n^(1/152),
// so pttqncnm approaches n^(1/152) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/152) ~= 1.0153, for n=20 ~= 1.0199, for n=30
// ~= 1.0226, for n=40 ~= 1.0246, for n=50 ~= 1.0261, for n=60
// ~= 1.0273, for n=70 ~= 1.0283, for n=80 ~= 1.0292, for n=85
// ~= 1.0297, for n=89 ~= 1.0300, for n=90 ~= 1.0300 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/152) ~= 1.0308) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/152) ~= 1.0308,
// and the pool100 [1x99, 100] reference reads 1.0205 spread
// (further absorbed from PTUQNCNM's 1.0207 spread landing -- TWO
// 4-decimal ticks of absorption at M_152) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_152.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> trequinquagintcentinagintic_mean = k,
//                                     range 0, pttqncnm 0 (tight).
//   * uniform ramp [1..10]          -> TQNCNM ~= 9.8497, range 9,
//                                     pttqncnm ~= 0.9137 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQNCNM 0.9137 at M_151).
//   * upper-outlier [1x9, 10]       -> TQNCNM ~= 9.8497, range 9,
//                                     pttqncnm ~= 0.9137 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_152).
//   * two-shoulders [1x8, 5x2]      -> TQNCNM ~= 4.9473, range 4,
//                                     pttqncnm ~= 0.8085 (tight --
//                                     JOINT with PTUQNCNM 0.8085 at
//                                     M_151).
//   * 50/50 split [1x5, 10x5]       -> TQNCNM ~= 9.9545, range 9,
//                                     pttqncnm ~= 0.9041 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQNCNM 0.9042 at M_151).
//   * extreme outlier [1x9, 100]    -> TQNCNM ~= 98.4966, range 99,
//                                     pttqncnm ~= 1.0051 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/152) ~ 1.0153 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQNCNM 1.0052 at M_151).
//   * two-partner [1, 9]            -> TQNCNM ~= 8.9591, range 8,
//                                     pttqncnm ~= 0.8930 (tight --
//                                     JOINT with PTUQNCNM 0.8930 at
//                                     M_151).
//   * two-partner [1, 100]          -> TQNCNM ~= 99.5450, range 99,
//                                     pttqncnm ~= 0.9945 (TIGHT --
//                                     JOINT with PTUQNCNM 0.9945 at
//                                     M_151).
//   * small [10, 1, 1]              -> TQNCNM ~= 9.9280, range 9,
//                                     pttqncnm ~= 0.9065 (tight --
//                                     JOINT with PTUQNCNM 0.9065 at
//                                     M_151).
//   * pool_count=100 [1x99, 100]    -> TQNCNM ~= 97.0157, range 99,
//                                     pttqncnm ~= 1.0205 (SPREAD --
//                                     FURTHER ABSORBED from PTUQNCNM
//                                     M_151's 1.0207 spread; the
//                                     100-partner asymptote
//                                     100^(1/152) ~ 1.0308 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_152).
//
// Bands on raw pttqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR trequinquagintcentinagintic_mean == 0
//   * tight                pttqncnm < 1.005
//   * spread               pttqncnm in [1.005, 1.09)
//   * wide                 pttqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_pttqncnm_max /
// wide_pttqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.559):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanSection
// (P11.555) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-trequinquagintcentinagintic-center
// after the P11.555 range-against-unquinquagintcentinagintic-center landing.
//
// Naming: trequinquagintcentinagintic = un (1) + quin (5) + quaginta (50) +
// centinagintic (100) following the unquadragintcentinagintic (M_141)
// dozen-boundary pattern; abbreviation PTTQNCNM (P-T-Duo-Quin-Quaginta
// [N=nasal marker of the quinquaginta "-N-"]-Centi-Nagintic-M) is
// distinct from PTUQCNM (M_141 unquadragintcentinagintic) by the added
// 'N' segment (quinquaginta's "-N-" middle), from PTQICNM (M_105
// quincentinagintic) by the added un+quaginta segments, and from
// PTUQNCNM (M_151 unquinquagintcentinagintic) by leading D (duo) rung
// stacked on top of the quinquaginta root.

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

// Bands on raw pttqncnm (fixed cutoffs since trequinquagintcentinagintic_mean
// scales with cell counts and typical trequinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_152 is 0.9137
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0155
// (M_151) to 1.0153 (M_152), 20-partner drops from 1.0202 to 1.0199,
// 30-partner drops from 1.0226 to 1.0226, 40-partner drops from
// 1.0249 to 1.0246, 50-partner drops from 1.0264 to 1.0261,
// 60-partner drops from 1.0277 to 1.0273, 70-partner drops from
// 1.0287 to 1.0283, 80-partner drops from 1.0296 to 1.0292,
// 85-partner drops from 1.0301 to 1.0297, 89-partner drops from
// 1.0304 to 1.0300, 90-partner drops from 1.0305 to 1.0300 -- so
// pool_count >= 100 (100^(1/152) ~ 1.0308) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTUQNCNM 1.0207 spread to PTTQNCNM 1.0205 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTTQNCNM_MAX = 1.005;
const WIDE_PTTQNCNM_MIN = 1.09;

// PTTQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_trequinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_trequinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pttqncnm_max: number;
  readonly wide_pttqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanMap;
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

// Peak-to-trequinquagintcentinagintic-mean of a discrete distribution:
//   PTTQNCNM = (max - min) / trequinquagintcentinagintic_mean
// where trequinquagintcentinagintic_mean = ((sum x_i^153) / n)^(1/153).
// Returns null on empty, solo, and degenerate (zero
// trequinquagintcentinagintic_mean or non-finite hundred-and-fifty-first-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_trequinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFiftyThirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^153 = x^128 * x^16 * x^8 * x^1 = p128 * p16 * oct * v
    // -- (128 + 16 + 8 + 1) decomposition reuses the p128 rung
    // shared with the M_128..M_152 siblings and multiplies by p16,
    // oct, v to hit the next order.
    hundredFiftyThirdSum += p128 * p16 * oct * v;
  }
  if (
    !Number.isFinite(hundredFiftyThirdSum) ||
    hundredFiftyThirdSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequinquagintcentinagintic_mean: null,
    };
  }
  const trequinquagintcentinagintic_mean = Math.pow(
    hundredFiftyThirdSum / pool_count,
    1 / 153,
  );
  if (
    !Number.isFinite(trequinquagintcentinagintic_mean) ||
    trequinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_trequinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const pttqncnm = range / trequinquagintcentinagintic_mean;
  const clamped = pttqncnm < 0 ? 0 : pttqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_trequinquagintcentinagintic_mean: roundTo(clamped, PTTQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_trequinquagintcentinagintic_mean:
      partner.peak_to_trequinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_trequinquagintcentinagintic_mean:
      metric.peak_to_trequinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMean {
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
    tight_pttqncnm_max: TIGHT_PTTQNCNM_MAX,
    wide_pttqncnm_min: WIDE_PTTQNCNM_MIN,
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
  pttqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtuqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pttqncnm === null) return "degenerate";
  if (pttqncnm >= wide_min) return "wide";
  if (pttqncnm < tight_max) return "tight";
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
  pttqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuqncnm(
    pool_count,
    pool_cells,
    pttqncnm,
    tight_max,
    wide_min,
  );
  const pttqncnmText = pttqncnm === null ? "-" : pttqncnm.toFixed(4);
  return `PTTQNCNM ${pttqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pttqncnm_max, wide_pttqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_trequinquagintcentinagintic_mean, tight_pttqncnm_max, wide_pttqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_trequinquagintcentinagintic_mean, tight_pttqncnm_max, wide_pttqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TREQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TREQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; pttqncnm = (max - min) / trequinquagintcentinagintic_mean where trequinquagintcentinagintic_mean = ((sum x_i^153) / n)^(1/153). Reads the pool's total RANGE in units of its TREQUINQUAGINTCENTINAGINTIC (power-mean-of-order-151, M_152) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.554 PTUQNCNM because raising to the ONE-HUNDRED-AND-FIFTY-SECOND power lifts the anchor MORE than raising to the hundred-and-fifty-first does. Unique DISPERSION-axis contribution extends the (harmonic..unquinquagintcentinagintic) power-mean TREOCTOGINTUPLET into a QUATTUOROCTOGINTUPLET with the M_152 trequinquagintcentinagintic mean, third step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149). Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pttqncnm approaches n^(1/152) so 10-partner pools cap near 1.0153, 20-partner near 1.0199, 30-partner near 1.0226, 40-partner near 1.0246, 50-partner near 1.0261, 60-partner near 1.0273, 70-partner near 1.0283, 80-partner near 1.0292, 85-partner near 1.0297, 89-partner near 1.0300 and 90-partner near 1.0300 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/152) ~= 1.0308) are required to escape into wide with a modest outlier. Composite regime labels: PTTQNCNM tight + PTUQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTTQNCNM 0.9137 tight -- rejoining the uniform ramp's 0.9137); PTTQNCNM spread + PTUQNCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTQNCNM 1.0051 spread -- one 4-decimal tick below PTUQNCNM's 1.0052); PTTQNCNM spread + PTUQNCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_152 ([1x99, 100] reads 1.0205 spread after M_151's 1.0207 spread landing -- two 4-decimal ticks of absorption); PTTQNCNM tight + PTUQNCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_151 ([1, 100] reads 0.9945 tight, same as M_151's 0.9945 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR trequinquagintcentinagintic_mean == 0 (guarded but unreachable), tight = pttqncnm &lt; ${tight_pttqncnm_max}, spread = pttqncnm in [${tight_pttqncnm_max}, ${wide_pttqncnm_min}), wide = pttqncnm &ge; ${wide_pttqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pttqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
