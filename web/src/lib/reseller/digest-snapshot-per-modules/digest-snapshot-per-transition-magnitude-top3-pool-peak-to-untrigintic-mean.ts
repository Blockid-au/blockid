// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-UNTRIGINTIC-MEAN
// pure-lib (P11.316).
//
// WHOLE-POOL RANGE-AGAINST-UNTRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's UNTRIGINTIC MEAN (a.k.a. power mean of order 31, M_31):
//
//   ptutm = (max - min) / untrigintic_mean
//
// where untrigintic_mean = ((sum x_i^31) / n)^(1/31). Reads the peak
// spread against the UNTRIGINTIC (power-mean-of-order-31) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.314
// PTRGTM, because raising to the THIRTY-FIRST power before averaging
// lifts the anchor MORE than raising to the thirtieth does, dampening
// the ratio against the range even harder.
//
// PTUTM's unique DISPERSION-axis contribution: reads range in units
// of the UNTRIGINTIC (POWER-MEAN-OF-ORDER-31) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... novemvigintic M_29, trigintic M_30) power-mean
// DUOTRIGINTUPLET into a TRETRIGINTUPLET with the M_31 untrigintic
// mean. By Power Mean inequality M_31 >= M_30, so
// untrigintic_mean >= trigintic_mean and ptutm <= ptrgtm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// untrigintic_mean approaches x_max / n^(1/31), so ptutm
// approaches n^(1/31) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/31) ~= 1.0771, so even the most extreme outlier in a
// 10-partner pool reads ptutm just under 1.09. For n=11 the ceiling
// is 11^(1/31) ~= 1.0804, still below the wide floor. For n=12 the
// ceiling is 12^(1/31) ~= 1.0835 (also below wide). For n=13 the
// ceiling is 13^(1/31) ~= 1.0863 (still below wide). For n=14 the
// ceiling is 14^(1/31) ~= 1.0889 -- still just under wide -- so
// pools with pool_count >= 15 (15^(1/31) ~= 1.0913) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/31) ~= 1.1602, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> untrigintic_mean = k, range 0,
//                                     ptutm 0 (tight).
//   * uniform ramp [1..10]          -> UTM ~= 9.2957, range 9, ptutm
//                                     ~= 0.9682 (tight).
//   * upper-outlier [1x9, 10]       -> UTM ~= 9.2841, range 9, ptutm
//                                     ~= 0.9694 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.314
//                                     PTRGTM's 0.9718 tight landing).
//   * two-shoulders [1x8, 5x2]      -> UTM ~= 4.7470, range 4, ptutm
//                                     ~= 0.8426 (tight).
//   * 50/50 split [1x5, 10x5]       -> UTM ~= 9.7789, range 9, ptutm
//                                     ~= 0.9204 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> UTM ~= 92.8415, range 99,
//                                     ptutm ~= 1.0663 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/31) ~ 1.0771
//                                     asymptote).
//   * two-partner [1, 9]            -> UTM ~= 8.8010, range 8, ptutm
//                                     ~= 0.9090 (tight).
//   * two-partner [1, 100]          -> UTM ~= 97.7889, range 99, ptutm
//                                     ~= 1.0124 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> UTM ~= 9.6518, range 9, ptutm
//                                     ~= 0.9325 (tight).
//   * pool_count=100 [1x99, 100]    -> UTM ~= 86.1954, range 99, ptutm
//                                     ~= 1.1486 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptutm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR untrigintic_mean == 0
//   * tight                ptutm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptutm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0771,
//                          11-partner ~ 1.0804, 12-partner ~ 1.0835,
//                          13-partner ~ 1.0863 and 14-partner ~ 1.0889
//                          all cap within spread)
//   * wide                 ptutm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 15)
//
// Both cutoffs are exposed on the envelope as tight_ptutm_max /
// wide_ptutm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.317):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToTriginticMeanSection
// (P11.314) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-untrigintic-center
// after the P11.314 range-against-trigintic-center landing.

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
type PtutmLabel =
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

// Bands on raw ptutm (fixed cutoffs since untrigintic_mean scales
// with cell counts and typical untrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.314 PTRGTM's 1.005 -- MILD-OUTLIER at M_31 is 0.9694 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.314 PTRGTM's
// 1.09 -- 10-partner asymptote drops from 1.0798 (M_30) to 1.0771
// (M_31), 11-partner drops from 1.0832 to 1.0804, 12-partner drops
// from 1.0864 to 1.0835, 13-partner drops from 1.0893 to 1.0863,
// and 14-partner drops from 1.0920 to 1.0889 -- so pool_count >= 15
// (15^(1/31) ~ 1.0913) is now required to reach wide with a modest
// outlier.
const TIGHT_PTUTM_MAX = 1.005;
const WIDE_PTUTM_MIN = 1.09;

// PTUTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTUTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_untrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_untrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUntriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptutm_max: number;
  readonly wide_ptutm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanMap;
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

// Peak-to-untrigintic-mean of a discrete distribution:
//   PTUTM = (max - min) / untrigintic_mean
// where untrigintic_mean = ((sum x_i^31) / n)^(1/31). Returns null
// on empty, solo, and degenerate (zero untrigintic_mean or non-
// finite thirty-first-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_untrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_untrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_untrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_untrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtyfirstSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^31 = x^8 * x^8 * x^8 * x^4 * x^2 * x -> oct*oct*oct*quad*sq*v
    thirtyfirstSum += oct * oct * oct * quad * sq * v;
  }
  if (!Number.isFinite(thirtyfirstSum) || thirtyfirstSum <= 0) {
    return { pool_count, pool_cells, peak_to_untrigintic_mean: null };
  }
  const untrigintic_mean = Math.pow(thirtyfirstSum / pool_count, 1 / 31);
  if (!Number.isFinite(untrigintic_mean) || untrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_untrigintic_mean: null };
  }
  const range = max - min;
  const ptutm = range / untrigintic_mean;
  const clamped = ptutm < 0 ? 0 : ptutm;
  return {
    pool_count,
    pool_cells,
    peak_to_untrigintic_mean: roundTo(clamped, PTUTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_untrigintic_mean: partner.peak_to_untrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_untrigintic_mean: metric.peak_to_untrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToUntriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUntriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUntriginticMean {
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
    tight_ptutm_max: TIGHT_PTUTM_MAX,
    wide_ptutm_min: WIDE_PTUTM_MIN,
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

function labelForPtutm(
  pool_count: number,
  pool_cells: number,
  ptutm: number | null,
  tight_max: number,
  wide_min: number,
): PtutmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptutm === null) return "degenerate";
  if (ptutm >= wide_min) return "wide";
  if (ptutm < tight_max) return "tight";
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

function renderPtutmCell(
  pool_count: number,
  pool_cells: number,
  ptutm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtutm(
    pool_count,
    pool_cells,
    ptutm,
    tight_max,
    wide_min,
  );
  const ptutmText = ptutm === null ? "-" : ptutm.toFixed(4);
  return `PTUTM ${ptutmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUntriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToUntriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptutm_max, wide_ptutm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtutmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_untrigintic_mean, tight_ptutm_max, wide_ptutm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtutmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_untrigintic_mean, tight_ptutm_max, wide_ptutm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-UNTRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-UNTRIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptutm = (max - min) / untrigintic_mean where untrigintic_mean = ((sum x_i^31) / n)^(1/31). Reads the pool's total RANGE in units of its UNTRIGINTIC (power-mean-of-order-31, M_31) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.314 PTRGTM because raising to the THIRTY-FIRST power lifts the anchor MORE than raising to the thirtieth does. Unique DISPERSION-axis contribution extends the (harmonic..trigintic) power-mean DUOTRIGINTUPLET into a TRETRIGINTUPLET with the M_31 untrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptutm approaches n^(1/31) so 10-partner pools cap near 1.0771, 11-partner near 1.0804, 12-partner near 1.0835, 13-partner near 1.0863 and 14-partner near 1.0889 (all below the wide floor); pools with pool_count &gt;= 15 (15^(1/31) ~= 1.0913) are required to escape into wide with a modest outlier. Composite regime labels: PTUTM tight + PTRGTM tight = MILD OUTLIER absorbed by untrigintic ([1x9, 10] reads PTUTM 0.9694 tight); PTUTM spread + PTRGTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTUTM 1.0663 spread); PTUTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1486 wide); PTUTM spread + PTRGTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0124 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR untrigintic_mean == 0 (guarded but unreachable), tight = ptutm &lt; ${tight_ptutm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptutm in [${tight_ptutm_max}, ${wide_ptutm_min}) (extreme-outlier regime), wide = ptutm &ge; ${wide_ptutm_min} (runaway-outlier regime with pool_count &gt;= 15). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptutm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTUTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTUTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
