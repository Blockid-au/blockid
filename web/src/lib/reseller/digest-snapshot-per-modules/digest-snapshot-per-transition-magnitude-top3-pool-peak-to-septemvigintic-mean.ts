// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTEMVIGINTIC-MEAN
// pure-lib (P11.308).
//
// WHOLE-POOL RANGE-AGAINST-SEPTEMVIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTEMVIGINTIC MEAN (a.k.a. power mean of order 27, M_27):
//
//   ptspvm = (max - min) / septemvigintic_mean
//
// where septemvigintic_mean = ((sum x_i^27) / n)^(1/27). Reads the
// peak spread against the SEPTEMVIGINTIC (power-mean-of-order-27)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.306 PTSVM, because raising to the TWENTY-SEVENTH power
// before averaging lifts the anchor MORE than raising to the twenty-
// sixth does, dampening the ratio against the range even harder.
//
// PTSPVM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTEMVIGINTIC (POWER-MEAN-OF-ORDER-27) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quinvigintic M_25, sesvigintic M_26) power-mean
// VIGESIMOOCTET into a VIGESIMONOVET with the M_27 septemvigintic
// mean. By Power Mean inequality M_27 >= M_26, so
// septemvigintic_mean >= sesvigintic_mean and ptspvm <= ptsvm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septemvigintic_mean approaches x_max / n^(1/27), so ptspvm
// approaches n^(1/27) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/27) ~= 1.0890, so even the most extreme outlier in a
// 10-partner pool reads ptspvm just under 1.09. For n=100 the
// ceiling climbs to 100^(1/27) ~= 1.1860, so a large pool with a
// dominant outlier reads wide. Pools with pool_count >= 11 can
// still escape into wide (11^(1/27) ~= 1.0929 > wide_min = 1.09).
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septemvigintic_mean = k, range 0,
//                                     ptspvm 0 (tight).
//   * uniform ramp [1..10]          -> SPVM ~= 9.2026, range 9, ptspvm
//                                     ~= 0.9780 (tight).
//   * upper-outlier [1x9, 10]       -> SPVM ~= 9.1825, range 9, ptspvm
//                                     ~= 0.9801 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.306
//                                     PTSVM's 0.9833 tight landing).
//   * two-shoulders [1x8, 5x2]      -> SPVM ~= 4.7107, range 4, ptspvm
//                                     ~= 0.8491 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPVM ~= 9.7465, range 9, ptspvm
//                                     ~= 0.9234 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPVM ~= 91.8254, range 99,
//                                     ptspvm ~= 1.0781 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/27) ~ 1.0890
//                                     asymptote).
//   * two-partner [1, 9]            -> SPVM ~= 8.7719, range 8, ptspvm
//                                     ~= 0.9120 (tight).
//   * two-partner [1, 100]          -> SPVM ~= 97.4655, range 99, ptspvm
//                                     ~= 1.0157 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> SPVM ~= 9.6013, range 9, ptspvm
//                                     ~= 0.9374 (tight).
//   * pool_count=100 [1x99, 100]    -> SPVM ~= 84.3191, range 99, ptspvm
//                                     ~= 1.1741 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptspvm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septemvigintic_mean == 0
//   * tight                ptspvm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptspvm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0890)
//   * wide                 ptspvm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 11)
//
// Both cutoffs are exposed on the envelope as tight_ptspvm_max /
// wide_ptspvm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.309):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSesviginticMeanSection
// (P11.306) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septemvigintic-center
// after the P11.306 range-against-sesvigintic-center landing.

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
type PtspvmLabel =
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

// Bands on raw ptspvm (fixed cutoffs since septemvigintic_mean scales
// with cell counts and typical septemvigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.306 PTSVM's 1.005 -- MILD-OUTLIER at M_27 is 0.9801 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.306 PTSVM's
// 1.09 -- 10-partner asymptote drops from 1.0926 (M_26) to 1.0890
// (M_27) so 10-partner pools now cap under the wide floor, while
// 11^(1/27) ~= 1.0929 still keeps pool_count >= 11 pools within reach
// of wide with a modest outlier.
const TIGHT_PTSPVM_MAX = 1.005;
const WIDE_PTSPVM_MIN = 1.09;

// PTSPVM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPVM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septemvigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septemvigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemviginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspvm_max: number;
  readonly wide_ptspvm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanMap;
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

// Peak-to-septemvigintic-mean of a discrete distribution:
//   PTSPVM = (max - min) / septemvigintic_mean
// where septemvigintic_mean = ((sum x_i^27) / n)^(1/27). Returns null
// on empty, solo, and degenerate (zero septemvigintic_mean or non-
// finite twenty-seventh-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septemvigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_septemvigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_septemvigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_septemvigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let twentyseventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^27 = x^8 * x^8 * x^8 * x^2 * x
    twentyseventhSum += oct * oct * oct * sq * v;
  }
  if (!Number.isFinite(twentyseventhSum) || twentyseventhSum <= 0) {
    return { pool_count, pool_cells, peak_to_septemvigintic_mean: null };
  }
  const septemvigintic_mean = Math.pow(twentyseventhSum / pool_count, 1 / 27);
  if (!Number.isFinite(septemvigintic_mean) || septemvigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_septemvigintic_mean: null };
  }
  const range = max - min;
  const ptspvm = range / septemvigintic_mean;
  const clamped = ptspvm < 0 ? 0 : ptspvm;
  return {
    pool_count,
    pool_cells,
    peak_to_septemvigintic_mean: roundTo(clamped, PTSPVM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septemvigintic_mean:
      partner.peak_to_septemvigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septemvigintic_mean: metric.peak_to_septemvigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemviginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemviginticMean {
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
    tight_ptspvm_max: TIGHT_PTSPVM_MAX,
    wide_ptspvm_min: WIDE_PTSPVM_MIN,
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

function labelForPtspvm(
  pool_count: number,
  pool_cells: number,
  ptspvm: number | null,
  tight_max: number,
  wide_min: number,
): PtspvmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspvm === null) return "degenerate";
  if (ptspvm >= wide_min) return "wide";
  if (ptspvm < tight_max) return "tight";
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

function renderPtspvmCell(
  pool_count: number,
  pool_cells: number,
  ptspvm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspvm(
    pool_count,
    pool_cells,
    ptspvm,
    tight_max,
    wide_min,
  );
  const ptspvmText = ptspvm === null ? "-" : ptspvm.toFixed(4);
  return `PTSPVM ${ptspvmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemviginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspvm_max, wide_ptspvm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspvmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septemvigintic_mean, tight_ptspvm_max, wide_ptspvm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspvmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septemvigintic_mean, tight_ptspvm_max, wide_ptspvm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTEMVIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTEMVIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspvm = (max - min) / septemvigintic_mean where septemvigintic_mean = ((sum x_i^27) / n)^(1/27). Reads the pool's total RANGE in units of its SEPTEMVIGINTIC (power-mean-of-order-27, M_27) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.306 PTSVM because raising to the TWENTY-SEVENTH power lifts the anchor MORE than raising to the twenty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sesvigintic) power-mean VIGESIMOOCTET into a VIGESIMONOVET with the M_27 septemvigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspvm approaches n^(1/27) so 10-partner pools cap near 1.0890 (below the wide floor) and only pools with pool_count &gt;= 11 escape into wide with a modest outlier (11^(1/27) ~= 1.0929). Composite regime labels: PTSPVM tight + PTSVM tight = MILD OUTLIER absorbed by septemvigintic ([1x9, 10] reads PTSPVM 0.9801 tight); PTSPVM spread + PTSVM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPVM 1.0781 spread); PTSPVM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1741 wide); PTSPVM spread + PTSVM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0157 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septemvigintic_mean == 0 (guarded but unreachable), tight = ptspvm &lt; ${tight_ptspvm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptspvm in [${tight_ptspvm_max}, ${wide_ptspvm_min}) (extreme-outlier regime), wide = ptspvm &ge; ${wide_ptspvm_min} (runaway-outlier regime with pool_count &gt;= 11). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspvm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPVM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPVM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
