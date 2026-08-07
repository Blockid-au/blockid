// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVECENTINAGINTIC-MEAN
// pure-lib (P11.472).
//
// WHOLE-POOL RANGE-AGAINST-NOVECENTINAGINTIC-CENTER dispersion
// scalar over the P11.161 pool. Folds every cell into ONE dispersion
// read that reports the pool's total RANGE (max - min) in units of
// the pool's NOVECENTINAGINTIC MEAN (a.k.a. power mean of order
// 109, M_109):
//
//   ptncnm = (max - min) / novecentinagintic_mean
//
// where novecentinagintic_mean = ((sum x_i^109) / n)^(1/109).
// Reads the peak spread against the NOVECENTINAGINTIC
// (power-mean-of-order-109) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.470 PTOCNM, because raising to
// the ONE-HUNDRED-AND-NINTH power before averaging lifts the anchor
// MORE than raising to the hundred-and-eighth does, dampening the
// ratio against the range even harder.
//
// PTNCNM's unique DISPERSION-axis contribution: reads range in units
// of the NOVECENTINAGINTIC (POWER-MEAN-OF-ORDER-109) CENTER.
// Extends the (harmonic M_-1, geometric M_0, arithmetic M_1,
// quadratic M_2, cubic M_3 ... centinagintic M_100, uncentinagintic
// M_101, ducentinagintic M_102, trecentinagintic M_103,
// quattuorcentinagintic M_104, quincentinagintic M_105,
// sexcentinagintic M_106, septcentinagintic M_107,
// octocentinagintic M_108) power-mean QUADRAGINTASEPTUAGINTUPLET
// into an UNQUADRAGINTASEPTUAGINTUPLET with the M_109
// novecentinagintic mean -- climbing further into the TRIPLE-DIGIT
// power-mean family opened at PTCNM by cracking past the round-hundred
// threshold. By Power Mean inequality M_109 >= M_108, so
// novecentinagintic_mean >= octocentinagintic_mean and ptncnm <= ptocnm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novecentinagintic_mean approaches x_max / n^(1/109), so ptncnm
// approaches n^(1/109) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/109) ~= 1.0213, for n=20 ~= 1.0279, for n=30 ~= 1.0317,
// for n=40 ~= 1.0344, for n=50 ~= 1.0365, for n=60 ~= 1.0383,
// for n=70 ~= 1.0398, for n=80 ~= 1.0410, for n=85 ~= 1.0416,
// for n=89 ~= 1.0420, for n=90 ~= 1.0421 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/109) ~= 1.0432)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/109) ~= 1.0432, and the pool100
// [1x99, 100] reference reads 1.0327 spread (further absorbed
// from PTOCNM's 1.0331 spread landing) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits deeper
// inside the spread band at M_109.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novecentinagintic_mean = k,
//                                     range 0, ptncnm 0 (tight).
//   * uniform ramp [1..10]          -> NCNM ~= 9.7910, range 9,
//                                     ptncnm ~= 0.9192 (tight --
//                                     ADVANCES two 4-decimal ticks
//                                     from PTOCNM 0.9194 at M_108).
//   * upper-outlier [1x9, 10]       -> NCNM ~= 9.7910, range 9,
//                                     ptncnm ~= 0.9192 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_109;
//                                     the M_108 joint collapse at
//                                     0.9194 persists at M_109 as a
//                                     joint 0.9192 bucket because
//                                     both anchors continue to approach
//                                     10 / 10^(1/109) ~ 9.7910 in
//                                     lock-step).
//   * two-shoulders [1x8, 5x2]      -> NCNM ~= 4.9267, range 4,
//                                     ptncnm ~= 0.8119 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTOCNM 0.8120 at M_108).
//   * 50/50 split [1x5, 10x5]       -> NCNM ~= 9.9367, range 9,
//                                     ptncnm ~= 0.9057 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTOCNM 0.9058 at M_108;
//                                     the extra power nudges the
//                                     half-and-half anchor one 4-decimal
//                                     tick at M_109 -- the M_107..M_108
//                                     joint 0.9058 landing finally
//                                     unpicks at M_109).
//   * extreme outlier [1x9, 100]    -> NCNM ~= 97.9099, range 99,
//                                     ptncnm ~= 1.0111 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/109) ~ 1.0213 asymptote;
//                                     ADVANCES two 4-decimal ticks
//                                     from PTOCNM 1.0113 at M_108).
//   * two-partner [1, 9]            -> NCNM ~= 8.9430, range 8,
//                                     ptncnm ~= 0.8946 (tight --
//                                     JOINT with PTOCNM 0.8946 at
//                                     M_108; the small-n / small-max
//                                     ratio sits inside the same
//                                     4-decimal bucket at M_109).
//   * two-partner [1, 100]          -> NCNM ~= 99.3666, range 99,
//                                     ptncnm ~= 0.9963 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES one 4-decimal bucket
//                                     from PTOCNM 0.9964 at M_108;
//                                     the M_107..M_108 joint landing
//                                     finally unpicks at M_109).
//   * small [10, 1, 1]              -> NCNM ~= 9.8996, range 9,
//                                     ptncnm ~= 0.9091 (tight --
//                                     ADVANCES one 4-decimal bucket
//                                     from PTOCNM 0.9092 at M_108;
//                                     small-n / large-max ratio
//                                     absorbs one 4-decimal tick at
//                                     M_109).
//   * pool_count=100 [1x99, 100]    -> NCNM ~= 95.8630, range 99,
//                                     ptncnm ~= 1.0327 (SPREAD --
//                                     FURTHER ABSORBED from PTOCNM
//                                     M_108's 1.0331 spread; the
//                                     100-partner asymptote
//                                     100^(1/109) ~ 1.0432 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- four 4-decimal ticks
//                                     of absorption at M_109
//                                     continues the compression trend
//                                     landed at pool_count=100 across
//                                     the recent triple-digit family).
//
// Bands on raw ptncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novecentinagintic_mean == 0
//   * tight                ptncnm < 1.005
//   * spread               ptncnm in [1.005, 1.09)
//   * wide                 ptncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptncnm_max /
// wide_ptncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.473):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctocentinaginticMeanSection
// (P11.471) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novecentinagintic-center
// after the P11.471 range-against-octocentinagintic-center landing.

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
type PtncnmLabel =
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

// Bands on raw ptncnm (fixed cutoffs since novecentinagintic_mean
// scales with cell counts and typical novecentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_109 is 0.9192
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0215
// (M_108) to 1.0213 (M_109), 20-partner drops from 1.0281 to 1.0279,
// 30-partner drops from 1.0320 to 1.0317, 40-partner drops from
// 1.0348 to 1.0344, 50-partner drops from 1.0369 to 1.0365,
// 60-partner drops from 1.0386 to 1.0383, 70-partner drops from
// 1.0401 to 1.0398, 80-partner drops from 1.0414 to 1.0410,
// 85-partner drops from 1.0420 to 1.0416, 89-partner drops from
// 1.0424 to 1.0420, 90-partner drops from 1.0425 to 1.0421 -- so
// pool_count >= 100 (100^(1/109) ~ 1.0432) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTOCNM 1.0331 spread to PTNCNM 1.0327 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTNCNM_MAX = 1.005;
const WIDE_PTNCNM_MIN = 1.09;

// PTNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novecentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novecentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptncnm_max: number;
  readonly wide_ptncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanMap;
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

// Peak-to-novecentinagintic-mean of a discrete distribution:
//   PTNCNM = (max - min) / novecentinagintic_mean
// where novecentinagintic_mean = ((sum x_i^109) / n)^(1/109).
// Returns null on empty, solo, and degenerate (zero
// novecentinagintic_mean or non-finite hundred-and-ninth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novecentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novecentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novecentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novecentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredNinthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^109 = (x^8)^13 * x^5 = oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*quad*v
    hundredNinthSum +=
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
      quad *
      v;
  }
  if (!Number.isFinite(hundredNinthSum) || hundredNinthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novecentinagintic_mean: null,
    };
  }
  const novecentinagintic_mean = Math.pow(
    hundredNinthSum / pool_count,
    1 / 109,
  );
  if (
    !Number.isFinite(novecentinagintic_mean) ||
    novecentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novecentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptncnm = range / novecentinagintic_mean;
  const clamped = ptncnm < 0 ? 0 : ptncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_novecentinagintic_mean: roundTo(clamped, PTNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novecentinagintic_mean:
      partner.peak_to_novecentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novecentinagintic_mean:
      metric.peak_to_novecentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMean {
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
    tight_ptncnm_max: TIGHT_PTNCNM_MAX,
    wide_ptncnm_min: WIDE_PTNCNM_MIN,
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

function labelForPtncnm(
  pool_count: number,
  pool_cells: number,
  ptncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptncnm === null) return "degenerate";
  if (ptncnm >= wide_min) return "wide";
  if (ptncnm < tight_max) return "tight";
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

function renderPtncnmCell(
  pool_count: number,
  pool_cells: number,
  ptncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtncnm(
    pool_count,
    pool_cells,
    ptncnm,
    tight_max,
    wide_min,
  );
  const ptncnmText = ptncnm === null ? "-" : ptncnm.toFixed(4);
  return `PTNCNM ${ptncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovecentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptncnm_max, wide_ptncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novecentinagintic_mean, tight_ptncnm_max, wide_ptncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novecentinagintic_mean, tight_ptncnm_max, wide_ptncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVECENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVECENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptncnm = (max - min) / novecentinagintic_mean where novecentinagintic_mean = ((sum x_i^109) / n)^(1/109). Reads the pool's total RANGE in units of its NOVECENTINAGINTIC (power-mean-of-order-109, M_109) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.470 PTOCNM because raising to the ONE-HUNDRED-AND-NINTH power lifts the anchor MORE than raising to the hundred-and-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octocentinagintic) power-mean QUADRAGINTASEPTUAGINTUPLET into an UNQUADRAGINTASEPTUAGINTUPLET with the M_109 novecentinagintic mean, climbing further into the TRIPLE-DIGIT power-mean family opened at PTCNM by cracking past the round-hundred threshold. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptncnm approaches n^(1/109) so 10-partner pools cap near 1.0213, 20-partner near 1.0279, 30-partner near 1.0317, 40-partner near 1.0344, 50-partner near 1.0365, 60-partner near 1.0383, 70-partner near 1.0398, 80-partner near 1.0410, 85-partner near 1.0416, 89-partner near 1.0420 and 90-partner near 1.0421 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/109) ~= 1.0432) are required to escape into wide with a modest outlier. Composite regime labels: PTNCNM tight + PTOCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNCNM 0.9192 tight -- rejoining the uniform ramp's 0.9192 for the twenty-eighth tick in the sequence after PTOCNM's 0.9194 joint bucket at M_108); PTNCNM spread + PTOCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNCNM 1.0111 spread -- two 4-decimal ticks below PTOCNM's 1.0113); PTNCNM spread + PTOCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_109 ([1x99, 100] reads 1.0327 spread after M_108's 1.0331 spread landing); PTNCNM tight + PTOCNM tight = ISOLATED HIGH PARTNER absorption ADVANCES 1 tick at M_109 ([1, 100] reads 0.9963 tight after M_108's 0.9964 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novecentinagintic_mean == 0 (guarded but unreachable), tight = ptncnm &lt; ${tight_ptncnm_max}, spread = ptncnm in [${tight_ptncnm_max}, ${wide_ptncnm_min}), wide = ptncnm &ge; ${wide_ptncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
