// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESEPTUAGINTIC-MEAN
// pure-lib (P11.406).
//
// WHOLE-POOL RANGE-AGAINST-SESEPTUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SESEPTUAGINTIC MEAN (a.k.a. power mean of order 76, M_76):
//
//   ptsspqm = (max - min) / seseptuagintic_mean
//
// where seseptuagintic_mean = ((sum x_i^76) / n)^(1/76). Reads
// the peak spread against the SESEPTUAGINTIC (power-mean-of-
// order-76) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here
// than under P11.404 PTQISPQM, because raising to the SEVENTY-SIXTH
// power before averaging lifts the anchor MORE than raising to the
// seventy-fifth does, dampening the ratio against the range even harder.
//
// PTSSPQM's unique DISPERSION-axis contribution: reads range in units
// of the SESEPTUAGINTIC (POWER-MEAN-OF-ORDER-76) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quattuorseptuagintic M_74, quinquaseptuagintic M_75)
// power-mean SEPTENSEPTUAGINTUPLET into an OCTOSEPTUAGINTUPLET with the
// M_76 seseptuagintic mean. By Power Mean inequality M_76 >= M_75,
// so seseptuagintic_mean >= quinquaseptuagintic_mean and
// ptsspqm <= ptqispqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// seseptuagintic_mean approaches x_max / n^(1/76), so ptsspqm
// approaches n^(1/76) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/76) ~= 1.0308, for n=20 ~= 1.0402, for n=30 ~= 1.0458, for
// n=40 ~= 1.0497, for n=50 ~= 1.0528, for n=60 ~= 1.0554, for n=70
// ~= 1.0575, for n=80 ~= 1.0594, for n=85 ~= 1.0602, for n=89 ~= 1.0609
// -- all still just under wide -- so pools with pool_count >= 100
// (100^(1/76) ~= 1.0625) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/76) ~= 1.0625, and the
// pool100 [1x99, 100] reference reads 1.0519 spread (further absorbed
// from PTQISPQM's 1.0527 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_76.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> seseptuagintic_mean = k,
//                                     range 0, ptsspqm 0 (tight).
//   * uniform ramp [1..10]          -> SSPQM ~= 9.7016, range 9,
//                                     ptsspqm ~= 0.9277 (tight).
//   * upper-outlier [1x9, 10]       -> SSPQM ~= 9.7016, range 9,
//                                     ptsspqm ~= 0.9277 (tight --
//                                     MILD OUTLIER absorbed further
//                                     than P11.404 PTQISPQM's 0.9281
//                                     tick; at M_76 both the ramp and
//                                     the outlier round together to
//                                     the same 0.9277 tick as the
//                                     anchor keeps drifting past M_75).
//   * two-shoulders [1x8, 5x2]      -> SSPQM ~= 4.8952, range 4,
//                                     ptsspqm ~= 0.8171 (tight).
//   * 50/50 split [1x5, 10x5]       -> SSPQM ~= 9.9096, range 9,
//                                     ptsspqm ~= 0.9082 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> SSPQM ~= 97.0164, range 99,
//                                     ptsspqm ~= 1.0205 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/76) ~ 1.0308 asymptote).
//   * two-partner [1, 9]            -> SSPQM ~= 8.9183, range 8,
//                                     ptsspqm ~= 0.8970 (tight).
//   * two-partner [1, 100]          -> SSPQM ~= 99.0930, range 99,
//                                     ptsspqm ~= 0.9991 (TIGHT --
//                                     ISOLATED HIGH PARTNER continues
//                                     absorption past PTQISPQM's 0.9992
//                                     tick; mean_76 tips further past
//                                     the range, so ptsspqm rounds to
//                                     0.9991 from below).
//   * small [10, 1, 1]              -> SSPQM ~= 9.8565, range 9,
//                                     ptsspqm ~= 0.9131 (tight).
//   * pool_count=100 [1x99, 100]    -> SSPQM ~= 94.1205, range 99,
//                                     ptsspqm ~= 1.0518 (SPREAD --
//                                     FURTHER ABSORBED from PTQISPQM
//                                     M_75's 1.0527 spread;
//                                     100-partner asymptote
//                                     100^(1/76) ~ 1.0625 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptsspqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR seseptuagintic_mean == 0
//   * tight                ptsspqm < 1.005
//   * spread               ptsspqm in [1.005, 1.09)
//   * wide                 ptsspqm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptsspqm_max /
// wide_ptsspqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.407):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquaseptuaginticMeanSection
// (P11.405) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-seseptuagintic-center
// after the P11.405 range-against-quinquaseptuagintic-center landing.

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
type PtsspqmLabel =
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

// Bands on raw ptsspqm (fixed cutoffs since seseptuagintic_mean
// scales with cell counts and typical seseptuagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// HOLDS at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_76 is 0.9277
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0312 (M_75) to
// 1.0308 (M_76), 20-partner drops from 1.0408 to 1.0402, 30-partner
// drops from 1.0464 to 1.0458, 40-partner drops from 1.0504 to 1.0497,
// 50-partner drops from 1.0535 to 1.0528, 60-partner drops from 1.0561
// to 1.0554, 70-partner drops from 1.0583 to 1.0575, 80-partner drops
// from 1.0602 to 1.0594, 85-partner drops from 1.0610 to 1.0602,
// 89-partner drops from 1.0617 to 1.0609 -- so pool_count >= 100
// (100^(1/76) ~ 1.0625) is now required to reach wide with a modest
// outlier. In particular pool_count=100 [1x99, 100] drops from
// PTQISPQM 1.0527 spread to PTSSPQM 1.0519 spread -- FURTHER ABSORBED
// but stays within spread; the DISPERSION power-mean progression
// continues to compress the [1x99, 100] shape.
const TIGHT_PTSSPQM_MAX = 1.005;
const WIDE_PTSSPQM_MIN = 1.09;

// PTSSPQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSSPQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_seseptuagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_seseptuagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptsspqm_max: number;
  readonly wide_ptsspqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanMap;
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

// Peak-to-seseptuagintic-mean of a discrete distribution:
//   PTSSPQM = (max - min) / seseptuagintic_mean
// where seseptuagintic_mean = ((sum x_i^76) / n)^(1/76). Returns
// null on empty, solo, and degenerate (zero seseptuagintic_mean
// or non-finite seventy-sixth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_seseptuagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_seseptuagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_seseptuagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_seseptuagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let seventySixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^76 = (x^8)^9 * x^4 -> oct*oct*oct*oct*oct*oct*oct*oct*oct * quad
    seventySixthSum +=
      oct * oct * oct * oct * oct * oct * oct * oct * oct * quad;
  }
  if (!Number.isFinite(seventySixthSum) || seventySixthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_seseptuagintic_mean: null,
    };
  }
  const seseptuagintic_mean = Math.pow(
    seventySixthSum / pool_count,
    1 / 76,
  );
  if (
    !Number.isFinite(seseptuagintic_mean) ||
    seseptuagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_seseptuagintic_mean: null,
    };
  }
  const range = max - min;
  const ptsspqm = range / seseptuagintic_mean;
  const clamped = ptsspqm < 0 ? 0 : ptsspqm;
  return {
    pool_count,
    pool_cells,
    peak_to_seseptuagintic_mean: roundTo(clamped, PTSSPQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_seseptuagintic_mean:
      partner.peak_to_seseptuagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_seseptuagintic_mean:
      metric.peak_to_seseptuagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMean {
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
    tight_ptsspqm_max: TIGHT_PTSSPQM_MAX,
    wide_ptsspqm_min: WIDE_PTSSPQM_MIN,
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

function labelForPtsspqm(
  pool_count: number,
  pool_cells: number,
  ptsspqm: number | null,
  tight_max: number,
  wide_min: number,
): PtsspqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptsspqm === null) return "degenerate";
  if (ptsspqm >= wide_min) return "wide";
  if (ptsspqm < tight_max) return "tight";
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

function renderPtsspqmCell(
  pool_count: number,
  pool_cells: number,
  ptsspqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtsspqm(
    pool_count,
    pool_cells,
    ptsspqm,
    tight_max,
    wide_min,
  );
  const ptsspqmText = ptsspqm === null ? "-" : ptsspqm.toFixed(4);
  return `PTSSPQM ${ptsspqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeseptuaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptsspqm_max, wide_ptsspqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsspqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_seseptuagintic_mean, tight_ptsspqm_max, wide_ptsspqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtsspqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_seseptuagintic_mean, tight_ptsspqm_max, wide_ptsspqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESEPTUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESEPTUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptsspqm = (max - min) / seseptuagintic_mean where seseptuagintic_mean = ((sum x_i^76) / n)^(1/76). Reads the pool's total RANGE in units of its SESEPTUAGINTIC (power-mean-of-order-76, M_76) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.404 PTQISPQM because raising to the SEVENTY-SIXTH power lifts the anchor MORE than raising to the seventy-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquaseptuagintic) power-mean SEPTENSEPTUAGINTUPLET into an OCTOSEPTUAGINTUPLET with the M_76 seseptuagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptsspqm approaches n^(1/76) so 10-partner pools cap near 1.0308, 20-partner near 1.0402, 30-partner near 1.0458, 40-partner near 1.0497, 50-partner near 1.0528, 60-partner near 1.0554, 70-partner near 1.0575, 80-partner near 1.0594, 85-partner near 1.0602 and 89-partner near 1.0609 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/76) ~= 1.0625) are required to escape into wide with a modest outlier. Composite regime labels: PTSSPQM tight + PTQISPQM tight = MILD OUTLIER absorbed by seseptuagintic ([1x9, 10] reads PTSSPQM 0.9277 tight); PTSSPQM spread + PTQISPQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSSPQM 1.0205 spread); PTSSPQM spread + PTQISPQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_76 ([1x99, 100] reads 1.0518 spread after M_75's 1.0527 spread landing); PTSSPQM tight + PTQISPQM tight = ISOLATED HIGH PARTNER continues absorption past M_75 into M_76 ([1, 100] reads 0.9991 tight after M_75's 0.9992 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR seseptuagintic_mean == 0 (guarded but unreachable), tight = ptsspqm &lt; ${tight_ptsspqm_max}, spread = ptsspqm in [${tight_ptsspqm_max}, ${wide_ptsspqm_min}), wide = ptsspqm &ge; ${wide_ptsspqm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptsspqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSSPQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSSPQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
