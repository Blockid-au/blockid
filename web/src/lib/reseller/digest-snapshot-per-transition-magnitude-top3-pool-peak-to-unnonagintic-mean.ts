// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNNONAGINTIC-MEAN
// pure-lib (P11.436).
//
// WHOLE-POOL RANGE-AGAINST-UNNONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNNONAGINTIC MEAN (a.k.a. power mean of order 91, M_91):
//
//   ptunm = (max - min) / unnonagintic_mean
//
// where unnonagintic_mean = ((sum x_i^91) / n)^(1/91). Reads the
// peak spread against the UNNONAGINTIC (power-mean-of-order-91)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.434 PTNGM, because raising to the NINETY-FIRST power before
// averaging lifts the anchor MORE than raising to the ninetieth
// does, dampening the ratio against the range even harder.
//
// PTUNM's unique DISPERSION-axis contribution: reads range in units
// of the UNNONAGINTIC (POWER-MEAN-OF-ORDER-91) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... novemoctogintic M_89, nonagintic M_90) power-mean
// DUOVIGINTISEPTUAGINTUPLET into a TRESVIGINTISEPTUAGINTUPLET with the
// M_91 unnonagintic mean. By Power Mean inequality M_91 >= M_90,
// so unnonagintic_mean >= nonagintic_mean and ptunm <= ptngm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// unnonagintic_mean approaches x_max / n^(1/91), so ptunm
// approaches n^(1/91) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/91) ~= 1.0256, for n=20 ~= 1.0335, for n=30 ~= 1.0381,
// for n=40 ~= 1.0414, for n=50 ~= 1.0439, for n=60 ~= 1.0460,
// for n=70 ~= 1.0478, for n=80 ~= 1.0493, for n=85 ~= 1.0500,
// for n=89 ~= 1.0506, for n=90 ~= 1.0507 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/91) ~= 1.0519)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/91) ~= 1.0519, and the pool100
// [1x99, 100] reference reads 1.0414 spread (further absorbed
// from PTNGM's 1.0420 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_91.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> unnonagintic_mean = k,
//                                     range 0, ptunm 0 (tight).
//   * uniform ramp [1..10]          -> UNM ~= 9.7502, range 9,
//                                     ptunm ~= 0.9231 (tight).
//   * upper-outlier [1x9, 10]       -> UNM ~= 9.7501, range 9,
//                                     ptunm ~= 0.9231 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_91;
//                                     the M_90 joint collapse persists
//                                     at M_91 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/91) ~ 9.7502 in
//                                     lock-step, so ptngm's 0.9233
//                                     joint bucket at M_90 becomes a
//                                     joint 0.9231 bucket at M_91).
//   * two-shoulders [1x8, 5x2]      -> UNM ~= 4.9123, range 4,
//                                     ptunm ~= 0.8143 (tight).
//   * 50/50 split [1x5, 10x5]       -> UNM ~= 9.9241, range 9,
//                                     ptunm ~= 0.9069 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> UNM ~= 97.5014, range 99,
//                                     ptunm ~= 1.0154 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/91) ~ 1.0256 asymptote).
//   * two-partner [1, 9]            -> UNM ~= 8.9317, range 8,
//                                     ptunm ~= 0.8957 (tight).
//   * two-partner [1, 100]          -> UNM ~= 99.2412, range 99,
//                                     ptunm ~= 0.9976 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     CONFIRMED at M_91; already
//                                     collapsed at M_90's 0.9977 tick
//                                     and mean_91 tips further past
//                                     the range so ptunm rounds down
//                                     to 0.9976).
//   * small [10, 1, 1]              -> UNM ~= 9.8800, range 9,
//                                     ptunm ~= 0.9109 (tight).
//   * pool_count=100 [1x99, 100]    -> UNM ~= 95.0653, range 99,
//                                     ptunm ~= 1.0414 (SPREAD --
//                                     FURTHER ABSORBED from PTNGM
//                                     M_90's 1.0420 spread;
//                                     100-partner asymptote
//                                     100^(1/91) ~ 1.0519 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptunm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR unnonagintic_mean == 0
//   * tight                ptunm < 1.005
//   * spread               ptunm in [1.005, 1.09)
//   * wide                 ptunm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptunm_max /
// wide_ptunm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.437):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNonaginticMeanSection
// (P11.435) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-unnonagintic-center
// after the P11.435 range-against-nonagintic-center landing.

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
type PtunmLabel =
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

// Bands on raw ptunm (fixed cutoffs since unnonagintic_mean scales
// with cell counts and typical unnonagintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_91 is 0.9231 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0259 (M_90) to 1.0256
// (M_91), 20-partner drops from 1.0338 to 1.0335, 30-partner drops
// from 1.0385 to 1.0381, 40-partner drops from 1.0418 to 1.0414,
// 50-partner drops from 1.0444 to 1.0439, 60-partner drops from
// 1.0465 to 1.0460, 70-partner drops from 1.0483 to 1.0478,
// 80-partner drops from 1.0499 to 1.0493, 85-partner drops from
// 1.0506 to 1.0500, 89-partner drops from 1.0511 to 1.0506,
// 90-partner ~ 1.0507 -- so pool_count >= 100 (100^(1/91) ~ 1.0519)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTNGM 1.0420 spread to PTUNM
// 1.0414 spread -- FURTHER ABSORBED but stays within spread; the
// DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTUNM_MAX = 1.005;
const WIDE_PTUNM_MIN = 1.09;

// PTUNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_unnonagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_unnonagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnnonaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptunm_max: number;
  readonly wide_ptunm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanMap;
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

// Peak-to-unnonagintic-mean of a discrete distribution:
//   PTUNM = (max - min) / unnonagintic_mean
// where unnonagintic_mean = ((sum x_i^91) / n)^(1/91). Returns
// null on empty, solo, and degenerate (zero unnonagintic_mean or
// non-finite ninety-first-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_unnonagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unnonagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_unnonagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unnonagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetyOneSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^91 = (x^8)^11 * x^3 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * sq * v
    ninetyOneSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * sq * v;
  }
  if (!Number.isFinite(ninetyOneSum) || ninetyOneSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unnonagintic_mean: null,
    };
  }
  const unnonagintic_mean = Math.pow(ninetyOneSum / pool_count, 1 / 91);
  if (!Number.isFinite(unnonagintic_mean) || unnonagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_unnonagintic_mean: null,
    };
  }
  const range = max - min;
  const ptunm = range / unnonagintic_mean;
  const clamped = ptunm < 0 ? 0 : ptunm;
  return {
    pool_count,
    pool_cells,
    peak_to_unnonagintic_mean: roundTo(clamped, PTUNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_unnonagintic_mean: partner.peak_to_unnonagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_unnonagintic_mean: metric.peak_to_unnonagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnnonaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnnonaginticMean {
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
    tight_ptunm_max: TIGHT_PTUNM_MAX,
    wide_ptunm_min: WIDE_PTUNM_MIN,
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

function labelForPtunm(
  pool_count: number,
  pool_cells: number,
  ptunm: number | null,
  tight_max: number,
  wide_min: number,
): PtunmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptunm === null) return "degenerate";
  if (ptunm >= wide_min) return "wide";
  if (ptunm < tight_max) return "tight";
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

function renderPtunmCell(
  pool_count: number,
  pool_cells: number,
  ptunm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtunm(
    pool_count,
    pool_cells,
    ptunm,
    tight_max,
    wide_min,
  );
  const ptunmText = ptunm === null ? "-" : ptunm.toFixed(4);
  return `PTUNM ${ptunmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnnonaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUnnonaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptunm_max, wide_ptunm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtunmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_unnonagintic_mean, tight_ptunm_max, wide_ptunm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtunmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_unnonagintic_mean, tight_ptunm_max, wide_ptunm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNNONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNNONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptunm = (max - min) / unnonagintic_mean where unnonagintic_mean = ((sum x_i^91) / n)^(1/91). Reads the pool's total RANGE in units of its UNNONAGINTIC (power-mean-of-order-91, M_91) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.434 PTNGM because raising to the NINETY-FIRST power lifts the anchor MORE than raising to the ninetieth does. Unique DISPERSION-axis contribution extends the (harmonic..nonagintic) power-mean DUOVIGINTISEPTUAGINTUPLET into a TRESVIGINTISEPTUAGINTUPLET with the M_91 unnonagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptunm approaches n^(1/91) so 10-partner pools cap near 1.0256, 20-partner near 1.0335, 30-partner near 1.0381, 40-partner near 1.0414, 50-partner near 1.0439, 60-partner near 1.0460, 70-partner near 1.0478, 80-partner near 1.0493, 85-partner near 1.0500, 89-partner near 1.0506 and 90-partner near 1.0507 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/91) ~= 1.0519) are required to escape into wide with a modest outlier. Composite regime labels: PTUNM tight + PTNGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTUNM 0.9231 tight -- rejoining the uniform ramp's 0.9231 for the tenth tick in the sequence after PTNGM's 0.9233 joint bucket at M_90); PTUNM spread + PTNGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUNM 1.0154 spread); PTUNM spread + PTNGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_91 ([1x99, 100] reads 1.0414 spread after M_90's 1.0420 spread landing); PTUNM tight + PTNGM tight = ISOLATED HIGH PARTNER absorption confirmed past M_90 into M_91 ([1, 100] rounds down to 0.9976 tight after M_90's 0.9977 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR unnonagintic_mean == 0 (guarded but unreachable), tight = ptunm &lt; ${tight_ptunm_max}, spread = ptunm in [${tight_ptunm_max}, ${wide_ptunm_min}), wide = ptunm &ge; ${wide_ptunm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptunm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
