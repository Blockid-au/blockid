// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-TRETRIGINTIC-MEAN
// pure-lib (P11.320).
//
// WHOLE-POOL RANGE-AGAINST-TRETRIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's TRETRIGINTIC MEAN (a.k.a. power mean of order 33, M_33):
//
//   ptttm = (max - min) / tretrigintic_mean
//
// where tretrigintic_mean = ((sum x_i^33) / n)^(1/33). Reads the peak
// spread against the TRETRIGINTIC (power-mean-of-order-33) centre so a
// LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.318
// PTDTM, because raising to the THIRTY-THIRD power before averaging
// lifts the anchor MORE than raising to the thirty-second does, dampening
// the ratio against the range even harder.
//
// PTTTM's unique DISPERSION-axis contribution: reads range in units
// of the TRETRIGINTIC (POWER-MEAN-OF-ORDER-33) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... untrigintic M_31, duotrigintic M_32) power-mean
// TETRATRIGINTUPLET into a PENTATRIGINTUPLET with the M_33 tretrigintic
// mean. By Power Mean inequality M_33 >= M_32, so
// tretrigintic_mean >= duotrigintic_mean and ptttm <= ptdtm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// tretrigintic_mean approaches x_max / n^(1/33), so ptttm
// approaches n^(1/33) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/33) ~= 1.0723, so even the most extreme outlier in a
// 10-partner pool reads ptttm just under 1.09. For n=11 the ceiling
// is 11^(1/33) ~= 1.0754, still below the wide floor. For n=12 the
// ceiling is 12^(1/33) ~= 1.0782 (also below wide). For n=13 the
// ceiling is 13^(1/33) ~= 1.0808 (still below wide). For n=14 the
// ceiling is 14^(1/33) ~= 1.0833 (still below wide). For n=15 the
// ceiling is 15^(1/33) ~= 1.0855 (still below wide). For n=16 the
// ceiling is 16^(1/33) ~= 1.0876 (still below wide). For n=17 the
// ceiling is 17^(1/33) ~= 1.0896 -- still just under wide -- so
// pools with pool_count >= 18 (18^(1/33) ~= 1.0915) are required
// to escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/33) ~= 1.1487, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> tretrigintic_mean = k, range 0,
//                                     ptttm 0 (tight).
//   * uniform ramp [1..10]          -> TTM ~= 9.3348, range 9, ptttm
//                                     ~= 0.9641 (tight).
//   * upper-outlier [1x9, 10]       -> TTM ~= 9.3260, range 9, ptttm
//                                     ~= 0.9650 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.318
//                                     PTDTM's 0.9671 tight landing).
//   * two-shoulders [1x8, 5x2]      -> TTM ~= 4.7620, range 4, ptttm
//                                     ~= 0.8400 (tight).
//   * 50/50 split [1x5, 10x5]       -> TTM ~= 9.7921, range 9, ptttm
//                                     ~= 0.9191 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> TTM ~= 93.2603, range 99,
//                                     ptttm ~= 1.0615 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/33) ~ 1.0723
//                                     asymptote).
//   * two-partner [1, 9]            -> TTM ~= 8.8129, range 8, ptttm
//                                     ~= 0.9078 (tight).
//   * two-partner [1, 100]          -> TTM ~= 97.9215, range 99, ptttm
//                                     ~= 1.0110 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> TTM ~= 9.6726, range 9, ptttm
//                                     ~= 0.9305 (tight).
//   * pool_count=100 [1x99, 100]    -> TTM ~= 86.9749, range 99, ptttm
//                                     ~= 1.1383 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptttm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR tretrigintic_mean == 0
//   * tight                ptttm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptttm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0723,
//                          11-partner ~ 1.0754, 12-partner ~ 1.0782,
//                          13-partner ~ 1.0808, 14-partner ~ 1.0833,
//                          15-partner ~ 1.0855, 16-partner ~ 1.0876
//                          and 17-partner ~ 1.0896 all cap within spread)
//   * wide                 ptttm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 18)
//
// Both cutoffs are exposed on the envelope as tight_ptttm_max /
// wide_ptttm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.321):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToDuotriginticMeanSection
// (P11.318) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-tretrigintic-center
// after the P11.318 range-against-duotrigintic-center landing.

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
type PtttmLabel =
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

// Bands on raw ptttm (fixed cutoffs since tretrigintic_mean scales
// with cell counts and typical tretrigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.318 PTDTM's 1.005 -- MILD-OUTLIER at M_33 is 0.9650 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.318 PTDTM's
// 1.09 -- 10-partner asymptote drops from 1.0746 (M_32) to 1.0723
// (M_33), 11-partner drops from 1.0778 to 1.0754, 12-partner drops
// from 1.0807 to 1.0782, 13-partner drops from 1.0835 to 1.0808,
// 14-partner drops from 1.0860 to 1.0833, 15-partner drops from
// 1.0883 to 1.0855, 16-partner drops from 1.0905 to 1.0876 and
// 17-partner drops from 1.0925 to 1.0896 -- so pool_count >= 18
// (18^(1/33) ~ 1.0915) is now required to reach wide with a modest
// outlier.
const TIGHT_PTTTM_MAX = 1.005;
const WIDE_PTTTM_MIN = 1.09;

// PTTTM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTTTM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_tretrigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_tretrigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretriginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptttm_max: number;
  readonly wide_ptttm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanMap;
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

// Peak-to-tretrigintic-mean of a discrete distribution:
//   PTTTM = (max - min) / tretrigintic_mean
// where tretrigintic_mean = ((sum x_i^33) / n)^(1/33). Returns null
// on empty, solo, and degenerate (zero tretrigintic_mean or non-
// finite thirty-third-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_tretrigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_tretrigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_tretrigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_tretrigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let thirtythirdSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^33 = x^8 * x^8 * x^8 * x^8 * x -> oct*oct*oct*oct*v
    thirtythirdSum += oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(thirtythirdSum) || thirtythirdSum <= 0) {
    return { pool_count, pool_cells, peak_to_tretrigintic_mean: null };
  }
  const tretrigintic_mean = Math.pow(thirtythirdSum / pool_count, 1 / 33);
  if (!Number.isFinite(tretrigintic_mean) || tretrigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_tretrigintic_mean: null };
  }
  const range = max - min;
  const ptttm = range / tretrigintic_mean;
  const clamped = ptttm < 0 ? 0 : ptttm;
  return {
    pool_count,
    pool_cells,
    peak_to_tretrigintic_mean: roundTo(clamped, PTTTM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_tretrigintic_mean: partner.peak_to_tretrigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_tretrigintic_mean: metric.peak_to_tretrigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToTretriginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretriginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretriginticMean {
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
    tight_ptttm_max: TIGHT_PTTTM_MAX,
    wide_ptttm_min: WIDE_PTTTM_MIN,
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

function labelForPtttm(
  pool_count: number,
  pool_cells: number,
  ptttm: number | null,
  tight_max: number,
  wide_min: number,
): PtttmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptttm === null) return "degenerate";
  if (ptttm >= wide_min) return "wide";
  if (ptttm < tight_max) return "tight";
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

function renderPtttmCell(
  pool_count: number,
  pool_cells: number,
  ptttm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtttm(
    pool_count,
    pool_cells,
    ptttm,
    tight_max,
    wide_min,
  );
  const ptttmText = ptttm === null ? "-" : ptttm.toFixed(4);
  return `PTTTM ${ptttmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretriginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTretriginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptttm_max, wide_ptttm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtttmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_tretrigintic_mean, tight_ptttm_max, wide_ptttm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtttmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_tretrigintic_mean, tight_ptttm_max, wide_ptttm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-TRETRIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-TRETRIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptttm = (max - min) / tretrigintic_mean where tretrigintic_mean = ((sum x_i^33) / n)^(1/33). Reads the pool's total RANGE in units of its TRETRIGINTIC (power-mean-of-order-33, M_33) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.318 PTDTM because raising to the THIRTY-THIRD power lifts the anchor MORE than raising to the thirty-second does. Unique DISPERSION-axis contribution extends the (harmonic..duotrigintic) power-mean TETRATRIGINTUPLET into a PENTATRIGINTUPLET with the M_33 tretrigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptttm approaches n^(1/33) so 10-partner pools cap near 1.0723, 11-partner near 1.0754, 12-partner near 1.0782, 13-partner near 1.0808, 14-partner near 1.0833, 15-partner near 1.0855, 16-partner near 1.0876 and 17-partner near 1.0896 (all below the wide floor); pools with pool_count &gt;= 18 (18^(1/33) ~= 1.0915) are required to escape into wide with a modest outlier. Composite regime labels: PTTTM tight + PTDTM tight = MILD OUTLIER absorbed by tretrigintic ([1x9, 10] reads PTTTM 0.9650 tight); PTTTM spread + PTDTM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTTTM 1.0615 spread); PTTTM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1383 wide); PTTTM spread + PTDTM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0110 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR tretrigintic_mean == 0 (guarded but unreachable), tight = ptttm &lt; ${tight_ptttm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptttm in [${tight_ptttm_max}, ${wide_ptttm_min}) (extreme-outlier regime), wide = ptttm &ge; ${wide_ptttm_min} (runaway-outlier regime with pool_count &gt;= 18). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptttm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTTTM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTTTM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
