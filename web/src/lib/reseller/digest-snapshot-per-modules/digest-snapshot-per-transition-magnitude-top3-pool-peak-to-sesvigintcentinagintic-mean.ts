// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESVIGINTCENTINAGINTIC-MEAN
// pure-lib (P11.506).
//
// WHOLE-POOL RANGE-AGAINST-SESVIGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SESVIGINTCENTINAGINTIC MEAN (a.k.a. power
// mean of order 126, M_126):
//
//   ptsvcnm = (max - min) / sesvigintcentinagintic_mean
//
// where sesvigintcentinagintic_mean = ((sum x_i^126) / n)^(1/126).
// Reads the peak spread against the SESVIGINTCENTINAGINTIC
// (power-mean-of-order-126) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.504 PTQIVCNM, because raising to
// the ONE-HUNDRED-AND-TWENTY-SIXTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-twenty-fifth does,
// dampening the ratio against the range even harder.
//
// PTSVCNM's unique DISPERSION-axis contribution: reads range in units
// of the SESVIGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-126) CENTER.
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
// quattuorvigintcentinagintic M_124, quinvigintcentinagintic M_125)
// power-mean SEPTQUINQUAGINTASEPTUAGINTUPLET into an
// OCTQUINQUAGINTASEPTUAGINTUPLET with the M_126
// sesvigintcentinagintic mean -- climbing one step further into
// the third dozen of the triple-digit family opened at PTCNM. By the
// Power Mean inequality M_126 >= M_125, so
// sesvigintcentinagintic_mean >= quinvigintcentinagintic_mean and
// ptsvcnm <= ptqivcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sesvigintcentinagintic_mean approaches x_max / n^(1/126), so
// ptsvcnm approaches n^(1/126) as x_max -> +Inf. For n=10 the ceiling
// is 10^(1/126) ~= 1.0184, for n=20 ~= 1.0241, for n=30 ~= 1.0274,
// for n=40 ~= 1.0297, for n=50 ~= 1.0315, for n=60 ~= 1.0330,
// for n=70 ~= 1.0343, for n=80 ~= 1.0354, for n=85 ~= 1.0359,
// for n=89 ~= 1.0363, for n=90 ~= 1.0364 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/126) ~= 1.0372)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/126) ~= 1.0372, and the pool100
// [1x99, 100] reference reads 1.0269 spread (further absorbed
// from PTQIVCNM's 1.0272 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_126.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sesvigintcentinagintic_mean = k,
//                                     range 0, ptsvcnm 0 (tight).
//   * uniform ramp [1..10]          -> SVCNM ~= 9.8189, range 9,
//                                     ptsvcnm ~= 0.9166 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQIVCNM 0.9167 at M_125).
//   * upper-outlier [1x9, 10]       -> SVCNM ~= 9.8189, range 9,
//                                     ptsvcnm ~= 0.9166 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_126;
//                                     the M_125 joint collapse at
//                                     0.9167 persists at M_126 as a
//                                     joint 0.9166 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/126) ~ 9.8189 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> SVCNM ~= 4.9365, range 4,
//                                     ptsvcnm ~= 0.8103 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTQIVCNM 0.8104 at M_125).
//   * 50/50 split [1x5, 10x5]       -> SVCNM ~= 9.9451, range 9,
//                                     ptsvcnm ~= 0.9050 (tight --
//                                     JOINT with PTQIVCNM 0.9050 at
//                                     M_125).
//   * extreme outlier [1x9, 100]    -> SVCNM ~= 98.1891, range 99,
//                                     ptsvcnm ~= 1.0083 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/126) ~ 1.0184 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTQIVCNM 1.0084 at M_125).
//   * two-partner [1, 9]            -> SVCNM ~= 8.9506, range 8,
//                                     ptsvcnm ~= 0.8938 (tight --
//                                     JOINT with PTQIVCNM 0.8938 at
//                                     M_125).
//   * two-partner [1, 100]          -> SVCNM ~= 99.4515, range 99,
//                                     ptsvcnm ~= 0.9955 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     JOINT with PTQIVCNM 0.9955 at
//                                     M_125).
//   * small [10, 1, 1]              -> SVCNM ~= 9.9132, range 9,
//                                     ptsvcnm ~= 0.9079 (tight --
//                                     JOINT with PTQIVCNM 0.9079 at
//                                     M_125).
//   * pool_count=100 [1x99, 100]    -> SVCNM ~= 96.4111, range 99,
//                                     ptsvcnm ~= 1.0269 (SPREAD --
//                                     FURTHER ABSORBED from PTQIVCNM
//                                     M_125's 1.0272 spread; the
//                                     100-partner asymptote
//                                     100^(1/126) ~ 1.0372 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- three 4-decimal ticks
//                                     of absorption at M_126
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptsvcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sesvigintcentinagintic_mean == 0
//   * tight                ptsvcnm < 1.005
//   * spread               ptsvcnm in [1.005, 1.09)
//   * wide                 ptsvcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsvcnm_max /
// wide_ptsvcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.507):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinvigintcentinaginticMeanSection
// (P11.505) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sesvigintcentinagintic-center
// after the P11.505 range-against-quinvigintcentinagintic-center landing.

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
type PtsvcnmLabel =
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

// Bands on raw ptsvcnm (fixed cutoffs since sesvigintcentinagintic_mean
// scales with cell counts and typical sesvigintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_126 is 0.9166
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0186
// (M_125) to 1.0184 (M_126), 20-partner drops from 1.0243 to 1.0241,
// 30-partner drops from 1.0276 to 1.0274, 40-partner drops from
// 1.0300 to 1.0297, 50-partner drops from 1.0318 to 1.0315,
// 60-partner drops from 1.0333 to 1.0330, 70-partner drops from
// 1.0346 to 1.0343, 80-partner drops from 1.0357 to 1.0354,
// 85-partner drops from 1.0362 to 1.0359, 89-partner drops from
// 1.0366 to 1.0363, 90-partner drops from 1.0367 to 1.0364 -- so
// pool_count >= 100 (100^(1/126) ~ 1.0372) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTQIVCNM 1.0272 spread to PTSVCNM 1.0269 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSVCNM_MAX = 1.005;
const WIDE_PTSVCNM_MIN = 1.09;

// PTSVCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSVCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sesvigintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sesvigintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsvcnm_max: number;
  readonly wide_ptsvcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanMap;
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

// Peak-to-sesvigintcentinagintic-mean of a discrete distribution:
//   PTSVCNM = (max - min) / sesvigintcentinagintic_mean
// where sesvigintcentinagintic_mean = ((sum x_i^126) / n)^(1/126).
// Returns null on empty, solo, and degenerate (zero
// sesvigintcentinagintic_mean or non-finite hundred-and-twenty-sixth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sesvigintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesvigintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesvigintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesvigintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredTwentySixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    // x^126 = x^64 * x^32 * x^16 * x^8 * x^4 * x^2 = p64 * p32 * p16 * oct * quad * sq
    hundredTwentySixthSum += p64 * p32 * p16 * oct * quad * sq;
  }
  if (
    !Number.isFinite(hundredTwentySixthSum) ||
    hundredTwentySixthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesvigintcentinagintic_mean: null,
    };
  }
  const sesvigintcentinagintic_mean = Math.pow(
    hundredTwentySixthSum / pool_count,
    1 / 126,
  );
  if (
    !Number.isFinite(sesvigintcentinagintic_mean) ||
    sesvigintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesvigintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsvcnm = range / sesvigintcentinagintic_mean;
  const clamped = ptsvcnm < 0 ? 0 : ptsvcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_sesvigintcentinagintic_mean: roundTo(clamped, PTSVCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sesvigintcentinagintic_mean:
      partner.peak_to_sesvigintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sesvigintcentinagintic_mean:
      metric.peak_to_sesvigintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMean {
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
    tight_ptsvcnm_max: TIGHT_PTSVCNM_MAX,
    wide_ptsvcnm_min: WIDE_PTSVCNM_MIN,
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

function labelForPtsvcnm(
  pool_count: number,
  pool_cells: number,
  ptsvcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtsvcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsvcnm === null) return "degenerate";
  if (ptsvcnm >= wide_min) return "wide";
  if (ptsvcnm < tight_max) return "tight";
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

function renderPtsvcnmCell(
  pool_count: number,
  pool_cells: number,
  ptsvcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsvcnm(
    pool_count,
    pool_cells,
    ptsvcnm,
    tight_max,
    wide_min,
  );
  const ptsvcnmText = ptsvcnm === null ? "-" : ptsvcnm.toFixed(4);
  return `PTSVCNM ${ptsvcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesvigintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsvcnm_max, wide_ptsvcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsvcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sesvigintcentinagintic_mean, tight_ptsvcnm_max, wide_ptsvcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsvcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sesvigintcentinagintic_mean, tight_ptsvcnm_max, wide_ptsvcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESVIGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESVIGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsvcnm = (max - min) / sesvigintcentinagintic_mean where sesvigintcentinagintic_mean = ((sum x_i^126) / n)^(1/126). Reads the pool's total RANGE in units of its SESVIGINTCENTINAGINTIC (power-mean-of-order-126, M_126) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.504 PTQIVCNM because raising to the ONE-HUNDRED-AND-TWENTY-SIXTH power lifts the anchor MORE than raising to the hundred-and-twenty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinvigintcentinagintic) power-mean SEPTQUINQUAGINTASEPTUAGINTUPLET into an OCTQUINQUAGINTASEPTUAGINTUPLET with the M_126 sesvigintcentinagintic mean, climbing one step further into the third dozen of the triple-digit family opened at PTCNM. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsvcnm approaches n^(1/126) so 10-partner pools cap near 1.0184, 20-partner near 1.0241, 30-partner near 1.0274, 40-partner near 1.0297, 50-partner near 1.0315, 60-partner near 1.0330, 70-partner near 1.0343, 80-partner near 1.0354, 85-partner near 1.0359, 89-partner near 1.0363 and 90-partner near 1.0364 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/126) ~= 1.0372) are required to escape into wide with a modest outlier. Composite regime labels: PTSVCNM tight + PTQIVCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSVCNM 0.9166 tight -- rejoining the uniform ramp's 0.9166 for the forty-fifth tick in the sequence after PTQIVCNM's 0.9167 joint bucket at M_125); PTSVCNM spread + PTQIVCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSVCNM 1.0083 spread -- one 4-decimal tick below PTQIVCNM's 1.0084); PTSVCNM spread + PTQIVCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_126 ([1x99, 100] reads 1.0269 spread after M_125's 1.0272 spread landing); PTSVCNM tight + PTQIVCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_126 ([1, 100] reads 0.9955 tight matching M_125's 0.9955 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sesvigintcentinagintic_mean == 0 (guarded but unreachable), tight = ptsvcnm &lt; ${tight_ptsvcnm_max}, spread = ptsvcnm in [${tight_ptsvcnm_max}, ${wide_ptsvcnm_min}), wide = ptsvcnm &ge; ${wide_ptsvcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsvcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSVCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSVCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
