// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SESQUINQUAGINTIC-MEAN
// pure-lib (P11.366).
//
// WHOLE-POOL RANGE-AGAINST-SESQUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SESQUINQUAGINTIC MEAN (a.k.a. power mean of order 56, M_56):
//
//   ptseqqm = (max - min) / sesquinquagintic_mean
//
// where sesquinquagintic_mean = ((sum x_i^56) / n)^(1/56). Reads
// the peak spread against the SESQUINQUAGINTIC (power-mean-of-
// order-56) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here
// than under P11.364 PTQIQQM, because raising to the FIFTY-SIXTH power
// before averaging lifts the anchor MORE than raising to the fifty-
// fifth does, dampening the ratio against the range even harder.
//
// PTSEQQM's unique DISPERSION-axis contribution: reads range in units
// of the SESQUINQUAGINTIC (POWER-MEAN-OF-ORDER-56) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quattuorquinquagintic M_54, quinquequinquagintic M_55)
// power-mean SEPTEMQUINQUAGINTUPLET into an OCTOQUINQUAGINTUPLET with
// the M_56 sesquinquagintic mean. By Power Mean inequality
// M_56 >= M_55, so sesquinquagintic_mean >= quinquequinquagintic_mean
// and ptseqqm <= ptqiqqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// sesquinquagintic_mean approaches x_max / n^(1/56), so ptseqqm
// approaches n^(1/56) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/56) ~= 1.0420, for n=20 ~= 1.0550, for n=30 ~= 1.0626, for
// n=40 ~= 1.0681, for n=50 ~= 1.0724, for n=60 ~= 1.0759, for n=70
// ~= 1.0788, for n=80 ~= 1.0814, for n=85 ~= 1.0826, for n=89 ~= 1.0835
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/56) ~= 1.0851) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/56) ~= 1.0857, and the
// pool100 [1x99, 100] reference reads 1.0749 spread (further absorbed
// from PTQIQQM's 1.0765 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_56.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> sesquinquagintic_mean = k,
//                                     range 0, ptseqqm 0 (tight).
//   * uniform ramp [1..10]          -> SEQQM ~= 9.5976, range 9, ptseqqm
//                                     ~= 0.9377 (tight).
//   * upper-outlier [1x9, 10]       -> SEQQM ~= 9.5972, range 9, ptseqqm
//                                     ~= 0.9378 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.364
//                                     PTQIQQM's 0.9385 tight landing).
//   * two-shoulders [1x8, 5x2]      -> SEQQM ~= 4.8583, range 4, ptseqqm
//                                     ~= 0.8233 (tight).
//   * 50/50 split [1x5, 10x5]       -> SEQQM ~= 9.8770, range 9, ptseqqm
//                                     ~= 0.9112 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> SEQQM ~= 95.9716, range 99,
//                                     ptseqqm ~= 1.0316 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/56) ~ 1.0420
//                                     asymptote).
//   * two-partner [1, 9]            -> SEQQM ~= 8.8893, range 8, ptseqqm
//                                     ~= 0.9000 (tight).
//   * two-partner [1, 100]          -> SEQQM ~= 98.7699, range 99, ptseqqm
//                                     ~= 1.0023 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_56; PTQIQQM's M_55
//                                     landing at 1.0026 already sat below
//                                     tight and PTSEQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> SEQQM ~= 9.8057, range 9, ptseqqm
//                                     ~= 0.9178 (tight).
//   * pool_count=100 [1x99, 100]    -> SEQQM ~= 92.1055, range 99, ptseqqm
//                                     ~= 1.0749 (SPREAD -- FURTHER
//                                     ABSORBED from PTQIQQM M_55's 1.0765
//                                     spread; 100-partner asymptote
//                                     100^(1/56) ~ 1.0857 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptseqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR sesquinquagintic_mean == 0
//   * tight                ptseqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptseqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0420,
//                          20-partner ~ 1.0550, 30-partner ~ 1.0626,
//                          40-partner ~ 1.0681, 50-partner ~ 1.0724,
//                          60-partner ~ 1.0759, 70-partner ~ 1.0788,
//                          80-partner ~ 1.0814, 85-partner ~ 1.0826,
//                          89-partner ~ 1.0835 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0749 also caps
//                          within spread)
//   * wide                 ptseqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptseqqm_max /
// wide_ptseqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.367):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToQuinquequinquaginticMeanSection
// (P11.365) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-sesquinquagintic-center
// after the P11.365 range-against-quinquequinquagintic-center landing.

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
type PtseqqmLabel =
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

// Bands on raw ptseqqm (fixed cutoffs since sesquinquagintic_mean
// scales with cell counts and typical sesquinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_56 is 0.9378
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0428 (M_55) to
// 1.0420 (M_56), 20-partner drops from 1.0560 to 1.0550, 30-partner
// drops from 1.0638 to 1.0626, 40-partner drops from 1.0694 to 1.0681,
// 50-partner drops from 1.0737 to 1.0724, 60-partner drops from 1.0773
// to 1.0759, 70-partner drops from 1.0803 to 1.0788, 80-partner drops
// from 1.0829 to 1.0814, 85-partner drops from 1.0841 to 1.0826,
// 89-partner lands at 1.0835 -- so pool_count >= 97 (97^(1/56) ~
// 1.0851) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTQIQQM 1.0765
// spread to PTSEQQM 1.0749 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTSEQQM_MAX = 1.005;
const WIDE_PTSEQQM_MIN = 1.09;

// PTSEQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSEQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_sesquinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_sesquinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptseqqm_max: number;
  readonly wide_ptseqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanMap;
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

// Peak-to-sesquinquagintic-mean of a discrete distribution:
//   PTSEQQM = (max - min) / sesquinquagintic_mean
// where sesquinquagintic_mean = ((sum x_i^56) / n)^(1/56). Returns
// null on empty, solo, and degenerate (zero sesquinquagintic_mean
// or non-finite fifty-sixth-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_sesquinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftySixthSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^56 = (x^8)^7 -> oct*oct*oct*oct*oct*oct*oct
    fiftySixthSum += oct * oct * oct * oct * oct * oct * oct;
  }
  if (!Number.isFinite(fiftySixthSum) || fiftySixthSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintic_mean: null,
    };
  }
  const sesquinquagintic_mean = Math.pow(
    fiftySixthSum / pool_count,
    1 / 56,
  );
  if (
    !Number.isFinite(sesquinquagintic_mean) ||
    sesquinquagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_sesquinquagintic_mean: null,
    };
  }
  const range = max - min;
  const ptseqqm = range / sesquinquagintic_mean;
  const clamped = ptseqqm < 0 ? 0 : ptseqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_sesquinquagintic_mean: roundTo(clamped, PTSEQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_sesquinquagintic_mean:
      partner.peak_to_sesquinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_sesquinquagintic_mean:
      metric.peak_to_sesquinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMean {
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
    tight_ptseqqm_max: TIGHT_PTSEQQM_MAX,
    wide_ptseqqm_min: WIDE_PTSEQQM_MIN,
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

function labelForPtseqqm(
  pool_count: number,
  pool_cells: number,
  ptseqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtseqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptseqqm === null) return "degenerate";
  if (ptseqqm >= wide_min) return "wide";
  if (ptseqqm < tight_max) return "tight";
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

function renderPtseqqmCell(
  pool_count: number,
  pool_cells: number,
  ptseqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtseqqm(
    pool_count,
    pool_cells,
    ptseqqm,
    tight_max,
    wide_min,
  );
  const ptseqqmText = ptseqqm === null ? "-" : ptseqqm.toFixed(4);
  return `PTSEQQM ${ptseqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSesquinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptseqqm_max, wide_ptseqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtseqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_sesquinquagintic_mean, tight_ptseqqm_max, wide_ptseqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtseqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_sesquinquagintic_mean, tight_ptseqqm_max, wide_ptseqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SESQUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SESQUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptseqqm = (max - min) / sesquinquagintic_mean where sesquinquagintic_mean = ((sum x_i^56) / n)^(1/56). Reads the pool's total RANGE in units of its SESQUINQUAGINTIC (power-mean-of-order-56, M_56) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.364 PTQIQQM because raising to the FIFTY-SIXTH power lifts the anchor MORE than raising to the fifty-fifth does. Unique DISPERSION-axis contribution extends the (harmonic..quinquequinquagintic) power-mean SEPTEMQUINQUAGINTUPLET into an OCTOQUINQUAGINTUPLET with the M_56 sesquinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptseqqm approaches n^(1/56) so 10-partner pools cap near 1.0420, 20-partner near 1.0550, 30-partner near 1.0626, 40-partner near 1.0681, 50-partner near 1.0724, 60-partner near 1.0759, 70-partner near 1.0788, 80-partner near 1.0814, 85-partner near 1.0826 and 89-partner near 1.0835 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/56) ~= 1.0851) are required to escape into wide with a modest outlier. Composite regime labels: PTSEQQM tight + PTQIQQM tight = MILD OUTLIER absorbed by sesquinquagintic ([1x9, 10] reads PTSEQQM 0.9378 tight); PTSEQQM spread + PTQIQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSEQQM 1.0316 spread); PTSEQQM spread + PTQIQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_56 ([1x99, 100] reads 1.0749 spread after M_55's 1.0765 spread landing); PTSEQQM tight + PTQIQQM tight = ISOLATED HIGH PARTNER already absorbed at M_55 stays absorbed at M_56 ([1, 100] reads 1.0023 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR sesquinquagintic_mean == 0 (guarded but unreachable), tight = ptseqqm &lt; ${tight_ptseqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptseqqm in [${tight_ptseqqm_max}, ${wide_ptseqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptseqqm &ge; ${wide_ptseqqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptseqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSEQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSEQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
