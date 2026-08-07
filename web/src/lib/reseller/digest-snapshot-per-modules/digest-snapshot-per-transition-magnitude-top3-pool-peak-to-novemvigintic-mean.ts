// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-NOVEMVIGINTIC-MEAN
// pure-lib (P11.312).
//
// WHOLE-POOL RANGE-AGAINST-NOVEMVIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's NOVEMVIGINTIC MEAN (a.k.a. power mean of order 29, M_29):
//
//   ptnvgm = (max - min) / novemvigintic_mean
//
// where novemvigintic_mean = ((sum x_i^29) / n)^(1/29). Reads the
// peak spread against the NOVEMVIGINTIC (power-mean-of-order-29)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.310 PTOVM, because raising to the TWENTY-NINTH power
// before averaging lifts the anchor MORE than raising to the twenty-
// eighth does, dampening the ratio against the range even harder.
//
// PTNVGM's unique DISPERSION-axis contribution: reads range in units
// of the NOVEMVIGINTIC (POWER-MEAN-OF-ORDER-29) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... septemvigintic M_27, octovigintic M_28) power-mean
// TRIGINTUPLET into a UNTRIGINTUPLET with the M_29 novemvigintic
// mean. By Power Mean inequality M_29 >= M_28, so
// novemvigintic_mean >= octovigintic_mean and ptnvgm <= ptovm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// novemvigintic_mean approaches x_max / n^(1/29), so ptnvgm
// approaches n^(1/29) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/29) ~= 1.0826, so even the most extreme outlier in a
// 10-partner pool reads ptnvgm just under 1.09. For n=11 the ceiling
// is 11^(1/29) ~= 1.0862, still below the wide floor. For n=12 the
// ceiling is 12^(1/29) ~= 1.0895 -- also below wide -- so pools
// with pool_count >= 13 (13^(1/29) ~= 1.0925) are required to
// escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/29) ~= 1.1725, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> novemvigintic_mean = k, range 0,
//                                     ptnvgm 0 (tight).
//   * uniform ramp [1..10]          -> NVGM ~= 9.2519, range 9, ptnvgm
//                                     ~= 0.9728 (tight).
//   * upper-outlier [1x9, 10]       -> NVGM ~= 9.2367, range 9, ptnvgm
//                                     ~= 0.9744 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.310
//                                     PTOVM's 0.9771 tight landing).
//   * two-shoulders [1x8, 5x2]      -> NVGM ~= 4.7301, range 4, ptnvgm
//                                     ~= 0.8457 (tight).
//   * 50/50 split [1x5, 10x5]       -> NVGM ~= 9.7638, range 9, ptnvgm
//                                     ~= 0.9218 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> NVGM ~= 92.3671, range 99,
//                                     ptnvgm ~= 1.0718 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/29) ~ 1.0826
//                                     asymptote).
//   * two-partner [1, 9]            -> NVGM ~= 8.7874, range 8, ptnvgm
//                                     ~= 0.9104 (tight).
//   * two-partner [1, 100]          -> NVGM ~= 97.6382, range 99, ptnvgm
//                                     ~= 1.0139 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> NVGM ~= 9.6283, range 9, ptnvgm
//                                     ~= 0.9347 (tight).
//   * pool_count=100 [1x99, 100]    -> NVGM ~= 85.3168, range 99, ptnvgm
//                                     ~= 1.1604 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptnvgm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR novemvigintic_mean == 0
//   * tight                ptnvgm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptnvgm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0826,
//                          11-partner ~ 1.0862 and 12-partner ~ 1.0895
//                          all cap within spread)
//   * wide                 ptnvgm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 13)
//
// Both cutoffs are exposed on the envelope as tight_ptnvgm_max /
// wide_ptnvgm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.313):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToOctoviginticMeanSection
// (P11.310) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-novemvigintic-center
// after the P11.310 range-against-octovigintic-center landing.

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
type PtnvgmLabel =
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

// Bands on raw ptnvgm (fixed cutoffs since novemvigintic_mean scales
// with cell counts and typical novemvigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.310 PTOVM's 1.005 -- MILD-OUTLIER at M_29 is 0.9744 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.310 PTOVM's
// 1.09 -- 10-partner asymptote drops from 1.0857 (M_28) to 1.0826
// (M_29), 11-partner drops from 1.0894 to 1.0862, and the 12-partner
// asymptote also drops from 1.0928 to 1.0895 -- so pool_count >= 13
// (13^(1/29) ~ 1.0925) is now required to reach wide with a modest
// outlier.
const TIGHT_PTNVGM_MAX = 1.005;
const WIDE_PTNVGM_MIN = 1.09;

// PTNVGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTNVGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_novemvigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_novemvigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemviginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptnvgm_max: number;
  readonly wide_ptnvgm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanMap;
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

// Peak-to-novemvigintic-mean of a discrete distribution:
//   PTNVGM = (max - min) / novemvigintic_mean
// where novemvigintic_mean = ((sum x_i^29) / n)^(1/29). Returns null
// on empty, solo, and degenerate (zero novemvigintic_mean or non-
// finite twenty-ninth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_novemvigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_novemvigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_novemvigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_novemvigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let twentyninthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^29 = x^8 * x^8 * x^8 * x^4 * x -> oct*oct*oct*quad*v
    twentyninthSum += oct * oct * oct * quad * v;
  }
  if (!Number.isFinite(twentyninthSum) || twentyninthSum <= 0) {
    return { pool_count, pool_cells, peak_to_novemvigintic_mean: null };
  }
  const novemvigintic_mean = Math.pow(twentyninthSum / pool_count, 1 / 29);
  if (!Number.isFinite(novemvigintic_mean) || novemvigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_novemvigintic_mean: null };
  }
  const range = max - min;
  const ptnvgm = range / novemvigintic_mean;
  const clamped = ptnvgm < 0 ? 0 : ptnvgm;
  return {
    pool_count,
    pool_cells,
    peak_to_novemvigintic_mean: roundTo(clamped, PTNVGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_novemvigintic_mean: partner.peak_to_novemvigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_novemvigintic_mean: metric.peak_to_novemvigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemviginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemviginticMean {
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
    tight_ptnvgm_max: TIGHT_PTNVGM_MAX,
    wide_ptnvgm_min: WIDE_PTNVGM_MIN,
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

function labelForPtnvgm(
  pool_count: number,
  pool_cells: number,
  ptnvgm: number | null,
  tight_max: number,
  wide_min: number,
): PtnvgmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptnvgm === null) return "degenerate";
  if (ptnvgm >= wide_min) return "wide";
  if (ptnvgm < tight_max) return "tight";
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

function renderPtnvgmCell(
  pool_count: number,
  pool_cells: number,
  ptnvgm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtnvgm(
    pool_count,
    pool_cells,
    ptnvgm,
    tight_max,
    wide_min,
  );
  const ptnvgmText = ptnvgm === null ? "-" : ptnvgm.toFixed(4);
  return `PTNVGM ${ptnvgmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemviginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToNovemviginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptnvgm_max, wide_ptnvgm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnvgmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_novemvigintic_mean, tight_ptnvgm_max, wide_ptnvgm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtnvgmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_novemvigintic_mean, tight_ptnvgm_max, wide_ptnvgm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-NOVEMVIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-NOVEMVIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptnvgm = (max - min) / novemvigintic_mean where novemvigintic_mean = ((sum x_i^29) / n)^(1/29). Reads the pool's total RANGE in units of its NOVEMVIGINTIC (power-mean-of-order-29, M_29) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.310 PTOVM because raising to the TWENTY-NINTH power lifts the anchor MORE than raising to the twenty-eighth does. Unique DISPERSION-axis contribution extends the (harmonic..octovigintic) power-mean TRIGINTUPLET into a UNTRIGINTUPLET with the M_29 novemvigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptnvgm approaches n^(1/29) so 10-partner pools cap near 1.0826, 11-partner near 1.0862 and 12-partner near 1.0895 (all below the wide floor); pools with pool_count &gt;= 13 (13^(1/29) ~= 1.0925) are required to escape into wide with a modest outlier. Composite regime labels: PTNVGM tight + PTOVM tight = MILD OUTLIER absorbed by novemvigintic ([1x9, 10] reads PTNVGM 0.9744 tight); PTNVGM spread + PTOVM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTNVGM 1.0718 spread); PTNVGM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1604 wide); PTNVGM spread + PTOVM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0139 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR novemvigintic_mean == 0 (guarded but unreachable), tight = ptnvgm &lt; ${tight_ptnvgm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptnvgm in [${tight_ptnvgm_max}, ${wide_ptnvgm_min}) (extreme-outlier regime), wide = ptnvgm &ge; ${wide_ptnvgm_min} (runaway-outlier regime with pool_count &gt;= 13). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptnvgm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTNVGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTNVGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
