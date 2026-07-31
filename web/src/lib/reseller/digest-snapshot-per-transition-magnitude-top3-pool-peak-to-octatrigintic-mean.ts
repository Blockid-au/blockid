// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTATRIGINTIC-MEAN
// pure-lib (P11.330).
//
// WHOLE-POOL RANGE-AGAINST-OCTATRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTATRIGINTIC MEAN (a.k.a. power mean of order 38, M_38):
//
//   ptotm = (max - min) / octatrigintic_mean
//
// where octatrigintic_mean = ((sum x_i^38) / n)^(1/38). Reads the peak
// spread against the OCTATRIGINTIC (power-mean-of-order-38) centre so
// a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.328
// PTHPTM, because raising to the THIRTY-EIGHTH power before averaging
// lifts the anchor MORE than raising to the thirty-seventh does,
// dampening the ratio against the range even harder.
//
// PTOTM's unique DISPERSION-axis contribution: reads range in units
// of the OCTATRIGINTIC (POWER-MEAN-OF-ORDER-38) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... hexatrigintic M_36, heptatrigintic M_37) power-mean
// NOVEMTRIGINTUPLET into a QUADRAGINTUPLET with the M_38 octatrigintic
// mean. By Power Mean inequality M_38 >= M_37, so
// octatrigintic_mean >= heptatrigintic_mean and ptotm <= pthptm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octatrigintic_mean approaches x_max / n^(1/38), so ptotm
// approaches n^(1/38) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/38) ~= 1.0625, so even the most extreme outlier in a
// 10-partner pool reads ptotm just under 1.09. For n=11 the ceiling
// is 11^(1/38) ~= 1.0651, still below the wide floor. For n=12 the
// ceiling is 12^(1/38) ~= 1.0676 (also below wide). For n=13 the
// ceiling is 13^(1/38) ~= 1.0698 (still below wide). For n=14 the
// ceiling is 14^(1/38) ~= 1.0719 (still below wide). For n=15 the
// ceiling is 15^(1/38) ~= 1.0739 (still below wide). For n=16 the
// ceiling is 16^(1/38) ~= 1.0757 (still below wide). For n=17 the
// ceiling is 17^(1/38) ~= 1.0774 (still below wide). For n=18 the
// ceiling is 18^(1/38) ~= 1.0790 (still below wide). For n=19 the
// ceiling is 19^(1/38) ~= 1.0806 (still below wide). For n=20 the
// ceiling is 20^(1/38) ~= 1.0820 (still below wide). For n=21 the
// ceiling is 21^(1/38) ~= 1.0834 (still below wide). For n=22 the
// ceiling is 22^(1/38) ~= 1.0847 (still below wide). For n=23 the
// ceiling is 23^(1/38) ~= 1.0860 (still below wide). For n=24 the
// ceiling is 24^(1/38) ~= 1.0872 (still below wide). For n=25 the
// ceiling is 25^(1/38) ~= 1.0884 (still below wide). For n=26 the
// ceiling is 26^(1/38) ~= 1.0895 -- still just under wide -- so
// pools with pool_count >= 27 (27^(1/38) ~= 1.0906) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/38) ~= 1.1288, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octatrigintic_mean = k, range 0,
//                                     ptotm 0 (tight).
//   * uniform ramp [1..10]          -> OTM ~= 9.4166, range 9, ptotm
//                                     ~= 0.9558 (tight).
//   * upper-outlier [1x9, 10]       -> OTM ~= 9.4120, range 9, ptotm
//                                     ~= 0.9562 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.328
//                                     PTHPTM's 0.9578 tight landing).
//   * two-shoulders [1x8, 5x2]      -> OTM ~= 4.7927, range 4, ptotm
//                                     ~= 0.8346 (tight).
//   * 50/50 split [1x5, 10x5]       -> OTM ~= 9.8192, range 9, ptotm
//                                     ~= 0.9166 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> OTM ~= 94.1205, range 99,
//                                     ptotm ~= 1.0518 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/38) ~ 1.0625
//                                     asymptote).
//   * two-partner [1, 9]            -> OTM ~= 8.8373, range 8, ptotm
//                                     ~= 0.9053 (tight).
//   * two-partner [1, 100]          -> OTM ~= 98.1925, range 99, ptotm
//                                     ~= 1.0082 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> OTM ~= 9.7150, range 9, ptotm
//                                     ~= 0.9264 (tight).
//   * pool_count=100 [1x99, 100]    -> OTM ~= 88.5867, range 99, ptotm
//                                     ~= 1.1175 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptotm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octatrigintic_mean == 0
//   * tight                ptotm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptotm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0625,
//                          11-partner ~ 1.0651, 12-partner ~ 1.0676,
//                          13-partner ~ 1.0698, 14-partner ~ 1.0719,
//                          15-partner ~ 1.0739, 16-partner ~ 1.0757,
//                          17-partner ~ 1.0774, 18-partner ~ 1.0790,
//                          19-partner ~ 1.0806, 20-partner ~ 1.0820,
//                          21-partner ~ 1.0834, 22-partner ~ 1.0847,
//                          23-partner ~ 1.0860, 24-partner ~ 1.0872,
//                          25-partner ~ 1.0884 and 26-partner ~ 1.0895
//                          all cap within spread)
//   * wide                 ptotm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 27)
//
// Both cutoffs are exposed on the envelope as tight_ptotm_max /
// wide_ptotm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.331):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToHeptatriginticMeanSection
// (P11.328) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octatrigintic-center
// after the P11.328 range-against-heptatrigintic-center landing.

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
type PtotmLabel =
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

// Bands on raw ptotm (fixed cutoffs since octatrigintic_mean scales
// with cell counts and typical octatrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.328 PTHPTM's 1.005 -- MILD-OUTLIER at M_38 is 0.9562 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.328 PTHPTM's
// 1.09 -- 10-partner asymptote drops from 1.0642 (M_37) to 1.0625
// (M_38), 11-partner drops from 1.0670 to 1.0651, 12-partner drops
// from 1.0695 to 1.0676, 13-partner drops from 1.0718 to 1.0698,
// 14-partner drops from 1.0739 to 1.0719, 15-partner drops from
// 1.0759 to 1.0739, 16-partner drops from 1.0778 to 1.0757, 17-partner
// drops from 1.0796 to 1.0774, 18-partner drops from 1.0813 to 1.0790,
// 19-partner drops from 1.0828 to 1.0806, 20-partner drops from
// 1.0843 to 1.0820, 21-partner drops from 1.0858 to 1.0834, 22-partner
// drops from 1.0871 to 1.0847, 23-partner drops from 1.0884 to 1.0860,
// 24-partner drops from 1.0897 to 1.0872, 25-partner lands at 1.0884
// and 26-partner lands at 1.0895 -- so pool_count >= 27
// (27^(1/38) ~ 1.0906) is now required to reach wide with a modest
// outlier.
const TIGHT_PTOTM_MAX = 1.005;
const WIDE_PTOTM_MIN = 1.09;

// PTOTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octatrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octatrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctatriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptotm_max: number;
  readonly wide_ptotm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanMap;
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

// Peak-to-octatrigintic-mean of a discrete distribution:
//   PTOTM = (max - min) / octatrigintic_mean
// where octatrigintic_mean = ((sum x_i^38) / n)^(1/38). Returns null
// on empty, solo, and degenerate (zero octatrigintic_mean or non-
// finite thirty-eighth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octatrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_octatrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_octatrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_octatrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtyeighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^38 = x^8 * x^8 * x^8 * x^8 * x^4 * x^2 -> oct*oct*oct*oct*quad*sq
    thirtyeighthSum += oct * oct * oct * oct * quad * sq;
  }
  if (!Number.isFinite(thirtyeighthSum) || thirtyeighthSum <= 0) {
    return { pool_count, pool_cells, peak_to_octatrigintic_mean: null };
  }
  const octatrigintic_mean = Math.pow(thirtyeighthSum / pool_count, 1 / 38);
  if (!Number.isFinite(octatrigintic_mean) || octatrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_octatrigintic_mean: null };
  }
  const range = max - min;
  const ptotm = range / octatrigintic_mean;
  const clamped = ptotm < 0 ? 0 : ptotm;
  return {
    pool_count,
    pool_cells,
    peak_to_octatrigintic_mean: roundTo(clamped, PTOTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octatrigintic_mean: partner.peak_to_octatrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octatrigintic_mean: metric.peak_to_octatrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctatriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctatriginticMean {
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
    tight_ptotm_max: TIGHT_PTOTM_MAX,
    wide_ptotm_min: WIDE_PTOTM_MIN,
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

function labelForPtotm(
  pool_count: number,
  pool_cells: number,
  ptotm: number | null,
  tight_max: number,
  wide_min: number,
): PtotmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptotm === null) return "degenerate";
  if (ptotm >= wide_min) return "wide";
  if (ptotm < tight_max) return "tight";
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

function renderPtotmCell(
  pool_count: number,
  pool_cells: number,
  ptotm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtotm(
    pool_count,
    pool_cells,
    ptotm,
    tight_max,
    wide_min,
  );
  const ptotmText = ptotm === null ? "-" : ptotm.toFixed(4);
  return `PTOTM ${ptotmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctatriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctatriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptotm_max, wide_ptotm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtotmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octatrigintic_mean, tight_ptotm_max, wide_ptotm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtotmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octatrigintic_mean, tight_ptotm_max, wide_ptotm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTATRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTATRIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptotm = (max - min) / octatrigintic_mean where octatrigintic_mean = ((sum x_i^38) / n)^(1/38). Reads the pool's total RANGE in units of its OCTATRIGINTIC (power-mean-of-order-38, M_38) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.328 PTHPTM because raising to the THIRTY-EIGHTH power lifts the anchor MORE than raising to the thirty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..heptatrigintic) power-mean NOVEMTRIGINTUPLET into a QUADRAGINTUPLET with the M_38 octatrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptotm approaches n^(1/38) so 10-partner pools cap near 1.0625, 11-partner near 1.0651, 12-partner near 1.0676, 13-partner near 1.0698, 14-partner near 1.0719, 15-partner near 1.0739, 16-partner near 1.0757, 17-partner near 1.0774, 18-partner near 1.0790, 19-partner near 1.0806, 20-partner near 1.0820, 21-partner near 1.0834, 22-partner near 1.0847, 23-partner near 1.0860, 24-partner near 1.0872, 25-partner near 1.0884 and 26-partner near 1.0895 (all below the wide floor); pools with pool_count &gt;= 27 (27^(1/38) ~= 1.0906) are required to escape into wide with a modest outlier. Composite regime labels: PTOTM tight + PTHPTM tight = MILD OUTLIER absorbed by octatrigintic ([1x9, 10] reads PTOTM 0.9562 tight); PTOTM spread + PTHPTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOTM 1.0518 spread); PTOTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1175 wide); PTOTM spread + PTHPTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0082 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octatrigintic_mean == 0 (guarded but unreachable), tight = ptotm &lt; ${tight_ptotm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptotm in [${tight_ptotm_max}, ${wide_ptotm_min}) (extreme-outlier regime), wide = ptotm &ge; ${wide_ptotm_min} (runaway-outlier regime with pool_count &gt;= 27). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptotm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
