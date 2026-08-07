// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMOCTOGINTIC-MEAN
// pure-lib (P11.432).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMOCTOGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NOVEMOCTOGINTIC MEAN (a.k.a. power mean of order 89, M_89):
//
//   ptnogm = (max - min) / novemoctogintic_mean
//
// where novemoctogintic_mean = ((sum x_i^89) / n)^(1/89). Reads the
// peak spread against the NOVEMOCTOGINTIC (power-mean-of-order-89)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under
// P11.430 PTOOGM, because raising to the EIGHTY-NINTH power before
// averaging lifts the anchor MORE than raising to the eighty-eighth
// does, dampening the ratio against the range even harder.
//
// PTNOGM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMOCTOGINTIC (POWER-MEAN-OF-ORDER-89) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... septoctogintic M_87, octoctogintic M_88) power-mean
// VIGINTISEPTUAGINTUPLET into an UNVIGINTISEPTUAGINTUPLET with the
// M_89 novemoctogintic mean. By Power Mean inequality M_89 >= M_88,
// so novemoctogintic_mean >= octoctogintic_mean and ptnogm <= ptoogm
// for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemoctogintic_mean approaches x_max / n^(1/89), so ptnogm
// approaches n^(1/89) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/89) ~= 1.0262, for n=20 ~= 1.0342, for n=30 ~= 1.0390,
// for n=40 ~= 1.0423, for n=50 ~= 1.0449, for n=60 ~= 1.0471,
// for n=70 ~= 1.0489, for n=80 ~= 1.0505, for n=85 ~= 1.0512,
// for n=89 ~= 1.0517 -- all still just under wide -- so pools with
// pool_count >= 100 (100^(1/89) ~= 1.0531) are required to escape
// into wide with a modest outlier. For n=100 the ceiling is
// 100^(1/89) ~= 1.0531, and the pool100 [1x99, 100] reference reads
// 1.0426 spread (further absorbed from PTOOGM's 1.0432 spread
// landing) because the asymptote gap at n=100 has narrowed and the
// [1x99, 100] pool sits deeper inside the spread band at M_89.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemoctogintic_mean = k,
//                                     range 0, ptnogm 0 (tight).
//   * uniform ramp [1..10]          -> NOGM ~= 9.7446, range 9,
//                                     ptnogm ~= 0.9236 (tight).
//   * upper-outlier [1x9, 10]       -> NOGM ~= 9.7446, range 9,
//                                     ptnogm ~= 0.9236 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_89;
//                                     the M_88 joint collapse persists
//                                     at M_89 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/89) ~ 9.7446 in
//                                     lock-step, so ptoogm's 0.9239
//                                     joint bucket at M_88 remains a
//                                     joint 0.9236 bucket at M_89).
//   * two-shoulders [1x8, 5x2]      -> NOGM ~= 4.9104, range 4,
//                                     ptnogm ~= 0.8146 (tight).
//   * 50/50 split [1x5, 10x5]       -> NOGM ~= 9.9224, range 9,
//                                     ptnogm ~= 0.9070 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> NOGM ~= 97.4460, range 99,
//                                     ptnogm ~= 1.0159 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/89) ~ 1.0262 asymptote).
//   * two-partner [1, 9]            -> NOGM ~= 8.9302, range 8,
//                                     ptnogm ~= 0.8958 (tight).
//   * two-partner [1, 100]          -> NOGM ~= 99.2242, range 99,
//                                     ptnogm ~= 0.9977 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTOOGM's 0.9978
//                                     tick; mean_89 tips further past
//                                     the range, so ptnogm rounds to
//                                     0.9977 from below).
//   * small [10, 1, 1]              -> NOGM ~= 9.8773, range 9,
//                                     ptnogm ~= 0.9112 (tight).
//   * pool_count=100 [1x99, 100]    -> NOGM ~= 94.9572, range 99,
//                                     ptnogm ~= 1.0426 (SPREAD --
//                                     FURTHER ABSORBED from PTOOGM
//                                     M_88's 1.0432 spread;
//                                     100-partner asymptote
//                                     100^(1/89) ~ 1.0531 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptnogm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemoctogintic_mean == 0
//   * tight                ptnogm < 1.005
//   * spread               ptnogm in [1.005, 1.09)
//   * wide                 ptnogm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptnogm_max /
// wide_ptnogm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.433):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoctoginticMeanSection
// (P11.431) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemoctogintic-center
// after the P11.431 range-against-octoctogintic-center landing.

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
type PtnogmLabel =
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

// Bands on raw ptnogm (fixed cutoffs since novemoctogintic_mean scales
// with cell counts and typical novemoctogintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_89 is 0.9236 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344 PTQIQM's
// 1.09 -- 10-partner asymptote drops from 1.0265 (M_88) to 1.0262
// (M_89), 20-partner drops from 1.0346 to 1.0342, 30-partner drops
// from 1.0394 to 1.0390, 40-partner drops from 1.0428 to 1.0423,
// 50-partner drops from 1.0455 to 1.0449, 60-partner drops from
// 1.0476 to 1.0471, 70-partner drops from 1.0495 to 1.0489,
// 80-partner drops from 1.0511 to 1.0505, 85-partner drops from
// 1.0518 to 1.0512, 89-partner drops from 1.0523 to 1.0517 -- so
// pool_count >= 100 (100^(1/89) ~ 1.0531) is now required to reach
// wide with a modest outlier. In particular pool_count=100
// [1x99, 100] drops from PTOOGM 1.0432 spread to PTNOGM 1.0426
// spread -- FURTHER ABSORBED but stays within spread; the DISPERSION
// power-mean progression continues to compress the [1x99, 100] shape.
const TIGHT_PTNOGM_MAX = 1.005;
const WIDE_PTNOGM_MIN = 1.09;

// PTNOGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNOGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemoctogintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemoctogintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnogm_max: number;
  readonly wide_ptnogm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanMap;
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

// Peak-to-novemoctogintic-mean of a discrete distribution:
//   PTNOGM = (max - min) / novemoctogintic_mean
// where novemoctogintic_mean = ((sum x_i^89) / n)^(1/89). Returns
// null on empty, solo, and degenerate (zero novemoctogintic_mean or
// non-finite eighty-ninth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemoctogintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemoctogintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemoctogintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemoctogintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let eightyNineSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^89 = (x^8)^11 * x -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct * v
    eightyNineSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(eightyNineSum) || eightyNineSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemoctogintic_mean: null,
    };
  }
  const novemoctogintic_mean = Math.pow(eightyNineSum / pool_count, 1 / 89);
  if (
    !Number.isFinite(novemoctogintic_mean) ||
    novemoctogintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_novemoctogintic_mean: null,
    };
  }
  const range = max - min;
  const ptnogm = range / novemoctogintic_mean;
  const clamped = ptnogm < 0 ? 0 : ptnogm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemoctogintic_mean: roundTo(clamped, PTNOGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemoctogintic_mean:
      partner.peak_to_novemoctogintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemoctogintic_mean:
      metric.peak_to_novemoctogintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMean {
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
    tight_ptnogm_max: TIGHT_PTNOGM_MAX,
    wide_ptnogm_min: WIDE_PTNOGM_MIN,
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

function labelForPtnogm(
  pool_count: number,
  pool_cells: number,
  ptnogm: number | null,
  tight_max: number,
  wide_min: number,
): PtnogmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnogm === null) return "degenerate";
  if (ptnogm >= wide_min) return "wide";
  if (ptnogm < tight_max) return "tight";
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

function renderPtnogmCell(
  pool_count: number,
  pool_cells: number,
  ptnogm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnogm(
    pool_count,
    pool_cells,
    ptnogm,
    tight_max,
    wide_min,
  );
  const ptnogmText = ptnogm === null ? "-" : ptnogm.toFixed(4);
  return `PTNOGM ${ptnogmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemoctoginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnogm_max, wide_ptnogm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnogmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemoctogintic_mean, tight_ptnogm_max, wide_ptnogm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnogmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemoctogintic_mean, tight_ptnogm_max, wide_ptnogm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMOCTOGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMOCTOGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnogm = (max - min) / novemoctogintic_mean where novemoctogintic_mean = ((sum x_i^89) / n)^(1/89). Reads the pool's total RANGE in units of its NOVEMOCTOGINTIC (power-mean-of-order-89, M_89) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.430 PTOOGM because raising to the EIGHTY-NINTH power lifts the anchor MORE than raising to the eighty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octoctogintic) power-mean VIGINTISEPTUAGINTUPLET into an UNVIGINTISEPTUAGINTUPLET with the M_89 novemoctogintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnogm approaches n^(1/89) so 10-partner pools cap near 1.0262, 20-partner near 1.0342, 30-partner near 1.0390, 40-partner near 1.0423, 50-partner near 1.0449, 60-partner near 1.0471, 70-partner near 1.0489, 80-partner near 1.0505, 85-partner near 1.0512 and 89-partner near 1.0517 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/89) ~= 1.0531) are required to escape into wide with a modest outlier. Composite regime labels: PTNOGM tight + PTOOGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTNOGM 0.9236 tight -- rejoining the uniform ramp's 0.9236 for the eighth tick in the sequence after PTOOGM's 0.9239 joint bucket at M_88); PTNOGM spread + PTOOGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNOGM 1.0159 spread); PTNOGM spread + PTOOGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_89 ([1x99, 100] reads 1.0426 spread after M_88's 1.0432 spread landing); PTNOGM tight + PTOOGM tight = ISOLATED HIGH PARTNER continues absorption past M_88 into M_89 ([1, 100] reads 0.9977 tight after M_88's 0.9978 tick). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemoctogintic_mean == 0 (guarded but unreachable), tight = ptnogm &lt; ${tight_ptnogm_max}, spread = ptnogm in [${tight_ptnogm_max}, ${wide_ptnogm_min}), wide = ptnogm &ge; ${wide_ptnogm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnogm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNOGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNOGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
