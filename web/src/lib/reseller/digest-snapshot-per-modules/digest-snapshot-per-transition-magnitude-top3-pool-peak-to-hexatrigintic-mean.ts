// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-HEXATRIGINTIC-MEAN
// pure-lib (P11.326).
//
// WHOLE-POOL RANGE-AGAINST-HEXATRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's HEXATRIGINTIC MEAN (a.k.a. power mean of order 36, M_36):
//
//   pthtm = (max - min) / hexatrigintic_mean
//
// where hexatrigintic_mean = ((sum x_i^36) / n)^(1/36). Reads the peak
// spread against the HEXATRIGINTIC (power-mean-of-order-36) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.324
// PTPTM, because raising to the THIRTY-SIXTH power before averaging
// lifts the anchor MORE than raising to the thirty-fifth does, dampening
// the ratio against the range even harder.
//
// PTHTM's unique DISPERSION-axis contribution: reads range in units
// of the HEXATRIGINTIC (POWER-MEAN-OF-ORDER-36) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... tetratrigintic M_34, pentatrigintic M_35) power-mean
// HEPTATRIGINTUPLET into an OCTATRIGINTUPLET with the M_36 hexatrigintic
// mean. By Power Mean inequality M_36 >= M_35, so
// hexatrigintic_mean >= pentatrigintic_mean and pthtm <= ptptm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// hexatrigintic_mean approaches x_max / n^(1/36), so pthtm
// approaches n^(1/36) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/36) ~= 1.0661, so even the most extreme outlier in a
// 10-partner pool reads pthtm just under 1.09. For n=11 the ceiling
// is 11^(1/36) ~= 1.0689, still below the wide floor. For n=12 the
// ceiling is 12^(1/36) ~= 1.0715 (also below wide). For n=13 the
// ceiling is 13^(1/36) ~= 1.0738 (still below wide). For n=14 the
// ceiling is 14^(1/36) ~= 1.0761 (still below wide). For n=15 the
// ceiling is 15^(1/36) ~= 1.0781 (still below wide). For n=16 the
// ceiling is 16^(1/36) ~= 1.0801 (still below wide). For n=17 the
// ceiling is 17^(1/36) ~= 1.0819 (still below wide). For n=18 the
// ceiling is 18^(1/36) ~= 1.0836 (still below wide). For n=19 the
// ceiling is 19^(1/36) ~= 1.0852 (still below wide). For n=20 the
// ceiling is 20^(1/36) ~= 1.0868 (still below wide). For n=21 the
// ceiling is 21^(1/36) ~= 1.0882 (still below wide). For n=22 the
// ceiling is 22^(1/36) ~= 1.0897 -- still just under wide -- so
// pools with pool_count >= 23 (23^(1/36) ~= 1.0910) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/36) ~= 1.1360, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> hexatrigintic_mean = k, range 0,
//                                     pthtm 0 (tight).
//   * uniform ramp [1..10]          -> HTM ~= 9.3863, range 9, pthtm
//                                     ~= 0.9588 (tight).
//   * upper-outlier [1x9, 10]       -> HTM ~= 9.3804, range 9, pthtm
//                                     ~= 0.9594 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.324
//                                     PTPTM's 0.9612 tight landing).
//   * two-shoulders [1x8, 5x2]      -> HTM ~= 4.7814, range 4, pthtm
//                                     ~= 0.8366 (tight).
//   * 50/50 split [1x5, 10x5]       -> HTM ~= 9.8093, range 9, pthtm
//                                     ~= 0.9175 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> HTM ~= 93.8042, range 99,
//                                     pthtm ~= 1.0554 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/36) ~ 1.0661
//                                     asymptote).
//   * two-partner [1, 9]            -> HTM ~= 8.8284, range 8, pthtm
//                                     ~= 0.9062 (tight).
//   * two-partner [1, 100]          -> HTM ~= 98.0928, range 99, pthtm
//                                     ~= 1.0092 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> HTM ~= 9.6995, range 9, pthtm
//                                     ~= 0.9279 (tight).
//   * pool_count=100 [1x99, 100]    -> HTM ~= 87.9952, range 99, pthtm
//                                     ~= 1.1251 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw pthtm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR hexatrigintic_mean == 0
//   * tight                pthtm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               pthtm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0661,
//                          11-partner ~ 1.0689, 12-partner ~ 1.0715,
//                          13-partner ~ 1.0738, 14-partner ~ 1.0761,
//                          15-partner ~ 1.0781, 16-partner ~ 1.0801,
//                          17-partner ~ 1.0819, 18-partner ~ 1.0836,
//                          19-partner ~ 1.0852, 20-partner ~ 1.0868,
//                          21-partner ~ 1.0882 and 22-partner ~ 1.0897
//                          all cap within spread)
//   * wide                 pthtm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 23)
//
// Both cutoffs are exposed on the envelope as tight_pthtm_max /
// wide_pthtm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.327):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToPentatriginticMeanSection
// (P11.324) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-hexatrigintic-center
// after the P11.324 range-against-pentatrigintic-center landing.

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
type PthtmLabel =
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

// Bands on raw pthtm (fixed cutoffs since hexatrigintic_mean scales
// with cell counts and typical hexatrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.324 PTPTM's 1.005 -- MILD-OUTLIER at M_36 is 0.9594 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.324 PTPTM's
// 1.09 -- 10-partner asymptote drops from 1.0680 (M_35) to 1.0661
// (M_36), 11-partner drops from 1.0709 to 1.0689, 12-partner drops
// from 1.0736 to 1.0715, 13-partner drops from 1.0760 to 1.0738,
// 14-partner drops from 1.0783 to 1.0761, 15-partner drops from
// 1.0804 to 1.0781, 16-partner drops from 1.0824 to 1.0801, 17-partner
// drops from 1.0843 to 1.0819, 18-partner drops from 1.0861 to 1.0836,
// 19-partner drops from 1.0878 to 1.0852, 20-partner drops from
// 1.0894 to 1.0868, 21-partner drops from 1.0909 to 1.0882 and
// 22-partner drops from n/a to 1.0897 -- so pool_count >= 23
// (23^(1/36) ~ 1.0910) is now required to reach wide with a modest
// outlier.
const TIGHT_PTHTM_MAX = 1.005;
const WIDE_PTHTM_MIN = 1.09;

// PTHTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTHTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_hexatrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_hexatrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHexatriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pthtm_max: number;
  readonly wide_pthtm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanMap;
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

// Peak-to-hexatrigintic-mean of a discrete distribution:
//   PTHTM = (max - min) / hexatrigintic_mean
// where hexatrigintic_mean = ((sum x_i^36) / n)^(1/36). Returns null
// on empty, solo, and degenerate (zero hexatrigintic_mean or non-
// finite thirty-sixth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_hexatrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_hexatrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_hexatrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_hexatrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtysixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^36 = x^8 * x^8 * x^8 * x^8 * x^4 -> oct*oct*oct*oct*quad
    thirtysixthSum += oct * oct * oct * oct * quad;
  }
  if (!Number.isFinite(thirtysixthSum) || thirtysixthSum <= 0) {
    return { pool_count, pool_cells, peak_to_hexatrigintic_mean: null };
  }
  const hexatrigintic_mean = Math.pow(thirtysixthSum / pool_count, 1 / 36);
  if (!Number.isFinite(hexatrigintic_mean) || hexatrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_hexatrigintic_mean: null };
  }
  const range = max - min;
  const pthtm = range / hexatrigintic_mean;
  const clamped = pthtm < 0 ? 0 : pthtm;
  return {
    pool_count,
    pool_cells,
    peak_to_hexatrigintic_mean: roundTo(clamped, PTHTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_hexatrigintic_mean: partner.peak_to_hexatrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_hexatrigintic_mean: metric.peak_to_hexatrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHexatriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHexatriginticMean {
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
    tight_pthtm_max: TIGHT_PTHTM_MAX,
    wide_pthtm_min: WIDE_PTHTM_MIN,
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

function labelForPthtm(
  pool_count: number,
  pool_cells: number,
  pthtm: number | null,
  tight_max: number,
  wide_min: number,
): PthtmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pthtm === null) return "degenerate";
  if (pthtm >= wide_min) return "wide";
  if (pthtm < tight_max) return "tight";
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

function renderPthtmCell(
  pool_count: number,
  pool_cells: number,
  pthtm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPthtm(
    pool_count,
    pool_cells,
    pthtm,
    tight_max,
    wide_min,
  );
  const pthtmText = pthtm === null ? "-" : pthtm.toFixed(4);
  return `PTHTM ${pthtmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHexatriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHexatriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pthtm_max, wide_pthtm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPthtmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_hexatrigintic_mean, tight_pthtm_max, wide_pthtm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPthtmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_hexatrigintic_mean, tight_pthtm_max, wide_pthtm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-HEXATRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-HEXATRIGINTIC-CENTER scalar over the P11.161 pool &mdash; pthtm = (max - min) / hexatrigintic_mean where hexatrigintic_mean = ((sum x_i^36) / n)^(1/36). Reads the pool's total RANGE in units of its HEXATRIGINTIC (power-mean-of-order-36, M_36) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.324 PTPTM because raising to the THIRTY-SIXTH power lifts the anchor MORE than raising to the thirty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..pentatrigintic) power-mean HEPTATRIGINTUPLET into an OCTATRIGINTUPLET with the M_36 hexatrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pthtm approaches n^(1/36) so 10-partner pools cap near 1.0661, 11-partner near 1.0689, 12-partner near 1.0715, 13-partner near 1.0738, 14-partner near 1.0761, 15-partner near 1.0781, 16-partner near 1.0801, 17-partner near 1.0819, 18-partner near 1.0836, 19-partner near 1.0852, 20-partner near 1.0868, 21-partner near 1.0882 and 22-partner near 1.0897 (all below the wide floor); pools with pool_count &gt;= 23 (23^(1/36) ~= 1.0910) are required to escape into wide with a modest outlier. Composite regime labels: PTHTM tight + PTPTM tight = MILD OUTLIER absorbed by hexatrigintic ([1x9, 10] reads PTHTM 0.9594 tight); PTHTM spread + PTPTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTHTM 1.0554 spread); PTHTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1251 wide); PTHTM spread + PTPTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0092 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR hexatrigintic_mean == 0 (guarded but unreachable), tight = pthtm &lt; ${tight_pthtm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = pthtm in [${tight_pthtm_max}, ${wide_pthtm_min}) (extreme-outlier regime), wide = pthtm &ge; ${wide_pthtm_min} (runaway-outlier regime with pool_count &gt;= 23). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pthtm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTHTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTHTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
