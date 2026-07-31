// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRIGINTIC-MEAN
// pure-lib (P11.314).
//
// WHOLE-POOL RANGE-AGAINST-TRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRIGINTIC MEAN (a.k.a. power mean of order 30, M_30):
//
//   ptrgtm = (max - min) / trigintic_mean
//
// where trigintic_mean = ((sum x_i^30) / n)^(1/30). Reads the peak
// spread against the TRIGINTIC (power-mean-of-order-30) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.312
// PTNVGM, because raising to the THIRTIETH power before averaging
// lifts the anchor MORE than raising to the twenty-ninth does,
// dampening the ratio against the range even harder.
//
// PTRGTM's unique DISPERSION-axis contribution: reads range in units
// of the TRIGINTIC (POWER-MEAN-OF-ORDER-30) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... octovigintic M_28, novemvigintic M_29) power-mean
// UNTRIGINTUPLET into a DUOTRIGINTUPLET with the M_30 trigintic
// mean. By Power Mean inequality M_30 >= M_29, so
// trigintic_mean >= novemvigintic_mean and ptrgtm <= ptnvgm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// trigintic_mean approaches x_max / n^(1/30), so ptrgtm
// approaches n^(1/30) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/30) ~= 1.0798, so even the most extreme outlier in a
// 10-partner pool reads ptrgtm just under 1.09. For n=11 the ceiling
// is 11^(1/30) ~= 1.0832, still below the wide floor. For n=12 the
// ceiling is 12^(1/30) ~= 1.0864 (also below wide). For n=13 the
// ceiling is 13^(1/30) ~= 1.0893 -- still just under wide -- so
// pools with pool_count >= 14 (14^(1/30) ~= 1.0920) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/30) ~= 1.1659, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> trigintic_mean = k, range 0,
//                                     ptrgtm 0 (tight).
//   * uniform ramp [1..10]          -> TRGTM ~= 9.2744, range 9, ptrgtm
//                                     ~= 0.9704 (tight).
//   * upper-outlier [1x9, 10]       -> TRGTM ~= 9.2612, range 9, ptrgtm
//                                     ~= 0.9718 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.312
//                                     PTNVGM's 0.9744 tight landing).
//   * two-shoulders [1x8, 5x2]      -> TRGTM ~= 4.7388, range 4, ptrgtm
//                                     ~= 0.8441 (tight).
//   * 50/50 split [1x5, 10x5]       -> TRGTM ~= 9.7716, range 9, ptrgtm
//                                     ~= 0.9210 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> TRGTM ~= 92.6119, range 99,
//                                     ptrgtm ~= 1.0690 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/30) ~ 1.0798
//                                     asymptote).
//   * two-partner [1, 9]            -> TRGTM ~= 8.7944, range 8, ptrgtm
//                                     ~= 0.9097 (tight).
//   * two-partner [1, 100]          -> TRGTM ~= 97.7160, range 99, ptrgtm
//                                     ~= 1.0131 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> TRGTM ~= 9.6404, range 9, ptrgtm
//                                     ~= 0.9336 (tight).
//   * pool_count=100 [1x99, 100]    -> TRGTM ~= 85.7696, range 99, ptrgtm
//                                     ~= 1.1543 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptrgtm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR trigintic_mean == 0
//   * tight                ptrgtm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptrgtm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0798,
//                          11-partner ~ 1.0832, 12-partner ~ 1.0864
//                          and 13-partner ~ 1.0893 all cap within spread)
//   * wide                 ptrgtm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 14)
//
// Both cutoffs are exposed on the envelope as tight_ptrgtm_max /
// wide_ptrgtm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.315):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToNovemviginticMeanSection
// (P11.312) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-trigintic-center
// after the P11.312 range-against-novemvigintic-center landing.

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
type PtrgtmLabel =
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

// Bands on raw ptrgtm (fixed cutoffs since trigintic_mean scales
// with cell counts and typical trigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.312 PTNVGM's 1.005 -- MILD-OUTLIER at M_30 is 0.9718 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.312 PTNVGM's
// 1.09 -- 10-partner asymptote drops from 1.0826 (M_29) to 1.0798
// (M_30), 11-partner drops from 1.0862 to 1.0832, 12-partner drops
// from 1.0895 to 1.0864, and 13-partner drops from 1.0925 to 1.0893
// -- so pool_count >= 14 (14^(1/30) ~ 1.0920) is now required to
// reach wide with a modest outlier.
const TIGHT_PTRGTM_MAX = 1.005;
const WIDE_PTRGTM_MIN = 1.09;

// PTRGTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTRGTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_trigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_trigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptrgtm_max: number;
  readonly wide_ptrgtm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTriginticMeanMap;
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

// Peak-to-trigintic-mean of a discrete distribution:
//   PTRGTM = (max - min) / trigintic_mean
// where trigintic_mean = ((sum x_i^30) / n)^(1/30). Returns null
// on empty, solo, and degenerate (zero trigintic_mean or non-
// finite thirtieth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_trigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_trigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_trigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_trigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtiethSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^30 = x^8 * x^8 * x^8 * x^4 * x^2 -> oct*oct*oct*quad*sq
    thirtiethSum += oct * oct * oct * quad * sq;
  }
  if (!Number.isFinite(thirtiethSum) || thirtiethSum <= 0) {
    return { pool_count, pool_cells, peak_to_trigintic_mean: null };
  }
  const trigintic_mean = Math.pow(thirtiethSum / pool_count, 1 / 30);
  if (!Number.isFinite(trigintic_mean) || trigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_trigintic_mean: null };
  }
  const range = max - min;
  const ptrgtm = range / trigintic_mean;
  const clamped = ptrgtm < 0 ? 0 : ptrgtm;
  return {
    pool_count,
    pool_cells,
    peak_to_trigintic_mean: roundTo(clamped, PTRGTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_trigintic_mean: partner.peak_to_trigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_trigintic_mean: metric.peak_to_trigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTriginticMean {
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
    tight_ptrgtm_max: TIGHT_PTRGTM_MAX,
    wide_ptrgtm_min: WIDE_PTRGTM_MIN,
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

function labelForPtrgtm(
  pool_count: number,
  pool_cells: number,
  ptrgtm: number | null,
  tight_max: number,
  wide_min: number,
): PtrgtmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptrgtm === null) return "degenerate";
  if (ptrgtm >= wide_min) return "wide";
  if (ptrgtm < tight_max) return "tight";
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

function renderPtrgtmCell(
  pool_count: number,
  pool_cells: number,
  ptrgtm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtrgtm(
    pool_count,
    pool_cells,
    ptrgtm,
    tight_max,
    wide_min,
  );
  const ptrgtmText = ptrgtm === null ? "-" : ptrgtm.toFixed(4);
  return `PTRGTM ${ptrgtmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptrgtm_max, wide_ptrgtm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtrgtmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_trigintic_mean, tight_ptrgtm_max, wide_ptrgtm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtrgtmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_trigintic_mean, tight_ptrgtm_max, wide_ptrgtm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptrgtm = (max - min) / trigintic_mean where trigintic_mean = ((sum x_i^30) / n)^(1/30). Reads the pool's total RANGE in units of its TRIGINTIC (power-mean-of-order-30, M_30) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.312 PTNVGM because raising to the THIRTIETH power lifts the anchor MORE than raising to the twenty-ninth does. Unique DISPERSION-axis contribution extends the (harmonic..novemvigintic) power-mean UNTRIGINTUPLET into a DUOTRIGINTUPLET with the M_30 trigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptrgtm approaches n^(1/30) so 10-partner pools cap near 1.0798, 11-partner near 1.0832, 12-partner near 1.0864 and 13-partner near 1.0893 (all below the wide floor); pools with pool_count &gt;= 14 (14^(1/30) ~= 1.0920) are required to escape into wide with a modest outlier. Composite regime labels: PTRGTM tight + PTNVGM tight = MILD OUTLIER absorbed by trigintic ([1x9, 10] reads PTRGTM 0.9718 tight); PTRGTM spread + PTNVGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTRGTM 1.0690 spread); PTRGTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1543 wide); PTRGTM spread + PTNVGM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0131 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR trigintic_mean == 0 (guarded but unreachable), tight = ptrgtm &lt; ${tight_ptrgtm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptrgtm in [${tight_ptrgtm_max}, ${wide_ptrgtm_min}) (extreme-outlier regime), wide = ptrgtm &ge; ${wide_ptrgtm_min} (runaway-outlier regime with pool_count &gt;= 14). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptrgtm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTRGTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTRGTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
