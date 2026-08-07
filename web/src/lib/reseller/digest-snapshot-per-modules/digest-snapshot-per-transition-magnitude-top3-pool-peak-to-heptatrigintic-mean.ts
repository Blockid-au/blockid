// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-HEPTATRIGINTIC-MEAN
// pure-lib (P11.328).
//
// WHOLE-POOL RANGE-AGAINST-HEPTATRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's HEPTATRIGINTIC MEAN (a.k.a. power mean of order 37, M_37):
//
//   pthptm = (max - min) / heptatrigintic_mean
//
// where heptatrigintic_mean = ((sum x_i^37) / n)^(1/37). Reads the peak
// spread against the HEPTATRIGINTIC (power-mean-of-order-37) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.326
// PTHTM, because raising to the THIRTY-SEVENTH power before averaging
// lifts the anchor MORE than raising to the thirty-sixth does, dampening
// the ratio against the range even harder.
//
// PTHPTM's unique DISPERSION-axis contribution: reads range in units
// of the HEPTATRIGINTIC (POWER-MEAN-OF-ORDER-37) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... pentatrigintic M_35, hexatrigintic M_36) power-mean
// OCTATRIGINTUPLET into a NOVEMTRIGINTUPLET with the M_37 heptatrigintic
// mean. By Power Mean inequality M_37 >= M_36, so
// heptatrigintic_mean >= hexatrigintic_mean and pthptm <= pthtm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// heptatrigintic_mean approaches x_max / n^(1/37), so pthptm
// approaches n^(1/37) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/37) ~= 1.0642, so even the most extreme outlier in a
// 10-partner pool reads pthptm just under 1.09. For n=11 the ceiling
// is 11^(1/37) ~= 1.0670, still below the wide floor. For n=12 the
// ceiling is 12^(1/37) ~= 1.0695 (also below wide). For n=13 the
// ceiling is 13^(1/37) ~= 1.0718 (still below wide). For n=14 the
// ceiling is 14^(1/37) ~= 1.0739 (still below wide). For n=15 the
// ceiling is 15^(1/37) ~= 1.0759 (still below wide). For n=16 the
// ceiling is 16^(1/37) ~= 1.0778 (still below wide). For n=17 the
// ceiling is 17^(1/37) ~= 1.0796 (still below wide). For n=18 the
// ceiling is 18^(1/37) ~= 1.0813 (still below wide). For n=19 the
// ceiling is 19^(1/37) ~= 1.0828 (still below wide). For n=20 the
// ceiling is 20^(1/37) ~= 1.0843 (still below wide). For n=21 the
// ceiling is 21^(1/37) ~= 1.0858 (still below wide). For n=22 the
// ceiling is 22^(1/37) ~= 1.0871 (still below wide). For n=23 the
// ceiling is 23^(1/37) ~= 1.0884 (still below wide). For n=24 the
// ceiling is 24^(1/37) ~= 1.0897 -- still just under wide -- so
// pools with pool_count >= 25 (25^(1/37) ~= 1.0909) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/37) ~= 1.1319, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> heptatrigintic_mean = k, range 0,
//                                     pthptm 0 (tight).
//   * uniform ramp [1..10]          -> HPTM ~= 9.4018, range 9, pthptm
//                                     ~= 0.9573 (tight).
//   * upper-outlier [1x9, 10]       -> HPTM ~= 9.3966, range 9, pthptm
//                                     ~= 0.9578 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.326
//                                     PTHTM's 0.9594 tight landing).
//   * two-shoulders [1x8, 5x2]      -> HPTM ~= 4.7872, range 4, pthptm
//                                     ~= 0.8356 (tight).
//   * 50/50 split [1x5, 10x5]       -> HPTM ~= 9.8144, range 9, pthptm
//                                     ~= 0.9170 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> HPTM ~= 93.9665, range 99,
//                                     pthptm ~= 1.0536 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/37) ~ 1.0642
//                                     asymptote).
//   * two-partner [1, 9]            -> HPTM ~= 8.8330, range 8, pthptm
//                                     ~= 0.9057 (tight).
//   * two-partner [1, 100]          -> HPTM ~= 98.1441, range 99, pthptm
//                                     ~= 1.0087 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> HPTM ~= 9.7074, range 9, pthptm
//                                     ~= 0.9271 (tight).
//   * pool_count=100 [1x99, 100]    -> HPTM ~= 88.2970, range 99, pthptm
//                                     ~= 1.1212 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw pthptm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR heptatrigintic_mean == 0
//   * tight                pthptm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               pthptm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0642,
//                          11-partner ~ 1.0670, 12-partner ~ 1.0695,
//                          13-partner ~ 1.0718, 14-partner ~ 1.0739,
//                          15-partner ~ 1.0759, 16-partner ~ 1.0778,
//                          17-partner ~ 1.0796, 18-partner ~ 1.0813,
//                          19-partner ~ 1.0828, 20-partner ~ 1.0843,
//                          21-partner ~ 1.0858, 22-partner ~ 1.0871,
//                          23-partner ~ 1.0884 and 24-partner ~ 1.0897
//                          all cap within spread)
//   * wide                 pthptm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 25)
//
// Both cutoffs are exposed on the envelope as tight_pthptm_max /
// wide_pthptm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.329):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToHexatriginticMeanSection
// (P11.326) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-heptatrigintic-center
// after the P11.326 range-against-hexatrigintic-center landing.

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
type PthptmLabel =
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

// Bands on raw pthptm (fixed cutoffs since heptatrigintic_mean scales
// with cell counts and typical heptatrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.326 PTHTM's 1.005 -- MILD-OUTLIER at M_37 is 0.9578 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.326 PTHTM's
// 1.09 -- 10-partner asymptote drops from 1.0661 (M_36) to 1.0642
// (M_37), 11-partner drops from 1.0689 to 1.0670, 12-partner drops
// from 1.0715 to 1.0695, 13-partner drops from 1.0738 to 1.0718,
// 14-partner drops from 1.0761 to 1.0739, 15-partner drops from
// 1.0781 to 1.0759, 16-partner drops from 1.0801 to 1.0778, 17-partner
// drops from 1.0819 to 1.0796, 18-partner drops from 1.0836 to 1.0813,
// 19-partner drops from 1.0852 to 1.0828, 20-partner drops from
// 1.0868 to 1.0843, 21-partner drops from 1.0882 to 1.0858, 22-partner
// drops from 1.0897 to 1.0871, 23-partner drops from 1.0910 to 1.0884
// and 24-partner lands at 1.0897 -- so pool_count >= 25
// (25^(1/37) ~ 1.0909) is now required to reach wide with a modest
// outlier.
const TIGHT_PTHPTM_MAX = 1.005;
const WIDE_PTHPTM_MIN = 1.09;

// PTHPTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTHPTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_heptatrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_heptatrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHeptatriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_pthptm_max: number;
  readonly wide_pthptm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanMap;
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

// Peak-to-heptatrigintic-mean of a discrete distribution:
//   PTHPTM = (max - min) / heptatrigintic_mean
// where heptatrigintic_mean = ((sum x_i^37) / n)^(1/37). Returns null
// on empty, solo, and degenerate (zero heptatrigintic_mean or non-
// finite thirty-seventh-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_heptatrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_heptatrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_heptatrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_heptatrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtyseventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^37 = x^8 * x^8 * x^8 * x^8 * x^4 * x -> oct*oct*oct*oct*quad*v
    thirtyseventhSum += oct * oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(thirtyseventhSum) || thirtyseventhSum <= 0) {
    return { pool_count, pool_cells, peak_to_heptatrigintic_mean: null };
  }
  const heptatrigintic_mean = Math.pow(thirtyseventhSum / pool_count, 1 / 37);
  if (!Number.isFinite(heptatrigintic_mean) || heptatrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_heptatrigintic_mean: null };
  }
  const range = max - min;
  const pthptm = range / heptatrigintic_mean;
  const clamped = pthptm < 0 ? 0 : pthptm;
  return {
    pool_count,
    pool_cells,
    peak_to_heptatrigintic_mean: roundTo(clamped, PTHPTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_heptatrigintic_mean: partner.peak_to_heptatrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_heptatrigintic_mean: metric.peak_to_heptatrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHeptatriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHeptatriginticMean {
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
    tight_pthptm_max: TIGHT_PTHPTM_MAX,
    wide_pthptm_min: WIDE_PTHPTM_MIN,
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

function labelForPthptm(
  pool_count: number,
  pool_cells: number,
  pthptm: number | null,
  tight_max: number,
  wide_min: number,
): PthptmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (pthptm === null) return "degenerate";
  if (pthptm >= wide_min) return "wide";
  if (pthptm < tight_max) return "tight";
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

function renderPthptmCell(
  pool_count: number,
  pool_cells: number,
  pthptm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPthptm(
    pool_count,
    pool_cells,
    pthptm,
    tight_max,
    wide_min,
  );
  const pthptmText = pthptm === null ? "-" : pthptm.toFixed(4);
  return `PTHPTM ${pthptmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHeptatriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_pthptm_max, wide_pthptm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPthptmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_heptatrigintic_mean, tight_pthptm_max, wide_pthptm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPthptmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_heptatrigintic_mean, tight_pthptm_max, wide_pthptm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-HEPTATRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-HEPTATRIGINTIC-CENTER scalar over the P11.161 pool &mdash; pthptm = (max - min) / heptatrigintic_mean where heptatrigintic_mean = ((sum x_i^37) / n)^(1/37). Reads the pool's total RANGE in units of its HEPTATRIGINTIC (power-mean-of-order-37, M_37) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.326 PTHTM because raising to the THIRTY-SEVENTH power lifts the anchor MORE than raising to the thirty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..hexatrigintic) power-mean OCTATRIGINTUPLET into a NOVEMTRIGINTUPLET with the M_37 heptatrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, pthptm approaches n^(1/37) so 10-partner pools cap near 1.0642, 11-partner near 1.0670, 12-partner near 1.0695, 13-partner near 1.0718, 14-partner near 1.0739, 15-partner near 1.0759, 16-partner near 1.0778, 17-partner near 1.0796, 18-partner near 1.0813, 19-partner near 1.0828, 20-partner near 1.0843, 21-partner near 1.0858, 22-partner near 1.0871, 23-partner near 1.0884 and 24-partner near 1.0897 (all below the wide floor); pools with pool_count &gt;= 25 (25^(1/37) ~= 1.0909) are required to escape into wide with a modest outlier. Composite regime labels: PTHPTM tight + PTHTM tight = MILD OUTLIER absorbed by heptatrigintic ([1x9, 10] reads PTHPTM 0.9578 tight); PTHPTM spread + PTHTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTHPTM 1.0536 spread); PTHPTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1212 wide); PTHPTM spread + PTHTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0087 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR heptatrigintic_mean == 0 (guarded but unreachable), tight = pthptm &lt; ${tight_pthptm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = pthptm in [${tight_pthptm_max}, ${wide_pthptm_min}) (extreme-outlier regime), wide = pthptm &ge; ${wide_pthptm_min} (runaway-outlier regime with pool_count &gt;= 25). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + pthptm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTHPTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTHPTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
