// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMTRIGINTIC-MEAN
// pure-lib (P11.332).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMTRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NOVEMTRIGINTIC MEAN (a.k.a. power mean of order 39, M_39):
//
//   ptntm = (max - min) / novemtrigintic_mean
//
// where novemtrigintic_mean = ((sum x_i^39) / n)^(1/39). Reads the peak
// spread against the NOVEMTRIGINTIC (power-mean-of-order-39) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.330
// PTOTM, because raising to the THIRTY-NINTH power before averaging
// lifts the anchor MORE than raising to the thirty-eighth does,
// dampening the ratio against the range even harder.
//
// PTNTM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMTRIGINTIC (POWER-MEAN-OF-ORDER-39) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... heptatrigintic M_37, octatrigintic M_38) power-mean
// QUADRAGINTUPLET into an UNQUADRAGINTUPLET with the M_39 novemtrigintic
// mean. By Power Mean inequality M_39 >= M_38, so
// novemtrigintic_mean >= octatrigintic_mean and ptntm <= ptotm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemtrigintic_mean approaches x_max / n^(1/39), so ptntm
// approaches n^(1/39) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/39) ~= 1.0608, so even the most extreme outlier in a
// 10-partner pool reads ptntm just under 1.09. For n=11 the ceiling
// is 11^(1/39) ~= 1.0634, still below the wide floor. For n=12 the
// ceiling is 12^(1/39) ~= 1.0658 (also below wide). For n=13 the
// ceiling is 13^(1/39) ~= 1.0680 (still below wide). For n=14 the
// ceiling is 14^(1/39) ~= 1.0700 (still below wide). For n=15 the
// ceiling is 15^(1/39) ~= 1.0719 (still below wide). For n=16 the
// ceiling is 16^(1/39) ~= 1.0737 (still below wide). For n=17 the
// ceiling is 17^(1/39) ~= 1.0754 (still below wide). For n=18 the
// ceiling is 18^(1/39) ~= 1.0769 (still below wide). For n=19 the
// ceiling is 19^(1/39) ~= 1.0784 (still below wide). For n=20 the
// ceiling is 20^(1/39) ~= 1.0798 (still below wide). For n=21 the
// ceiling is 21^(1/39) ~= 1.0812 (still below wide). For n=22 the
// ceiling is 22^(1/39) ~= 1.0825 (still below wide). For n=23 the
// ceiling is 23^(1/39) ~= 1.0837 (still below wide). For n=24 the
// ceiling is 24^(1/39) ~= 1.0849 (still below wide). For n=25 the
// ceiling is 25^(1/39) ~= 1.0860 (still below wide). For n=26 the
// ceiling is 26^(1/39) ~= 1.0871 (still below wide). For n=27 the
// ceiling is 27^(1/39) ~= 1.0882 (still below wide). For n=28 the
// ceiling is 28^(1/39) ~= 1.0892 (still below wide). For n=29 the
// ceiling is 29^(1/39) ~= 1.0902 -- still just under wide -- so
// pools with pool_count >= 30 (30^(1/39) ~= 1.0911) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/39) ~= 1.1253, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemtrigintic_mean = k, range 0,
//                                     ptntm 0 (tight).
//   * uniform ramp [1..10]          -> NTM ~= 9.4307, range 9, ptntm
//                                     ~= 0.9543 (tight).
//   * upper-outlier [1x9, 10]       -> NTM ~= 9.4267, range 9, ptntm
//                                     ~= 0.9547 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.330
//                                     PTOTM's 0.9562 tight landing).
//   * two-shoulders [1x8, 5x2]      -> NTM ~= 4.7979, range 4, ptntm
//                                     ~= 0.8337 (tight).
//   * 50/50 split [1x5, 10x5]       -> NTM ~= 9.8238, range 9, ptntm
//                                     ~= 0.9161 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> NTM ~= 94.2668, range 99,
//                                     ptntm ~= 1.0502 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/39) ~ 1.0608
//                                     asymptote).
//   * two-partner [1, 9]            -> NTM ~= 8.8415, range 8, ptntm
//                                     ~= 0.9048 (tight).
//   * two-partner [1, 100]          -> NTM ~= 98.2384, range 99, ptntm
//                                     ~= 1.0078 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> NTM ~= 9.7222, range 9, ptntm
//                                     ~= 0.9257 (tight).
//   * pool_count=100 [1x99, 100]    -> NTM ~= 88.8624, range 99, ptntm
//                                     ~= 1.1141 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptntm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemtrigintic_mean == 0
//   * tight                ptntm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptntm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0608,
//                          11-partner ~ 1.0634, 12-partner ~ 1.0658,
//                          13-partner ~ 1.0680, 14-partner ~ 1.0700,
//                          15-partner ~ 1.0719, 16-partner ~ 1.0737,
//                          17-partner ~ 1.0754, 18-partner ~ 1.0769,
//                          19-partner ~ 1.0784, 20-partner ~ 1.0798,
//                          21-partner ~ 1.0812, 22-partner ~ 1.0825,
//                          23-partner ~ 1.0837, 24-partner ~ 1.0849,
//                          25-partner ~ 1.0860, 26-partner ~ 1.0871,
//                          27-partner ~ 1.0882, 28-partner ~ 1.0892
//                          and 29-partner ~ 1.0902 all cap within spread)
//   * wide                 ptntm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 30)
//
// Both cutoffs are exposed on the envelope as tight_ptntm_max /
// wide_ptntm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.333):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctatriginticMeanSection
// (P11.330) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemtrigintic-center
// after the P11.330 range-against-octatrigintic-center landing.

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
type PtntmLabel =
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

// Bands on raw ptntm (fixed cutoffs since novemtrigintic_mean scales
// with cell counts and typical novemtrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.330 PTOTM's 1.005 -- MILD-OUTLIER at M_39 is 0.9547 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.330 PTOTM's
// 1.09 -- 10-partner asymptote drops from 1.0625 (M_38) to 1.0608
// (M_39), 11-partner drops from 1.0651 to 1.0634, 12-partner drops
// from 1.0676 to 1.0658, 13-partner drops from 1.0698 to 1.0680,
// 14-partner drops from 1.0719 to 1.0700, 15-partner drops from
// 1.0739 to 1.0719, 16-partner drops from 1.0757 to 1.0737, 17-partner
// drops from 1.0774 to 1.0754, 18-partner drops from 1.0790 to 1.0769,
// 19-partner drops from 1.0806 to 1.0784, 20-partner drops from
// 1.0820 to 1.0798, 21-partner drops from 1.0834 to 1.0812, 22-partner
// drops from 1.0847 to 1.0825, 23-partner drops from 1.0860 to 1.0837,
// 24-partner drops from 1.0872 to 1.0849, 25-partner drops from
// 1.0884 to 1.0860, 26-partner drops from 1.0895 to 1.0871, 27-partner
// lands at 1.0882, 28-partner lands at 1.0892 and 29-partner lands at
// 1.0902 -- so pool_count >= 30 (30^(1/39) ~ 1.0911) is now required
// to reach wide with a modest outlier.
const TIGHT_PTNTM_MAX = 1.005;
const WIDE_PTNTM_MIN = 1.09;

// PTNTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemtrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemtrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptntm_max: number;
  readonly wide_ptntm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanMap;
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

// Peak-to-novemtrigintic-mean of a discrete distribution:
//   PTNTM = (max - min) / novemtrigintic_mean
// where novemtrigintic_mean = ((sum x_i^39) / n)^(1/39). Returns null
// on empty, solo, and degenerate (zero novemtrigintic_mean or non-
// finite thirty-ninth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemtrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_novemtrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_novemtrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_novemtrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtyninthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^39 = x^8 * x^8 * x^8 * x^8 * x^4 * x^2 * x -> oct*oct*oct*oct*quad*sq*v
    thirtyninthSum += oct * oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(thirtyninthSum) || thirtyninthSum <= 0) {
    return { pool_count, pool_cells, peak_to_novemtrigintic_mean: null };
  }
  const novemtrigintic_mean = Math.pow(thirtyninthSum / pool_count, 1 / 39);
  if (!Number.isFinite(novemtrigintic_mean) || novemtrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_novemtrigintic_mean: null };
  }
  const range = max - min;
  const ptntm = range / novemtrigintic_mean;
  const clamped = ptntm < 0 ? 0 : ptntm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemtrigintic_mean: roundTo(clamped, PTNTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemtrigintic_mean: partner.peak_to_novemtrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemtrigintic_mean: metric.peak_to_novemtrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtriginticMean {
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
    tight_ptntm_max: TIGHT_PTNTM_MAX,
    wide_ptntm_min: WIDE_PTNTM_MIN,
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

function labelForPtntm(
  pool_count: number,
  pool_cells: number,
  ptntm: number | null,
  tight_max: number,
  wide_min: number,
): PtntmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptntm === null) return "degenerate";
  if (ptntm >= wide_min) return "wide";
  if (ptntm < tight_max) return "tight";
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

function renderPtntmCell(
  pool_count: number,
  pool_cells: number,
  ptntm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtntm(
    pool_count,
    pool_cells,
    ptntm,
    tight_max,
    wide_min,
  );
  const ptntmText = ptntm === null ? "-" : ptntm.toFixed(4);
  return `PTNTM ${ptntmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemtriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptntm_max, wide_ptntm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtntmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemtrigintic_mean, tight_ptntm_max, wide_ptntm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtntmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemtrigintic_mean, tight_ptntm_max, wide_ptntm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMTRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMTRIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptntm = (max - min) / novemtrigintic_mean where novemtrigintic_mean = ((sum x_i^39) / n)^(1/39). Reads the pool's total RANGE in units of its NOVEMTRIGINTIC (power-mean-of-order-39, M_39) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.330 PTOTM because raising to the THIRTY-NINTH power lifts the anchor MORE than raising to the thirty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octatrigintic) power-mean QUADRAGINTUPLET into an UNQUADRAGINTUPLET with the M_39 novemtrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptntm approaches n^(1/39) so 10-partner pools cap near 1.0608, 11-partner near 1.0634, 12-partner near 1.0658, 13-partner near 1.0680, 14-partner near 1.0700, 15-partner near 1.0719, 16-partner near 1.0737, 17-partner near 1.0754, 18-partner near 1.0769, 19-partner near 1.0784, 20-partner near 1.0798, 21-partner near 1.0812, 22-partner near 1.0825, 23-partner near 1.0837, 24-partner near 1.0849, 25-partner near 1.0860, 26-partner near 1.0871, 27-partner near 1.0882, 28-partner near 1.0892 and 29-partner near 1.0902 (all below the wide floor); pools with pool_count &gt;= 30 (30^(1/39) ~= 1.0911) are required to escape into wide with a modest outlier. Composite regime labels: PTNTM tight + PTOTM tight = MILD OUTLIER absorbed by novemtrigintic ([1x9, 10] reads PTNTM 0.9547 tight); PTNTM spread + PTOTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNTM 1.0502 spread); PTNTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1141 wide); PTNTM spread + PTOTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0078 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemtrigintic_mean == 0 (guarded but unreachable), tight = ptntm &lt; ${tight_ptntm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptntm in [${tight_ptntm_max}, ${wide_ptntm_min}) (extreme-outlier regime), wide = ptntm &ge; ${wide_ptntm_min} (runaway-outlier regime with pool_count &gt;= 30). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptntm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
