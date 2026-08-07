// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTOVIGINTIC-MEAN
// pure-lib (P11.310).
//
// WHOLE-POOL RANGE-AGAINST-OCTOVIGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTOVIGINTIC MEAN (a.k.a. power mean of order 28, M_28):
//
//   ptovm = (max - min) / octovigintic_mean
//
// where octovigintic_mean = ((sum x_i^28) / n)^(1/28). Reads the
// peak spread against the OCTOVIGINTIC (power-mean-of-order-28)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.308 PTSPVM, because raising to the TWENTY-EIGHTH power
// before averaging lifts the anchor MORE than raising to the twenty-
// seventh does, dampening the ratio against the range even harder.
//
// PTOVM's unique DISPERSION-axis contribution: reads range in units
// of the OCTOVIGINTIC (POWER-MEAN-OF-ORDER-28) CENTER. Extends the
// (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... sesvigintic M_26, septemvigintic M_27) power-mean
// VIGESIMONOVET into a TRIGINTUPLET with the M_28 octovigintic
// mean. By Power Mean inequality M_28 >= M_27, so
// octovigintic_mean >= septemvigintic_mean and ptovm <= ptspvm for
// every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octovigintic_mean approaches x_max / n^(1/28), so ptovm
// approaches n^(1/28) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/28) ~= 1.0857, so even the most extreme outlier in a
// 10-partner pool reads ptovm just under 1.09. For n=11 the ceiling
// is 11^(1/28) ~= 1.0894, still just below the wide floor — so
// pools with pool_count >= 12 (12^(1/28) ~= 1.0928) are required to
// escape into wide with a modest outlier. For n=100 the ceiling
// climbs to 100^(1/28) ~= 1.1788, so a large pool with a dominant
// outlier reads wide.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octovigintic_mean = k, range 0,
//                                     ptovm 0 (tight).
//   * uniform ramp [1..10]          -> OVM ~= 9.2280, range 9, ptovm
//                                     ~= 0.9753 (tight).
//   * upper-outlier [1x9, 10]       -> OVM ~= 9.2106, range 9, ptovm
//                                     ~= 0.9771 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.308
//                                     PTSPVM's 0.9801 tight landing).
//   * two-shoulders [1x8, 5x2]      -> OVM ~= 4.7207, range 4, ptovm
//                                     ~= 0.8473 (tight).
//   * 50/50 split [1x5, 10x5]       -> OVM ~= 9.7555, range 9, ptovm
//                                     ~= 0.9226 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> OVM ~= 92.1055, range 99,
//                                     ptovm ~= 1.0749 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/28) ~ 1.0857
//                                     asymptote).
//   * two-partner [1, 9]            -> OVM ~= 8.7799, range 8, ptovm
//                                     ~= 0.9112 (tight).
//   * two-partner [1, 100]          -> OVM ~= 97.5549, range 99, ptovm
//                                     ~= 1.0148 (SPREAD -- ISOLATED HIGH
//                                     PARTNER remains above the 1.005
//                                     tight/spread boundary).
//   * small [10, 1, 1]              -> OVM ~= 9.6152, range 9, ptovm
//                                     ~= 0.9360 (tight).
//   * pool_count=100 [1x99, 100]    -> OVM ~= 84.8343, range 99, ptovm
//                                     ~= 1.1670 (WIDE -- RUNAWAY OUTLIER).
//
// Bands on raw ptovm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octovigintic_mean == 0
//   * tight                ptovm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner, small regimes)
//   * spread               ptovm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0857 and
//                          11-partner asymptote ~ 1.0894 both cap
//                          within spread)
//   * wide                 ptovm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 12)
//
// Both cutoffs are exposed on the envelope as tight_ptovm_max /
// wide_ptovm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.311):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptemviginticMeanSection
// (P11.308) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octovigintic-center
// after the P11.308 range-against-septemvigintic-center landing.

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
type PtovmLabel =
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

// Bands on raw ptovm (fixed cutoffs since octovigintic_mean scales
// with cell counts and typical octovigintic-center emissions land
// near 1-10 for the P11.161 top-3 pool). Tight boundary holds at
// P11.308 PTSPVM's 1.005 -- MILD-OUTLIER at M_28 is 0.9771 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.308 PTSPVM's
// 1.09 -- 10-partner asymptote drops from 1.0890 (M_27) to 1.0857
// (M_28) so 10-partner pools remain capped under the wide floor and
// 11-partner asymptote 1.0894 now sits below wide too, so pool_count
// >= 12 (12^(1/28) ~ 1.0928) is required to reach wide with a modest
// outlier.
const TIGHT_PTOVM_MAX = 1.005;
const WIDE_PTOVM_MIN = 1.09;

// PTOVM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTOVM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octovigintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octovigintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoviginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptovm_max: number;
  readonly wide_ptovm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanMap;
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

// Peak-to-octovigintic-mean of a discrete distribution:
//   PTOVM = (max - min) / octovigintic_mean
// where octovigintic_mean = ((sum x_i^28) / n)^(1/28). Returns null
// on empty, solo, and degenerate (zero octovigintic_mean or non-
// finite twenty-eighth-power sum) so downstream labels fire from
// distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octovigintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return { pool_count, pool_cells, peak_to_octovigintic_mean: null };
  }
  if (pool_count === 1) {
    return { pool_count, pool_cells, peak_to_octovigintic_mean: null };
  }
  if (pool_cells === 0) {
    return { pool_count, pool_cells, peak_to_octovigintic_mean: null };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let twentyeighthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^28 = x^8 * x^8 * x^8 * x^4 -> oct*oct*oct*quad
    twentyeighthSum += oct * oct * oct * quad;
  }
  if (!Number.isFinite(twentyeighthSum) || twentyeighthSum <= 0) {
    return { pool_count, pool_cells, peak_to_octovigintic_mean: null };
  }
  const octovigintic_mean = Math.pow(twentyeighthSum / pool_count, 1 / 28);
  if (!Number.isFinite(octovigintic_mean) || octovigintic_mean <= 0) {
    return { pool_count, pool_cells, peak_to_octovigintic_mean: null };
  }
  const range = max - min;
  const ptovm = range / octovigintic_mean;
  const clamped = ptovm < 0 ? 0 : ptovm;
  return {
    pool_count,
    pool_cells,
    peak_to_octovigintic_mean: roundTo(clamped, PTOVM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octovigintic_mean: partner.peak_to_octovigintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octovigintic_mean: metric.peak_to_octovigintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoviginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoviginticMean {
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
    tight_ptovm_max: TIGHT_PTOVM_MAX,
    wide_ptovm_min: WIDE_PTOVM_MIN,
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

function labelForPtovm(
  pool_count: number,
  pool_cells: number,
  ptovm: number | null,
  tight_max: number,
  wide_min: number,
): PtovmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptovm === null) return "degenerate";
  if (ptovm >= wide_min) return "wide";
  if (ptovm < tight_max) return "tight";
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

function renderPtovmCell(
  pool_count: number,
  pool_cells: number,
  ptovm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtovm(
    pool_count,
    pool_cells,
    ptovm,
    tight_max,
    wide_min,
  );
  const ptovmText = ptovm === null ? "-" : ptovm.toFixed(4);
  return `PTOVM ${ptovmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoviginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctoviginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptovm_max, wide_ptovm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtovmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octovigintic_mean, tight_ptovm_max, wide_ptovm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtovmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octovigintic_mean, tight_ptovm_max, wide_ptovm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTOVIGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTOVIGINTIC-CENTER scalar over the P11.161 pool &mdash; ptovm = (max - min) / octovigintic_mean where octovigintic_mean = ((sum x_i^28) / n)^(1/28). Reads the pool's total RANGE in units of its OCTOVIGINTIC (power-mean-of-order-28, M_28) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.308 PTSPVM because raising to the TWENTY-EIGHTH power lifts the anchor MORE than raising to the twenty-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septemvigintic) power-mean VIGESIMONOVET into a TRIGINTUPLET with the M_28 octovigintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptovm approaches n^(1/28) so 10-partner pools cap near 1.0857 and 11-partner pools cap near 1.0894 (both below the wide floor); pools with pool_count &gt;= 12 (12^(1/28) ~= 1.0928) are required to escape into wide with a modest outlier. Composite regime labels: PTOVM tight + PTSPVM tight = MILD OUTLIER absorbed by octovigintic ([1x9, 10] reads PTOVM 0.9771 tight); PTOVM spread + PTSPVM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTOVM 1.0749 spread); PTOVM wide = RUNAWAY OUTLIER with a large pool ([1x99, 100] reads 1.1670 wide); PTOVM spread + PTSPVM spread + PTSOM tight = ISOLATED HIGH PARTNER ([1, 100] reads 1.0148 spread). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octovigintic_mean == 0 (guarded but unreachable), tight = ptovm &lt; ${tight_ptovm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner, small regimes), spread = ptovm in [${tight_ptovm_max}, ${wide_ptovm_min}) (extreme-outlier regime), wide = ptovm &ge; ${wide_ptovm_min} (runaway-outlier regime with pool_count &gt;= 12). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptovm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTOVM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTOVM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
