// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 POOL TOP-2 / BOTTOM-2
// RATIO pure-lib (P11.187).
//
// Two-slot multiplicative DOMINANT-PAIR-vs-FLOOR-PAIR lens over the
// P11.161 pool. Where the P11.185 TOP-1 / BOTTOM-1 RATIO surface names
// the multiplicative gap between the single LEADER and the single
// TRAILER (top1_cells / bottom1_cells), this surface names the
// multiplicative gap between the two LARGEST cells COMBINED (P11.167
// top-2 numerator) and the two SMALLEST cells COMBINED (P11.183
// bottom-2 denominator). Because both endpoints are pair-sums, the
// two-slot ratio COMPRESSES the head/tail spread that the single-slot
// P11.185 ratio exposes — a leader whose 2nd-place sibling is thin
// still shows up as very unequal in P11.185 but softens toward the
// pack in this surface, while a pool whose top TWO both dominate stays
// visibly stark in both surfaces:
//
//   • pool [10, 5, 5]  — top2 15/20=0.75, bottom2 10/20=0.50,
//                        ratio 15/10 = 1.5 (level). P11.185 reads
//                        this pool as ratio 2 (unequal) because the
//                        SINGLE leader is 2x the SINGLE trailer, but
//                        the two-pair fold cancels that gap out —
//                        the top-2 combined (leader + tied) roughly
//                        matches the bottom-2 combined (two ties at
//                        the floor). This is the LOAD-BEARING
//                        difference between the two surfaces.
//   • pool [6, 1, 1]   — top2 7/8=0.875, bottom2 2/8=0.25,
//                        ratio 7/2 = 3.5 (unequal). P11.185 ratio
//                        6 (stark). Two-pair softens because the
//                        2nd-place cell joins the tail on the
//                        numerator's slot count but bottom-2 already
//                        gets the leader's 2nd-slot floor sibling.
//   • pool [4, 3, 2, 1] — top2 7/10=0.70, bottom2 3/10=0.30,
//                        ratio 7/3 = 2.3333 (unequal). P11.185
//                        ratio 4 (unequal). Both surfaces agree the
//                        pool is unequal but the two-pair lens is
//                        modestly less peaky.
//   • pool [10, 1, 1]  — top2 11/12=0.9167, bottom2 2/12=0.1667,
//                        ratio 11/2 = 5.5 (stark). P11.185 ratio
//                        10 (stark). Both surfaces agree on stark;
//                        the pair fold does not rescue a floor-thin
//                        pool from the stark verdict once the head
//                        also thickens.
//
// The pool-shape surfaces now cover the pool from every angle:
//   P11.161 pool count      — how MANY partners populate the pool?
//   P11.163 HHI             — whole-pool concentration (fold all)
//   P11.169 Gini            — whole-pool inequality (fold all)
//   P11.171 Theil           — whole-pool entropy inequality (fold all)
//   P11.173 Atkinson        — whole-pool welfare inequality (fold all)
//   P11.175 CV              — whole-pool coefficient of variation
//   P11.177 H_norm          — whole-pool normalised entropy (evenness)
//   P11.165 top-1 share     — leader's slice of the pool
//   P11.167 top-2 share     — dominant pair's slice of the pool
//   P11.179 bottom-1 share  — floor's slice of the pool
//   P11.183 bottom-2 share  — dominant floor pair's slice
//   P11.181 range           — head-to-floor ADDITIVE spread (single-pair)
//   P11.185 top1/bottom1    — head-to-floor MULTIPLICATIVE ratio
//                             (single-pair, single-slot)
//   P11.187 top2/bottom2    — dominant-pair / floor-pair
//                             MULTIPLICATIVE ratio (two-slot,
//                             this module)
//
// Ratio is well-defined for every non-empty pool because the P11.139
// hot-cells envelope only counts (partner, KPI) participants that
// appear at least once, so bottom2 is always >= 1 for a non-empty pool
// and the denominator can never be zero:
//   • pool_count 0 → ratio null (empty pool).
//   • pool_count 1 → ratio 1 by definition. Both top-2 and bottom-2
//                    span the whole pool (K >= pool_count), so
//                    top2_cells === bottom2_cells === pool_cells and
//                    ratio = 1.
//   • pool_count 2 → ratio 1 by definition. Same reason — the two
//                    slots exhaust the pool on both ends.
//   • pool_count >= 3 → ratio can grow (bounded by the same
//                       (pool_cells - (pool_count - 2)) / 2 upper
//                       when the head owns nearly everything and
//                       every trailer holds exactly one cell, since
//                       bottom2 then equals 2 and top2 equals
//                       pool_cells - (pool_count - 2)).
//
// Cutoffs re-use the P11.185 top1/bottom1 posture (level < 2, unequal
// in [2, 5), stark >= 5) for direct cross-comparability across the
// single-slot and two-slot leader-to-floor surfaces. Disagreements
// between the two ratios are the load-bearing signal — a pool that
// reads "unequal" under P11.185 but "level" under P11.187 has a lone
// leader with a fat pack behind it; a pool that stays "stark" under
// both has a truly peaky head. Anchored to what a small-count pool
// naturally emits: pool [3,1,1] top2=4 bottom2=2 ratio=2 (unequal
// edge); pool [5,1,1] ratio=3 (unequal); pool [10,1,1] ratio=5.5
// (stark edge).
//   • level    (ratio <  2) — top-pair and floor-pair are roughly
//                              matched; pool is fairly level once the
//                              two ends are averaged over pairs.
//   • unequal  (ratio >= 2) — top-pair carries 2-5x the floor-pair;
//                              noticeable multiplicative gap even
//                              after the pair fold.
//   • stark    (ratio >= 5) — top-pair carries 5x+ the floor-pair;
//                              head dominates on both slots.
// Both cutoffs are exposed on the envelope as level_ratio_max /
// stark_ratio_min so downstream JSONL consumers render the label
// vocabulary without importing the TS module.
//
// LABEL ORIENTATION follows the inequality-framing convention: HIGH
// ratio = HIGH multiplicative inequality (matches P11.163 HHI /
// P11.169 Gini / P11.171 Theil / P11.173 Atkinson / P11.175 CV /
// P11.181 range / P11.185 top1/bottom1 where the top band names the
// peakier / more unequal pool; inverts the P11.177 H_norm / P11.179
// bottom-1 / P11.183 bottom-2 evenness framing). Chosen because a
// ratio reader wants "big number = big multiplicative gap" for direct
// human read.
//
// Uses TOP_N re-exported from the P11.149 leaderboard for parity with
// every pool-shape sibling; band cutoffs re-exported from P11.145 so
// band edges cannot drift. TOP_K + BOTTOM_K are both 2 (independent
// of TOP_N).
//
// Splice placement rule for a follow-up cron-wiring tick: IMMEDIATELY
// BELOW perTransitionMagnitudeTop3PoolTop1Bottom1RatioSection (P11.186)
// AND IMMEDIATELY ABOVE perPairHotCellsSection so the hierarchy
// descends per-transition MAGNITUDE TOP-3 POOL SIZE (P11.161) → HHI
// (P11.163) → GINI (P11.169) → THEIL (P11.171) → ATKINSON (P11.173)
// → CV (P11.175) → NORMALIZED ENTROPY (P11.177) → TOP-1 SHARE
// (P11.165) → TOP-2 SHARE (P11.167) → BOTTOM-1 SHARE (P11.179) →
// RANGE (P11.181) → BOTTOM-2 SHARE (P11.183) → TOP1/BOTTOM1 RATIO
// (P11.185) → TOP2/BOTTOM2 RATIO (this module) → per-pair hot-cells
// GRANULAR (P11.139). Whole-pool inequality SEXTET first, then leader
// slice, dominant-pair slice, floor slice, head-to-floor ADDITIVE
// SPREAD, dominant-floor-pair slice, single-slot head/floor
// MULTIPLICATIVE RATIO, then two-slot dominant-pair/floor-pair
// MULTIPLICATIVE RATIO — the pool is described from every-end-then-
// each-slice-then-spread-then-tail-slice-then-single-slot-ratio-then-
// two-slot-ratio before the per-pair granular table.

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

// Re-use the P11.185 single-slot cutoffs so a downstream consumer can
// diff the two surfaces without re-anchoring the label vocabulary. A
// pool whose P11.185 ratio is "stark" but P11.187 ratio is "unequal"
// carries a load-bearing signal: the lone LEADER is peaky but the
// dominant PAIR is not — softens once the 2nd-place head joins the
// numerator.
const LEVEL_RATIO_MAX = 2;
const STARK_RATIO_MIN = 5;

// Rounded to 4 decimals so weekly digests are stable under float-noise
// re-runs. Same precision as the P11.163 HHI + P11.181 range +
// P11.185 top1/bottom1 ratio surfaces.
const RATIO_DECIMALS = 4;

// TOP_K and BOTTOM_K are both 2 (two-slot on each end). Independent
// of TOP_N (the leaderboard display cap).
const TOP_K = 2;
const BOTTOM_K = 2;

export interface PerTransitionMagnitudeTop3PoolTop2Bottom2RatioBand {
  readonly partner_pool_count: number;
  readonly partner_pool_cells: number;
  readonly partner_top2_cells: number;
  readonly partner_bottom2_cells: number;
  readonly partner_ratio: number | null;
  readonly metric_pool_count: number;
  readonly metric_pool_cells: number;
  readonly metric_top2_cells: number;
  readonly metric_bottom2_cells: number;
  readonly metric_ratio: number | null;
}

export interface PerTransitionMagnitudeTop3PoolTop2Bottom2RatioBands {
  readonly small: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioBand;
  readonly medium: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioBand;
  readonly large: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioBand;
}

export interface PerTransitionMagnitudeTop3PoolTop2Bottom2RatioEntry {
  readonly bands: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioBands;
}

export interface PerTransitionMagnitudeTop3PoolTop2Bottom2RatioMap {
  readonly improved: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioEntry;
  readonly degraded: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioEntry;
  readonly rotated: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioEntry;
  readonly undecidable: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio {
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
  readonly transitions: PerTransitionMagnitudeTop3PoolTop2Bottom2RatioMap;
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
  top2_cells: number;
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
      top2_cells: 0,
      bottom2_cells: 0,
      ratio: null,
    };
  }
  // Sort desc for top-K, asc for bottom-K via reverse-slice. A pool of
  // size <= K has BOTH endpoints spanning the whole pool, so top2 and
  // bottom2 are both === pool_cells and ratio = 1 exactly.
  const desc = [...values].sort((a, b) => b - a);
  const top2_cells = desc.slice(0, TOP_K).reduce((a, b) => a + b, 0);
  const asc = [...values].sort((a, b) => a - b);
  const bottom2_cells = asc.slice(0, BOTTOM_K).reduce((a, b) => a + b, 0);
  // Denominator guaranteed >= 1 because the hot-cells envelope only
  // records participants that appear at least once — min(cell_counts)
  // is >= 1 for a non-empty pool and bottom2 sums at least one such
  // value.
  const ratio = roundTo(top2_cells / bottom2_cells, RATIO_DECIMALS);
  return { pool_count, pool_cells, top2_cells, bottom2_cells, ratio };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PoolTop2Bottom2RatioBand {
  const partner = foldMap(buckets.partners);
  const metric = foldMap(buckets.metrics);
  return {
    partner_pool_count: partner.pool_count,
    partner_pool_cells: partner.pool_cells,
    partner_top2_cells: partner.top2_cells,
    partner_bottom2_cells: partner.bottom2_cells,
    partner_ratio: partner.ratio,
    metric_pool_count: metric.pool_count,
    metric_pool_cells: metric.pool_cells,
    metric_top2_cells: metric.top2_cells,
    metric_bottom2_cells: metric.bottom2_cells,
    metric_ratio: metric.ratio,
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3PoolTop2Bottom2RatioEntry {
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

export function computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio {
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
  // pool_count <= TOP_K exhausts the pool on BOTH ends so ratio is 1
  // by definition — surface that as "solo" to match the P11.185
  // vocabulary (the pool is trivially level because the same cells
  // fill both slots).
  if (pool_count <= TOP_K) return "solo";
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
  top2_cells: number,
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
  return `ratio ${ratioText} (top2 ${top2_cells} / bottom2 ${bottom2_cells}) / pool ${pool_count} across ${pool_cells} cells (${label})`;
}

export function formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2RatioSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom2Ratio,
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
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.partner_pool_count, band.partner_pool_cells, band.partner_top2_cells, band.partner_bottom2_cells, band.partner_ratio, level_ratio_max, stark_ratio_min)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${renderRatioCell(band.metric_pool_count, band.metric_pool_cells, band.metric_top2_cells, band.metric_bottom2_cells, band.metric_ratio, level_ratio_max, stark_ratio_min)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} pool TOP-${snapshot.top_k} / BOTTOM-${snapshot.bottom_k} RATIO across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Two-slot MULTIPLICATIVE dominant-pair-to-floor-pair lens over the P11.161 pool &mdash; folds the P11.167 TOP-2 combined cells and the P11.183 BOTTOM-2 combined cells into ONE scale-invariant scalar: ratio = top2_cells / bottom2_cells. Companion to the P11.185 TOP-1 / BOTTOM-1 RATIO (single-slot on each end) &mdash; the two-slot fold COMPRESSES the head/tail spread the single-slot lens exposes. A pool whose P11.185 verdict is "unequal" or "stark" but P11.187 verdict is "level" has a lone leader with a fat pack behind it; a pool that stays "stark" under BOTH surfaces has a truly peaky head that dominates on both slots. Labels: solo = pool_count &le; ${snapshot.top_k} (ratio=1 by definition, both slots span the whole pool), level = ratio &lt; ${level_ratio_max}x (top-pair and floor-pair roughly matched), unequal = ratio in [${level_ratio_max}x, ${stark_ratio_min}x) (noticeable multiplicative gap between pair sums), stark = ratio &ge; ${stark_ratio_min}x (top-pair carries ${stark_ratio_min}x+ the floor-pair). Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated + undecidable ship empty pools in medium + large bands by P11.139 design. Empty cells omitted from this table but stay on the JSONL envelope with pool_count 0 + ratio null.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">partner ratio</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">KPI ratio</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
