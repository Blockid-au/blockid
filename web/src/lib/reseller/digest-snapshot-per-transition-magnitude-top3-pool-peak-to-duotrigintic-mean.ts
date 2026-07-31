// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-DUOTRIGINTIC-MEAN
// pure-lib (P11.318).
//
// WHOLE-POOL RANGE-AGAINST-DUOTRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's DUOTRIGINTIC MEAN (a.k.a. power mean of order 32, M_32):
//
//   ptdtm = (max - min) / duotrigintic_mean
//
// where duotrigintic_mean = ((sum x_i^32) / n)^(1/32). Reads the peak
// spread against the DUOTRIGINTIC (power-mean-of-order-32) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.316
// PTUTM, because raising to the THIRTY-SECOND power before averaging
// lifts the anchor MORE than raising to the thirty-first does, dampening
// the ratio against the range even harder.
//
// PTDTM's unique DISPERSION-axis contribution: reads range in units
// of the DUOTRIGINTIC (POWER-MEAN-OF-ORDER-32) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... trigintic M_30, untrigintic M_31) power-mean
// TRETRIGINTUPLET into a TETRATRIGINTUPLET with the M_32 duotrigintic
// mean. By Power Mean inequality M_32 >= M_31, so
// duotrigintic_mean >= untrigintic_mean and ptdtm <= ptutm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// duotrigintic_mean approaches x_max / n^(1/32), so ptdtm
// approaches n^(1/32) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/32) ~= 1.0746, so even the most extreme outlier in a
// 10-partner pool reads ptdtm just under 1.09. For n=11 the ceiling
// is 11^(1/32) ~= 1.0778, still below the wide floor. For n=12 the
// ceiling is 12^(1/32) ~= 1.0807 (also below wide). For n=13 the
// ceiling is 13^(1/32) ~= 1.0835 (still below wide). For n=14 the
// ceiling is 14^(1/32) ~= 1.0860 (still below wide). For n=15 the
// ceiling is 15^(1/32) ~= 1.0883 -- still just under wide -- so
// pools with pool_count >= 16 (16^(1/32) ~= 1.0905) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/32) ~= 1.1548, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> duotrigintic_mean = k, range 0,
//                                     ptdtm 0 (tight).
//   * uniform ramp [1..10]          -> DTM ~= 9.3158, range 9, ptdtm
//                                     ~= 0.9661 (tight).
//   * upper-outlier [1x9, 10]       -> DTM ~= 9.3057, range 9, ptdtm
//                                     ~= 0.9671 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.316
//                                     PTUTM's 0.9694 tight landing).
//   * two-shoulders [1x8, 5x2]      -> DTM ~= 4.7547, range 4, ptdtm
//                                     ~= 0.8413 (tight).
//   * 50/50 split [1x5, 10x5]       -> DTM ~= 9.7857, range 9, ptdtm
//                                     ~= 0.9197 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> DTM ~= 93.0572, range 99,
//                                     ptdtm ~= 1.0639 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/32) ~ 1.0746
//                                     asymptote).
//   * two-partner [1, 9]            -> DTM ~= 8.8071, range 8, ptdtm
//                                     ~= 0.9084 (tight).
//   * two-partner [1, 100]          -> DTM ~= 97.8572, range 99, ptdtm
//                                     ~= 1.0117 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> DTM ~= 9.6625, range 9, ptdtm
//                                     ~= 0.9314 (tight).
//   * pool_count=100 [1x99, 100]    -> DTM ~= 86.5964, range 99, ptdtm
//                                     ~= 1.1432 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptdtm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR duotrigintic_mean == 0
//   * tight                ptdtm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptdtm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0746,
//                          11-partner ~ 1.0778, 12-partner ~ 1.0807,
//                          13-partner ~ 1.0835, 14-partner ~ 1.0860
//                          and 15-partner ~ 1.0883 all cap within spread)
//   * wide                 ptdtm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 16)
//
// Both cutoffs are exposed on the envelope as tight_ptdtm_max /
// wide_ptdtm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.319):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToUntriginticMeanSection
// (P11.316) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-duotrigintic-center
// after the P11.316 range-against-untrigintic-center landing.

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
type PtdtmLabel =
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

// Bands on raw ptdtm (fixed cutoffs since duotrigintic_mean scales
// with cell counts and typical duotrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.316 PTUTM's 1.005 -- MILD-OUTLIER at M_32 is 0.9671 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.316 PTUTM's
// 1.09 -- 10-partner asymptote drops from 1.0771 (M_31) to 1.0746
// (M_32), 11-partner drops from 1.0804 to 1.0778, 12-partner drops
// from 1.0835 to 1.0807, 13-partner drops from 1.0863 to 1.0835,
// 14-partner drops from 1.0889 to 1.0860 and 15-partner drops from
// 1.0913 to 1.0883 -- so pool_count >= 16 (16^(1/32) ~ 1.0905) is
// now required to reach wide with a modest outlier.
const TIGHT_PTDTM_MAX = 1.005;
const WIDE_PTDTM_MIN = 1.09;

// PTDTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTDTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_duotrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_duotrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptdtm_max: number;
  readonly wide_ptdtm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanMap;
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

// Peak-to-duotrigintic-mean of a discrete distribution:
//   PTDTM = (max - min) / duotrigintic_mean
// where duotrigintic_mean = ((sum x_i^32) / n)^(1/32). Returns null
// on empty, solo, and degenerate (zero duotrigintic_mean or non-
// finite thirty-second-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_duotrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_duotrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_duotrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_duotrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtysecondSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^32 = x^8 * x^8 * x^8 * x^8 -> oct*oct*oct*oct
    thirtysecondSum += oct * oct * oct * oct;
  }
  if (!Number.isFinite(thirtysecondSum) || thirtysecondSum <= 0) {
    return { pool_count, pool_cells, peak_to_duotrigintic_mean: null };
  }
  const duotrigintic_mean = Math.pow(thirtysecondSum / pool_count, 1 / 32);
  if (!Number.isFinite(duotrigintic_mean) || duotrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_duotrigintic_mean: null };
  }
  const range = max - min;
  const ptdtm = range / duotrigintic_mean;
  const clamped = ptdtm < 0 ? 0 : ptdtm;
  return {
    pool_count,
    pool_cells,
    peak_to_duotrigintic_mean: roundTo(clamped, PTDTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_duotrigintic_mean: partner.peak_to_duotrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_duotrigintic_mean: metric.peak_to_duotrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotriginticMean {
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
    tight_ptdtm_max: TIGHT_PTDTM_MAX,
    wide_ptdtm_min: WIDE_PTDTM_MIN,
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

function labelForPtdtm(
  pool_count: number,
  pool_cells: number,
  ptdtm: number | null,
  tight_max: number,
  wide_min: number,
): PtdtmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptdtm === null) return "degenerate";
  if (ptdtm >= wide_min) return "wide";
  if (ptdtm < tight_max) return "tight";
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

function renderPtdtmCell(
  pool_count: number,
  pool_cells: number,
  ptdtm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtdtm(
    pool_count,
    pool_cells,
    ptdtm,
    tight_max,
    wide_min,
  );
  const ptdtmText = ptdtm === null ? "-" : ptdtm.toFixed(4);
  return `PTDTM ${ptdtmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuotriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptdtm_max, wide_ptdtm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdtmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_duotrigintic_mean, tight_ptdtm_max, wide_ptdtm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtdtmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_duotrigintic_mean, tight_ptdtm_max, wide_ptdtm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-DUOTRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-DUOTRIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptdtm = (max - min) / duotrigintic_mean where duotrigintic_mean = ((sum x_i^32) / n)^(1/32). Reads the pool's total RANGE in units of its DUOTRIGINTIC (power-mean-of-order-32, M_32) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.316 PTUTM because raising to the THIRTY-SECOND power lifts the anchor MORE than raising to the thirty-first does. Unique DISPERSION-axis contribution extends the (harmonic..untrigintic) power-mean TRETRIGINTUPLET into a TETRATRIGINTUPLET with the M_32 duotrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptdtm approaches n^(1/32) so 10-partner pools cap near 1.0746, 11-partner near 1.0778, 12-partner near 1.0807, 13-partner near 1.0835, 14-partner near 1.0860 and 15-partner near 1.0883 (all below the wide floor); pools with pool_count &gt;= 16 (16^(1/32) ~= 1.0905) are required to escape into wide with a modest outlier. Composite regime labels: PTDTM tight + PTUTM tight = MILD OUTLIER absorbed by duotrigintic ([1x9, 10] reads PTDTM 0.9671 tight); PTDTM spread + PTUTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTDTM 1.0639 spread); PTDTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1432 wide); PTDTM spread + PTUTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0117 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR duotrigintic_mean == 0 (guarded but unreachable), tight = ptdtm &lt; ${tight_ptdtm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptdtm in [${tight_ptdtm_max}, ${wide_ptdtm_min}) (extreme-outlier regime), wide = ptdtm &ge; ${wide_ptdtm_min} (runaway-outlier regime with pool_count &gt;= 16). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptdtm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTDTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTDTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
