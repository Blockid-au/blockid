// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEXOCTOGINTIC-MEAN
// pure-lib (P11.426).
//
// WHOLE-POOL RANGE-AGAINST-SEXOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEXOCTOGINTIC MEAN (a.k.a. power mean of order 86, M_86):
//
//   ptsogm = (max - min) / sexoctogintic_mean
//
// where sexoctogintic_mean = ((sum x_i^86) / n)^(1/86). Reads the
// peak spread against the SEXOCTOGINTIC (power-mean-of-order-86)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.424 PTQIOGM, because raising to the EIGHTY-SIXTH power before
// averaging lifts the anchor MORE than raising to the eighty-fifth
// does, dampening the ratio against the range even harder.
//
// PTSOGM's unique DISPERSION-axis contribution: reads range in units
// of the SEXOCTOGINTIC (POWER-MEAN-OF-ORDER-86) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quattuoroctogintic M_84, quinquoctogintic M_85)
// power-mean SEPTEMDECIMSEPTUAGINTUPLET into an OCTODECIMSEPTUAGINTUPLET
// with the M_86 sexoctogintic mean. By Power Mean inequality M_86
// >= M_85, so sexoctogintic_mean >= quinquoctogintic_mean and
// ptsogm <= ptqiogm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sexoctogintic_mean approaches x_max / n^(1/86), so ptsogm
// approaches n^(1/86) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/86) ~= 1.0271, for n=20 ~= 1.0354, for n=30 ~= 1.0403,
// for n=40 ~= 1.0438, for n=50 ~= 1.0465, for n=60 ~= 1.0488,
// for n=70 ~= 1.0506, for n=80 ~= 1.0523, for n=85 ~= 1.0530,
// for n=89 ~= 1.0536 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/86) ~= 1.0550) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/86) ~= 1.0550, and the pool100 [1x99, 100] reference reads
// 1.0445 spread (further absorbed from PTQIOGM's 1.0451 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_86.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sexoctogintic_mean = k,
//                                     range 0, ptsogm 0 (tight).
//   * uniform ramp [1..10]          -> SOGM ~= 9.7358, range 9,
//                                     ptsogm ~= 0.9244 (tight).
//   * upper-outlier [1x9, 10]       -> SOGM ~= 9.7358, range 9,
//                                     ptsogm ~= 0.9244 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_86;
//                                     the M_85 joint collapse persists
//                                     at M_86 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/86) ~ 9.7358 in
//                                     lock-step, so ptqiogm's 0.9247
//                                     joint bucket at M_85 remains a
//                                     joint 0.9244 bucket at M_86).
//   * two-shoulders [1x8, 5x2]      -> SOGM ~= 4.9073, range 4,
//                                     ptsogm ~= 0.8151 (tight).
//   * 50/50 split [1x5, 10x5]       -> SOGM ~= 9.9197, range 9,
//                                     ptsogm ~= 0.9073 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SOGM ~= 97.3581, range 99,
//                                     ptsogm ~= 1.0169 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/86) ~ 1.0271 asymptote).
//   * two-partner [1, 9]            -> SOGM ~= 8.9278, range 8,
//                                     ptsogm ~= 0.8961 (tight).
//   * two-partner [1, 100]          -> SOGM ~= 99.1973, range 99,
//                                     ptsogm ~= 0.9980 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTQIOGM's 0.9981
//                                     tick; mean_86 tips further past
//                                     the range, so ptsogm rounds to
//                                     0.9980 from below).
//   * small [10, 1, 1]              -> SOGM ~= 9.8731, range 9,
//                                     ptsogm ~= 0.9116 (tight).
//   * pool_count=100 [1x99, 100]    -> SOGM ~= 94.7860, range 99,
//                                     ptsogm ~= 1.0445 (SPREAD --
//                                     FURTHER ABSORBED from PTQIOGM
//                                     M_85's 1.0451 spread;
//                                     100-partner asymptote
//                                     100^(1/86) ~ 1.0550 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptsogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sexoctogintic_mean == 0
//   * tight                ptsogm < 1.005
//   * spread               ptsogm in [1.005, 1.09)
//   * wide                 ptsogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsogm_max /
// wide_ptsogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.427):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquoctoginticMeanSection
// (P11.425) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sexoctogintic-center
// after the P11.425 range-against-quinquoctogintic-center landing.

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
type PtsogmLabel =
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

// Bands on raw ptsogm (fixed cutoffs since sexoctogintic_mean scales
// with cell counts and typical sexoctogintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_86 is 0.9244 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0275 (M_85) to 1.0271
// (M_86), 20-partner drops from 1.0359 to 1.0354, 30-partner drops
// from 1.0408 to 1.0403, 40-partner drops from 1.0444 to 1.0438,
// 50-partner drops from 1.0471 to 1.0465, 60-partner drops from
// 1.0494 to 1.0488, 70-partner drops from 1.0513 to 1.0506,
// 80-partner drops from 1.0529 to 1.0523, 85-partner drops from
// 1.0537 to 1.0530, 89-partner drops from 1.0542 to 1.0536 -- so
// pool_count >= 100 (100^(1/86) ~ 1.0550) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTQIOGM 1.0451 spread to PTSOGM 1.0445
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTSOGM_MAX = 1.005;
const WIDE_PTSOGM_MIN = 1.09;

// PTSOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sexoctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sexoctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexoctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsogm_max: number;
  readonly wide_ptsogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanMap;
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

// Peak-to-sexoctogintic-mean of a discrete distribution:
//   PTSOGM = (max - min) / sexoctogintic_mean
// where sexoctogintic_mean = ((sum x_i^86) / n)^(1/86). Returns
// null on empty, solo, and degenerate (zero sexoctogintic_mean or
// non-finite eighty-sixth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sexoctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexoctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexoctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexoctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightySixSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const hex = quad * sq;
    const oct = quad * quad;
    // x^86 = (x^8)^10 * x^6 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * hex
    eightySixSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * hex;
  }
  if (!Number.isFinite(eightySixSum) || eightySixSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexoctogintic_mean: null,
    };
  }
  const sexoctogintic_mean = Math.pow(eightySixSum / pool_count, 1 / 86);
  if (
    !Number.isFinite(sexoctogintic_mean) ||
    sexoctogintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sexoctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptsogm = range / sexoctogintic_mean;
  const clamped = ptsogm < 0 ? 0 : ptsogm;
  return {
    pool_count,
    pool_cells,
    peak_to_sexoctogintic_mean: roundTo(clamped, PTSOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sexoctogintic_mean:
      partner.peak_to_sexoctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sexoctogintic_mean:
      metric.peak_to_sexoctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexoctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexoctoginticMean {
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
    tight_ptsogm_max: TIGHT_PTSOGM_MAX,
    wide_ptsogm_min: WIDE_PTSOGM_MIN,
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

function labelForPtsogm(
  pool_count: number,
  pool_cells: number,
  ptsogm: number | null,
  tight_max: number,
  wide_min: number,
): PtsogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsogm === null) return "degenerate";
  if (ptsogm >= wide_min) return "wide";
  if (ptsogm < tight_max) return "tight";
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

function renderPtsogmCell(
  pool_count: number,
  pool_cells: number,
  ptsogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsogm(
    pool_count,
    pool_cells,
    ptsogm,
    tight_max,
    wide_min,
  );
  const ptsogmText = ptsogm === null ? "-" : ptsogm.toFixed(4);
  return `PTSOGM ${ptsogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexoctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexoctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsogm_max, wide_ptsogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sexoctogintic_mean, tight_ptsogm_max, wide_ptsogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sexoctogintic_mean, tight_ptsogm_max, wide_ptsogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEXOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEXOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsogm = (max - min) / sexoctogintic_mean where sexoctogintic_mean = ((sum x_i^86) / n)^(1/86). Reads the pool's total RANGE in units of its SEXOCTOGINTIC (power-mean-of-order-86, M_86) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.424 PTQIOGM because raising to the EIGHTY-SIXTH power lifts the anchor MORE than raising to the eighty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquoctogintic) power-mean SEPTEMDECIMSEPTUAGINTUPLET into an OCTODECIMSEPTUAGINTUPLET with the M_86 sexoctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsogm approaches n^(1/86) so 10-partner pools cap near 1.0271, 20-partner near 1.0354, 30-partner near 1.0403, 40-partner near 1.0438, 50-partner near 1.0465, 60-partner near 1.0488, 70-partner near 1.0506, 80-partner near 1.0523, 85-partner near 1.0530 and 89-partner near 1.0536 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/86) ~= 1.0550) are required to escape into wide with a modest outlier. Composite regime labels: PTSOGM tight + PTQIOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTSOGM 0.9244 tight -- rejoining the uniform ramp's 0.9244 for the fifth tick in the sequence after PTQIOGM's 0.9247 joint bucket at M_85); PTSOGM spread + PTQIOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSOGM 1.0169 spread); PTSOGM spread + PTQIOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_86 ([1x99, 100] reads 1.0445 spread after M_85's 1.0451 spread landing); PTSOGM tight + PTQIOGM tight = ISOLATED HIGH PARTNER continues absorption past M_85 into M_86 ([1, 100] reads 0.9980 tight after M_85's 0.9981 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sexoctogintic_mean == 0 (guarded but unreachable), tight = ptsogm &lt; ${tight_ptsogm_max}, spread = ptsogm in [${tight_ptsogm_max}, ${wide_ptsogm_min}), wide = ptsogm &ge; ${wide_ptsogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
