// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-PENTATRIGINTIC-MEAN
// pure-lib (P11.324).
//
// WHOLE-POOL RANGE-AGAINST-PENTATRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's PENTATRIGINTIC MEAN (a.k.a. power mean of order 35, M_35):
//
//   ptptm = (max - min) / pentatrigintic_mean
//
// where pentatrigintic_mean = ((sum x_i^35) / n)^(1/35). Reads the peak
// spread against the PENTATRIGINTIC (power-mean-of-order-35) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.322
// PTTETM, because raising to the THIRTY-FIFTH power before averaging
// lifts the anchor MORE than raising to the thirty-fourth does, dampening
// the ratio against the range even harder.
//
// PTPTM's unique DISPERSION-axis contribution: reads range in units
// of the PENTATRIGINTIC (POWER-MEAN-OF-ORDER-35) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... tretrigintic M_33, tetratrigintic M_34) power-mean
// HEXATRIGINTUPLET into a HEPTATRIGINTUPLET with the M_35 pentatrigintic
// mean. By Power Mean inequality M_35 >= M_34, so
// pentatrigintic_mean >= tetratrigintic_mean and ptptm <= pttetm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// pentatrigintic_mean approaches x_max / n^(1/35), so ptptm
// approaches n^(1/35) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/35) ~= 1.0680, so even the most extreme outlier in a
// 10-partner pool reads ptptm just under 1.09. For n=11 the ceiling
// is 11^(1/35) ~= 1.0709, still below the wide floor. For n=12 the
// ceiling is 12^(1/35) ~= 1.0736 (also below wide). For n=13 the
// ceiling is 13^(1/35) ~= 1.0760 (still below wide). For n=14 the
// ceiling is 14^(1/35) ~= 1.0783 (still below wide). For n=15 the
// ceiling is 15^(1/35) ~= 1.0804 (still below wide). For n=16 the
// ceiling is 16^(1/35) ~= 1.0824 (still below wide). For n=17 the
// ceiling is 17^(1/35) ~= 1.0843 (still below wide). For n=18 the
// ceiling is 18^(1/35) ~= 1.0861 (still below wide). For n=19 the
// ceiling is 19^(1/35) ~= 1.0878 (still below wide). For n=20 the
// ceiling is 20^(1/35) ~= 1.0894 -- still just under wide -- so
// pools with pool_count >= 21 (21^(1/35) ~= 1.0909) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/35) ~= 1.1402, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> pentatrigintic_mean = k, range 0,
//                                     ptptm 0 (tight).
//   * uniform ramp [1..10]          -> PTM ~= 9.3700, range 9, ptptm
//                                     ~= 0.9605 (tight).
//   * upper-outlier [1x9, 10]       -> PTM ~= 9.3633, range 9, ptptm
//                                     ~= 0.9612 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.322
//                                     PTTETM's 0.9631 tight landing).
//   * two-shoulders [1x8, 5x2]      -> PTM ~= 4.7753, range 4, ptptm
//                                     ~= 0.8376 (tight).
//   * 50/50 split [1x5, 10x5]       -> PTM ~= 9.8039, range 9, ptptm
//                                     ~= 0.9180 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> PTM ~= 93.6329, range 99,
//                                     ptptm ~= 1.0573 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/35) ~ 1.0680
//                                     asymptote).
//   * two-partner [1, 9]            -> PTM ~= 8.8235, range 8, ptptm
//                                     ~= 0.9067 (tight).
//   * two-partner [1, 100]          -> PTM ~= 98.0391, range 99, ptptm
//                                     ~= 1.0098 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> PTM ~= 9.6910, range 9, ptptm
//                                     ~= 0.9287 (tight).
//   * pool_count=100 [1x99, 100]    -> PTM ~= 87.6712, range 99, ptptm
//                                     ~= 1.1292 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptptm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR pentatrigintic_mean == 0
//   * tight                ptptm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptptm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0680,
//                          11-partner ~ 1.0709, 12-partner ~ 1.0736,
//                          13-partner ~ 1.0760, 14-partner ~ 1.0783,
//                          15-partner ~ 1.0804, 16-partner ~ 1.0824,
//                          17-partner ~ 1.0843, 18-partner ~ 1.0861,
//                          19-partner ~ 1.0878 and 20-partner ~ 1.0894
//                          all cap within spread)
//   * wide                 ptptm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 21)
//
// Both cutoffs are exposed on the envelope as tight_ptptm_max /
// wide_ptptm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.325):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTetratriginticMeanSection
// (P11.322) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-pentatrigintic-center
// after the P11.322 range-against-tetratrigintic-center landing.

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
type PtptmLabel =
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

// Bands on raw ptptm (fixed cutoffs since pentatrigintic_mean scales
// with cell counts and typical pentatrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.322 PTTETM's 1.005 -- MILD-OUTLIER at M_35 is 0.9612 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.322 PTTETM's
// 1.09 -- 10-partner asymptote drops from 1.0701 (M_34) to 1.0680
// (M_35), 11-partner drops from 1.0731 to 1.0709, 12-partner drops
// from 1.0758 to 1.0736, 13-partner drops from 1.0784 to 1.0760,
// 14-partner drops from 1.0807 to 1.0783, 15-partner drops from
// 1.0829 to 1.0804, 16-partner drops from 1.0850 to 1.0824, 17-partner
// drops from 1.0869 to 1.0843, 18-partner drops from 1.0887 to 1.0861,
// 19-partner drops from 1.0905 to 1.0878 and 20-partner drops from
// 1.0923 to 1.0894 -- so pool_count >= 21 (21^(1/35) ~ 1.0909) is now
// required to reach wide with a modest outlier.
const TIGHT_PTPTM_MAX = 1.005;
const WIDE_PTPTM_MIN = 1.09;

// PTPTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTPTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_pentatrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_pentatrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToPentatriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptptm_max: number;
  readonly wide_ptptm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanMap;
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

// Peak-to-pentatrigintic-mean of a discrete distribution:
//   PTPTM = (max - min) / pentatrigintic_mean
// where pentatrigintic_mean = ((sum x_i^35) / n)^(1/35). Returns null
// on empty, solo, and degenerate (zero pentatrigintic_mean or non-
// finite thirty-fifth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_pentatrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_pentatrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_pentatrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_pentatrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtyfifthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^35 = x^8 * x^8 * x^8 * x^8 * x^2 * x -> oct*oct*oct*oct*sq*v
    thirtyfifthSum += oct * oct * oct * oct * sq * v;
  }
  if (!Number.isFinite(thirtyfifthSum) || thirtyfifthSum <= 0) {
    return { pool_count, pool_cells, peak_to_pentatrigintic_mean: null };
  }
  const pentatrigintic_mean = Math.pow(thirtyfifthSum / pool_count, 1 / 35);
  if (!Number.isFinite(pentatrigintic_mean) || pentatrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_pentatrigintic_mean: null };
  }
  const range = max - min;
  const ptptm = range / pentatrigintic_mean;
  const clamped = ptptm < 0 ? 0 : ptptm;
  return {
    pool_count,
    pool_cells,
    peak_to_pentatrigintic_mean: roundTo(clamped, PTPTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_pentatrigintic_mean: partner.peak_to_pentatrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_pentatrigintic_mean: metric.peak_to_pentatrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToPentatriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToPentatriginticMean {
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
    tight_ptptm_max: TIGHT_PTPTM_MAX,
    wide_ptptm_min: WIDE_PTPTM_MIN,
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

function labelForPtptm(
  pool_count: number,
  pool_cells: number,
  ptptm: number | null,
  tight_max: number,
  wide_min: number,
): PtptmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptptm === null) return "degenerate";
  if (ptptm >= wide_min) return "wide";
  if (ptptm < tight_max) return "tight";
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

function renderPtptmCell(
  pool_count: number,
  pool_cells: number,
  ptptm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtptm(
    pool_count,
    pool_cells,
    ptptm,
    tight_max,
    wide_min,
  );
  const ptptmText = ptptm === null ? "-" : ptptm.toFixed(4);
  return `PTPTM ${ptptmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToPentatriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToPentatriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptptm_max, wide_ptptm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtptmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_pentatrigintic_mean, tight_ptptm_max, wide_ptptm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtptmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_pentatrigintic_mean, tight_ptptm_max, wide_ptptm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-PENTATRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-PENTATRIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptptm = (max - min) / pentatrigintic_mean where pentatrigintic_mean = ((sum x_i^35) / n)^(1/35). Reads the pool's total RANGE in units of its PENTATRIGINTIC (power-mean-of-order-35, M_35) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.322 PTTETM because raising to the THIRTY-FIFTH power lifts the anchor MORE than raising to the thirty-fourth does. Unique DISPERSION-axis contribution extends the (harmonic..tetratrigintic) power-mean HEXATRIGINTUPLET into a HEPTATRIGINTUPLET with the M_35 pentatrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptptm approaches n^(1/35) so 10-partner pools cap near 1.0680, 11-partner near 1.0709, 12-partner near 1.0736, 13-partner near 1.0760, 14-partner near 1.0783, 15-partner near 1.0804, 16-partner near 1.0824, 17-partner near 1.0843, 18-partner near 1.0861, 19-partner near 1.0878 and 20-partner near 1.0894 (all below the wide floor); pools with pool_count &gt;= 21 (21^(1/35) ~= 1.0909) are required to escape into wide with a modest outlier. Composite regime labels: PTPTM tight + PTTETM tight = MILD OUTLIER absorbed by pentatrigintic ([1x9, 10] reads PTPTM 0.9612 tight); PTPTM spread + PTTETM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTPTM 1.0573 spread); PTPTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1292 wide); PTPTM spread + PTTETM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0098 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR pentatrigintic_mean == 0 (guarded but unreachable), tight = ptptm &lt; ${tight_ptptm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptptm in [${tight_ptptm_max}, ${wide_ptptm_min}) (extreme-outlier regime), wide = ptptm &ge; ${wide_ptptm_min} (runaway-outlier regime with pool_count &gt;= 21). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptptm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTPTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTPTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
