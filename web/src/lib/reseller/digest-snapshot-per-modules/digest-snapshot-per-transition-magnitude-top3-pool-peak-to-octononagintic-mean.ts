// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-OCTONONAGINTIC-MEAN
// pure-lib (P11.450).
//
// WHOLE-POOL RANGE-AGAINST-OCTONONAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's OCTONONAGINTIC MEAN (a.k.a. power mean of order 98, M_98):
//
//   ptongm = (max - min) / octononagintic_mean
//
// where octononagintic_mean = ((sum x_i^98) / n)^(1/98). Reads the
// peak spread against the OCTONONAGINTIC (power-mean-of-order-98)
// centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than
// under P11.448 PTSPNGM, because raising to the NINETY-EIGHTH power
// before averaging lifts the anchor MORE than raising to the
// ninety-seventh does, dampening the ratio against the range even harder.
//
// PTONGM's unique DISPERSION-axis contribution: reads range in units
// of the OCTONONAGINTIC (POWER-MEAN-OF-ORDER-98) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quinquonagintic M_95, sexnonagintic M_96,
// septennonagintic M_97) power-mean NOVEMVIGINTISEPTUAGINTUPLET into
// a TRIGINTASEPTUAGINTUPLET with the M_98 octononagintic mean.
// By Power Mean inequality M_98 >= M_97, so octononagintic_mean >=
// septennonagintic_mean and ptongm <= ptspngm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// octononagintic_mean approaches x_max / n^(1/98), so ptongm
// approaches n^(1/98) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/98) ~= 1.0238, for n=20 ~= 1.0310, for n=30 ~= 1.0353,
// for n=40 ~= 1.0384, for n=50 ~= 1.0407, for n=60 ~= 1.0427,
// for n=70 ~= 1.0443, for n=80 ~= 1.0457, for n=85 ~= 1.0464,
// for n=89 ~= 1.0469, for n=90 ~= 1.0470 -- all still just under
// wide -- so pools with pool_count >= 100 (100^(1/98) ~= 1.0481)
// are required to escape into wide with a modest outlier. For
// n=100 the ceiling is 100^(1/98) ~= 1.0481, and the pool100
// [1x99, 100] reference reads 1.0376 spread (further absorbed
// from PTSPNGM's 1.0381 spread landing) because the asymptote gap
// at n=100 has narrowed and the [1x99, 100] pool sits deeper
// inside the spread band at M_98.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> octononagintic_mean = k,
//                                     range 0, ptongm 0 (tight).
//   * uniform ramp [1..10]          -> ONGM ~= 9.7678, range 9,
//                                     ptongm ~= 0.9214 (tight).
//   * upper-outlier [1x9, 10]       -> ONGM ~= 9.7678, range 9,
//                                     ptongm ~= 0.9214 (tight --
//                                     MILD OUTLIER STAYS collapsed
//                                     into the same 4-decimal bucket
//                                     as the uniform ramp at M_98;
//                                     the M_97 joint collapse persists
//                                     at M_98 because both anchors
//                                     continue to approach
//                                     10 / 10^(1/98) ~ 9.7678 in
//                                     lock-step, so ptspngm's 0.9216
//                                     joint bucket at M_97 becomes a
//                                     joint 0.9214 bucket at M_98).
//   * two-shoulders [1x8, 5x2]      -> ONGM ~= 4.9186, range 4,
//                                     ptongm ~= 0.8132 (tight).
//   * 50/50 split [1x5, 10x5]       -> ONGM ~= 9.9295, range 9,
//                                     ptongm ~= 0.9064 (tight --
//                                     BIMODAL SPLIT well-absorbed).
//   * extreme outlier [1x9, 100]    -> ONGM ~= 97.6778, range 99,
//                                     ptongm ~= 1.0135 (SPREAD --
//                                     EXTREME OUTLIER approaches
//                                     n^(1/98) ~ 1.0238 asymptote).
//   * two-partner [1, 9]            -> ONGM ~= 8.9366, range 8,
//                                     ptongm ~= 0.8952 (tight).
//   * two-partner [1, 100]          -> ONGM ~= 99.2952, range 99,
//                                     ptongm ~= 0.9970 (TIGHT --
//                                     ISOLATED HIGH PARTNER absorption
//                                     ADVANCES at M_98; drops from
//                                     M_97's 0.9971 landing to a
//                                     fresh 0.9970 tick as the
//                                     octononagintic anchor tips
//                                     further past the range).
//   * small [10, 1, 1]              -> ONGM ~= 9.8885, range 9,
//                                     ptongm ~= 0.9101 (tight).
//   * pool_count=100 [1x99, 100]    -> ONGM ~= 95.4095, range 99,
//                                     ptongm ~= 1.0376 (SPREAD --
//                                     FURTHER ABSORBED from PTSPNGM
//                                     M_97's 1.0381 spread;
//                                     100-partner asymptote
//                                     100^(1/98) ~ 1.0481 sits within
//                                     the spread band so a modest
//                                     outlier no longer reaches wide
//                                     at n=100).
//
// Bands on raw ptongm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR octononagintic_mean == 0
//   * tight                ptongm < 1.005
//   * spread               ptongm in [1.005, 1.09)
//   * wide                 ptongm >= 1.09
//
// Both cutoffs are exposed on the envelope as tight_ptongm_max /
// wide_ptongm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.451):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSeptennonaginticMeanSection
// (P11.449) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-octononagintic-center
// after the P11.449 range-against-septennonagintic-center landing.

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
type PtongmLabel =
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

// Bands on raw ptongm (fixed cutoffs since octononagintic_mean
// scales with cell counts and typical octononagintic-center emissions
// land near 1-10 for the P11.161 top-3 pool). Tight boundary HOLDS at
// P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_98 is 0.9214 (already
// well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0240 (M_97) to
// 1.0238 (M_98), 20-partner drops from 1.0314 to 1.0310, 30-partner
// drops from 1.0358 to 1.0353, 40-partner drops from 1.0388 to
// 1.0384, 50-partner drops from 1.0412 to 1.0407, 60-partner drops
// from 1.0432 to 1.0427, 70-partner drops from 1.0448 to 1.0443,
// 80-partner drops from 1.0463 to 1.0457, 85-partner drops from
// 1.0470 to 1.0464, 89-partner drops from 1.0475 to 1.0469,
// 90-partner ~ 1.0470 -- so pool_count >= 100 (100^(1/98) ~ 1.0481)
// is now required to reach wide with a modest outlier. In particular
// pool_count=100 [1x99, 100] drops from PTSPNGM 1.0381 spread to
// PTONGM 1.0376 spread -- FURTHER ABSORBED but stays within spread;
// the DISPERSION power-mean progression continues to compress the
// [1x99, 100] shape.
const TIGHT_PTONGM_MAX = 1.005;
const WIDE_PTONGM_MIN = 1.09;

// PTONGM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTONGM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_octononagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_octononagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctononaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptongm_max: number;
  readonly wide_ptongm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanMap;
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

// Peak-to-octononagintic-mean of a discrete distribution:
//   PTONGM = (max - min) / octononagintic_mean
// where octononagintic_mean = ((sum x_i^98) / n)^(1/98). Returns
// null on empty, solo, and degenerate (zero octononagintic_mean
// or non-finite ninety-eighth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_octononagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octononagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_octononagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octononagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let ninetyEightSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^98 = (x^8)^12 * x^2 -> oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*oct*sq
    ninetyEightSum +=
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      oct *
      sq;
  }
  if (!Number.isFinite(ninetyEightSum) || ninetyEightSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octononagintic_mean: null,
    };
  }
  const octononagintic_mean = Math.pow(ninetyEightSum / pool_count, 1 / 98);
  if (!Number.isFinite(octononagintic_mean) || octononagintic_mean <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_octononagintic_mean: null,
    };
  }
  const range = max - min;
  const ptongm = range / octononagintic_mean;
  const clamped = ptongm < 0 ? 0 : ptongm;
  return {
    pool_count,
    pool_cells,
    peak_to_octononagintic_mean: roundTo(clamped, PTONGM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_octononagintic_mean:
      partner.peak_to_octononagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_octononagintic_mean: metric.peak_to_octononagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctononaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctononaginticMean {
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
    tight_ptongm_max: TIGHT_PTONGM_MAX,
    wide_ptongm_min: WIDE_PTONGM_MIN,
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

function labelForPtongm(
  pool_count: number,
  pool_cells: number,
  ptongm: number | null,
  tight_max: number,
  wide_min: number,
): PtongmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptongm === null) return "degenerate";
  if (ptongm >= wide_min) return "wide";
  if (ptongm < tight_max) return "tight";
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

function renderPtongmCell(
  pool_count: number,
  pool_cells: number,
  ptongm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtongm(
    pool_count,
    pool_cells,
    ptongm,
    tight_max,
    wide_min,
  );
  const ptongmText = ptongm === null ? "-" : ptongm.toFixed(4);
  return `PTONGM ${ptongmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctononaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOctononaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptongm_max, wide_ptongm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtongmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_octononagintic_mean, tight_ptongm_max, wide_ptongm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtongmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_octononagintic_mean, tight_ptongm_max, wide_ptongm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-OCTONONAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-OCTONONAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptongm = (max - min) / octononagintic_mean where octononagintic_mean = ((sum x_i^98) / n)^(1/98). Reads the pool's total RANGE in units of its OCTONONAGINTIC (power-mean-of-order-98, M_98) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.448 PTSPNGM because raising to the NINETY-EIGHTH power lifts the anchor MORE than raising to the ninety-seventh does. Unique DISPERSION-axis contribution extends the (harmonic..septennonagintic) power-mean NOVEMVIGINTISEPTUAGINTUPLET into a TRIGINTASEPTUAGINTUPLET with the M_98 octononagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptongm approaches n^(1/98) so 10-partner pools cap near 1.0238, 20-partner near 1.0310, 30-partner near 1.0353, 40-partner near 1.0384, 50-partner near 1.0407, 60-partner near 1.0427, 70-partner near 1.0443, 80-partner near 1.0457, 85-partner near 1.0464, 89-partner near 1.0469 and 90-partner near 1.0470 (all below the wide floor); pools with pool_count &gt;= 100 (100^(1/98) ~= 1.0481) are required to escape into wide with a modest outlier. Composite regime labels: PTONGM tight + PTSPNGM tight = MILD OUTLIER STAYS collapsed into the ramp's bucket ([1x9, 10] reads PTONGM 0.9214 tight -- rejoining the uniform ramp's 0.9214 for the seventeenth tick in the sequence after PTSPNGM's 0.9216 joint bucket at M_97); PTONGM spread + PTSPNGM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTONGM 1.0135 spread); PTONGM spread + PTSPNGM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_98 ([1x99, 100] reads 1.0376 spread after M_97's 1.0381 spread landing); PTONGM tight + PTSPNGM tight = ISOLATED HIGH PARTNER absorption ADVANCES at M_98 ([1, 100] drops to 0.9970 tight from M_97's 0.9971 landing -- fresh 4-decimal bucket after the M_96/M_97 collapse). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR octononagintic_mean == 0 (guarded but unreachable), tight = ptongm &lt; ${tight_ptongm_max}, spread = ptongm in [${tight_ptongm_max}, ${wide_ptongm_min}), wide = ptongm &ge; ${wide_ptongm_min}. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptongm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTONGM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTONGM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
