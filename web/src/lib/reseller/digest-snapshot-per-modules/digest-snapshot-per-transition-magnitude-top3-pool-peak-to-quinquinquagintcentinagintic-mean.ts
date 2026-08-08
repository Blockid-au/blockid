// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.564).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUINQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 155, M_155):
//
//   ptqiqncnm = (max - min) / quinquinquagintcentinagintic_mean
//
// where quinquinquagintcentinagintic_mean = ((sum x_i^155) / n)^(1/155).
// Reads the peak spread against the QUINQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-155) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.562 PTQQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTY-FIFTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifty-fourth does,
// dampening the ratio against the range even harder. Fifth entry
// in the FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTQIQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-155)
// CENTER. Extends the (harmonic M_-1 .. quattuorquinquagintcentinagintic
// M_154) power-mean SESOCTOGINTUPLET into a SEPTOCTOGINTUPLET with
// the M_155 quinquinquagintcentinagintic mean -- fifth step into
// the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM
// (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_155 >= M_154, so
// quinquinquagintcentinagintic_mean >= quattuorquinquagintcentinagintic_mean
// and ptqiqncnm <= ptqqncnm for every non-flat pool.
//
// DOUBLE-PRECISION OVERFLOW REGIME: 100^155 = 10^310 exceeds
// Number.MAX_VALUE (~1.7976e308), so any pool containing a cell with
// value >= 100 folds to a non-finite hundredFifthPowerSum and returns
// null (degenerate). This is a NOTABLE regime change from M_154 --
// the extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100]
// reference distributions all degenerate at M_155 whereas they
// returned finite ptqqncnm readings at M_154. Pools bounded above by
// x_max <= 92 (92^155 ~= 6.9e304 well within double-precision
// headroom) stay finite; the transition happens somewhere in the
// [92, 100) band. Downstream JSONL consumers treat degenerate the
// same as any earlier degenerate branch -- there is no schema change
// or new label needed to accommodate the overflow.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max (constrained
// to x_max < 100 to stay within the finite regime),
// quinquinquagintcentinagintic_mean approaches x_max / n^(1/155),
// so ptqiqncnm approaches n^(1/155) as x_max -> x_ceiling. For n=10
// the ceiling is 10^(1/155) ~= 1.0150, for n=20 ~= 1.0195, for n=30
// ~= 1.0222, for n=40 ~= 1.0241, for n=50 ~= 1.0256, for n=60
// ~= 1.0268, for n=70 ~= 1.0278, for n=80 ~= 1.0286, for n=85
// ~= 1.0290, for n=89 ~= 1.0293, for n=90 ~= 1.0294 -- all still
// just under wide -- so pools with pool_count >= 100 would be needed
// to escape into wide with a modest outlier, but such pools also
// need x_max < 100 to stay within the finite regime, so wide is
// effectively unreachable at M_155 for the [1..10] cell-value
// catalogue used in the P11.161 top-3 pool.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquinquagintcentinagintic_mean = k,
//                                     range 0, ptqiqncnm 0 (tight).
//   * uniform ramp [1..10]          -> QIQNCNM ~= 9.8525, range 9,
//                                     ptqiqncnm ~= 0.9135 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTQQNCNM 0.9136 at M_154).
//   * upper-outlier [1x9, 10]       -> QIQNCNM ~= 9.8525, range 9,
//                                     ptqiqncnm ~= 0.9135 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_155;
//                                     ADVANCES one 4-decimal tick
//                                     from PTQQNCNM 0.9136 at M_154).
//   * two-shoulders [1x8, 5x2]      -> QIQNCNM ~= 4.9484, range 4,
//                                     ptqiqncnm ~= 0.8084 (tight --
//                                     JOINT with PTQQNCNM 0.8084 at
//                                     M_154).
//   * 50/50 split [1x5, 10x5]       -> QIQNCNM ~= 9.9554, range 9,
//                                     ptqiqncnm ~= 0.9040 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTQQNCNM 0.9041 at M_154).
//   * extreme outlier [1x9, 100]    -> hundredFifthPowerSum non-finite,
//                                     ptqiqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME; the 100^155
//                                     term exceeds Number.MAX_VALUE
//                                     so the fold trips the finite
//                                     guard; whereas M_154 landed
//                                     1.0049 tight).
//   * two-partner [1, 9]            -> QIQNCNM ~= 8.9598, range 8,
//                                     ptqiqncnm ~= 0.8929 (tight --
//                                     JOINT with PTQQNCNM 0.8929 at
//                                     M_154).
//   * two-partner [1, 100]          -> hundredFifthPowerSum non-finite,
//                                     ptqiqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME; whereas M_154
//                                     landed 0.9945 tight).
//   * small [10, 1, 1]              -> QIQNCNM ~= 9.9294, range 9,
//                                     ptqiqncnm ~= 0.9064 (tight --
//                                     JOINT with PTQQNCNM 0.9064 at
//                                     M_154).
//   * pool_count=100 [1x99, 100]    -> hundredFifthPowerSum non-finite,
//                                     ptqiqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME; whereas M_154
//                                     landed 1.0201 spread).
//
// Bands on raw ptqiqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquinquagintcentinagintic_mean == 0
//                          OR hundredFifthPowerSum non-finite (the
//                          x >= 100 overflow branch fires here at M_155)
//   * tight                ptqiqncnm < 1.005
//   * spread               ptqiqncnm in [1.005, 1.09)
//   * wide                 ptqiqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqiqncnm_max /
// wide_ptqiqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.565):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuattuorquinquagintcentinaginticMeanSection
// (P11.563) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquinquagintcentinagintic-center
// after the P11.563 range-against-quattuorquinquagintcentinagintic-center landing.
//
// Naming: quinquinquagintcentinagintic = quin (5) + quin (5) +
// quaginta (50) + centinagintic (100); abbreviation PTQIQNCNM
// (P-T-QuIn-Quinquaginta[N=nasal marker of the quinquaginta
// "-N-"]-Centi-Nagintic-M) uses the QI prefix pattern established at
// PTQIQCNM (M_145 quinquadragintcentinagintic) to distinguish the
// leading "quin" segment from the plain single-Q prefixes.
// Distinct from PTQQNCNM (M_154 quattuorquinquagintcentinagintic) by
// the QI (quin) vs QQ (quattuor+quin) segment split, from PTQNCNM
// (M_150 quinquagintcentinagintic) by the added QI (quin) prefix
// rung, from PTQIQCNM (M_145 quinquadragintcentinagintic) by the
// added N segment (quinquaginta's "-N-" middle) that swaps the
// quadragint root for the quinquaginta root, and from PTQQQM (M_55
// quinquinquagintic) by the added centinagintic segment.

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
type PtqiqncnmLabel =
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

// Bands on raw ptqiqncnm (fixed cutoffs since quinquinquagintcentinagintic_mean
// scales with cell counts and typical quinquinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_155 is 0.9135
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0151
// (M_154) to 1.0150 (M_155), 20-partner drops from 1.0196 to 1.0195,
// 30-partner drops from 1.0223 to 1.0222, 40-partner drops from
// 1.0243 to 1.0241, 50-partner drops from 1.0258 to 1.0256,
// 60-partner drops from 1.0270 to 1.0268, 70-partner drops from
// 1.0280 to 1.0278, 80-partner drops from 1.0288 to 1.0286,
// 85-partner drops from 1.0292 to 1.0290, 89-partner drops from
// 1.0295 to 1.0293, 90-partner drops from 1.0296 to 1.0294 -- and
// wide is effectively unreachable at M_155 for the [1..10] cell-value
// catalogue since pool_count >= 100 with x_max < 100 (double-precision
// finite-fold ceiling) would be required to reach wide with a modest
// outlier, and the P11.161 top-3 pool caps at pool_count 10.
const TIGHT_PTQIQNCNM_MAX = 1.005;
const WIDE_PTQIQNCNM_MIN = 1.09;

// PTQIQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQIQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqiqncnm_max: number;
  readonly wide_ptqiqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanMap;
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

// Peak-to-quinquinquagintcentinagintic-mean of a discrete distribution:
//   PTQIQNCNM = (max - min) / quinquinquagintcentinagintic_mean
// where quinquinquagintcentinagintic_mean = ((sum x_i^155) / n)^(1/155).
// Returns null on empty, solo, and degenerate (zero
// quinquinquagintcentinagintic_mean or non-finite hundred-and-fifty-fifth-power
// sum -- the x >= 100 overflow branch fires here at M_155) so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFifthPowerSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^155 = x^128 * x^16 * x^8 * x^2 * x = p128 * p16 * oct * sq * v
    // -- (128 + 16 + 8 + 2 + 1) decomposition reuses the p128 rung
    // shared with the M_128..M_154 siblings and multiplies by p16,
    // oct, sq, v to hit the next order.
    hundredFifthPowerSum += p128 * p16 * oct * sq * v;
  }
  if (
    !Number.isFinite(hundredFifthPowerSum) ||
    hundredFifthPowerSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquinquagintcentinagintic_mean: null,
    };
  }
  const quinquinquagintcentinagintic_mean = Math.pow(
    hundredFifthPowerSum / pool_count,
    1 / 155,
  );
  if (
    !Number.isFinite(quinquinquagintcentinagintic_mean) ||
    quinquinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqiqncnm = range / quinquinquagintcentinagintic_mean;
  const clamped = ptqiqncnm < 0 ? 0 : ptqiqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquinquagintcentinagintic_mean: roundTo(clamped, PTQIQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquinquagintcentinagintic_mean:
      partner.peak_to_quinquinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquinquagintcentinagintic_mean:
      metric.peak_to_quinquinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMean {
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
    tight_ptqiqncnm_max: TIGHT_PTQIQNCNM_MAX,
    wide_ptqiqncnm_min: WIDE_PTQIQNCNM_MIN,
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

function labelForPtqiqncnm(
  pool_count: number,
  pool_cells: number,
  ptqiqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqiqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqiqncnm === null) return "degenerate";
  if (ptqiqncnm >= wide_min) return "wide";
  if (ptqiqncnm < tight_max) return "tight";
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

function renderPtqiqncnmCell(
  pool_count: number,
  pool_cells: number,
  ptqiqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqiqncnm(
    pool_count,
    pool_cells,
    ptqiqncnm,
    tight_max,
    wide_min,
  );
  const ptqiqncnmText = ptqiqncnm === null ? "-" : ptqiqncnm.toFixed(4);
  return `PTQIQNCNM ${ptqiqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqiqncnm_max, wide_ptqiqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquinquagintcentinagintic_mean, tight_ptqiqncnm_max, wide_ptqiqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqiqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquinquagintcentinagintic_mean, tight_ptqiqncnm_max, wide_ptqiqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqiqncnm = (max - min) / quinquinquagintcentinagintic_mean where quinquinquagintcentinagintic_mean = ((sum x_i^155) / n)^(1/155). Reads the pool's total RANGE in units of its QUINQUINQUAGINTCENTINAGINTIC (power-mean-of-order-155, M_155) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.562 PTQQNCNM because raising to the ONE-HUNDRED-AND-FIFTY-FIFTH power lifts the anchor MORE than raising to the hundred-and-fifty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..quattuorquinquagintcentinagintic) power-mean SESOCTOGINTUPLET into a SEPTOCTOGINTUPLET with the M_155 quinquinquagintcentinagintic mean, fifth step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151). DOUBLE-PRECISION OVERFLOW REGIME: at M_155 the 100^155 = 10^310 term exceeds Number.MAX_VALUE (~1.7976e308) so any pool containing a cell with value &ge; 100 folds to a non-finite hundredFifthPowerSum and returns null (degenerate) &mdash; a NOTABLE regime change from M_154 where extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100] all returned finite ptqqncnm readings. Composite regime labels: PTQIQNCNM tight + PTQQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQIQNCNM 0.9135 tight); PTQIQNCNM degenerate + PTQQNCNM tight = EXTREME OUTLIER OVERFLOWS at M_155 ([1x9, 100] reads PTQIQNCNM null degenerate as 100^155 exceeds double-precision headroom); PTQIQNCNM degenerate + PTQQNCNM spread = 100-PARTNER RUNAWAY OUTLIER OVERFLOWS at M_155 ([1x99, 100] reads null after M_154's 1.0201 spread landing); PTQIQNCNM degenerate + PTQQNCNM tight = ISOLATED HIGH PARTNER OVERFLOWS at M_155 ([1, 100] reads null degenerate after M_154's 0.9945 tight landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquinquagintcentinagintic_mean == 0 OR hundredFifthPowerSum non-finite (the x &ge; 100 overflow branch fires here), tight = ptqiqncnm &lt; ${tight_ptqiqncnm_max}, spread = ptqiqncnm in [${tight_ptqiqncnm_max}, ${wide_ptqiqncnm_min}), wide = ptqiqncnm &ge; ${wide_ptqiqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqiqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQIQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQIQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
