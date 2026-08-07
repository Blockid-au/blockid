// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL TOP-1 / BOTTOM-2
// RATIO pure-lib (P11.191).
//
// Asymmetric MULTIPLICATIVE single-leader-to-floor-pair scalar over
// the P11.161 pool. Where the P11.185 TOP-1/BOTTOM-1 RATIO reads the
// SAME endpoint pair as single-slot cells and the P11.187 TOP-2/
// BOTTOM-2 RATIO reads the SAME endpoints as two-slot cells, this
// surface reads the ASYMMETRIC slice: the SINGLE LEADER divided by
// the FLOOR-PAIR combined:
//
//   ratio = top1_cells / bottom2_cells
//
// The asymmetric fold gives a genuinely different reading from the
// symmetric ratios because the denominator SUMS the two smallest
// slots, so a flat pool like [1,1,1] reads ratio 0.5 (leader is HALF
// the floor-pair combined) rather than 1 (leader equals the floor).
// A ratio > 1 means the leader dominates the floor-pair combined; a
// ratio < 1 means the floor-pair OUTWEIGHS the lone leader:
//
//   • pool [3, 1, 1]   — top1 3, bottom2 1+1=2, ratio 3/2=1.5
//                        (unequal edge — leader = 1.5x floor-pair).
//   • pool [6, 1, 1]   — top1 6, bottom2 1+1=2, ratio 6/2=3.0
//                        (unequal — leader = 3x floor-pair).
//   • pool [10, 1, 1]  — top1 10, bottom2 1+1=2, ratio 10/2=5.0
//                        (stark — leader = 5x floor-pair).
//   • pool [4, 3, 2]   — top1 4, bottom2 2+3=5, ratio 4/5=0.8
//                        (level — leader smaller than floor-pair
//                        combined; a genuinely flat pool where the
//                        symmetric TOP-1/BOTTOM-1 surface reads 4/2=2
//                        UNEQUAL).
//   • pool [1, 1, 1]   — top1 1, bottom2 1+1=2, ratio 0.5
//                        (level — leader is HALF the floor-pair by
//                        construction on a flat 3-partner pool).
//
// The disagreement with P11.185 on pools like [4,3,2] is load-bearing
// — that pool has a strong single leader (top1_share 4/9=0.44) but
// its floor-pair combined (2+3=5) exceeds the leader, so the leader
// does not truly dominate the floor. A downstream reader who wants
// "does the single leader dominate the floor-pair combined?" prefers
// this asymmetric surface over P11.185's symmetric single-slot lens.
//
// The pool-shape surfaces now cover the pool from every angle:
//   P11.161 pool count           — how MANY partners populate the pool?
//   P11.163 HHI                  — whole-pool concentration (fold all)
//   P11.169 Gini                 — whole-pool inequality (fold all)
//   P11.171 Theil                — whole-pool entropy inequality
//   P11.173 Atkinson             — whole-pool welfare inequality
//   P11.175 CV                   — whole-pool coefficient of variation
//   P11.177 H_norm               — whole-pool normalised entropy
//   P11.165 top-1 share          — leader's slice of the pool
//   P11.167 top-2 share          — dominant pair's slice of the pool
//   P11.179 bottom-1 share       — floor's slice of the pool
//   P11.183 bottom-2 share       — dominant floor pair's slice
//   P11.181 range                — head-to-floor ADDITIVE spread
//   P11.185 top1/bottom1 ratio   — head-to-floor single-slot RATIO
//   P11.187 top2/bottom2 ratio   — dominant-pair-to-floor-pair RATIO
//   P11.189 mid-mass share       — middle-mass EVENNESS complement
//   P11.191 top1/bottom2 ratio   — ASYMMETRIC head-to-floor-pair
//                                  RATIO (this module)
//
// Ratio well-defined for every non-empty pool because the P11.139 hot-
// cells envelope only counts (partner, KPI) participants that appear
// at least once — the two smallest slots each hold >= 1 cell so the
// denominator is >= 2 for pool_count >= 3.
//   • pool_count 0 → ratio null (empty pool).
//   • pool_count 1 → ratio 1 by definition (single slot IS both top-1
//                    and bottom-2 collapsed to top-1; solo label —
//                    the pool is too small for an asymmetric head-vs-
//                    floor-pair distinction).
//   • pool_count 2 → ratio 1 by definition (bottom-2 exhausts the
//                    pool between both slots, so top1/pool_cells is
//                    just the top-1 share, not an asymmetric ratio;
//                    solo label — the pool is still too small for a
//                    genuine head-vs-floor-pair reading).
//   • pool_count >= 3 → ratio = top1_cells / bottom2_cells with
//                       bottom2_cells = sum of the two smallest slot
//                       cell counts. Ratio range: [pool_cells /
//                       (pool_cells − 1) − 1, (pool_cells − 2)/2].
//                       A flat 3-partner pool [1,1,1] yields ratio
//                       1/2=0.5; a dominant [10,1,1] yields 10/2=5.
//
// Cutoffs use plain-language multiplicative bands. Anchored to
// asymmetric-friendly ratios (denominator sums two slots so magnitudes
// COMPRESS vs the P11.185 single-slot denominator by roughly 2x for
// pool [k,1,1] shapes): pool [3,1,1] ratio 1.5 (unequal edge); pool
// [6,1,1] ratio 3 (unequal); pool [8,1,1] ratio 4 (stark edge); pool
// [10,1,1] ratio 5 (stark). Level catches the compressed regime where
// the leader is at most 1.5x the floor-pair combined — including
// pools where the leader is SMALLER than the floor-pair.
//   • level    (ratio <  1.5) — leader within 1.5x of the floor-pair
//                                combined; flat or nearly flat.
//   • unequal  (ratio >= 1.5) — leader 1.5-4x the floor-pair combined;
//                                noticeable multiplicative dominance.
//   • stark    (ratio >= 4)   — leader 4x or more the floor-pair
//                                combined; floor-pair is a thin
//                                sliver of the leader.
// Both cutoffs are exposed on the envelope as level_ratio_max /
// stark_ratio_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the inequality-framing convention: a HIGH
// ratio value = HIGH multiplicative dominance (matches P11.163 HHI /
// P11.169 Gini / P11.171 Theil / P11.173 Atkinson / P11.175 CV /
// P11.181 range / P11.185 top1/bottom1 / P11.187 top2/bottom2 where
// the top band names the peakier / more unequal pool; inverts the
// P11.177 H_norm / P11.179 bottom-1 / P11.183 bottom-2 / P11.189 mid-
// mass evenness framing). Chosen because a ratio reader wants "big
// number = big multiplicative gap" for direct human read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. TOP_K=1 and BOTTOM_K=2 (asymmetric slice).
//
// Splice placement rule for a follow-up cron-wiring tick (P11.192):
// IMMEDIATELY BELOW perTransitionMagnitudeTop3PoolMidMassShareSection
// (P11.190) AND IMMEDIATELY ABOVE perPairHotCellsSection so the
// hierarchy descends per-transition MAGNITUDE TOP-3 POOL SIZE
// (P11.161) → HHI (P11.163) → GINI (P11.169) → THEIL (P11.171) →
// ATKINSON (P11.173) → CV (P11.175) → NORMALIZED ENTROPY (P11.177) →
// TOP-1 SHARE (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE
// (P11.179) → RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/
// BOTTOM1 RATIO (P11.185) → TOP2/BOTTOM2 RATIO (P11.187) → MID-MASS
// SHARE (P11.189) → TOP1/BOTTOM2 RATIO (this module) → per-pair hot-
// cells GRANULAR (P11.139). Whole-pool inequality SEXTET first, then
// leader slice, dominant-pair slice, floor slice, head-to-floor
// SPREAD, floor-pair slice, single-slot RATIO, two-slot RATIO,
// middle-mass complement, then ASYMMETRIC head-to-floor-pair RATIO —
// the pool is described from every-end-then-each-slice-then-spread-
// then-tail-slice-then-symmetric-ratios-then-middle-then-asymmetric-
// ratio before the per-pair granular table.

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
type RatioLabel = "empty" | "solo" | "level" | "unequal" | "stark";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

// Plain-language multiplicative bands for the ASYMMETRIC top-1 vs
// bottom-2 slice. Anchored to what small pools naturally emit under
// the asymmetric fold: pool [3,1,1] ratio 1.5 (unequal edge); pool
// [6,1,1] ratio 3 (unequal); pool [8,1,1] ratio 4 (stark edge); pool
// [10,1,1] ratio 5 (stark). Level catches the compressed regime where
// the leader is smaller than 1.5x the floor-pair combined (including
// flat pools where ratio dips below 1).
const LEVEL_RATIO_MAX = 1.5;
const STARK_RATIO_MIN = 4;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as the P11.185/P11.187 sibling ratio
// surfaces.
const RATIO_DECIMALS = 4;

// Top-1 vs Bottom-2 asymmetric slice: TOP_K=1 (single leader) and
// BOTTOM_K=2 (floor-pair combined). Independent of TOP_N (the
// leaderboard display cap).
const TOP_K = 1;
const BOTTOM_K = 2;

export interface PerTransitionMagnitudeTop3PoolTop1Bottom2RatioBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top1_cells: number;
  readonly partner_bottom2_cells: number;
  readonly partner_ratio: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top1_cells: number;
  readonly metric_bottom2_cells: number;
  readonly metric_ratio: number | null;
}

export interface PerTransitionMagnitudeTop3PoolTop1Bottom2RatioBands {
  readonly small: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioBand;
  readonly medium: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioBand;
  readonly large: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioBand;
}

export interface PerTransitionMagnitudeTop3PoolTop1Bottom2RatioEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioBands;
}

export interface PerTransitionMagnitudeTop3PoolTop1Bottom2RatioMap {
  readonly improved: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly top_k: number;
  readonly bottom_k: number;
  readonly level_ratio_max: number;
  readonly stark_ratio_min: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3PoolTop1Bottom2RatioMap;
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

function foldMap(cellsByKey: Map<string, number>): {
  pool_count: number;
  pool_cells: number;
  top1_cells: number;
  bottom2_cells: number;
  ratio: number | null;
} {
  const values = Array.from(cellsByKey.values());
  const pool_count = values.length;
  const pool_cells = values.reduce((a, b) => a + b, 0);
  if (pool_count === 0 || pool_cells === 0) {
    return {
      pool_count,
      pool_cells,
      top1_cells: 0,
      bottom2_cells: 0,
      ratio: null,
    };
  }
  const top1_cells = Math.max(...values);
  // Sort asc + take the first BOTTOM_K slots. For pool_count < BOTTOM_K
  // the slice returns the whole pool (bottom2_cells === pool_cells).
  const sorted = [...values].sort((a, b) => a - b);
  const bottom2_cells = sorted.slice(0, BOTTOM_K).reduce((a, b) => a + b, 0);
  // For pool_count <= BOTTOM_K the asymmetric head-vs-floor-pair
  // distinction collapses (both slots span the entire pool), so we
  // pin ratio 1 by definition and let the label render as "solo" for
  // downstream readers. For pool_count >= 3 the two smallest slots
  // each hold >= 1 cell so bottom2_cells >= 2 and the denominator is
  // guaranteed non-zero.
  const ratio =
    pool_count <= BOTTOM_K
      ? 1
      : roundTo(top1_cells / bottom2_cells, RATIO_DECIMALS);
  return { pool_count, pool_cells, top1_cells, bottom2_cells, ratio };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolTop1Bottom2RatioBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top1_cells: partner.top1_cells,
    partner_bottom2_cells: partner.bottom2_cells,
    partner_ratio: partner.ratio,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top1_cells: metric.top1_cells,
    metric_bottom2_cells: metric.bottom2_cells,
    metric_ratio: metric.ratio,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolTop1Bottom2RatioEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio {
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
    top_k: TOP_K,
    bottom_k: BOTTOM_K,
    level_ratio_max: LEVEL_RATIO_MAX,
    stark_ratio_min: STARK_RATIO_MIN,
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

function labelForRatio(
  pool_count: number,
  ratio: number | null,
  level_ratio_max: number,
  stark_ratio_min: number,
): RatioLabel {
  if (pool_count === 0 || ratio === null) return "empty";
  // pool_count <= BOTTOM_K collapses the asymmetric head-vs-floor-pair
  // distinction (both slots span the entire pool). Surface it as
  // "solo" so downstream readers know the ratio=1 is structural, not
  // a computed level verdict.
  if (pool_count <= BOTTOM_K) return "solo";
  if (ratio >= stark_ratio_min) return "stark";
  if (ratio < level_ratio_max) return "level";
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

function renderRatioCell(
  pool_count: number,
  pool_cells: number,
  top1_cells: number,
  bottom2_cells: number,
  ratio: number | null,
  level_ratio_max: number,
  stark_ratio_min: number,
): string {
  if (pool_count === 0) return "&mdash;";
  const label = labelForRatio(
    pool_count,
    ratio,
    level_ratio_max,
    stark_ratio_min,
  );
  const ratioText = ratio === null ? "-" : `${ratio.toFixed(2)}x`;
  return `ratio ${ratioText} (top1 ${top1_cells} / bottom2 ${bottom2_cells}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2RatioSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom2Ratio,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;
  const { level_ratio_max, stark_ratio_min } = snapshot;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.partner_pool_count > 0 || band.metric_pool_count > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top1_cells, band.partner_bottom2_cells, band.partner_ratio, level_ratio_max, stark_ratio_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top1_cells, band.metric_bottom2_cells, band.metric_ratio, level_ratio_max, stark_ratio_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool TOP-1 / BOTTOM-2 RATIO across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Asymmetric MULTIPLICATIVE single-leader-to-floor-pair scalar over the P11.161 pool &mdash; folds the P11.165 TOP-1 cell count divided by the P11.183 BOTTOM-2 (two smallest slots) cell count into ONE ratio: ratio = top1_cells / bottom2_cells. Complements the P11.185 TOP-1/BOTTOM-1 RATIO surface which reads the SAME leader against the single FLOOR SLOT &mdash; two cells with the same P11.185 verdict can carry very different asymmetric ratios if the floor slot's neighbour is thick vs thin. Ratio can dip below 1 for genuinely flat pools where the floor-pair combined OUTWEIGHS the lone leader (e.g. pool [4,3,2] ratio 4/5 = 0.8 &mdash; the leader does not truly dominate the floor even though P11.185 reads 4/2 = 2 UNEQUAL). Labels: solo = pool_count &le; ${BOTTOM_K} (ratio=1 by definition, no asymmetric head-vs-floor-pair distinction exists), level = ratio &lt; ${level_ratio_max}x (leader within ${level_ratio_max}x of the floor-pair combined; flat or nearly flat), unequal = ratio in [${level_ratio_max}x, ${stark_ratio_min}x) (noticeable multiplicative dominance), stark = ratio &ge; ${stark_ratio_min}x (leader ${stark_ratio_min}x or more the floor-pair combined &mdash; floor-pair is a thin sliver of the leader). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ratio null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner ratio</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI ratio</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
