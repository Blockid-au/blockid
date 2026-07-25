// Weekly digest PER-TRANSITION MAGNITUDE LEADERBOARD pure-lib (P11.147).
//
// The P11.145 / P11.146 pair opened the PER-TRANSITION MAGNITUDE drill-down
// surface over the P11.143 per-transition drill-down and the P11.141 blended
// scalar summary — partitioning the P11.139 per-pair hot-cells list first
// BY transition and then BY hot_score magnitude band {small, medium, large}
// so an ops reader sees whether a loud transition bucket is loud from MANY
// cells that barely qualified or a FEW cells that jumped a huge distance.
//
// The P11.145 envelope answers 'HOW LOUD, by count and total score, is each
// (transition, band) cell?' with per-band {cells, sum_hot_score,
// max_hot_score} scalars. But it does NOT answer the follow-up question the
// per-band scalars alone cannot surface: 'WITHIN a specific (transition,
// band) cell — say (degraded, large) — WHICH PARTNER and WHICH KPI own the
// loudest chunk of that cell?'. A (degraded, large) cell with 4 hot cells
// summing to hot_score 32 reads differently if all 4 belong to one partner
// on a single KPI (that partner has a portfolio-wide degradation on that
// metric) versus if they are spread across 4 different partner × KPI pairs
// (a systemic sector-wide degradation on that metric).
//
// This module opens the LEADERBOARD complement to P11.145. Within each of
// the 12 (transition, band) cells, it picks:
//   • top_partner — the reseller_code with the most cells in that
//     (transition, band) tuple, tie-breaking on sum_hot_score DESC then
//     reseller_code ASC. Carries {reseller_code, cells, sum_hot_score,
//     max_hot_score} so a reader sees at-a-glance whether the winner is
//     loud from cell COUNT or from a single MAX cell.
//   • top_metric — the KPI key with the most cells in that (transition,
//     band) tuple, tie-breaking on sum_hot_score DESC then key ASC.
//     Carries {key, metric_name, cells, sum_hot_score, max_hot_score};
//     metric_name flows through from the first-seen input row for that
//     key so the formatter can render human-readable KPI labels without a
//     lookup.
//
// Rotated + undecidable rows always carry hot_score = 1 by P11.139 design,
// so their medium + large bands will always ship null pickers. That is the
// correct read: rotated / undecidable are alert-worthy but low-magnitude
// by construction, and a leaderboard over an empty cell has no winner. The
// envelope still ships the null-picker entries for those bands so a JSONL
// consumer joining by (transition, band) tuple always finds the complete
// 4×3 grid.
//
// The five surfaces (P11.139 granular / P11.141 blended summary / P11.143
// per-transition drill-down / P11.145 magnitude drill-down / this module
// magnitude leaderboard) stay strictly disjoint. This module never emits
// row-level hot-cell shape (that lives on P11.139) and never emits per-
// band cell / sum / max scalars in aggregate (those live on P11.145). It
// carries ONLY the per-(transition, band) top_partner + top_metric picks
// so the JSONL envelope has no field duplication with any sibling surface.
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.143 → P11.144 / P11.145 → P11.146 cadence — cron-route wiring
// intentionally deferred to a follow-up tick (P11.148) so the per-
// (transition, band) leaderboard shape can be exercised in isolation
// before touching the hot Monday cron path (already hosting four grains
// of scorecard + four grains of verdict + four grains of transition +
// four grains of transition distribution + cross-grain family-alerts
// executive summary + per-partner cross-metric ranking + per-metric
// cross-partner ranking + per-pair hot-cells granular ranking + per-pair
// hot-cells scalar summary + per-transition hot-cells drill-down + per-
// transition magnitude drill-down).
//
// Splice placement rule for P11.148: immediately BELOW
// perTransitionMagnitudeDrilldownSection AND immediately ABOVE
// perPairHotCellsSection so the hierarchy descends per-transition
// DRILL-DOWN (P11.143) → per-transition MAGNITUDE scalars (P11.145) →
// per-transition MAGNITUDE LEADERBOARD (P11.147) → per-pair hot-cells
// GRANULAR (P11.139) → per-pair scalar distribution (P11.130). Ops reads
// the per-transition winner picks first, then the magnitude breakdown for
// the loud-vs-quiet-distribution shape, then the magnitude leaderboard to
// name the specific partner + KPI owning each loud (transition, band)
// cell, then the granular table for the individual cells behind each
// leaderboard pick.
//
// Envelope entry snapshot_per_transition_magnitude_leaderboard will land
// IMMEDIATELY AFTER snapshot_per_transition_magnitude_drilldown and
// IMMEDIATELY BEFORE snapshot_per_pair_hot_cells so the five per-pair-
// hot-cells envelope entries (blended scalar → per-transition drill-down
// → magnitude scalar drill-down → magnitude leaderboard → granular rows)
// stay adjacent and hierarchically ordered in the JSONL response body.
//
// Design notes:
//   • Fixed-key `transitions` shape {improved, degraded, rotated,
//     undecidable} mirrors P11.143 / P11.145 so the drill-down chain
//     aligns 1:1 by transition axis.
//   • Fixed-key `bands` shape {small, medium, large} within every
//     transition mirrors P11.145 so the leaderboard grid aligns 1:1 by
//     magnitude axis.
//   • Empty (transition, band) cells carry {top_partner: null,
//     top_metric: null} rather than being omitted from the envelope.
//   • Band cutoffs pinned to MAGNITUDE_SMALL_MAX = 2 and
//     MAGNITUDE_MEDIUM_MAX = 5, re-exported from the P11.145 module so
//     both surfaces cannot drift.
//   • total_hot_cells scalar mirrors P11.145 for parity across the two
//     drill-down surfaces — leaderboard.total_hot_cells always equals
//     drilldown.total_hot_cells because both fold the same P11.139
//     envelope rows.
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `total_hot_cells === 0` (nothing to lead). Empty individual
//     (transition, band) cells are OMITTED from the visual table but STAY
//     on the JSONL envelope with null pickers so a JSONL consumer never
//     sees a truncated set.

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

export interface PerTransitionMagnitudeTopPartner {
  readonly reseller_code: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerTransitionMagnitudeTopMetric {
  readonly key: PerPairHotCellRow["key"];
  readonly metric_name: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerTransitionMagnitudeLeaderboardBand {
  readonly top_partner: PerTransitionMagnitudeTopPartner | null;
  readonly top_metric: PerTransitionMagnitudeTopMetric | null;
}

export interface PerTransitionMagnitudeLeaderboardBands {
  readonly small: PerTransitionMagnitudeLeaderboardBand;
  readonly medium: PerTransitionMagnitudeLeaderboardBand;
  readonly large: PerTransitionMagnitudeLeaderboardBand;
}

export interface PerTransitionMagnitudeLeaderboardEntry {
  readonly bands: PerTransitionMagnitudeLeaderboardBands;
}

export interface PerTransitionMagnitudeLeaderboardMap {
  readonly improved: PerTransitionMagnitudeLeaderboardEntry;
  readonly degraded: PerTransitionMagnitudeLeaderboardEntry;
  readonly rotated: PerTransitionMagnitudeLeaderboardEntry;
  readonly undecidable: PerTransitionMagnitudeLeaderboardEntry;
}

export interface DigestSnapshotPerTransitionMagnitudeLeaderboard {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly band_thresholds: BandThresholds;
  readonly transitions: PerTransitionMagnitudeLeaderboardMap;
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

function pickTopPartner(
  buckets: BandBuckets,
): PerTransitionMagnitudeTopPartner | null {
  let winner: PartnerAggregator | null = null;
  for (const p of buckets.partners.values()) {
    if (
      winner === null ||
      p.cells > winner.cells ||
      (p.cells === winner.cells && p.sum_hot_score > winner.sum_hot_score) ||
      (p.cells === winner.cells &&
        p.sum_hot_score === winner.sum_hot_score &&
        p.reseller_code < winner.reseller_code)
    ) {
      winner = p;
    }
  }
  if (winner === null) return null;
  return {
    reseller_code: winner.reseller_code,
    cells: winner.cells,
    sum_hot_score: winner.sum_hot_score,
    max_hot_score: winner.max_hot_score,
  };
}

function pickTopMetric(
  buckets: BandBuckets,
): PerTransitionMagnitudeTopMetric | null {
  let winner: MetricAggregator | null = null;
  for (const m of buckets.metrics.values()) {
    if (
      winner === null ||
      m.cells > winner.cells ||
      (m.cells === winner.cells && m.sum_hot_score > winner.sum_hot_score) ||
      (m.cells === winner.cells &&
        m.sum_hot_score === winner.sum_hot_score &&
        m.key < winner.key)
    ) {
      winner = m;
    }
  }
  if (winner === null) return null;
  return {
    key: winner.key,
    metric_name: winner.metric_name,
    cells: winner.cells,
    sum_hot_score: winner.sum_hot_score,
    max_hot_score: winner.max_hot_score,
  };
}

function finaliseBand(
  buckets: BandBuckets,
): PerTransitionMagnitudeLeaderboardBand {
  return {
    top_partner: pickTopPartner(buckets),
    top_metric: pickTopMetric(buckets),
  };
}

function finaliseTransition(
  buckets: TransitionBuckets,
): PerTransitionMagnitudeLeaderboardEntry {
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
 * magnitude band) and pick a top_partner + top_metric leaderboard entry
 * per cell. Complements the P11.145 per-transition magnitude drill-down
 * with named winners so an ops reader sees WHICH partner + WHICH KPI own
 * the loudest chunk inside each of the 12 (transition, band) cells rather
 * than only the per-band aggregate {cells, sum, max} scalars.
 *
 * Tie-break: cells DESC → sum_hot_score DESC → identity ASC (reseller_code
 * for top_partner, key for top_metric). Mirrors P11.141 / P11.143 so ops
 * learns ONE tie-break vocabulary across all leaderboard surfaces.
 *
 * Empty (transition, band) cells emit {top_partner: null, top_metric:
 * null} — the envelope always ships the full 4×3 grid so a JSONL consumer
 * never sees a truncated set. Rotated + undecidable transitions will
 * always ship null pickers in the medium + large bands since those rows
 * carry hot_score = 1 by P11.139 design.
 */
export function computeDigestSnapshotPerTransitionMagnitudeLeaderboard(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionMagnitudeLeaderboard {
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

function partnerCell(top: PerTransitionMagnitudeTopPartner | null): string {
  if (top === null) return "&mdash;";
  return `${escapeHtml(top.reseller_code)} (cells ${top.cells}, sum ${top.sum_hot_score}, max ${top.max_hot_score})`;
}

function metricCell(top: PerTransitionMagnitudeTopMetric | null): string {
  if (top === null) return "&mdash;";
  return `${escapeHtml(top.metric_name)} (cells ${top.cells}, sum ${top.sum_hot_score}, max ${top.max_hot_score})`;
}

/**
 * Render the per-transition magnitude leaderboard as a table: one row per
 * non-empty (transition, band) cell naming the top_partner and top_metric
 * for that cell. Designed to splice IMMEDIATELY BELOW the P11.145 per-
 * transition magnitude drill-down and IMMEDIATELY ABOVE the P11.139
 * granular per-pair hot-cells table so the hierarchy descends per-
 * transition DRILL-DOWN (P11.143) → per-transition MAGNITUDE scalars
 * (P11.145) → per-transition MAGNITUDE LEADERBOARD (P11.147) → per-pair
 * hot-cells GRANULAR (P11.139).
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when total_hot_cells is
 * 0 (nothing to lead).
 *
 * Empty (transition, band) cells are OMITTED from the visual table but
 * STAY on the JSONL envelope with {top_partner: null, top_metric: null}
 * so a JSONL consumer never sees a truncated set.
 */
export function formatDigestSnapshotPerTransitionMagnitudeLeaderboardSection(
  snapshot: DigestSnapshotPerTransitionMagnitudeLeaderboard,
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
      return band.top_partner !== null || band.top_metric !== null;
    }).map((b) => {
      const band = entry.bands[b];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${transitionLabel(t)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${bandRangeLabel(b, small_max, medium_max)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${partnerCell(band.top_partner)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${metricCell(band.top_metric)}</td></tr>`;
    });
  }).join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition magnitude leaderboard across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Names the loudest partner and loudest KPI inside each (transition, band) cell so an ops reader can attribute the ${snapshot.total_hot_cells} hot cells P11.145 partitioned by magnitude to specific counterparties and metrics without cross-referencing the granular per-pair table below. Bands: small (1..${small_max}), medium (${small_max + 1}..${medium_max}), large (${medium_max + 1}+). Rotated and undecidable transitions ship null pickers in medium + large bands by P11.139 design. Empty (transition, band) cells omitted from this table but stay on the JSONL envelope with null pickers.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">magnitude band</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">top partner</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">top KPI</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
