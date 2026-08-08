// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-QUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.554).
//
// WHOLE-POOL RANGE-AGAINST-QUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's QUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 150, M_150):
//
//   ptqncnm = (max - min) / quinquagintcentinagintic_mean
//
// where quinquagintcentinagintic_mean = ((sum x_i^150) / n)^(1/150).
// Reads the peak spread against the QUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-150) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.552 PTNQCNM, because raising to
// the ONE-HUNDRED-AND-FIFTIETH power before averaging lifts the
// anchor MORE than raising to the hundred-and-forty-ninth does,
// dampening the ratio against the range even harder. First entry
// in the M_150+ FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the QUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-150)
// CENTER. Extends the (harmonic M_-1 .. novemquadragintcentinagintic
// M_149) power-mean UNOCTOGINTUPLET into a DUOCTOGINTUPLET with
// the M_150 quinquagintcentinagintic mean -- first step into the
// FIFTH DOZEN of the triple-digit family opened at PTQNCNM (M_150)
// past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_150 >= M_149, so
// quinquagintcentinagintic_mean >= novemquadragintcentinagintic_mean
// and ptqncnm <= ptnqcnm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// quinquagintcentinagintic_mean approaches x_max / n^(1/150),
// so ptqncnm approaches n^(1/150) as x_max -> +Inf. For n=10 the
// ceiling is 10^(1/150) ~= 1.0155, for n=20 ~= 1.0202, for n=30
// ~= 1.0229, for n=40 ~= 1.0249, for n=50 ~= 1.0264, for n=60
// ~= 1.0277, for n=70 ~= 1.0287, for n=80 ~= 1.0296, for n=85
// ~= 1.0301, for n=89 ~= 1.0304, for n=90 ~= 1.0305 -- all still
// just under wide -- so pools with pool_count >= 100
// (100^(1/150) ~= 1.0312) are required to escape into wide with a
// modest outlier. For n=100 the ceiling is 100^(1/150) ~= 1.0312,
// and the pool100 [1x99, 100] reference reads 1.0209 spread
// (further absorbed from PTNQCNM's 1.0211 spread landing -- TWO
// 4-decimal ticks of absorption at M_150) because the asymptote gap
// at n=100 has narrowed further and the [1x99, 100] pool sits
// deeper inside the spread band at M_150.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> quinquagintcentinagintic_mean = k,
//                                     range 0, ptqncnm 0 (tight).
//   * uniform ramp [1..10]          -> QNCNM ~= 9.8477, range 9,
//                                     ptqncnm ~= 0.9139 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTNQCNM 0.9140 at M_149).
//   * upper-outlier [1x9, 10]       -> QNCNM ~= 9.8477, range 9,
//                                     ptqncnm ~= 0.9139 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_150).
//   * two-shoulders [1x8, 5x2]      -> QNCNM ~= 4.9466, range 4,
//                                     ptqncnm ~= 0.8086 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTNQCNM 0.8087 at M_149).
//   * 50/50 split [1x5, 10x5]       -> QNCNM ~= 9.9539, range 9,
//                                     ptqncnm ~= 0.9042 (tight --
//                                     JOINT with PTNQCNM 0.9042 at
//                                     M_149).
//   * extreme outlier [1x9, 100]    -> QNCNM ~= 98.4767, range 99,
//                                     ptqncnm ~= 1.0053 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/150) ~ 1.0155 asymptote;
//                                     ADVANCES one 4-decimal tick
//                                     from PTNQCNM 1.0054 at M_149).
//   * two-partner [1, 9]            -> QNCNM ~= 8.9585, range 8,
//                                     ptqncnm ~= 0.8930 (tight --
//                                     JOINT with PTNQCNM 0.8930 at
//                                     M_149).
//   * two-partner [1, 100]          -> QNCNM ~= 99.5390, range 99,
//                                     ptqncnm ~= 0.9946 (TIGHT --
//                                     JOINT with PTNQCNM 0.9946 at
//                                     M_149).
//   * small [10, 1, 1]              -> QNCNM ~= 9.9270, range 9,
//                                     ptqncnm ~= 0.9066 (tight --
//                                     ADVANCES one 4-decimal tick
//                                     from PTNQCNM 0.9067 at M_149).
//   * pool_count=100 [1x99, 100]    -> QNCNM ~= 96.9765, range 99,
//                                     ptqncnm ~= 1.0209 (SPREAD --
//                                     FURTHER ABSORBED from PTNQCNM
//                                     M_149's 1.0211 spread; the
//                                     100-partner asymptote
//                                     100^(1/150) ~ 1.0312 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100 -- two 4-decimal ticks
//                                     of absorption at M_150).
//
// Bands on raw ptqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR quinquagintcentinagintic_mean == 0
//   * tight                ptqncnm < 1.005
//   * spread               ptqncnm in [1.005, 1.09)
//   * wide                 ptqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptqncnm_max /
// wide_ptqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.555):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemquadragintcentinaginticMeanSection
// (P11.553) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-quinquagintcentinagintic-center
// after the P11.553 range-against-novemquadragintcentinagintic-center landing.
//
// Naming: quinquagintcentinagintic = quin (5) + quaginta (50) +
// centinagintic (100) following the quadragintcentinagintic (M_140)
// dozen-boundary pattern; abbreviation PTQNCNM (P-T-Quin-Quaginta
// [N=nasal marker of the quinquaginta "-N-"]-Centi-Nagintic-M) is
// distinct from PTQCNM (M_140 quadragintcentinagintic) by the added
// 'N' segment (quinquaginta's "-N-" middle), from PTQICNM (M_105
// quincentinagintic) by the added quaginta segment, and from
// PTNQCNM (M_149 novemquadragintcentinagintic) by leading Q (quin)
// vs leading N (novem).

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
type PtqncnmLabel =
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

// Bands on raw ptqncnm (fixed cutoffs since quinquagintcentinagintic_mean
// scales with cell counts and typical quinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_150 is 0.9139
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0156
// (M_149) to 1.0155 (M_150), 20-partner drops from 1.0203 to 1.0202,
// 30-partner drops from 1.0231 to 1.0229, 40-partner drops from
// 1.0251 to 1.0249, 50-partner drops from 1.0266 to 1.0264,
// 60-partner drops from 1.0279 to 1.0277, 70-partner drops from
// 1.0289 to 1.0287, 80-partner drops from 1.0298 to 1.0296,
// 85-partner drops from 1.0303 to 1.0301, 89-partner drops from
// 1.0306 to 1.0304, 90-partner drops from 1.0307 to 1.0305 -- so
// pool_count >= 100 (100^(1/150) ~ 1.0312) is now required to reach
// wide with a modest outlier. In particular pool_count=100 [1x99, 100]
// drops from PTNQCNM 1.0211 spread to PTQNCNM 1.0209 spread -- FURTHER
// ABSORBED but stays within spread; the DISPERSION power-mean
// progression continues to compress the [1x99, 100] shape.
const TIGHT_PTQNCNM_MAX = 1.005;
const WIDE_PTQNCNM_MIN = 1.09;

// PTQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_quinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_quinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptqncnm_max: number;
  readonly wide_ptqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanMap;
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

// Peak-to-quinquagintcentinagintic-mean of a discrete distribution:
//   PTQNCNM = (max - min) / quinquagintcentinagintic_mean
// where quinquagintcentinagintic_mean = ((sum x_i^150) / n)^(1/150).
// Returns null on empty, solo, and degenerate (zero
// quinquagintcentinagintic_mean or non-finite hundred-and-fiftieth-power
// sum) so downstream labels fire from distinct guard branches rather
// than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_quinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredFiftiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^150 = x^128 * x^16 * x^4 * x^2 = p128 * p16 * quad * sq --
    // (128 + 16 + 4 + 2) decomposition reuses the p128 rung shared
    // with the M_128..M_149 siblings and multiplies by p16, quad, sq
    // to hit the next order.
    hundredFiftiethSum += p128 * p16 * quad * sq;
  }
  if (
    !Number.isFinite(hundredFiftiethSum) ||
    hundredFiftiethSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquagintcentinagintic_mean: null,
    };
  }
  const quinquagintcentinagintic_mean = Math.pow(
    hundredFiftiethSum / pool_count,
    1 / 150,
  );
  if (
    !Number.isFinite(quinquagintcentinagintic_mean) ||
    quinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_quinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptqncnm = range / quinquagintcentinagintic_mean;
  const clamped = ptqncnm < 0 ? 0 : ptqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_quinquagintcentinagintic_mean: roundTo(clamped, PTQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_quinquagintcentinagintic_mean:
      partner.peak_to_quinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_quinquagintcentinagintic_mean:
      metric.peak_to_quinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMean {
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
    tight_ptqncnm_max: TIGHT_PTQNCNM_MAX,
    wide_ptqncnm_min: WIDE_PTQNCNM_MIN,
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

function labelForPtqncnm(
  pool_count: number,
  pool_cells: number,
  ptqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptqncnm === null) return "degenerate";
  if (ptqncnm >= wide_min) return "wide";
  if (ptqncnm < tight_max) return "tight";
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

function renderPtqncnmCell(
  pool_count: number,
  pool_cells: number,
  ptqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtqncnm(
    pool_count,
    pool_cells,
    ptqncnm,
    tight_max,
    wide_min,
  );
  const ptqncnmText = ptqncnm === null ? "-" : ptqncnm.toFixed(4);
  return `PTQNCNM ${ptqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptqncnm_max, wide_ptqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_quinquagintcentinagintic_mean, tight_ptqncnm_max, wide_ptqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_quinquagintcentinagintic_mean, tight_ptqncnm_max, wide_ptqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-QUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-QUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptqncnm = (max - min) / quinquagintcentinagintic_mean where quinquagintcentinagintic_mean = ((sum x_i^150) / n)^(1/150). Reads the pool's total RANGE in units of its QUINQUAGINTCENTINAGINTIC (power-mean-of-order-150, M_150) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.552 PTNQCNM because raising to the ONE-HUNDRED-AND-FIFTIETH power lifts the anchor MORE than raising to the hundred-and-forty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemquadragintcentinagintic) power-mean UNOCTOGINTUPLET into a DUOCTOGINTUPLET with the M_150 quinquagintcentinagintic mean, first step into the FIFTH DOZEN of the triple-digit family opened at PTQNCNM (M_150) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149). Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptqncnm approaches n^(1/150) so 10-partner pools cap near 1.0155, 20-partner near 1.0202, 30-partner near 1.0229, 40-partner near 1.0249, 50-partner near 1.0264, 60-partner near 1.0277, 70-partner near 1.0287, 80-partner near 1.0296, 85-partner near 1.0301, 89-partner near 1.0304 and 90-partner near 1.0305 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/150) ~= 1.0312) are required to escape into wide with a modest outlier. Composite regime labels: PTQNCNM tight + PTNQCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTQNCNM 0.9139 tight -- rejoining the uniform ramp's 0.9139); PTQNCNM spread + PTNQCNM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTQNCNM 1.0053 spread -- one 4-decimal tick below PTNQCNM's 1.0054); PTQNCNM spread + PTNQCNM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_150 ([1x99, 100] reads 1.0209 spread after M_149's 1.0211 spread landing -- two 4-decimal ticks of absorption); PTQNCNM tight + PTNQCNM tight = ISOLATED HIGH PARTNER absorption JOINT with M_149 ([1, 100] reads 0.9946 tight, same as M_149's 0.9946 landing). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR quinquagintcentinagintic_mean == 0 (guarded but unreachable), tight = ptqncnm &lt; ${tight_ptqncnm_max}, spread = ptqncnm in [${tight_ptqncnm_max}, ${wide_ptqncnm_min}), wide = ptqncnm &ge; ${wide_ptqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
