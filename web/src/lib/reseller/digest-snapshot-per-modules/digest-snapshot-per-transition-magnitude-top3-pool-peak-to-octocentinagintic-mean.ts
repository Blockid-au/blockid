// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOCENTINAGINTIC-MEAN
// pure-lib (P11.470).
//
// WHOLE-POOL RANGE-AGAINST-OCTOCENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's OCTOCENTINAGINTIC MEAN (a.k.a. power mean of order
// 108, M_108):
//
//   ptocnm = (max - min) / octocentinagintic_mean
//
// where octocentinagintic_mean = ((sum x_i^108) / n)^(1/108).
// Reads the peak spread against the OCTOCENTINAGINTIC
// (power-mean-of-order-108) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.468 PTSPCNM, because raising to
// the ONE-HUNDRED-AND-EIGHTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-seventh does, dampening the
// ratio against the range even harder.
//
// PTOCNM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOCENTINAGINTIC (POWER-MEAN-OF-ORDER-108) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107) power-mean
// NOVEMTRIGINTASEPTUAGINTUPLET into a QUADRAGINTASEPTUAGINTUPLET
// with the M_108 octocentinagintic mean -- climbing further into
// the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking
// past the round-hundred threshold. By Power Mean inequality
// M_108 >= M_107, so octocentinagintic_mean >= septcentinagintic_mean
// and ptocnm <= ptspcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octocentinagintic_mean approaches x_max / n^(1/108), so ptocnm
// approaches n^(1/108) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/108) ~= 1.0215, for n=20 ~= 1.0281, for n=30 ~= 1.0320,
// for n=40 ~= 1.0348, for n=50 ~= 1.0369, for n=60 ~= 1.0386,
// for n=70 ~= 1.0401, for n=80 ~= 1.0414, for n=85 ~= 1.0420,
// for n=89 ~= 1.0424, for n=90 ~= 1.0425 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/108) ~= 1.0436)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/108) ~= 1.0436, and the pool100
// [1x99, 100] reference reads 1.0331 spread (further absorbed
// from PTSPCNM's 1.0335 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits deeper
// inside the spread band at M_108.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octocentinagintic_mean = k,
//                                     range 0, ptocnm 0 (tight).
//   * uniform ramp [1..10]          -> OCNM ~= 9.7891, range 9,
//                                     ptocnm ~= 0.9194 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSPCNM 0.9196 at M_107).
//   * upper-outlier [1x9, 10]       -> OCNM ~= 9.7891, range 9,
//                                     ptocnm ~= 0.9194 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_108;
//                                     the M_107 joint collapse at
//                                     0.9196 persists at M_108 as a
//                                     joint 0.9194 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/108) ~ 9.7891 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> OCNM ~= 4.9260, range 4,
//                                     ptocnm ~= 0.8120 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSPCNM 0.8121 at M_107).
//   * 50/50 split [1x5, 10x5]       -> OCNM ~= 9.9360, range 9,
//                                     ptocnm ~= 0.9058 (tight --
//                                     JOINT with PTSPCNM 0.9058 at
//                                     M_107; the extra power barely
//                                     nudges the half-and-half anchor
//                                     at M_108).
//   * extreme outlier [1x9, 100]    -> OCNM ~= 97.8918, range 99,
//                                     ptocnm ~= 1.0113 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/108) ~ 1.0215 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTSPCNM 1.0115 at M_107).
//   * two-partner [1, 9]            -> OCNM ~= 8.9424, range 8,
//                                     ptocnm ~= 0.8946 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSPCNM 0.8947 at M_107;
//                                     the small-n / small-max ratio
//                                     advances one tick at M_108).
//   * two-partner [1, 100]          -> OCNM ~= 99.3602, range 99,
//                                     ptocnm ~= 0.9964 (TIGHT --
//                                     JOINT with PTSPCNM 0.9964 at
//                                     M_107; ISOLATED HIGH PARTNER
//                                     absorption sits inside the same
//                                     4-decimal bucket at M_108).
//   * small [10, 1, 1]              -> OCNM ~= 9.8988, range 9,
//                                     ptocnm ~= 0.9092 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTSPCNM 0.9093 at M_107;
//                                     small-n / large-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_108).
//   * pool_count=100 [1x99, 100]    -> OCNM ~= 95.8252, range 99,
//                                     ptocnm ~= 1.0331 (SPREAD --
//                                     FURTHER ABSORBED from PTSPCNM
//                                     M_107's 1.0335 spread; the
//                                     100-partner asymptote
//                                     100^(1/108) ~ 1.0436 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_108
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptocnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octocentinagintic_mean == 0
//   * tight                ptocnm < 1.005
//   * spread               ptocnm in [1.005, 1.09)
//   * wide                 ptocnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptocnm_max /
// wide_ptocnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.471):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptcentinaginticMeanSection
// (P11.469) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octocentinagintic-center
// after the P11.469 range-against-septcentinagintic-center landing.

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
type PtocnmLabel =
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

// Bands on raw ptocnm (fixed cutoffs since octocentinagintic_mean
// scales with cell counts and typical octocentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_108 is 0.9194
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0218
// (M_107) to 1.0215 (M_108), 20-partner drops from 1.0284 to 1.0281,
// 30-partner drops from 1.0323 to 1.0320, 40-partner drops from
// 1.0351 to 1.0348, 50-partner drops from 1.0372 to 1.0369,
// 60-partner drops from 1.0390 to 1.0386, 70-partner drops from
// 1.0405 to 1.0401, 80-partner drops from 1.0418 to 1.0414,
// 85-partner drops from 1.0424 to 1.0420, 89-partner drops from
// 1.0428 to 1.0424, 90-partner drops from 1.0430 to 1.0425 -- so
// pool_count >= 100 (100^(1/108) ~ 1.0436) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTSPCNM 1.0335 spread to PTOCNM 1.0331 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTOCNM_MAX = 1.005;
const WIDE_PTOCNM_MIN = 1.09;

// PTOCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octocentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octocentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptocnm_max: number;
  readonly wide_ptocnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanMap;
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

// Peak-to-octocentinagintic-mean of a discrete distribution:
//   PTOCNM = (max - min) / octocentinagintic_mean
// where octocentinagintic_mean = ((sum x_i^108) / n)^(1/108).
// Returns null on empty, solo, and degenerate (zero
// octocentinagintic_mean or non-finite hundred-and-eighth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octocentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octocentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octocentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octocentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredEighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^108 = (x^8)^13 * x^4 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad
    hundredEighthSum +=
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
      quad;
  }
  if (!Number.isFinite(hundredEighthSum) || hundredEighthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octocentinagintic_mean: null,
    };
  }
  const octocentinagintic_mean = Math.pow(
    hundredEighthSum / pool_count,
    1 / 108,
  );
  if (
    !Number.isFinite(octocentinagintic_mean) ||
    octocentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_octocentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptocnm = range / octocentinagintic_mean;
  const clamped = ptocnm < 0 ? 0 : ptocnm;
  return {
    pool_count,
    pool_cells,
    peak_to_octocentinagintic_mean: roundTo(clamped, PTOCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octocentinagintic_mean:
      partner.peak_to_octocentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octocentinagintic_mean:
      metric.peak_to_octocentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMean {
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
    tight_ptocnm_max: TIGHT_PTOCNM_MAX,
    wide_ptocnm_min: WIDE_PTOCNM_MIN,
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

function labelForPtocnm(
  pool_count: number,
  pool_cells: number,
  ptocnm: number | null,
  tight_max: number,
  wide_min: number,
): PtocnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptocnm === null) return "degenerate";
  if (ptocnm >= wide_min) return "wide";
  if (ptocnm < tight_max) return "tight";
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

function renderPtocnmCell(
  pool_count: number,
  pool_cells: number,
  ptocnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtocnm(
    pool_count,
    pool_cells,
    ptocnm,
    tight_max,
    wide_min,
  );
  const ptocnmText = ptocnm === null ? "-" : ptocnm.toFixed(4);
  return `PTOCNM ${ptocnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctocentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptocnm_max, wide_ptocnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtocnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octocentinagintic_mean, tight_ptocnm_max, wide_ptocnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtocnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octocentinagintic_mean, tight_ptocnm_max, wide_ptocnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptocnm = (max - min) / octocentinagintic_mean where octocentinagintic_mean = ((sum x_i^108) / n)^(1/108). Reads the pool's total RANGE in units of its OCTOCENTINAGINTIC (power-mean-of-order-108, M_108) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.468 PTSPCNM because raising to the ONE-HUNDRED-AND-EIGHTH power lifts the anchor MORE than raising to the hundred-and-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septcentinagintic) power-mean NOVEMTRIGINTASEPTUAGINTUPLET into a QUADRAGINTASEPTUAGINTUPLET with the M_108 octocentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptocnm approaches n^(1/108) so 10-partner pools cap near 1.0215, 20-partner near 1.0281, 30-partner near 1.0320, 40-partner near 1.0348, 50-partner near 1.0369, 60-partner near 1.0386, 70-partner near 1.0401, 80-partner near 1.0414, 85-partner near 1.0420, 89-partner near 1.0424 and 90-partner near 1.0425 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/108) ~= 1.0436) are required to escape into wide with a modest outlier. Composite regime labels: PTOCNM tight + PTSPCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTOCNM 0.9194 tight -- rejoining the uniform ramp's 0.9194 for the twenty-seventh tick in the sequence after PTSPCNM's 0.9196 joint bucket at M_107); PTOCNM spread + PTSPCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOCNM 1.0113 spread -- two 4-decimal ticks below PTSPCNM's 1.0115); PTOCNM spread + PTSPCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_108 ([1x99, 100] reads 1.0331 spread after M_107's 1.0335 spread landing); PTOCNM tight + PTSPCNM tight = ISOLATED HIGH PARTNER absorption JOINT at M_108 ([1, 100] reads 0.9964 tight joint with M_107's 0.9964 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octocentinagintic_mean == 0 (guarded but unreachable), tight = ptocnm &lt; ${tight_ptocnm_max}, spread = ptocnm in [${tight_ptocnm_max}, ${wide_ptocnm_min}), wide = ptocnm &ge; ${wide_ptocnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptocnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
