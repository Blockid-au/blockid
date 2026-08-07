// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTCENTINAGINTIC-MEAN
// pure-lib (P11.468).
//
// WHOLE-POOL RANGE-AGAINST-SEPTCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's SEPTCENTINAGINTIC MEAN (a.k.a. power mean of order
// 107, M_107):
//
//   ptspcnm = (max - min) / septcentinagintic_mean
//
// where septcentinagintic_mean = ((sum x_i^107) / n)^(1/107).
// Reads the peak spread against the SEPTCENTINAGINTIC
// (power-mean-of-order-107) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.466 PTSCNM, because raising to
// the ONE-HUNDRED-AND-SEVENTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-sixth does, dampening the
// ratio against the range even harder.
//
// PTSPCNM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTCENTINAGINTIC (POWER-MEAN-OF-ORDER-107) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106) power-mean OCTOTRIGINTASEPTUAGINTUPLET
// into a NOVEMTRIGINTASEPTUAGINTUPLET with the M_107 septcentinagintic
// mean -- climbing further into the TRIPLE-DIGIT power-mean family
// opened at PTCNM by cracking past the round-hundred threshold. By
// Power Mean inequality M_107 >= M_106, so septcentinagintic_mean >=
// sexcentinagintic_mean and ptspcnm <= ptscnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septcentinagintic_mean approaches x_max / n^(1/107), so ptspcnm
// approaches n^(1/107) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/107) ~= 1.0218, for n=20 ~= 1.0284, for n=30 ~= 1.0323,
// for n=40 ~= 1.0351, for n=50 ~= 1.0372, for n=60 ~= 1.0390,
// for n=70 ~= 1.0405, for n=80 ~= 1.0418, for n=85 ~= 1.0424,
// for n=89 ~= 1.0428, for n=90 ~= 1.0430 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/107) ~= 1.0440)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/107) ~= 1.0440, and the pool100
// [1x99, 100] reference reads 1.0335 spread (further absorbed
// from PTSCNM's 1.0340 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_107.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septcentinagintic_mean = k,
//                                     range 0, ptspcnm 0 (tight).
//   * uniform ramp [1..10]          -> SPCNM ~= 9.7871, range 9,
//                                     ptspcnm ~= 0.9196 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSCNM 0.9198 at M_106).
//   * upper-outlier [1x9, 10]       -> SPCNM ~= 9.7871, range 9,
//                                     ptspcnm ~= 0.9196 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_107;
//                                     the M_106 joint collapse at
//                                     0.9198 persists at M_107 as a
//                                     joint 0.9196 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/107) ~ 9.7871 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> SPCNM ~= 4.9254, range 4,
//                                     ptspcnm ~= 0.8121 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSCNM 0.8122 at M_106).
//   * 50/50 split [1x5, 10x5]       -> SPCNM ~= 9.9354, range 9,
//                                     ptspcnm ~= 0.9058 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSCNM 0.9059 at M_106).
//   * extreme outlier [1x9, 100]    -> SPCNM ~= 97.8710, range 99,
//                                     ptspcnm ~= 1.0115 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/107) ~ 1.0218 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSCNM 1.0117 at M_106).
//   * two-partner [1, 9]            -> SPCNM ~= 8.9419, range 8,
//                                     ptspcnm ~= 0.8947 (tight --
//                                     JOINT with PTSCNM 0.8947 at
//                                     M_106; the small-n / small-max
//                                     ratio sits inside the same
//                                     4-decimal bucket for the second
//                                     order in a row).
//   * two-partner [1, 100]          -> SPCNM ~= 99.3543, range 99,
//                                     ptspcnm ~= 0.9964 (TIGHT --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSCNM 0.9965 at M_106;
//                                     ISOLATED HIGH PARTNER absorption
//                                     nudges one tick at M_107).
//   * small [10, 1, 1]              -> SPCNM ~= 9.8979, range 9,
//                                     ptspcnm ~= 0.9093 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSCNM 0.9094 at M_106;
//                                     small-n / large-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_107).
//   * pool_count=100 [1x99, 100]    -> SPCNM ~= 95.7874, range 99,
//                                     ptspcnm ~= 1.0335 (SPREAD --
//                                     FURTHER ABSORBED from PTSCNM
//                                     M_106's 1.0340 spread; the
//                                     100-partner asymptote
//                                     100^(1/107) ~ 1.0440 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- five 4-decimal ticks
//                                     of absorption at M_107 is the
//                                     largest single-step compression
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptspcnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septcentinagintic_mean == 0
//   * tight                ptspcnm < 1.005
//   * spread               ptspcnm in [1.005, 1.09)
//   * wide                 ptspcnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptspcnm_max /
// wide_ptspcnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.469):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSexcentinaginticMeanSection
// (P11.467) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septcentinagintic-center
// after the P11.467 range-against-sexcentinagintic-center landing.

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
type PtspcnmLabel =
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

// Bands on raw ptspcnm (fixed cutoffs since septcentinagintic_mean
// scales with cell counts and typical septcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_107 is 0.9196
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0220
// (M_106) to 1.0218 (M_107), 20-partner drops from 1.0287 to 1.0284,
// 30-partner drops from 1.0326 to 1.0323, 40-partner drops from
// 1.0354 to 1.0351, 50-partner drops from 1.0376 to 1.0372,
// 60-partner drops from 1.0394 to 1.0390, 70-partner drops from
// 1.0409 to 1.0405, 80-partner drops from 1.0422 to 1.0418,
// 85-partner drops from 1.0428 to 1.0424, 89-partner drops from
// 1.0433 to 1.0428, 90-partner drops from 1.0434 to 1.0430 -- so
// pool_count >= 100 (100^(1/107) ~ 1.0440) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSCNM 1.0340 spread to PTSPCNM 1.0335 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSPCNM_MAX = 1.005;
const WIDE_PTSPCNM_MIN = 1.09;

// PTSPCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspcnm_max: number;
  readonly wide_ptspcnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanMap;
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

// Peak-to-septcentinagintic-mean of a discrete distribution:
//   PTSPCNM = (max - min) / septcentinagintic_mean
// where septcentinagintic_mean = ((sum x_i^107) / n)^(1/107).
// Returns null on empty, solo, and degenerate (zero
// septcentinagintic_mean or non-finite hundred-and-seventh-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSeventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const cube = sq * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^107 = (x^8)^13 * x^3 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*cube
    hundredSeventhSum +=
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
      oct *
      cube;
  }
  if (!Number.isFinite(hundredSeventhSum) || hundredSeventhSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septcentinagintic_mean: null,
    };
  }
  const septcentinagintic_mean = Math.pow(
    hundredSeventhSum / pool_count,
    1 / 107,
  );
  if (
    !Number.isFinite(septcentinagintic_mean) ||
    septcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspcnm = range / septcentinagintic_mean;
  const clamped = ptspcnm < 0 ? 0 : ptspcnm;
  return {
    pool_count,
    pool_cells,
    peak_to_septcentinagintic_mean: roundTo(clamped, PTSPCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septcentinagintic_mean:
      partner.peak_to_septcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septcentinagintic_mean:
      metric.peak_to_septcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMean {
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
    tight_ptspcnm_max: TIGHT_PTSPCNM_MAX,
    wide_ptspcnm_min: WIDE_PTSPCNM_MIN,
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

function labelForPtspcnm(
  pool_count: number,
  pool_cells: number,
  ptspcnm: number | null,
  tight_max: number,
  wide_min: number,
): PtspcnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspcnm === null) return "degenerate";
  if (ptspcnm >= wide_min) return "wide";
  if (ptspcnm < tight_max) return "tight";
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

function renderPtspcnmCell(
  pool_count: number,
  pool_cells: number,
  ptspcnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspcnm(
    pool_count,
    pool_cells,
    ptspcnm,
    tight_max,
    wide_min,
  );
  const ptspcnmText = ptspcnm === null ? "-" : ptspcnm.toFixed(4);
  return `PTSPCNM ${ptspcnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspcnm_max, wide_ptspcnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspcnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septcentinagintic_mean, tight_ptspcnm_max, wide_ptspcnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspcnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septcentinagintic_mean, tight_ptspcnm_max, wide_ptspcnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspcnm = (max - min) / septcentinagintic_mean where septcentinagintic_mean = ((sum x_i^107) / n)^(1/107). Reads the pool's total RANGE in units of its SEPTCENTINAGINTIC (power-mean-of-order-107, M_107) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.466 PTSCNM because raising to the ONE-HUNDRED-AND-SEVENTH power lifts the anchor MORE than raising to the hundred-and-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sexcentinagintic) power-mean OCTOTRIGINTASEPTUAGINTUPLET into a NOVEMTRIGINTASEPTUAGINTUPLET with the M_107 septcentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspcnm approaches n^(1/107) so 10-partner pools cap near 1.0218, 20-partner near 1.0284, 30-partner near 1.0323, 40-partner near 1.0351, 50-partner near 1.0372, 60-partner near 1.0390, 70-partner near 1.0405, 80-partner near 1.0418, 85-partner near 1.0424, 89-partner near 1.0428 and 90-partner near 1.0430 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/107) ~= 1.0440) are required to escape into wide with a modest outlier. Composite regime labels: PTSPCNM tight + PTSCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSPCNM 0.9196 tight -- rejoining the uniform ramp's 0.9196 for the twenty-sixth tick in the sequence after PTSCNM's 0.9198 joint bucket at M_106); PTSPCNM spread + PTSCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPCNM 1.0115 spread -- two 4-decimal ticks below PTSCNM's 1.0117); PTSPCNM spread + PTSCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_107 ([1x99, 100] reads 1.0335 spread after M_106's 1.0340 spread landing); PTSPCNM tight + PTSCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES one 4-decimal bucket at M_107 ([1, 100] reads 0.9964 tight below M_106's 0.9965 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septcentinagintic_mean == 0 (guarded but unreachable), tight = ptspcnm &lt; ${tight_ptspcnm_max}, spread = ptspcnm in [${tight_ptspcnm_max}, ${wide_ptspcnm_min}), wide = ptspcnm &ge; ${wide_ptspcnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspcnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
