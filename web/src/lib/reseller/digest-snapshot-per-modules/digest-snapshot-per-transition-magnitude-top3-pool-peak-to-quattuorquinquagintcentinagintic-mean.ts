// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUATTUORQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.562).
//
// WHOLE-POOL RANGE-AGAINST-QUATTUORQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUATTUORQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 154, M_154):
//
//   ptqqncnm = (max - min) / quattuorquinquagintcentinagintic_mean
//
// where quattuorquinquagintcentinagintic_mean = ((sum x_i^154) / n)^(1/154).
// Reads the peak spread against the QUATTUORQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-154) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.561 PTTQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTY-FOURTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifty-third does,
// dampening the ratio against the range even harder. Fourth entry
// in the FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTQQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUATTUORQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-154)
// CENTER. Extends the (harmonic M_-1 .. trequinquagintcentinagintic
// M_153) power-mean QUINQUOCTOGINTUPLET into a SESOCTOGINTUPLET with
// the M_154 quattuorquinquagintcentinagintic mean -- fourth step into
// the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM
// (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_154 >= M_153, so
// quattuorquinquagintcentinagintic_mean >= trequinquagintcentinagintic_mean
// and ptqqncnm <= pttqncnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quattuorquinquagintcentinagintic_mean approaches x_max / n^(1/154),
// so ptqqncnm approaches n^(1/154) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/154) ~= 1.0151, for n=20 ~= 1.0196, for n=30
// ~= 1.0223, for n=40 ~= 1.0243, for n=50 ~= 1.0258, for n=60
// ~= 1.0270, for n=70 ~= 1.0280, for n=80 ~= 1.0288, for n=85
// ~= 1.0292, for n=89 ~= 1.0295, for n=90 ~= 1.0296 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/154) ~= 1.0304) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/154) ~= 1.0304,
// and the pool100 [1x99, 100] reference reads 1.0201 spread
// (further absorbed from PTTQNCNM's 1.0205 spread landing -- FOUR
// 4-decimal ticks of absorption at M_154) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_154.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quattuorquinquagintcentinagintic_mean = k,
//                                     range 0, ptqqncnm 0 (tight).
//   * uniform ramp [1..10]          -> QQNCNM ~= 9.8516, range 9,
//                                     ptqqncnm ~= 0.9136 (tight --
//                                     JOINT with PTTQNCNM 0.9136 at
//                                     M_153).
//   * upper-outlier [1x9, 10]       -> QQNCNM ~= 9.8516, range 9,
//                                     ptqqncnm ~= 0.9136 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_154).
//   * two-shoulders [1x8, 5x2]      -> QQNCNM ~= 4.9480, range 4,
//                                     ptqqncnm ~= 0.8084 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTQNCNM 0.8085 at M_153).
//   * 50/50 split [1x5, 10x5]       -> QQNCNM ~= 9.9551, range 9,
//                                     ptqqncnm ~= 0.9041 (tight --
//                                     JOINT with PTTQNCNM 0.9041 at
//                                     M_153).
//   * extreme outlier [1x9, 100]    -> QQNCNM ~= 98.5159, range 99,
//                                     ptqqncnm ~= 1.0049 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/154) ~ 1.0151 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTTQNCNM 1.0050 at M_153).
//   * two-partner [1, 9]            -> QQNCNM ~= 8.9596, range 8,
//                                     ptqqncnm ~= 0.8929 (tight --
//                                     JOINT with PTTQNCNM 0.8929 at
//                                     M_153).
//   * two-partner [1, 100]          -> QQNCNM ~= 99.5509, range 99,
//                                     ptqqncnm ~= 0.9945 (TIGHT --
//                                     JOINT with PTTQNCNM 0.9945 at
//                                     M_153).
//   * small [10, 1, 1]              -> QQNCNM ~= 9.9289, range 9,
//                                     ptqqncnm ~= 0.9064 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTTQNCNM 0.9065 at M_153).
//   * pool_count=100 [1x99, 100]    -> QQNCNM ~= 97.0539, range 99,
//                                     ptqqncnm ~= 1.0201 (SPREAD --
//                                     FURTHER ABSORBED from PTTQNCNM
//                                     M_153's 1.0205 spread; the
//                                     100-partner asymptote
//                                     100^(1/154) ~ 1.0304 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_154).
//
// Bands on raw ptqqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quattuorquinquagintcentinagintic_mean == 0
//   * tight                ptqqncnm < 1.005
//   * spread               ptqqncnm in [1.005, 1.09)
//   * wide                 ptqqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqqncnm_max /
// wide_ptqqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.563):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTrequinquagintcentinaginticMeanSection
// (P11.561) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quattuorquinquagintcentinagintic-center
// after the P11.561 range-against-trequinquagintcentinagintic-center landing.
//
// Naming: quattuorquinquagintcentinagintic = quattuor (4) + quin (5) +
// quaginta (50) + centinagintic (100); abbreviation PTQQNCNM
// (P-T-Quattuor-Quin-Quaginta[N=nasal marker of the quinquaginta
// "-N-"]-Centi-Nagintic-M) is distinct from PTQQCNM (M_144
// quattuorquadragintcentinagintic) by the added 'N' segment
// (quinquaginta's "-N-" middle), from PTQQQM (M_54
// quattuorquinquagintic) by the added centinagintic segment, and from
// PTTQNCNM (M_153 trequinquagintcentinagintic) by leading Q (quattuor)
// rung stacked on top of the quinquaginta root.

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
type PtqqncnmLabel =
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

// Bands on raw ptqqncnm (fixed cutoffs since quattuorquinquagintcentinagintic_mean
// scales with cell counts and typical quattuorquinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_154 is 0.9136
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0153
// (M_153) to 1.0151 (M_154), 20-partner drops from 1.0199 to 1.0196,
// 30-partner drops from 1.0226 to 1.0223, 40-partner drops from
// 1.0246 to 1.0243, 50-partner drops from 1.0261 to 1.0258,
// 60-partner drops from 1.0273 to 1.0270, 70-partner drops from
// 1.0283 to 1.0280, 80-partner drops from 1.0292 to 1.0288,
// 85-partner drops from 1.0297 to 1.0292, 89-partner drops from
// 1.0300 to 1.0295, 90-partner drops from 1.0300 to 1.0296 -- so
// pool_count >= 100 (100^(1/154) ~ 1.0304) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTTQNCNM 1.0205 spread to PTQQNCNM 1.0201 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQQNCNM_MAX = 1.005;
const WIDE_PTQQNCNM_MIN = 1.09;

// PTQQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quattuorquinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quattuorquinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqqncnm_max: number;
  readonly wide_ptqqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanMap;
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

// Peak-to-quattuorquinquagintcentinagintic-mean of a discrete distribution:
//   PTQQNCNM = (max - min) / quattuorquinquagintcentinagintic_mean
// where quattuorquinquagintcentinagintic_mean = ((sum x_i^154) / n)^(1/154).
// Returns null on empty, solo, and degenerate (zero
// quattuorquinquagintcentinagintic_mean or non-finite hundred-and-fifty-fourth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quattuorquinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFiftyFourthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^154 = x^128 * x^16 * x^8 * x^2 = p128 * p16 * oct * sq
    // -- (128 + 16 + 8 + 2) decomposition reuses the p128 rung
    // shared with the M_128..M_153 siblings and multiplies by p16,
    // oct, sq to hit the next order.
    hundredFiftyFourthSum += p128 * p16 * oct * sq;
  }
  if (
    !Number.isFinite(hundredFiftyFourthSum) ||
    hundredFiftyFourthSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquinquagintcentinagintic_mean: null,
    };
  }
  const quattuorquinquagintcentinagintic_mean = Math.pow(
    hundredFiftyFourthSum / pool_count,
    1 / 154,
  );
  if (
    !Number.isFinite(quattuorquinquagintcentinagintic_mean) ||
    quattuorquinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quattuorquinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqqncnm = range / quattuorquinquagintcentinagintic_mean;
  const clamped = ptqqncnm < 0 ? 0 : ptqqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quattuorquinquagintcentinagintic_mean: roundTo(clamped, PTQQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quattuorquinquagintcentinagintic_mean:
      partner.peak_to_quattuorquinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quattuorquinquagintcentinagintic_mean:
      metric.peak_to_quattuorquinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMean {
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
    tight_ptqqncnm_max: TIGHT_PTQQNCNM_MAX,
    wide_ptqqncnm_min: WIDE_PTQQNCNM_MIN,
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

function labelForPtqqncnm(
  pool_count: number,
  pool_cells: number,
  ptqqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqqncnm === null) return "degenerate";
  if (ptqqncnm >= wide_min) return "wide";
  if (ptqqncnm < tight_max) return "tight";
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

function renderPtqqncnmCell(
  pool_count: number,
  pool_cells: number,
  ptqqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqqncnm(
    pool_count,
    pool_cells,
    ptqqncnm,
    tight_max,
    wide_min,
  );
  const ptqqncnmText = ptqqncnm === null ? "-" : ptqqncnm.toFixed(4);
  return `PTQQNCNM ${ptqqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqqncnm_max, wide_ptqqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quattuorquinquagintcentinagintic_mean, tight_ptqqncnm_max, wide_ptqqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quattuorquinquagintcentinagintic_mean, tight_ptqqncnm_max, wide_ptqqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUATTUORQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUATTUORQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqqncnm = (max - min) / quattuorquinquagintcentinagintic_mean where quattuorquinquagintcentinagintic_mean = ((sum x_i^154) / n)^(1/154). Reads the pool's total RANGE in units of its QUATTUORQUINQUAGINTCENTINAGINTIC (power-mean-of-order-154, M_154) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.561 PTTQNCNM because raising to the ONE-HUNDRED-AND-FIFTY-FOURTH power lifts the anchor MORE than raising to the hundred-and-fifty-third does. Unique DISPERSION-axis contribution extends the (harmonic..trequinquagintcentinagintic) power-mean QUINQUOCTOGINTUPLET into a SESOCTOGINTUPLET with the M_154 quattuorquinquagintcentinagintic mean, fourth step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149). Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqqncnm approaches n^(1/154) so 10-partner pools cap near 1.0151, 20-partner near 1.0196, 30-partner near 1.0223, 40-partner near 1.0243, 50-partner near 1.0258, 60-partner near 1.0270, 70-partner near 1.0280, 80-partner near 1.0288, 85-partner near 1.0292, 89-partner near 1.0295 and 90-partner near 1.0296 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/154) ~= 1.0304) are required to escape into wide with a modest outlier. Composite regime labels: PTQQNCNM tight + PTTQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQQNCNM 0.9136 tight -- rejoining the uniform ramp's 0.9136); PTQQNCNM spread + PTTQNCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQQNCNM 1.0049 spread -- one 4-decimal tick below PTTQNCNM's 1.0050); PTQQNCNM spread + PTTQNCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_154 ([1x99, 100] reads 1.0201 spread after M_153's 1.0205 spread landing -- four 4-decimal ticks of absorption); PTQQNCNM tight + PTTQNCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_153 ([1, 100] reads 0.9945 tight, same as M_153's 0.9945 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quattuorquinquagintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqqncnm &lt; ${tight_ptqqncnm_max}, spread = ptqqncnm in [${tight_ptqqncnm_max}, ${wide_ptqqncnm_min}), wide = ptqqncnm &ge; ${wide_ptqqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
