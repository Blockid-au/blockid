// Weekly digest PER-TRANSITION MAGNITUDE TOP-3 LEADERBOARD pure-lib (P11.149).
//
// The P11.147 / P11.148 pair opened the PER-(transition, band) LEADERBOARD
// surface, naming the SINGLE loudest partner + SINGLE loudest KPI inside
// each of the 12 (transition, band) cells. That answered 'WHO owns the
// loudest chunk of this cell?' but did NOT answer the follow-up an ops
// reader hits the moment the single-winner picker names a partner: 'is
// the top_partner an OUTLIER (the second-place partner has half as many
// cells), or is the winner just barely ahead of a pack of near-peers
// (three partners tied within one cell of each other, ops needs to poke
// all three)?'.
//
// This module opens the TOP-3 complement to P11.147. Within each of the
// 12 (transition, band) cells, it emits the top-3 partners and the top-3
// KPIs — up to three each — using the SAME tie-break vocabulary as
// P11.147 (cells DESC → sum_hot_score DESC → identity ASC) so ops learns
// ONE tie-break rule across all leaderboard surfaces. Cells with fewer
// than 3 partners or fewer than 3 KPIs ship a shorter array rather than
// null-padding; the envelope carries only the actual entries so a JSONL
// consumer joining by rank never sees dummy rows.
//
// Rotated + undecidable rows always carry hot_score = 1 by P11.139 design,
// so their medium + large bands will always ship empty arrays. That is
// the correct read: rotated / undecidable are alert-worthy but low-
// magnitude by construction, and a top-3 over an empty cell has no
// entries. The envelope still ships the empty-array entries for those
// bands so a JSONL consumer joining by (transition, band) tuple always
// finds the complete 4×3 grid.
//
// The six surfaces (P11.139 granular / P11.141 blended summary /
// P11.143 per-transition drill-down / P11.145 magnitude drill-down /
// P11.147 magnitude LEADERBOARD single-winner / this module magnitude
// TOP-3 leaderboard) stay strictly disjoint. This module never emits
// row-level hot-cell shape (that lives on P11.139) and never emits per-
// band cell / sum / max scalars in aggregate (those live on P11.145).
// It carries ONLY the per-(transition, band) top_partners + top_metrics
// arrays so the JSONL envelope has no field duplication with any sibling
// surface — the P11.147 single-winner entry stays authoritative for the
// #1 pick, this envelope carries the ranked list.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.145 → P11.146 / P11.147 → P11.148 cadence — cron-route wiring
// intentionally deferred to a follow-up tick (P11.150) so the per-
// (transition, band) top-3 shape can be exercised in isolation before
// touching the hot Monday cron path (already hosting the six per-pair-
// hot-cells surfaces named above plus every earlier scorecard / verdict
// / transition / distribution / cross-cut ranking surface).
//
// Splice placement rule for P11.150: immediately BELOW
// perTransitionMagnitudeLeaderboardSection AND immediately ABOVE
// perPairHotCellsSection so the hierarchy descends per-transition
// DRILL-DOWN (P11.143) → per-transition MAGNITUDE scalars (P11.145) →
// per-transition MAGNITUDE LEADERBOARD single-winner (P11.147) →
// per-transition MAGNITUDE TOP-3 LEADERBOARD (P11.149) → per-pair
// hot-cells GRANULAR (P11.139) → per-pair scalar distribution (P11.130).
// Ops reads the per-transition winner picks first, then the magnitude
// breakdown for the loud-vs-quiet-distribution shape, then the single-
// winner leaderboard to name the specific partner + KPI owning each
// loud (transition, band) cell, then the top-3 ranked list to see
// whether the #1 pick is an outlier or one of a pack of near-peers,
// then the granular table for the individual cells.
//
// Envelope entry snapshot_per_transition_magnitude_top3_leaderboard will
// land IMMEDIATELY AFTER snapshot_per_transition_magnitude_leaderboard
// and IMMEDIATELY BEFORE snapshot_per_pair_hot_cells so the six per-
// pair-hot-cells envelope entries (blended scalar → per-transition
// drill-down → magnitude scalar drill-down → magnitude leaderboard
// single-winner → magnitude leaderboard TOP-3 → granular rows) stay
// adjacent and hierarchically ordered in the JSONL response body.
//
// Design notes:
//   • Fixed-key `transitions` shape {improved, degraded, rotated,
//     undecidable} mirrors P11.143 / P11.145 / P11.147 so the drill-
//     down chain aligns 1:1 by transition axis.
//   • Fixed-key `bands` shape {small, medium, large} within every
//     transition mirrors P11.145 / P11.147 so the leaderboard grid
//     aligns 1:1 by magnitude axis.
//   • Empty (transition, band) cells carry {top_partners: [],
//     top_metrics: []} rather than being omitted from the envelope.
//   • Band cutoffs pinned to MAGNITUDE_SMALL_MAX = 2 and
//     MAGNITUDE_MEDIUM_MAX = 5, re-exported from the P11.145 module so
//     all three magnitude surfaces (drill-down / single-winner
//     leaderboard / TOP-3 leaderboard) cannot drift.
//   • total_hot_cells scalar mirrors P11.145 / P11.147 for parity across
//     the three magnitude drill-down surfaces — top3.total_hot_cells
//     always equals leaderboard.total_hot_cells always equals
//     drilldown.total_hot_cells because all three fold the same P11.139
//     envelope rows.
//   • TOP_N pinned to 3, exported so the formatter and any downstream
//     JSONL consumer can render the cap without re-declaring the number.
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `total_hot_cells === 0` (nothing to lead). Empty individual
//     (transition, band) cells are OMITTED from the visual table but
//     STAY on the JSONL envelope with empty arrays so a JSONL consumer
//     never sees a truncated set.

import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
  type BandThresholds,
} from "./digest-snapshot-per-transition-magnitude-drilldown";

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";
type MagnitudeBandKey = "small" | "medium" | "large";

const TRANSITION_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

const BAND_KEYS: readonly MagnitudeBandKey[] = ["small", "medium", "large"];

export const TOP_N = 3;

export interface PerTransitionMagnitudeTop3PartnerEntry {
  readonly reseller_code: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerTransitionMagnitudeTop3MetricEntry {
  readonly key: PerPairHotCellRow["key"];
  readonly metric_name: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerTransitionMagnitudeTop3LeaderboardBand {
  readonly top_partners: readonly PerTransitionMagnitudeTop3PartnerEntry[];
  readonly top_metrics: readonly PerTransitionMagnitudeTop3MetricEntry[];
}

export interface PerTransitionMagnitudeTop3LeaderboardBands {
  readonly small: PerTransitionMagnitudeTop3LeaderboardBand;
  readonly medium: PerTransitionMagnitudeTop3LeaderboardBand;
  readonly large: PerTransitionMagnitudeTop3LeaderboardBand;
}

export interface PerTransitionMagnitudeTop3LeaderboardEntry {
  readonly bands: PerTransitionMagnitudeTop3LeaderboardBands;
}

export interface PerTransitionMagnitudeTop3LeaderboardMap {
  readonly improved: PerTransitionMagnitudeTop3LeaderboardEntry;
  readonly degraded: PerTransitionMagnitudeTop3LeaderboardEntry;
  readonly rotated: PerTransitionMagnitudeTop3LeaderboardEntry;
  readonly undecidable: PerTransitionMagnitudeTop3LeaderboardEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeTop3Leaderboard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly top_n: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeTop3LeaderboardMap;
}

interface PartnerAggregator {
  reseller_code: string;
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
}

interface MetricAggregator {
  key: PerPairHotCellRow["key"];
  metric_name: string;
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
}

interface BandBuckets {
  partners: Map<string, PartnerAggregator>;
  metrics: Map<string, MetricAggregator>;
}

function emptyBandBuckets(): BandBuckets {
  return { partners: new Map(), metrics: new Map() };
}

interface TransitionBuckets {
  small: BandBuckets;
  medium: BandBuckets;
  large: BandBuckets;
}

function emptyTransitionBuckets(): TransitionBuckets {
  return {
    small: emptyBandBuckets(),
    medium: emptyBandBuckets(),
    large: emptyBandBuckets(),
  };
}

function isTransitionKey(
  t: PerPairHotCellRow["transition"],
): t is TransitionBucketKey {
  return (
    t === "improved" || t === "degraded" || t === "rotated" || t === "undecidable"
  );
}

function bandForScore(score: number): MagnitudeBandKey {
  if (score <= MAGNITUDE_SMALL_MAX) return "small";
  if (score <= MAGNITUDE_MEDIUM_MAX) return "medium";
  return "large";
}

function ingestPartner(
  buckets: BandBuckets,
  code: string,
  hot_score: number,
): void {
  const existing = buckets.partners.get(code);
  if (existing) {
    existing.cells += 1;
    existing.sum_hot_score += hot_score;
    if (hot_score > existing.max_hot_score) existing.max_hot_score = hot_score;
    return;
  }
  buckets.partners.set(code, {
    reseller_code: code,
    cells: 1,
    sum_hot_score: hot_score,
    max_hot_score: hot_score,
  });
}

function ingestMetric(
  buckets: BandBuckets,
  key: PerPairHotCellRow["key"],
  metric_name: string,
  hot_score: number,
): void {
  const existing = buckets.metrics.get(key);
  if (existing) {
    existing.cells += 1;
    existing.sum_hot_score += hot_score;
    if (hot_score > existing.max_hot_score) existing.max_hot_score = hot_score;
    return;
  }
  buckets.metrics.set(key, {
    key,
    metric_name,
    cells: 1,
    sum_hot_score: hot_score,
    max_hot_score: hot_score,
  });
}

function comparePartner(a: PartnerAggregator, b: PartnerAggregator): number {
  if (a.cells !== b.cells) return b.cells - a.cells;
  if (a.sum_hot_score !== b.sum_hot_score) {
    return b.sum_hot_score - a.sum_hot_score;
  }
  if (a.reseller_code < b.reseller_code) return -1;
  if (a.reseller_code > b.reseller_code) return 1;
  return 0;
}

function compareMetric(a: MetricAggregator, b: MetricAggregator): number {
  if (a.cells !== b.cells) return b.cells - a.cells;
  if (a.sum_hot_score !== b.sum_hot_score) {
    return b.sum_hot_score - a.sum_hot_score;
  }
  if (a.key < b.key) return -1;
  if (a.key > b.key) return 1;
  return 0;
}

function pickTopPartners(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3PartnerEntry[] {
  return Array.from(buckets.partners.values())
    .sort(comparePartner)
    .slice(0, TOP_N)
    .map((p) => ({
      reseller_code: p.reseller_code,
      cells: p.cells,
      sum_hot_score: p.sum_hot_score,
      max_hot_score: p.max_hot_score,
    }));
}

function pickTopMetrics(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3MetricEntry[] {
  return Array.from(buckets.metrics.values())
    .sort(compareMetric)
    .slice(0, TOP_N)
    .map((m) => ({
      key: m.key,
      metric_name: m.metric_name,
      cells: m.cells,
      sum_hot_score: m.sum_hot_score,
      max_hot_score: m.max_hot_score,
    }));
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeTop3LeaderboardBand {
  return {
    top_partners: pickTopPartners(buckets),
    top_metrics: pickTopMetrics(buckets),
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeTop3LeaderboardEntry {
  return {
    bands: {
      small: finaliseBand(buckets.small),
      medium: finaliseBand(buckets.medium),
      large: finaliseBand(buckets.large),
    },
  };
}

/**
 * Partition the P11.139 per-pair hot-cells envelope by (transition,
 * magnitude band) and emit up to TOP_N partners + up to TOP_N metrics
 * per cell. Complements the P11.147 single-winner leaderboard by
 * ranking the top three inside each of the 12 (transition, band) cells
 * so an ops reader sees whether the #1 pick is an outlier or one of a
 * pack of near-peers that all deserve investigation.
 *
 * Tie-break: cells DESC → sum_hot_score DESC → identity ASC
 * (reseller_code for partners, key for metrics). Mirrors P11.147 so ops
 * learns ONE tie-break vocabulary across the single-winner and TOP-3
 * leaderboard surfaces.
 *
 * Empty (transition, band) cells emit {top_partners: [], top_metrics:
 * []} — the envelope always ships the full 4×3 grid so a JSONL consumer
 * never sees a truncated set. Rotated + undecidable transitions will
 * always ship empty arrays in the medium + large bands since those
 * rows carry hot_score = 1 by P11.139 design.
 */
export function computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeTop3Leaderboard {
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
    const bandKey = bandForScore(r.hot_score);
    const band = buckets[r.transition][bandKey];
    ingestPartner(band, r.reseller_code, r.hot_score);
    ingestMetric(band, r.key, r.metric_name, r.hot_score);
  }

  return {
    window_size: hotCells.window_size,
    first_week: hotCells.first_week,
    last_week: hotCells.last_week,
    sustained_p90_threshold: hotCells.sustained_p90_threshold,
    threshold: hotCells.threshold,
    total_hot_cells,
    top_n: TOP_N,
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

function partnerListCell(
  entries: readonly PerTransitionMagnitudeTop3PartnerEntry[],
): string {
  if (entries.length === 0) return "&mdash;";
  return entries
    .map(
      (p, idx) =>
        `${idx + 1}. ${escapeHtml(p.reseller_code)} (cells ${p.cells}, sum ${p.sum_hot_score}, max ${p.max_hot_score})`,
    )
    .join("<br>");
}

function metricListCell(
  entries: readonly PerTransitionMagnitudeTop3MetricEntry[],
): string {
  if (entries.length === 0) return "&mdash;";
  return entries
    .map(
      (m, idx) =>
        `${idx + 1}. ${escapeHtml(m.metric_name)} (cells ${m.cells}, sum ${m.sum_hot_score}, max ${m.max_hot_score})`,
    )
    .join("<br>");
}

/**
 * Render the per-transition magnitude TOP-3 leaderboard as a table: one
 * row per non-empty (transition, band) cell listing the top-N partners
 * and top-N metrics for that cell. Designed to splice IMMEDIATELY BELOW
 * the P11.147 single-winner magnitude leaderboard and IMMEDIATELY ABOVE
 * the P11.139 granular per-pair hot-cells table so the hierarchy
 * descends per-transition DRILL-DOWN (P11.143) → per-transition
 * MAGNITUDE scalars (P11.145) → per-transition MAGNITUDE LEADERBOARD
 * single-winner (P11.147) → per-transition MAGNITUDE TOP-3 LEADERBOARD
 * (P11.149) → per-pair hot-cells GRANULAR (P11.139).
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when total_hot_cells
 * is 0 (nothing to lead).
 *
 * Empty (transition, band) cells are OMITTED from the visual table but
 * STAY on the JSONL envelope with {top_partners: [], top_metrics: []}
 * so a JSONL consumer never sees a truncated set.
 */
export function formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeTop3Leaderboard,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);
  const { small_max, medium_max } = snapshot.band_thresholds;

  const rowsHtml = TRANSITION_KEYS.flatMap((t) => {
    const entry = snapshot.transitions[t];
    return BAND_KEYS.filter((b) => {
      const band = entry.bands[b];
      return band.top_partners.length > 0 || band.top_metrics.length > 0;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${partnerListCell(band.top_partners)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top">${metricListCell(band.top_metrics)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude TOP-${snapshot.top_n} leaderboard across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Ranks the loudest ${snapshot.top_n} partners and loudest ${snapshot.top_n} KPIs inside each (transition, band) cell so an ops reader sees whether the P11.147 single-winner pick is an outlier or one of a pack of near-peers that all deserve investigation. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated and undecidable transitions ship empty arrays in medium + large bands by P11.139 design. Empty (transition, band) cells omitted from this table but stay on the JSONL envelope with empty arrays.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">top partners</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">top KPIs</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
