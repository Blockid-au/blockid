// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL QUARTILE
// COEFFICIENT OF DISPERSION pure-lib (P11.211).
//
// BOUNDED robust-stats INTERIOR-MASS dispersion scalar over the P11.161
// pool. Normalises the pool's middle-50% multiplicative spread into a
// dimensionless value on [0, 1):
//
//   qcd = (Q3 - Q1) / (Q3 + Q1)
//     where Q1 = 25th percentile (Tukey exclusive hinge)
//           Q3 = 75th percentile (Tukey exclusive hinge)
//
// Closes the (unbounded, bounded) x (endpoint, interior, whole-pool)
// normalisation grid on the multiplicative dispersion axis opened by
// P11.209 IQR RATIO:
//   • P11.181 range        = max - min                   (ADDITIVE
//                                                          endpoint-only,
//                                                          unbounded)
//   • P11.185 top1/bot1    = max / min                   (MULTIPLICATIVE
//                                                          endpoint-only,
//                                                          unbounded)
//   • P11.199 MAD          = mean(|xi - mean(x)|)        (ADDITIVE
//                                                          whole-pool,
//                                                          unbounded)
//   • P11.201 MADm         = mean(|xi - median(x)|)      (ADDITIVE
//                                                          whole-pool,
//                                                          unbounded)
//   • P11.207 IQR          = Q3 - Q1                     (ADDITIVE
//                                                          INTERIOR-MASS,
//                                                          unbounded)
//   • P11.209 IQR RATIO    = Q3 / Q1                     (MULTIPLICATIVE
//                                                          INTERIOR-MASS,
//                                                          unbounded)
//   • P11.211 QCD          = (Q3 - Q1) / (Q3 + Q1)       (BOUNDED
//                                                          INTERIOR-MASS,
//                                                          this module)
//
// QCD is the classroom "coefficient of quartile deviation" (Yule 1911;
// Kendall & Stuart Vol.1 §2.24 in modern print). Reads on [0, 1): a
// pool with Q1 == Q3 yields 0 (flat interior); a pool where Q3
// dominates Q1 approaches (but never reaches) 1. Because the value is
// bounded, it is directly comparable across resellers with different
// absolute cell-count baselines — a digest reader can scan the QCD
// column and see "how much interior spread relative to the pool's own
// interior midpoint" without needing to hold the pool's absolute
// magnitude in mind. In contrast, the P11.209 IQR RATIO surface reports
// the raw multiplicative ratio (unbounded in [1, ∞)) — the two are
// order-preserving (higher IQR RATIO ↔ higher QCD) but the reader
// picks whichever suits the row: raw ratio for magnitude comparison
// against P11.185 top1/bot1 ratio; bounded QCD for normalised
// scan-across-partners readability.
//
// Uses TUKEY EXCLUSIVE hinges (Method 1 in every intro-stats text):
// same convention as P11.207 IQR + P11.209 IQR RATIO so all three
// hinge-consuming surfaces read the same Q1/Q3 pair and differ only in
// fold operator:
//   • P11.207 IQR       = Q3 - Q1                         (raw additive)
//   • P11.209 IQR RATIO = Q3 / Q1                         (raw multiplicative)
//   • P11.211 QCD       = (Q3 - Q1) / (Q3 + Q1)           (normalised
//                                                            multiplicative)
//
// Well-defined for every pool with pool_count >= 4 (the same natural
// threshold as P11.207 IQR + P11.209 IQR RATIO):
//   • pool_count 0            → qcd null, q1/q3 null (empty pool).
//   • pool_count 1..3         → qcd null, q1/q3 null. Distinct
//                               "small_pool" label so the reader knows
//                               the value is structurally-undefined
//                               rather than a computed level verdict —
//                               quartiles don't have a stable meaning
//                               below n=4 and would collapse to the
//                               P11.185 top1/bottom1 ratio surface
//                               (Tukey exclusive on n=2 gives Q1=x0,
//                               Q3=x1 which is (max-min)/(max+min) in
//                               raw cells, and n=3 gives Q1=x0, Q3=x2
//                               which is the same — redundant surface).
//   • pool_count >= 4         → qcd = (Q3 - Q1) / (Q3 + Q1);
//                               rounded to 4 decimals. Denominator is
//                               guaranteed >= 2 because both Q1 and Q3
//                               are medians of a half of a sorted
//                               cell-count pool where every value is
//                               >= 1 (hot-cells envelope only counts
//                               participants that appear at least
//                               once) — so Q1 >= 1 AND Q3 >= 1 for
//                               pool_count >= 4, giving Q3 + Q1 >= 2
//                               and division-by-zero cannot fire.
//
// Cutoffs use plain-language bounded-dispersion bands. Anchors at 0.2 /
// 0.5 chosen to keep the vocabulary consistent with the "level /
// unequal / stark" MULTIPLICATIVE dispersion labelling used by P11.185
// top1/bottom1 ratio + P11.209 IQR RATIO — a reader who has
// internalised the "level < 2x", "stark >= 5x" mental anchors from
// P11.209 IQR RATIO can map them into QCD via the closed-form conversion
// qcd = (r - 1) / (r + 1) where r = IQR RATIO:
//   • qcd 0.2  ↔ IQR RATIO 1.5x  (interior 50% modestly unequal)
//   • qcd 0.5  ↔ IQR RATIO 3.0x  (interior 50% clearly unequal —
//                                    corresponds roughly to the halfway
//                                    point between P11.209's level_max
//                                    2x and stark_min 5x)
// Bands:
//   • level    (qcd <  0.2) — interior 50% is roughly flat; Q3 within
//                              50% of Q1 additively-plus-multiplicatively.
//   • unequal  (qcd >= 0.2) — Q3 is 1.5-3x Q1 (via the closed form);
//                              noticeable normalised interior spread.
//   • stark    (qcd >= 0.5) — Q3 is 3x or more Q1; extreme normalised
//                              interior multiplicative dispersion.
// Both cutoffs are exposed on the envelope as level_qcd_max /
// stark_qcd_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the same INEQUALITY framing as P11.209
// IQR RATIO (HIGH qcd = MORE interior dispersion). QCD is picked over
// alternatives such as the semi-interquartile range (Q3-Q1)/2 (an
// unbounded ADDITIVE INTERIOR read — collapses onto the P11.207 IQR
// axis after a linear rescale so adds no fresh signal) and the Bowley
// skewness ((Q1+Q3-2*Q2)/(Q3-Q1)) (a normalised SKEWNESS scalar which
// already has a whole-pool cousin at P11.203) because it lands on a
// fresh axis of the (unbounded, bounded) x (endpoint, interior,
// whole-pool) grid and closes the last unfilled cell on the
// INTERIOR-MASS row.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity
// with every pool-shape sibling; band cutoffs re-exported from
// P11.145 so band edges cannot drift. No TOP_K / BOTTOM_K parameters
// — QCD is a pool-wide fold that consumes every cell to compute the
// two hinges.
//
// Splice placement rule for a follow-up cron-wiring tick (P11.212):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolIqrRatioSection
// (P11.209) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177)
// → TOP-1 SHARE (P11.165) → TOP-2 COMBINED SHARE (P11.167) →
// BOTTOM-1 SHARE (P11.179) → RANGE (P11.181) → BOTTOM-2 COMBINED
// SHARE (P11.183) → TOP1/BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2
// RATIO (P11.187) → MID-MASS SHARE (P11.189) → TOP1/BOTTOM2 RATIO
// (P11.191) → TOP2/BOTTOM1 RATIO (P11.193) → MEDIAN/MEAN RATIO
// (P11.195) → MEAN-MEDIAN ABSOLUTE GAP (P11.197) → MEAN ABSOLUTE
// DEVIATION (P11.199) → MEDIAN ABSOLUTE DEVIATION (P11.201) →
// SKEWNESS (P11.203) → EXCESS KURTOSIS (P11.205) → IQR (P11.207)
// → IQR RATIO (P11.209) → QCD (this module) → per-pair hot-cells
// GRANULAR (P11.139). QCD sits IMMEDIATELY BELOW the IQR RATIO
// sibling because the three surfaces (P11.207 IQR, P11.209 IQR RATIO,
// P11.211 QCD) share the same Q1/Q3 hinge pair and only differ in
// fold operator (subtraction vs division vs normalised division) —
// grouping the three adjacent lets the reader spot the raw-vs-
// normalised interior dispersion contrast in one glance.

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
type QcdLabel =
  | "empty"
  | "small_pool"
  | "level"
  | "unequal"
  | "stark";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language bounded-dispersion bands. Anchors at 0.2 / 0.5 chosen
// to map cleanly onto the P11.209 IQR RATIO 2x / 5x anchors via the
// closed-form qcd = (r-1)/(r+1) — qcd 0.2 ↔ r 1.5x (below P11.209's
// level_max 2x boundary but still noticeable), qcd 0.5 ↔ r 3.0x (mid
// between P11.209's level_max 2x and stark_min 5x boundaries).
const LEVEL_QCD_MAX = 0.2;
const STARK_QCD_MIN = 0.5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as every other pool-shape sibling.
const QCD_DECIMALS = 4;

// Threshold below which Tukey exclusive hinges collapse to endpoints
// which duplicates the P11.185 top1/bottom1 ratio surface. Bumped to
// 4 so the QCD surface is a distinct interior-mass read rather than
// an endpoint-ratio clone.
const MIN_POOL_COUNT_FOR_QCD = 4;

export interface PerTransitionMagnitudeTop3PoolQcdBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_q1_cells: number | null;
  readonly partner_q3_cells: number | null;
  readonly partner_qcd: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_q1_cells: number | null;
  readonly metric_q3_cells: number | null;
  readonly metric_qcd: number | null;
}

export interface PerTransitionMagnitudeTop3PoolQcdBands {
  readonly small: PerTransitionMagnitudeTop3PoolQcdBand;
  readonly medium: PerTransitionMagnitudeTop3PoolQcdBand;
  readonly large: PerTransitionMagnitudeTop3PoolQcdBand;
}

export interface PerTransitionMagnitudeTop3PoolQcdEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolQcdBands;
}

export interface PerTransitionMagnitudeTop3PoolQcdMap {
  readonly improved: PerTransitionMagnitudeTop3PoolQcdEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolQcdEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolQcdEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolQcdEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolQcd {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly min_pool_count_for_qcd: number;
  readonly level_qcd_max: number;
  readonly stark_qcd_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolQcdMap;
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

// Median of a sorted slice using arithmetic-midpoint for even n. Same
// convention as P11.195 median/mean ratio + P11.197 mean-median
// absolute gap + P11.201 MADm + P11.207 IQR + P11.209 IQR RATIO so the
// median definition is shared across every median-consuming sibling.
function medianOfSorted(sorted: number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Tukey EXCLUSIVE Q1/Q3 hinges: for odd n exclude the central value
// then take the median of each half; for even n split at the midpoint
// and take the median of each half. Standard "Method 1" from every
// intro-stats text (also matches R quantile type=1 default). Shared
// convention with P11.207 IQR + P11.209 IQR RATIO.
function tukeyHinges(sorted: number[]): { q1: number; q3: number } {
  const n = sorted.length;
  const half = Math.floor(n / 2);
  const lower = sorted.slice(0, half);
  const upper = n % 2 === 1 ? sorted.slice(half + 1) : sorted.slice(half);
  return {
    q1: medianOfSorted(lower),
    q3: medianOfSorted(upper),
  };
}

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  q1_cells: number | null;
  q3_cells: number | null;
  qcd: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count < MIN_POOL_COUNT_FOR_QCD || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      q1_cells: null,
      q3_cells: null,
      qcd: null,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const { q1, q3 } = tukeyHinges(sorted);
  // Q1 + Q3 is guaranteed >= 2 because hot-cells envelope only records
  // participants that appear at least once — both hinges are medians
  // of halves drawn from a >=1 pool so both are >=1, giving Q3+Q1>=2
  // and division-by-zero cannot fire.
  return {
    pool_count,
    pool_cells,
    q1_cells: roundTo(q1, QCD_DECIMALS),
    q3_cells: roundTo(q3, QCD_DECIMALS),
    qcd: roundTo((q3 - q1) / (q3 + q1), QCD_DECIMALS),
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolQcdBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_q1_cells: partner.q1_cells,
    partner_q3_cells: partner.q3_cells,
    partner_qcd: partner.qcd,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_q1_cells: metric.q1_cells,
    metric_q3_cells: metric.q3_cells,
    metric_qcd: metric.qcd,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolQcdEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolQcd(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolQcd {
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
    min_pool_count_for_qcd: MIN_POOL_COUNT_FOR_QCD,
    level_qcd_max: LEVEL_QCD_MAX,
    stark_qcd_min: STARK_QCD_MIN,
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

function labelForQcd(
  pool_count: number,
  qcd: number | null,
  min_pool_count_for_qcd: number,
  level_qcd_max: number,
  stark_qcd_min: number,
): QcdLabel {
  if (pool_count === 0) return "empty";
  if (pool_count < min_pool_count_for_qcd || qcd === null) return "small_pool";
  if (qcd >= stark_qcd_min) return "stark";
  if (qcd < level_qcd_max) return "level";
  return "unequal";
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

function renderQcdCell(
  pool_count: number,
  pool_cells: number,
  q1_cells: number | null,
  q3_cells: number | null,
  qcd: number | null,
  min_pool_count_for_qcd: number,
  level_qcd_max: number,
  stark_qcd_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForQcd(
    pool_count,
    qcd,
    min_pool_count_for_qcd,
    level_qcd_max,
    stark_qcd_min,
  );
  const qcdText = qcd === null ? "-" : qcd.toFixed(3);
  const q1Text = q1_cells === null ? "-" : q1_cells.toFixed(2);
  const q3Text = q3_cells === null ? "-" : q3_cells.toFixed(2);
  return `qcd ${qcdText} (Q1 ${q1Text}, Q3 ${q3Text}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolQcdSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolQcd,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const {
    min_pool_count_for_qcd,
    level_qcd_max,
    stark_qcd_min,
  } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderQcdCell(band.partner_pool_count, band.partner_pool_cells, band.partner_q1_cells, band.partner_q3_cells, band.partner_qcd, min_pool_count_for_qcd, level_qcd_max, stark_qcd_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderQcdCell(band.metric_pool_count, band.metric_pool_cells, band.metric_q1_cells, band.metric_q3_cells, band.metric_qcd, min_pool_count_for_qcd, level_qcd_max, stark_qcd_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool QUARTILE COEFFICIENT OF DISPERSION across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">BOUNDED robust-stats INTERIOR-MASS dispersion scalar over the P11.161 pool &mdash; Tukey exclusive hinges name the normalised multiplicative spread of the pool's middle 50% into ONE dimensionless scalar on [0, 1): qcd = (Q3 - Q1) / (Q3 + Q1). Bounded normalised complement to P11.209 IQR RATIO (unbounded Q3/Q1) and P11.207 IQR (unbounded Q3-Q1); closes the (unbounded, bounded) &times; (endpoint, interior, whole-pool) normalisation grid. Values in [0, 1) &mdash; Q3 &ge; Q1 by construction. Labels: small_pool = pool_count &lt; ${min_pool_count_for_qcd} (Tukey exclusive hinges collapse to endpoints below n=4 which duplicates the P11.185 top1/bottom1 ratio surface; qcd null structurally), level = qcd &lt; ${level_qcd_max} (interior 50% roughly flat &mdash; corresponds to IQR RATIO &lt; 1.5x), unequal = qcd in [${level_qcd_max}, ${stark_qcd_min}) (noticeable normalised interior spread &mdash; IQR RATIO 1.5-3x), stark = qcd &ge; ${stark_qcd_min} (extreme normalised interior multiplicative dispersion &mdash; IQR RATIO 3x or more). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + qcd null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner qcd</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI qcd</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
