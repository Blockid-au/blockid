// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.558).
//
// WHOLE-POOL RANGE-AGAINST-DUOQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's DUOQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 151, M_152):
//
//   ptdqncnm = (max - min) / duoquinquagintcentinagintic_mean
//
// where duoquinquagintcentinagintic_mean = ((sum x_i^152) / n)^(1/152).
// Reads the peak spread against the DUOQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-151) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.554 PTUQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTY-SECOND power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifty-first does,
// dampening the ratio against the range even harder. Second entry
// in the M_151+ FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTDQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the DUOQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-151)
// CENTER. Extends the (harmonic M_-1 .. unquinquagintcentinagintic
// M_151) power-mean TREOCTOGINTUPLET into a QUATTUOROCTOGINTUPLET with
// the M_152 duoquinquagintcentinagintic mean -- second step into the
// FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151)
// past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_152 >= M_151, so
// duoquinquagintcentinagintic_mean >= unquinquagintcentinagintic_mean
// and ptdqncnm <= ptqncnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duoquinquagintcentinagintic_mean approaches x_max / n^(1/152),
// so ptdqncnm approaches n^(1/152) as x_max -> +Inf. For n=10 the
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
//   * flat [k,k,...,k]              -> duoquinquagintcentinagintic_mean = k,
//                                     range 0, ptdqncnm 0 (tight).
//   * uniform ramp [1..10]          -> DQNCNM ~= 9.8497, range 9,
//                                     ptdqncnm ~= 0.9137 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQNCNM 0.9137 at M_151).
//   * upper-outlier [1x9, 10]       -> DQNCNM ~= 9.8497, range 9,
//                                     ptdqncnm ~= 0.9137 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_152).
//   * two-shoulders [1x8, 5x2]      -> DQNCNM ~= 4.9473, range 4,
//                                     ptdqncnm ~= 0.8085 (tight --
//                                     JOINT with PTUQNCNM 0.8085 at
//                                     M_151).
//   * 50/50 split [1x5, 10x5]       -> DQNCNM ~= 9.9545, range 9,
//                                     ptdqncnm ~= 0.9041 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQNCNM 0.9042 at M_151).
//   * extreme outlier [1x9, 100]    -> DQNCNM ~= 98.4966, range 99,
//                                     ptdqncnm ~= 1.0051 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/152) ~ 1.0153 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTUQNCNM 1.0052 at M_151).
//   * two-partner [1, 9]            -> DQNCNM ~= 8.9591, range 8,
//                                     ptdqncnm ~= 0.8930 (tight --
//                                     JOINT with PTUQNCNM 0.8930 at
//                                     M_151).
//   * two-partner [1, 100]          -> DQNCNM ~= 99.5450, range 99,
//                                     ptdqncnm ~= 0.9945 (TIGHT --
//                                     JOINT with PTUQNCNM 0.9945 at
//                                     M_151).
//   * small [10, 1, 1]              -> DQNCNM ~= 9.9280, range 9,
//                                     ptdqncnm ~= 0.9065 (tight --
//                                     JOINT with PTUQNCNM 0.9065 at
//                                     M_151).
//   * pool_count=100 [1x99, 100]    -> DQNCNM ~= 97.0157, range 99,
//                                     ptdqncnm ~= 1.0205 (SPREAD --
//                                     FURTHER ABSORBED from PTUQNCNM
//                                     M_151's 1.0207 spread; the
//                                     100-partner asymptote
//                                     100^(1/152) ~ 1.0308 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_152).
//
// Bands on raw ptdqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duoquinquagintcentinagintic_mean == 0
//   * tight                ptdqncnm < 1.005
//   * spread               ptdqncnm in [1.005, 1.09)
//   * wide                 ptdqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptdqncnm_max /
// wide_ptdqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.559):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanSection
// (P11.555) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duoquinquagintcentinagintic-center
// after the P11.555 range-against-unquinquagintcentinagintic-center landing.
//
// Naming: duoquinquagintcentinagintic = un (1) + quin (5) + quaginta (50) +
// centinagintic (100) following the unquadragintcentinagintic (M_141)
// dozen-boundary pattern; abbreviation PTDQNCNM (P-T-Duo-Quin-Quaginta
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

// Bands on raw ptdqncnm (fixed cutoffs since duoquinquagintcentinagintic_mean
// scales with cell counts and typical duoquinquagintcentinagintic-center
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
// drops from PTUQNCNM 1.0207 spread to PTDQNCNM 1.0205 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTDQNCNM_MAX = 1.005;
const WIDE_PTDQNCNM_MIN = 1.09;

// PTDQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duoquinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duoquinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdqncnm_max: number;
  readonly wide_ptdqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanMap;
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

// Peak-to-duoquinquagintcentinagintic-mean of a discrete distribution:
//   PTDQNCNM = (max - min) / duoquinquagintcentinagintic_mean
// where duoquinquagintcentinagintic_mean = ((sum x_i^152) / n)^(1/152).
// Returns null on empty, solo, and degenerate (zero
// duoquinquagintcentinagintic_mean or non-finite hundred-and-fifty-first-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duoquinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFiftySecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^152 = x^128 * x^16 * x^8 = p128 * p16 * oct
    // -- (128 + 16 + 8) decomposition reuses the p128 rung
    // shared with the M_128..M_151 siblings and multiplies by p16,
    // quad, sq, v to hit the next order.
    hundredFiftySecondSum += p128 * p16 * oct;
  }
  if (
    !Number.isFinite(hundredFiftySecondSum) ||
    hundredFiftySecondSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquinquagintcentinagintic_mean: null,
    };
  }
  const duoquinquagintcentinagintic_mean = Math.pow(
    hundredFiftySecondSum / pool_count,
    1 / 152,
  );
  if (
    !Number.isFinite(duoquinquagintcentinagintic_mean) ||
    duoquinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_duoquinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptdqncnm = range / duoquinquagintcentinagintic_mean;
  const clamped = ptdqncnm < 0 ? 0 : ptdqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_duoquinquagintcentinagintic_mean: roundTo(clamped, PTDQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duoquinquagintcentinagintic_mean:
      partner.peak_to_duoquinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duoquinquagintcentinagintic_mean:
      metric.peak_to_duoquinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMean {
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
    tight_ptdqncnm_max: TIGHT_PTDQNCNM_MAX,
    wide_ptdqncnm_min: WIDE_PTDQNCNM_MIN,
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
  ptdqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtuqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdqncnm === null) return "degenerate";
  if (ptdqncnm >= wide_min) return "wide";
  if (ptdqncnm < tight_max) return "tight";
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
  ptdqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtuqncnm(
    pool_count,
    pool_cells,
    ptdqncnm,
    tight_max,
    wide_min,
  );
  const ptdqncnmText = ptdqncnm === null ? "-" : ptdqncnm.toFixed(4);
  return `PTDQNCNM ${ptdqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuoquinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdqncnm_max, wide_ptdqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duoquinquagintcentinagintic_mean, tight_ptdqncnm_max, wide_ptdqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtuqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duoquinquagintcentinagintic_mean, tight_ptdqncnm_max, wide_ptdqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdqncnm = (max - min) / duoquinquagintcentinagintic_mean where duoquinquagintcentinagintic_mean = ((sum x_i^152) / n)^(1/152). Reads the pool's total RANGE in units of its DUOQUINQUAGINTCENTINAGINTIC (power-mean-of-order-151, M_152) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.554 PTUQNCNM because raising to the ONE-HUNDRED-AND-FIFTY-SECOND power lifts the anchor MORE than raising to the hundred-and-fifty-first does. Unique DISPERSION-axis contribution extends the (harmonic..unquinquagintcentinagintic) power-mean TREOCTOGINTUPLET into a QUATTUOROCTOGINTUPLET with the M_152 duoquinquagintcentinagintic mean, third step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149). Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdqncnm approaches n^(1/152) so 10-partner pools cap near 1.0153, 20-partner near 1.0199, 30-partner near 1.0226, 40-partner near 1.0246, 50-partner near 1.0261, 60-partner near 1.0273, 70-partner near 1.0283, 80-partner near 1.0292, 85-partner near 1.0297, 89-partner near 1.0300 and 90-partner near 1.0300 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/152) ~= 1.0308) are required to escape into wide with a modest outlier. Composite regime labels: PTDQNCNM tight + PTUQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTDQNCNM 0.9137 tight -- rejoining the uniform ramp's 0.9137); PTDQNCNM spread + PTUQNCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDQNCNM 1.0051 spread -- one 4-decimal tick below PTUQNCNM's 1.0052); PTDQNCNM spread + PTUQNCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_152 ([1x99, 100] reads 1.0205 spread after M_151's 1.0207 spread landing -- two 4-decimal ticks of absorption); PTDQNCNM tight + PTUQNCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_151 ([1, 100] reads 0.9945 tight, same as M_151's 0.9945 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duoquinquagintcentinagintic_mean == 0 (guarded but unreachable), tight = ptdqncnm &lt; ${tight_ptdqncnm_max}, spread = ptdqncnm in [${tight_ptdqncnm_max}, ${wide_ptdqncnm_min}), wide = ptdqncnm &ge; ${wide_ptdqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
