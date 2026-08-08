// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.572).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's NOVEMQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 159, M_159):
//
//   ptnqncnm = (max - min) / novemquinquagintcentinagintic_mean
//
// where novemquinquagintcentinagintic_mean = ((sum x_i^159) / n)^(1/159).
// Reads the peak spread against the NOVEMQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-159) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.570 PTOQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTY-NINTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifty-eighth does,
// dampening the ratio against the range even harder. Ninth entry
// in the FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTNQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-159)
// CENTER. Extends the (harmonic M_-1 .. octoquinquagintcentinagintic
// M_158) power-mean NONAGINTUPLET into a UNNONAGINTUPLET with
// the M_159 novemquinquagintcentinagintic mean -- ninth step into
// the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM
// (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_159 >= M_158, so
// novemquinquagintcentinagintic_mean >= octoquinquagintcentinagintic_mean
// and ptnqncnm <= ptoqncnm for every non-flat pool with finite folds.
//
// DOUBLE-PRECISION OVERFLOW REGIME INHERITED from M_155: 100^159 =
// 10^318 exceeds Number.MAX_VALUE (~1.7976e308), so any pool
// containing a cell with value >= 100 folds to a non-finite
// hundredNinthPowerSum and returns null (degenerate). The
// extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100] reference
// distributions were already degenerate at M_155 / M_156 / M_157 / M_158
// and remain so at M_159 (the overflow threshold was crossed four orders
// earlier). Pools bounded above by x_max <= 91 (91^159 ~= 6.0e310 sits
// just above the double-precision headroom edge and typically overflows
// one order above M_158) stay finite for M_159 up to x_max ~= 91;
// the transition sits somewhere in the [91, 100) band and shifts
// down by one cell-value every couple of orders. Downstream JSONL
// consumers treat degenerate the same as any earlier degenerate
// branch -- no schema change or new label needed.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max (constrained
// to x_max < 100 to stay within the finite regime),
// novemquinquagintcentinagintic_mean approaches x_max / n^(1/159),
// so ptnqncnm approaches n^(1/159) as x_max -> x_ceiling. For n=10
// the ceiling is 10^(1/159) ~= 1.0146, for n=20 ~= 1.0191, for n=30
// ~= 1.0218, for n=40 ~= 1.0236, for n=50 ~= 1.0251, for n=60
// ~= 1.0261, for n=70 ~= 1.0271, for n=80 ~= 1.0280, for n=85
// ~= 1.0285, for n=89 ~= 1.0289, for n=90 ~= 1.0289 -- all still
// just under wide -- so pools with pool_count >= 100 would be needed
// to escape into wide with a modest outlier, but such pools also
// need x_max < 100 to stay within the finite regime, so wide is
// effectively unreachable at M_159 for the [1..10] cell-value
// catalogue used in the P11.161 top-3 pool.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemquinquagintcentinagintic_mean = k,
//                                     range 0, ptnqncnm 0 (tight).
//   * uniform ramp [1..10]          -> NQNCNM ~= 9.8562, range 9,
//                                     ptnqncnm ~= 0.9131 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTOQNCNM 0.9132 at M_158).
//   * upper-outlier [1x9, 10]       -> NQNCNM ~= 9.8562, range 9,
//                                     ptnqncnm ~= 0.9131 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_159;
//                                     ADVANCES one 4-decimal tick
//                                     from PTOQNCNM 0.9132 at M_158).
//   * two-shoulders [1x8, 5x2]      -> NQNCNM ~= 4.9496, range 4,
//                                     ptnqncnm ~= 0.8081 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTOQNCNM 0.8082 at M_158).
//   * 50/50 split [1x5, 10x5]       -> NQNCNM ~= 9.9565, range 9,
//                                     ptnqncnm ~= 0.9039 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTOQNCNM 0.9040 at M_158).
//   * extreme outlier [1x9, 100]    -> hundredNinthPowerSum non-finite,
//                                     ptnqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED from
//                                     M_155/M_156/M_157/M_158; the 100^159
//                                     term exceeds Number.MAX_VALUE so
//                                     the fold trips the finite guard,
//                                     same as M_158's null landing).
//   * two-partner [1, 9]            -> NQNCNM ~= 8.9609, range 8,
//                                     ptnqncnm ~= 0.8928 (tight --
//                                     JOINT with PTOQNCNM 0.8928 at
//                                     M_158).
//   * two-partner [1, 100]          -> hundredNinthPowerSum non-finite,
//                                     ptnqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED; M_158
//                                     was also null).
//   * small [10, 1, 1]              -> NQNCNM ~= 9.9311, range 9,
//                                     ptnqncnm ~= 0.9062 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTOQNCNM 0.9063 at M_158).
//   * pool_count=100 [1x99, 100]    -> hundredNinthPowerSum non-finite,
//                                     ptnqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED; M_158
//                                     was also null).
//
// Bands on raw ptnqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemquinquagintcentinagintic_mean == 0
//                          OR hundredNinthPowerSum non-finite (the
//                          x >= 100 overflow branch fires here at M_159)
//   * tight                ptnqncnm < 1.005
//   * spread               ptnqncnm in [1.005, 1.09)
//   * wide                 ptnqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptnqncnm_max /
// wide_ptnqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.573):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoquinquagintcentinaginticMeanSection
// (P11.571) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemquinquagintcentinagintic-center
// after the P11.571 range-against-octoquinquagintcentinagintic-center landing.
//
// Naming: novemquinquagintcentinagintic = novem (9) + quinquaginta (50) +
// centinagintic (100); abbreviation PTNQNCNM (P-T-Novem-Quinquaginta[N=
// nasal marker of the quinquaginta "-N-"]-Centi-Nagintic-M) uses the
// single-N prefix pattern established at PTNQCNM (M_149 novemquadragintcentinagintic)
// to distinguish the leading "novem" segment from the plain single-Q
// prefixes. Distinct from PTOQNCNM (M_158 octoquinquagintcentinagintic)
// by the N (novem) vs O (octo) segment split, from PTQNCNM (M_150
// quinquagintcentinagintic) by the added N (novem) prefix rung, from
// PTNQCNM (M_149 novemquadragintcentinagintic) by the added inner N
// segment (quinquaginta's "-N-" middle) that swaps the quadragint root
// for the quinquaginta root, and from PTNQQM (M_59 novemquinquagintic)
// by the added centinagintic segment.

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
type PtnqncnmLabel =
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

// Bands on raw ptnqncnm (fixed cutoffs since novemquinquagintcentinagintic_mean
// scales with cell counts and typical novemquinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_159 is 0.9131
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0147
// (M_158) to 1.0146 (M_159), 20-partner drops from 1.0192 to 1.0191,
// 30-partner drops from 1.0219 to 1.0218, 40-partner drops from
// 1.0237 to 1.0236, 50-partner drops from 1.0252 to 1.0251,
// 60-partner drops from 1.0263 to 1.0261, 70-partner drops from
// 1.0273 to 1.0271, 80-partner drops from 1.0282 to 1.0280,
// 85-partner drops from 1.0287 to 1.0285, 89-partner drops from
// 1.0290 to 1.0289, 90-partner drops from 1.0290 to 1.0289 -- and
// wide is effectively unreachable at M_159 for the [1..10] cell-value
// catalogue since pool_count >= 100 with x_max < 100 (double-precision
// finite-fold ceiling) would be required to reach wide with a modest
// outlier, and the P11.161 top-3 pool caps at pool_count 10.
const TIGHT_PTNQNCNM_MAX = 1.005;
const WIDE_PTNQNCNM_MIN = 1.09;

// PTNQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemquinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemquinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnqncnm_max: number;
  readonly wide_ptnqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanMap;
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

// Peak-to-novemquinquagintcentinagintic-mean of a discrete distribution:
//   PTNQNCNM = (max - min) / novemquinquagintcentinagintic_mean
// where novemquinquagintcentinagintic_mean = ((sum x_i^159) / n)^(1/159).
// Returns null on empty, solo, and degenerate (zero
// novemquinquagintcentinagintic_mean or non-finite hundred-and-fifty-ninth-power
// sum -- the x >= 100 overflow branch fires here at M_159) so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemquinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredNinthPowerSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^159 = x^128 * x^16 * x^8 * x^4 * x^2 * x = p128 * p16 * oct * quad * sq * v
    // -- (128 + 16 + 8 + 4 + 2 + 1) decomposition reuses the p128 rung
    // shared with the M_128..M_158 siblings and multiplies by p16,
    // oct, quad, sq, v to hit the next order.
    hundredNinthPowerSum += p128 * p16 * oct * quad * sq * v;
  }
  if (
    !Number.isFinite(hundredNinthPowerSum) ||
    hundredNinthPowerSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintcentinagintic_mean: null,
    };
  }
  const novemquinquagintcentinagintic_mean = Math.pow(
    hundredNinthPowerSum / pool_count,
    1 / 159,
  );
  if (
    !Number.isFinite(novemquinquagintcentinagintic_mean) ||
    novemquinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemquinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptnqncnm = range / novemquinquagintcentinagintic_mean;
  const clamped = ptnqncnm < 0 ? 0 : ptnqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemquinquagintcentinagintic_mean: roundTo(clamped, PTNQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemquinquagintcentinagintic_mean:
      partner.peak_to_novemquinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemquinquagintcentinagintic_mean:
      metric.peak_to_novemquinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMean {
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
    tight_ptnqncnm_max: TIGHT_PTNQNCNM_MAX,
    wide_ptnqncnm_min: WIDE_PTNQNCNM_MIN,
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

function labelForPtnqncnm(
  pool_count: number,
  pool_cells: number,
  ptnqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtnqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnqncnm === null) return "degenerate";
  if (ptnqncnm >= wide_min) return "wide";
  if (ptnqncnm < tight_max) return "tight";
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

function renderPtnqncnmCell(
  pool_count: number,
  pool_cells: number,
  ptnqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnqncnm(
    pool_count,
    pool_cells,
    ptnqncnm,
    tight_max,
    wide_min,
  );
  const ptnqncnmText = ptnqncnm === null ? "-" : ptnqncnm.toFixed(4);
  return `PTNQNCNM ${ptnqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemquinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnqncnm_max, wide_ptnqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemquinquagintcentinagintic_mean, tight_ptnqncnm_max, wide_ptnqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemquinquagintcentinagintic_mean, tight_ptnqncnm_max, wide_ptnqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnqncnm = (max - min) / novemquinquagintcentinagintic_mean where novemquinquagintcentinagintic_mean = ((sum x_i^159) / n)^(1/159). Reads the pool's total RANGE in units of its NOVEMQUINQUAGINTCENTINAGINTIC (power-mean-of-order-159, M_159) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.570 PTOQNCNM because raising to the ONE-HUNDRED-AND-FIFTY-NINTH power lifts the anchor MORE than raising to the hundred-and-fifty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octoquinquagintcentinagintic) power-mean NONAGINTUPLET into a UNNONAGINTUPLET with the M_159 novemquinquagintcentinagintic mean, ninth step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151). DOUBLE-PRECISION OVERFLOW REGIME INHERITED from M_155/M_156/M_157/M_158: the 100^159 = 10^318 term exceeds Number.MAX_VALUE (~1.7976e308) so any pool containing a cell with value &ge; 100 folds to a non-finite hundredNinthPowerSum and returns null (degenerate) &mdash; extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100] were already degenerate at M_158 and remain so at M_159. Composite regime labels: PTNQNCNM tight + PTOQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNQNCNM 0.9131 tight); PTNQNCNM degenerate + PTOQNCNM degenerate = EXTREME OUTLIER OVERFLOWS INHERITED at M_159 ([1x9, 100] reads PTNQNCNM null degenerate carried over from M_158's null); PTNQNCNM degenerate + PTOQNCNM degenerate = 100-PARTNER RUNAWAY OUTLIER OVERFLOWS INHERITED at M_159 ([1x99, 100] reads null carried over from M_158's null); PTNQNCNM degenerate + PTOQNCNM degenerate = ISOLATED HIGH PARTNER OVERFLOWS INHERITED at M_159 ([1, 100] reads null degenerate carried over from M_158's null). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemquinquagintcentinagintic_mean == 0 OR hundredNinthPowerSum non-finite (the x &ge; 100 overflow branch fires here), tight = ptnqncnm &lt; ${tight_ptnqncnm_max}, spread = ptnqncnm in [${tight_ptnqncnm_max}, ${wide_ptnqncnm_min}), wide = ptnqncnm &ge; ${wide_ptnqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
