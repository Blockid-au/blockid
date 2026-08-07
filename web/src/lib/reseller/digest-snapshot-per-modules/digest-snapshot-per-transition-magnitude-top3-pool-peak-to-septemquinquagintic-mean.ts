// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL PEAK-TO-SEPTEMQUINQUAGINTIC-MEAN
// pure-lib (P11.368).
//
// WHOLE-POOL RANGE-AGAINST-SEPTEMQUINQUAGINTIC-CENTER dispersion scalar
// over the P11.161 pool. Folds every cell into ONE dispersion read
// that reports the pool's total RANGE (max - min) in units of the
// pool's SEPTEMQUINQUAGINTIC MEAN (a.k.a. power mean of order 57, M_57):
//
//   ptspqqm = (max - min) / septemquinquagintic_mean
//
// where septemquinquagintic_mean = ((sum x_i^57) / n)^(1/57). Reads
// the peak spread against the SEPTEMQUINQUAGINTIC (power-mean-of-
// order-57) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here
// than under P11.366 PTSEQQM, because raising to the FIFTY-SEVENTH power
// before averaging lifts the anchor MORE than raising to the fifty-
// sixth does, dampening the ratio against the range even harder.
//
// PTSPQQM's unique DISPERSION-axis contribution: reads range in units
// of the SEPTEMQUINQUAGINTIC (POWER-MEAN-OF-ORDER-57) CENTER. Extends
// the (harmonic M_-1, geometric M_0, arithmetic M_1, quadratic M_2,
// cubic M_3 ... quinquequinquagintic M_55, sesquinquagintic M_56)
// power-mean OCTOQUINQUAGINTUPLET into a NOVEMQUINQUAGINTUPLET with
// the M_57 septemquinquagintic mean. By Power Mean inequality
// M_57 >= M_56, so septemquinquagintic_mean >= sesquinquagintic_mean
// and ptspqqm <= ptseqqm for every non-flat pool.
//
// Asymptotic ceiling: for a pool of size n with a single dominant
// outlier x_max and every other cell at x_min << x_max,
// septemquinquagintic_mean approaches x_max / n^(1/57), so ptspqqm
// approaches n^(1/57) as x_max -> +Inf. For n=10 the ceiling is
// 10^(1/57) ~= 1.0412, for n=20 ~= 1.0540, for n=30 ~= 1.0615, for
// n=40 ~= 1.0669, for n=50 ~= 1.0710, for n=60 ~= 1.0745, for n=70
// ~= 1.0774, for n=80 ~= 1.0799, for n=85 ~= 1.0811, for n=89 ~= 1.0819
// -- all still just under wide -- so pools with pool_count >= 97
// (97^(1/57) ~= 1.0836) are required to escape into wide with a modest
// outlier. For n=100 the ceiling is 100^(1/57) ~= 1.0841, and the
// pool100 [1x99, 100] reference reads 1.0733 spread (further absorbed
// from PTSEQQM's 1.0749 spread landing) because the asymptote gap at
// n=100 has narrowed and the [1x99, 100] pool sits deeper inside the
// spread band at M_57.
//
// Reference distributions (pool_count 10 unless noted):
//   * flat [k,k,...,k]              -> septemquinquagintic_mean = k,
//                                     range 0, ptspqqm 0 (tight).
//   * uniform ramp [1..10]          -> SPQQM ~= 9.6045, range 9, ptspqqm
//                                     ~= 0.9371 (tight).
//   * upper-outlier [1x9, 10]       -> SPQQM ~= 9.6041, range 9, ptspqqm
//                                     ~= 0.9371 (tight -- MILD OUTLIER
//                                     absorbed EVEN HARDER than P11.366
//                                     PTSEQQM's 0.9378 tight landing).
//   * two-shoulders [1x8, 5x2]      -> SPQQM ~= 4.8608, range 4, ptspqqm
//                                     ~= 0.8229 (tight).
//   * 50/50 split [1x5, 10x5]       -> SPQQM ~= 9.8791, range 9, ptspqqm
//                                     ~= 0.9110 (tight -- BIMODAL SPLIT
//                                     well-absorbed).
//   * extreme outlier [1x9, 100]    -> SPQQM ~= 96.0409, range 99,
//                                     ptspqqm ~= 1.0308 (SPREAD -- EXTREME
//                                     OUTLIER approaches n^(1/57) ~ 1.0412
//                                     asymptote).
//   * two-partner [1, 9]            -> SPQQM ~= 8.8912, range 8, ptspqqm
//                                     ~= 0.8998 (tight).
//   * two-partner [1, 100]          -> SPQQM ~= 98.7913, range 99, ptspqqm
//                                     ~= 1.0021 (TIGHT -- ISOLATED HIGH
//                                     PARTNER stays below the 1.005 tight
//                                     boundary at M_57; PTSEQQM's M_56
//                                     landing at 1.0023 already sat below
//                                     tight and PTSPQQM continues that
//                                     absorption trend).
//   * small [10, 1, 1]              -> SPQQM ~= 9.8091, range 9, ptspqqm
//                                     ~= 0.9175 (tight).
//   * pool_count=100 [1x99, 100]    -> SPQQM ~= 92.2385, range 99, ptspqqm
//                                     ~= 1.0733 (SPREAD -- FURTHER
//                                     ABSORBED from PTSEQQM M_56's 1.0749
//                                     spread; 100-partner asymptote
//                                     100^(1/57) ~ 1.0841 sits within the
//                                     spread band so a modest outlier no
//                                     longer reaches wide at n=100).
//
// Bands on raw ptspqqm (fixed cutoffs, calibrated against the n=10
// reference distributions):
//   * empty                pool_count == 0
//   * solo                 pool_count == 1
//   * degenerate           pool_cells == 0 OR septemquinquagintic_mean == 0
//   * tight                ptspqqm < 1.005 (flat, uniform ramp, upper-
//                          outlier, two-shoulders, bimodal-split,
//                          two-partner [1,9], two-partner [1,100],
//                          small regimes)
//   * spread               ptspqqm in [1.005, 1.09) (extreme-outlier
//                          regime; 10-partner asymptote ~ 1.0412,
//                          20-partner ~ 1.0540, 30-partner ~ 1.0615,
//                          40-partner ~ 1.0669, 50-partner ~ 1.0710,
//                          60-partner ~ 1.0745, 70-partner ~ 1.0774,
//                          80-partner ~ 1.0799, 85-partner ~ 1.0811,
//                          89-partner ~ 1.0819 all cap within spread;
//                          pool_count=100 [1x99,100] ~ 1.0733 also caps
//                          within spread)
//   * wide                 ptspqqm >= 1.09 (RUNAWAY-OUTLIER regime with
//                          pool_count >= 97)
//
// Both cutoffs are exposed on the envelope as tight_ptspqqm_max /
// wide_ptspqqm_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.369):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolPeakToSesquinquaginticMeanSection
// (P11.367) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// DISPERSION axis continues with range-against-septemquinquagintic-center
// after the P11.367 range-against-sesquinquagintic-center landing.

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
type PtspqqmLabel =
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

// Bands on raw ptspqqm (fixed cutoffs since septemquinquagintic_mean
// scales with cell counts and typical septemquinquagintic-center
// emissions land near 1-10 for the P11.161 top-3 pool). Tight boundary
// holds at P11.344 PTQIQM's 1.005 -- MILD-OUTLIER at M_57 is 0.9371
// (already well below the 1.005 buffer). Wide boundary HOLDS at P11.344
// PTQIQM's 1.09 -- 10-partner asymptote drops from 1.0420 (M_56) to
// 1.0412 (M_57), 20-partner drops from 1.0550 to 1.0540, 30-partner
// drops from 1.0626 to 1.0615, 40-partner drops from 1.0681 to 1.0669,
// 50-partner drops from 1.0724 to 1.0710, 60-partner drops from 1.0759
// to 1.0745, 70-partner drops from 1.0788 to 1.0774, 80-partner drops
// from 1.0814 to 1.0799, 85-partner drops from 1.0826 to 1.0811,
// 89-partner lands at 1.0819 -- so pool_count >= 97 (97^(1/57) ~
// 1.0836) is now required to reach wide with a modest outlier. In
// particular pool_count=100 [1x99, 100] drops from PTSEQQM 1.0749
// spread to PTSPQQM 1.0733 spread -- FURTHER ABSORBED but stays within
// spread; the DISPERSION power-mean progression continues to compress
// the [1x99, 100] shape.
const TIGHT_PTSPQQM_MAX = 1.005;
const WIDE_PTSPQQM_MIN = 1.09;

// PTSPQQM rounded to 4 decimals so weekly digests are stable under
// float-noise re-runs. Same precision as every other pool-shape sibling.
const PTSPQQM_DECIMALS = 4;

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_peak_to_septemquinquagintic_mean: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_peak_to_septemquinquagintic_mean: number | null;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanBands {
  readonly small: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanBand;
  readonly medium: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanBand;
  readonly large: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanBand;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanBands;
}

export interface PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanMap {
  readonly improved: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMean {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly tight_ptspqqm_max: number;
  readonly wide_ptspqqm_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanMap;
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

// Peak-to-septemquinquagintic-mean of a discrete distribution:
//   PTSPQQM = (max - min) / septemquinquagintic_mean
// where septemquinquagintic_mean = ((sum x_i^57) / n)^(1/57). Returns
// null on empty, solo, and degenerate (zero septemquinquagintic_mean
// or non-finite fifty-seventh-power sum) so downstream labels fire
// from distinct guard branches rather than from a NaN or Infinity.
function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  peak_to_septemquinquagintic_mean: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septemquinquagintic_mean: null,
    };
  }
  if (pool_count === 1) {
    return {
      pool_count,
      pool_cells,
      peak_to_septemquinquagintic_mean: null,
    };
  }
  if (pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septemquinquagintic_mean: null,
    };
  }
  const sortedAsc = [...values].sort((a, b) => a - b);
  const min = sortedAsc[0];
  const max = sortedAsc[sortedAsc.length - 1];
  let fiftySeventhSum = 0;
  for (const v of values) {
    const sq = v * v;
    const quad = sq * sq;
    const oct = quad * quad;
    // x^57 = x^56 * x = (x^8)^7 * x -> oct*oct*oct*oct*oct*oct*oct*v
    fiftySeventhSum += oct * oct * oct * oct * oct * oct * oct * v;
  }
  if (!Number.isFinite(fiftySeventhSum) || fiftySeventhSum <= 0) {
    return {
      pool_count,
      pool_cells,
      peak_to_septemquinquagintic_mean: null,
    };
  }
  const septemquinquagintic_mean = Math.pow(
    fiftySeventhSum / pool_count,
    1 / 57,
  );
  if (
    !Number.isFinite(septemquinquagintic_mean) ||
    septemquinquagintic_mean <= 0
  ) {
    return {
      pool_count,
      pool_cells,
      peak_to_septemquinquagintic_mean: null,
    };
  }
  const range = max - min;
  const ptspqqm = range / septemquinquagintic_mean;
  const clamped = ptspqqm < 0 ? 0 : ptspqqm;
  return {
    pool_count,
    pool_cells,
    peak_to_septemquinquagintic_mean: roundTo(clamped, PTSPQQM_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_peak_to_septemquinquagintic_mean:
      partner.peak_to_septemquinquagintic_mean,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_peak_to_septemquinquagintic_mean:
      metric.peak_to_septemquinquagintic_mean,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMean(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMean {
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
    tight_ptspqqm_max: TIGHT_PTSPQQM_MAX,
    wide_ptspqqm_min: WIDE_PTSPQQM_MIN,
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

function labelForPtspqqm(
  pool_count: number,
  pool_cells: number,
  ptspqqm: number | null,
  tight_max: number,
  wide_min: number,
): PtspqqmLabel {
  if (pool_count === 0) return "empty";
  if (pool_count === 1) return "solo";
  if (pool_cells === 0) return "degenerate";
  if (ptspqqm === null) return "degenerate";
  if (ptspqqm >= wide_min) return "wide";
  if (ptspqqm < tight_max) return "tight";
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

function renderPtspqqmCell(
  pool_count: number,
  pool_cells: number,
  ptspqqm: number | null,
  tight_max: number,
  wide_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForPtspqqm(
    pool_count,
    pool_cells,
    ptspqqm,
    tight_max,
    wide_min,
  );
  const ptspqqmText = ptspqqm === null ? "-" : ptspqqm.toFixed(4);
  return `PTSPQQM ${ptspqqmText} / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMeanSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptemquinquaginticMean,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { tight_ptspqqm_max, wide_ptspqqm_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqqmCell(band.partner_pool_count, band.partner_pool_cells, band.partner_peak_to_septemquinquagintic_mean, tight_ptspqqm_max, wide_ptspqqm_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderPtspqqmCell(band.metric_pool_count, band.metric_pool_cells, band.metric_peak_to_septemquinquagintic_mean, tight_ptspqqm_max, wide_ptspqqm_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool PEAK-TO-SEPTEMQUINQUAGINTIC-MEAN across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">WHOLE-POOL RANGE-AGAINST-SEPTEMQUINQUAGINTIC-CENTER scalar over the P11.161 pool &mdash; ptspqqm = (max - min) / septemquinquagintic_mean where septemquinquagintic_mean = ((sum x_i^57) / n)^(1/57). Reads the pool's total RANGE in units of its SEPTEMQUINQUAGINTIC (power-mean-of-order-57, M_57) centre so a LARGE-VALUE-DOMINATED pool reads TIGHTER here than under P11.366 PTSEQQM because raising to the FIFTY-SEVENTH power lifts the anchor MORE than raising to the fifty-sixth does. Unique DISPERSION-axis contribution extends the (harmonic..sesquinquagintic) power-mean OCTOQUINQUAGINTUPLET into a NOVEMQUINQUAGINTUPLET with the M_57 septemquinquagintic mean. Asymptotic ceiling: for a pool of size n with a dominant outlier x_max &gt;&gt; x_min, ptspqqm approaches n^(1/57) so 10-partner pools cap near 1.0412, 20-partner near 1.0540, 30-partner near 1.0615, 40-partner near 1.0669, 50-partner near 1.0710, 60-partner near 1.0745, 70-partner near 1.0774, 80-partner near 1.0799, 85-partner near 1.0811 and 89-partner near 1.0819 (all below the wide floor); pools with pool_count &gt;= 97 (97^(1/57) ~= 1.0836) are required to escape into wide with a modest outlier. Composite regime labels: PTSPQQM tight + PTSEQQM tight = MILD OUTLIER absorbed by septemquinquagintic ([1x9, 10] reads PTSPQQM 0.9371 tight); PTSPQQM spread + PTSEQQM spread = EXTREME OUTLIER partially absorbed ([1x9, 100] reads PTSPQQM 1.0308 spread); PTSPQQM spread + PTSEQQM spread = 100-PARTNER RUNAWAY OUTLIER FURTHER ABSORBED at M_57 ([1x99, 100] reads 1.0733 spread after M_56's 1.0749 spread landing); PTSPQQM tight + PTSEQQM tight = ISOLATED HIGH PARTNER already absorbed at M_56 stays absorbed at M_57 ([1, 100] reads 1.0021 tight). Labels: solo = pool_count == 1 (structural single partner), degenerate = pool_cells == 0 OR septemquinquagintic_mean == 0 (guarded but unreachable), tight = ptspqqm &lt; ${tight_ptspqqm_max} (flat, uniform ramp, upper-outlier, two-shoulders, bimodal-split, two-partner [1,9], two-partner [1,100], small regimes), spread = ptspqqm in [${tight_ptspqqm_max}, ${wide_ptspqqm_min}) (extreme-outlier regime plus pool_count=100 [1x99,100] FURTHER ABSORBED), wide = ptspqqm &ge; ${wide_ptspqqm_min} (runaway-outlier regime with pool_count &gt;= 97). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.129 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ptspqqm null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner PTSPQQM</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI PTSPQQM</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
