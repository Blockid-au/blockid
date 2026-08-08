// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESQUINQUAGINTCENTINAGINTIC-MEAN
// pure-lib (P11.566).
//
// WHOLE-POOL RANGE-AGAINST-SESQUINQUAGINTCENTINAGINTIC-CENTER
// dispersion scalar over the P11.161 pool. Folds every cell into ONE
// dispersion read that reports the pool's total RANGE (max - min) in
// units of the pool's SESQUINQUAGINTCENTINAGINTIC MEAN (power mean of
// order 156, M_156):
//
//   ptsqncnm = (max - min) / sesquinquagintcentinagintic_mean
//
// where sesquinquagintcentinagintic_mean = ((sum x_i^156) / n)^(1/156).
// Reads the peak spread against the SESQUINQUAGINTCENTINAGINTIC
// (power-mean-of-order-156) centre so a LARGE-VALUE-DOMINATED pool
// reads TIGHTER here than under P11.565 PTQIQNCNM, because raising to
// the ONE-HUNDRED-AND-FIFTY-SIXTH power before averaging lifts the
// anchor MORE than raising to the hundred-and-fifty-fifth does,
// dampening the ratio against the range even harder. Sixth entry
// in the FIFTH-DOZEN OF THE TRIPLE-DIGIT power-mean family
// (past the quinquaginta prefix boundary above the quadragint dozen).
//
// PTSQNCNM's unique DISPERSION-axis contribution: reads range in units
// of the SESQUINQUAGINTCENTINAGINTIC (POWER-MEAN-OF-ORDER-156)
// CENTER. Extends the (harmonic M_-1 .. quinquinquagintcentinagintic
// M_155) power-mean SEPTOCTOGINTUPLET into an OCTOCTOGINTUPLET with
// the M_156 sesquinquagintcentinagintic mean -- sixth step into
// the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM
// (M_151) past the fourth dozen (PTQCNM M_140 .. PTNQCNM M_149).
// By the Power Mean inequality M_156 >= M_155, so
// sesquinquagintcentinagintic_mean >= quinquinquagintcentinagintic_mean
// and ptsqncnm <= ptqiqncnm for every non-flat pool with finite folds.
//
// DOUBLE-PRECISION OVERFLOW REGIME: 100^156 = 10^312 exceeds
// Number.MAX_VALUE (~1.7976e308), so any pool containing a cell with
// value >= 100 folds to a non-finite hundredSixthPowerSum and returns
// null (degenerate). This regime is INHERITED from M_155 -- the
// extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100] reference
// distributions were already degenerate at M_155 and remain so at
// M_156 (the overflow threshold was crossed one order earlier).
// Pools bounded above by x_max <= 92 (92^156 ~= 6.4e306 well within
// double-precision headroom) stay finite; the transition sits
// somewhere in the [92, 100) band. Downstream JSONL consumers treat
// degenerate the same as any earlier degenerate branch -- no schema
// change or new label needed.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max (constrained
// to x_max < 100 to stay within the finite regime),
// sesquinquagintcentinagintic_mean approaches x_max / n^(1/156),
// so ptsqncnm approaches n^(1/156) as x_max -> x_ceiling. For n=10
// the ceiling is 10^(1/156) ~= 1.0149, for n=20 ~= 1.0194, for n=30
// ~= 1.0221, for n=40 ~= 1.0240, for n=50 ~= 1.0255, for n=60
// ~= 1.0267, for n=70 ~= 1.0277, for n=80 ~= 1.0285, for n=85
// ~= 1.0289, for n=89 ~= 1.0292, for n=90 ~= 1.0293 -- all still
// just under wide -- so pools with pool_count >= 100 would be needed
// to escape into wide with a modest outlier, but such pools also
// need x_max < 100 to stay within the finite regime, so wide is
// effectively unreachable at M_156 for the [1..10] cell-value
// catalogue used in the P11.161 top-3 pool.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sesquinquagintcentinagintic_mean = k,
//                                     range 0, ptsqncnm 0 (tight).
//   * uniform ramp [1..10]          -> SQNCNM ~= 9.8535, range 9,
//                                     ptsqncnm ~= 0.9134 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTQIQNCNM 0.9135 at M_155).
//   * upper-outlier [1x9, 10]       -> SQNCNM ~= 9.8535, range 9,
//                                     ptsqncnm ~= 0.9134 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_156;
//                                     ADVANCES one 4-decimal tick
//                                     from PTQIQNCNM 0.9135 at M_155).
//   * two-shoulders [1x8, 5x2]      -> SQNCNM ~= 4.9487, range 4,
//                                     ptsqncnm ~= 0.8083 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTQIQNCNM 0.8084 at M_155).
//   * 50/50 split [1x5, 10x5]       -> SQNCNM ~= 9.9557, range 9,
//                                     ptsqncnm ~= 0.9040 (tight --
//                                     JOINT with PTQIQNCNM 0.9040 at
//                                     M_155).
//   * extreme outlier [1x9, 100]    -> hundredSixthPowerSum non-finite,
//                                     ptsqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED from
//                                     M_155; the 100^156 term exceeds
//                                     Number.MAX_VALUE so the fold
//                                     trips the finite guard, same as
//                                     M_155's null landing).
//   * two-partner [1, 9]            -> SQNCNM ~= 8.9601, range 8,
//                                     ptsqncnm ~= 0.8928 (tight --
//                                     ADVANCES one 4-decimal tick from
//                                     PTQIQNCNM 0.8929 at M_155).
//   * two-partner [1, 100]          -> hundredSixthPowerSum non-finite,
//                                     ptsqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED; M_155
//                                     was also null).
//   * small [10, 1, 1]              -> SQNCNM ~= 9.9298, range 9,
//                                     ptsqncnm ~= 0.9064 (tight --
//                                     JOINT with PTQIQNCNM 0.9064 at
//                                     M_155).
//   * pool_count=100 [1x99, 100]    -> hundredSixthPowerSum non-finite,
//                                     ptsqncnm null (DEGENERATE --
//                                     OVERFLOW REGIME INHERITED; M_155
//                                     was also null).
//
// Bands on raw ptsqncnm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sesquinquagintcentinagintic_mean == 0
//                          OR hundredSixthPowerSum non-finite (the
//                          x >= 100 overflow branch fires here at M_156)
//   * tight                ptsqncnm < 1.005
//   * spread               ptsqncnm in [1.005, 1.09)
//   * wide                 ptsqncnm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsqncnm_max /
// wide_ptsqncnm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.567):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquinquagintcentinaginticMeanSection
// (P11.565) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sesquinquagintcentinagintic-center
// after the P11.565 range-against-quinquinquagintcentinagintic-center landing.
//
// Naming: sesquinquagintcentinagintic = ses (6) + quinquaginta (50) +
// centinagintic (100); abbreviation PTSQNCNM (P-T-Ses-Quinquaginta[N=
// nasal marker of the quinquaginta "-N-"]-Centi-Nagintic-M) uses the
// S prefix pattern established at PTSQCNM (M_146 sesquadragintcentinagintic)
// to distinguish the leading "ses" segment from the plain single-Q
// prefixes. Distinct from PTQIQNCNM (M_155 quinquinquagintcentinagintic)
// by the S (ses) vs QI (quin) segment split, from PTQNCNM (M_150
// quinquagintcentinagintic) by the added S (ses) prefix rung, from
// PTSQCNM (M_146 sesquadragintcentinagintic) by the added N segment
// (quinquaginta's "-N-" middle) that swaps the quadragint root for
// the quinquaginta root, and from PTSEQQM (M_56 sesquinquagintic) by
// the added centinagintic segment.

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
type PtsqncnmLabel =
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

// Bands on raw ptsqncnm (fixed cutoffs since sesquinquagintcentinagintic_mean
// scales with cell counts and typical sesquinquagintcentinagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_156 is 0.9134
// (already well below the 1.005 buffer). Wide boundary HOLDS at
// P11.344 PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0150
// (M_155) to 1.0149 (M_156), 20-partner drops from 1.0195 to 1.0194,
// 30-partner drops from 1.0222 to 1.0221, 40-partner drops from
// 1.0241 to 1.0240, 50-partner drops from 1.0256 to 1.0255,
// 60-partner drops from 1.0268 to 1.0267, 70-partner drops from
// 1.0278 to 1.0277, 80-partner drops from 1.0286 to 1.0285,
// 85-partner drops from 1.0290 to 1.0289, 89-partner drops from
// 1.0293 to 1.0292, 90-partner drops from 1.0294 to 1.0293 -- and
// wide is effectively unreachable at M_156 for the [1..10] cell-value
// catalogue since pool_count >= 100 with x_max < 100 (double-precision
// finite-fold ceiling) would be required to reach wide with a modest
// outlier, and the P11.161 top-3 pool caps at pool_count 10.
const TIGHT_PTSQNCNM_MAX = 1.005;
const WIDE_PTSQNCNM_MIN = 1.09;

// PTSQNCNM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSQNCNM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sesquinquagintcentinagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sesquinquagintcentinagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsqncnm_max: number;
  readonly wide_ptsqncnm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanMap;
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

// Peak-to-sesquinquagintcentinagintic-mean of a discrete distribution:
//   PTSQNCNM = (max - min) / sesquinquagintcentinagintic_mean
// where sesquinquagintcentinagintic_mean = ((sum x_i^156) / n)^(1/156).
// Returns null on empty, solo, and degenerate (zero
// sesquinquagintcentinagintic_mean or non-finite hundred-and-fifty-sixth-power
// sum -- the x >= 100 overflow branch fires here at M_156) so
// downstream labels fire from distinct guard branches rather than
// from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sesquinquagintcentinagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintcentinagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintcentinagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let hundredSixthPowerSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    const p16 = oct * oct;
    const p32 = p16 * p16;
    const p64 = p32 * p32;
    const p128 = p64 * p64;
    // x^156 = x^128 * x^16 * x^8 * x^4 = p128 * p16 * oct * quad
    // -- (128 + 16 + 8 + 4) decomposition reuses the p128 rung
    // shared with the M_128..M_155 siblings and multiplies by p16,
    // oct, quad to hit the next order.
    hundredSixthPowerSum += p128 * p16 * oct * quad;
  }
  if (
    !Number.isFinite(hundredSixthPowerSum) ||
    hundredSixthPowerSum <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintcentinagintic_mean: null,
    };
  }
  const sesquinquagintcentinagintic_mean = Math.pow(
    hundredSixthPowerSum / pool_count,
    1 / 156,
  );
  if (
    !Number.isFinite(sesquinquagintcentinagintic_mean) ||
    sesquinquagintcentinagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintcentinagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsqncnm = range / sesquinquagintcentinagintic_mean;
  const clamped = ptsqncnm < 0 ? 0 : ptsqncnm;
  return {
    pool_count,
    pool_cells,
    peak_to_sesquinquagintcentinagintic_mean: roundTo(clamped, PTSQNCNM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sesquinquagintcentinagintic_mean:
      partner.peak_to_sesquinquagintcentinagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sesquinquagintcentinagintic_mean:
      metric.peak_to_sesquinquagintcentinagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMean {
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
    tight_ptsqncnm_max: TIGHT_PTSQNCNM_MAX,
    wide_ptsqncnm_min: WIDE_PTSQNCNM_MIN,
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

function labelForPtsqncnm(
  pool_count: number,
  pool_cells: number,
  ptsqncnm: number | null,
  tight_max: number,
  wide_min: number,
): PtsqncnmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsqncnm === null) return "degenerate";
  if (ptsqncnm >= wide_min) return "wide";
  if (ptsqncnm < tight_max) return "tight";
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

function renderPtsqncnmCell(
  pool_count: number,
  pool_cells: number,
  ptsqncnm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsqncnm(
    pool_count,
    pool_cells,
    ptsqncnm,
    tight_max,
    wide_min,
  );
  const ptsqncnmText = ptsqncnm === null ? "-" : ptsqncnm.toFixed(4);
  return `PTSQNCNM ${ptsqncnmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquagintcentinaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsqncnm_max, wide_ptsqncnm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsqncnmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sesquinquagintcentinagintic_mean, tight_ptsqncnm_max, wide_ptsqncnm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsqncnmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sesquinquagintcentinagintic_mean, tight_ptsqncnm_max, wide_ptsqncnm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESQUINQUAGINTCENTINAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESQUINQUAGINTCENTINAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsqncnm = (max - min) / sesquinquagintcentinagintic_mean where sesquinquagintcentinagintic_mean = ((sum x_i^156) / n)^(1/156). Reads the pool's total RANGE in units of its SESQUINQUAGINTCENTINAGINTIC (power-mean-of-order-156, M_156) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.565 PTQIQNCNM because raising to the ONE-HUNDRED-AND-FIFTY-SIXTH power lifts the anchor MORE than raising to the hundred-and-fifty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquinquagintcentinagintic) power-mean SEPTOCTOGINTUPLET into an OCTOCTOGINTUPLET with the M_156 sesquinquagintcentinagintic mean, sixth step into the FIFTH DOZEN of the triple-digit family opened at PTUQNCNM (M_151). DOUBLE-PRECISION OVERFLOW REGIME INHERITED from M_155: the 100^156 = 10^312 term exceeds Number.MAX_VALUE (~1.7976e308) so any pool containing a cell with value &ge; 100 folds to a non-finite hundredSixthPowerSum and returns null (degenerate) &mdash; extreme[1x9, 100], twoPart[1, 100] and pool100[1x99, 100] were already degenerate at M_155 and remain so at M_156. Composite regime labels: PTSQNCNM tight + PTQIQNCNM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSQNCNM 0.9134 tight); PTSQNCNM degenerate + PTQIQNCNM degenerate = EXTREME OUTLIER OVERFLOWS INHERITED at M_156 ([1x9, 100] reads PTSQNCNM null degenerate carried over from M_155's null); PTSQNCNM degenerate + PTQIQNCNM degenerate = 100-PARTNER RUNAWAY OUTLIER OVERFLOWS INHERITED at M_156 ([1x99, 100] reads null carried over from M_155's null); PTSQNCNM degenerate + PTQIQNCNM degenerate = ISOLATED HIGH PARTNER OVERFLOWS INHERITED at M_156 ([1, 100] reads null degenerate carried over from M_155's null). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sesquinquagintcentinagintic_mean == 0 OR hundredSixthPowerSum non-finite (the x &ge; 100 overflow branch fires here), tight = ptsqncnm &lt; ${tight_ptsqncnm_max}, spread = ptsqncnm in [${tight_ptsqncnm_max}, ${wide_ptsqncnm_min}), wide = ptsqncnm &ge; ${wide_ptsqncnm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsqncnm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSQNCNM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSQNCNM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
