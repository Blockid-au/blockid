// Weekly digest PER-TRANSITION HOT CELLS DRILL-DOWN pure-lib (P11.143).
//
// The P11.141 / P11.142 pair opened the SCALAR ROLL-UP surface over the
// P11.139 granular per-pair hot-cells ranking — total cells, sum / max /
// mean hot_score, fixed-key {improved, degraded, rotated, undecidable}
// bucket counts, plus one single loudest partner and one single loudest
// KPI across ALL transitions blended together.
//
// This module opens the DRILL-DOWN complement to that scalar summary.
// Rather than blending across transitions, it partitions the P11.139
// hot-cells list BY transition and picks a per-bucket top-partner +
// top-KPI winner PER bucket. The output answers a question the P11.141
// scalar summary cannot: "WHICH partner and WHICH KPI own the loudest
// signal within each individual transition axis?".
//
// Ops case: the P11.141 blend can be dominated by the loudest transition,
// masking the picture inside quieter transitions. If 12 of 15 hot cells
// this week are improvements, the P11.141 top_partner + top_metric will
// almost certainly reflect the improvement winners even if a smaller but
// far more urgent degradation cluster is sitting on a single partner and
// a single KPI. This drill-down surfaces the degradation-bucket winner
// alongside the improvement-bucket winner so the urgent-but-quieter
// signal never gets buried inside the blended roll-up.
//
// Pure derivation of the P11.139 envelope — no new folds, no scorecard
// replay, no new inputs. A caller who wants the loudest INDIVIDUAL cells
// reads P11.139; the BLENDED SCALAR SUMMARY reads P11.141; the PER-
// TRANSITION drill-down with per-bucket winners reads this module. The
// three surfaces stay strictly disjoint: this module never emits row-
// level hot-cell shape (that lives on the P11.139 envelope) and never
// emits blended cross-transition winners (they live on the P11.141
// envelope).
//
// Pure-lib-first per the P11.14 → P11.15 / P11.115 → P11.116 / ... /
// P11.141 → P11.142 cadence — cron-route wiring intentionally deferred
// to a follow-up tick (P11.144) so the per-transition bucket shape can
// be exercised in isolation before touching the hot Monday cron path
// (already hosting four grains of scorecard + four grains of verdict +
// four grains of transition + four grains of transition distribution +
// cross-grain family-alerts executive summary + per-partner cross-metric
// ranking + per-metric cross-partner ranking + per-pair hot-cells
// granular ranking + per-pair hot-cells scalar summary).
//
// Design notes:
//   • Fixed-key `buckets` shape {improved, degraded, rotated, undecidable}
//     so the JSONL envelope is stable regardless of which transitions
//     actually appear this week. A JSONL consumer joining bucket entries
//     by transition key across ticks always finds the complete set even
//     in weeks where only one transition fires.
//   • Every bucket carries {cells, sum_hot_score, max_hot_score,
//     top_partner|null, top_metric|null}. Empty buckets carry zeros +
//     null winners rather than being omitted — same stability rationale.
//   • Per-bucket top_partner tie-break: cells DESC → sum_hot_score DESC →
//     reseller_code ASC. Same shape + rationale as P11.141 top_partner
//     (a partner with more cells wins; within the same cell count the
//     louder-magnitude partner wins; within the same score the alpha-
//     early reseller_code wins for stable re-runs).
//   • Per-bucket top_metric tie-break: cells DESC → sum_hot_score DESC →
//     key ASC. Same shape + rationale as P11.141 top_metric. metric_name
//     is carried through from the first row for that key (all rows for
//     a given key share the same metric_name since it flows from
//     HEADLINE_METRICS).
//   • max_hot_score on both bucket winners surfaces whether the winner
//     is loud from a single MAX cell or from a broader distribution
//     within that transition — same rationale as P11.141.
//   • total_hot_cells envelope scalar mirrors P11.141 so the drill-down
//     can be quick-checked against the summary as a sanity total
//     (drilldown.total_hot_cells should always match summary.total_hot_cells
//     since both consume the same P11.139 envelope).
//   • Suppression envelope-wide (formatter side): `window_size < 3`
//     (matches every downstream grain's short-window guard) OR
//     `total_hot_cells === 0` (nothing to drill into). Empty individual
//     buckets are omitted from the visual table but STAY on the JSONL
//     envelope so a JSONL consumer never sees a truncated set.

import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";

type TransitionBucketKey = "improved" | "degraded" | "rotated" | "undecidable";

const BUCKET_KEYS: readonly TransitionBucketKey[] = [
  "improved",
  "degraded",
  "rotated",
  "undecidable",
];

export interface PerTransitionBucketTopPartner {
  readonly reseller_code: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerTransitionBucketTopMetric {
  readonly key: KnownKpiSection;
  readonly metric_name: string;
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
}

export interface PerTransitionBucket {
  readonly cells: number;
  readonly sum_hot_score: number;
  readonly max_hot_score: number;
  readonly top_partner: PerTransitionBucketTopPartner | null;
  readonly top_metric: PerTransitionBucketTopMetric | null;
}

export interface PerTransitionBuckets {
  readonly improved: PerTransitionBucket;
  readonly degraded: PerTransitionBucket;
  readonly rotated: PerTransitionBucket;
  readonly undecidable: PerTransitionBucket;
}

export interface DigestSnapshotPerTransitionHotCellsDrilldown {
  readonly window_size: number;
  readonly first_week: string | null;
  readonly last_week: string | null;
  readonly sustained_p90_threshold: number;
  readonly threshold: number;
  readonly total_hot_cells: number;
  readonly buckets: PerTransitionBuckets;
}

interface PartnerAgg {
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
}

interface MetricAgg {
  metric_name: string;
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
}

interface BucketAggregator {
  cells: number;
  sum_hot_score: number;
  max_hot_score: number;
  partners: Map<string, PartnerAgg>;
  metrics: Map<KnownKpiSection, MetricAgg>;
}

function emptyBucketAgg(): BucketAggregator {
  return {
    cells: 0,
    sum_hot_score: 0,
    max_hot_score: 0,
    partners: new Map(),
    metrics: new Map(),
  };
}

function isBucketKey(t: PerPairHotCellRow["transition"]): t is TransitionBucketKey {
  return (
    t === "improved" || t === "degraded" || t === "rotated" || t === "undecidable"
  );
}

function pickTopPartner(
  partners: Map<string, PartnerAgg>,
): PerTransitionBucketTopPartner | null {
  let winner: PerTransitionBucketTopPartner | null = null;
  for (const [reseller_code, agg] of partners) {
    if (winner === null) {
      winner = { reseller_code, ...agg };
      continue;
    }
    if (agg.cells > winner.cells) {
      winner = { reseller_code, ...agg };
      continue;
    }
    if (agg.cells === winner.cells) {
      if (agg.sum_hot_score > winner.sum_hot_score) {
        winner = { reseller_code, ...agg };
        continue;
      }
      if (
        agg.sum_hot_score === winner.sum_hot_score &&
        reseller_code < winner.reseller_code
      ) {
        winner = { reseller_code, ...agg };
      }
    }
  }
  return winner;
}

function pickTopMetric(
  metrics: Map<KnownKpiSection, MetricAgg>,
): PerTransitionBucketTopMetric | null {
  let winner: PerTransitionBucketTopMetric | null = null;
  for (const [key, agg] of metrics) {
    if (winner === null) {
      winner = { key, ...agg };
      continue;
    }
    if (agg.cells > winner.cells) {
      winner = { key, ...agg };
      continue;
    }
    if (agg.cells === winner.cells) {
      if (agg.sum_hot_score > winner.sum_hot_score) {
        winner = { key, ...agg };
        continue;
      }
      if (agg.sum_hot_score === winner.sum_hot_score && key < winner.key) {
        winner = { key, ...agg };
      }
    }
  }
  return winner;
}

function finaliseBucket(agg: BucketAggregator): PerTransitionBucket {
  return {
    cells: agg.cells,
    sum_hot_score: agg.sum_hot_score,
    max_hot_score: agg.max_hot_score,
    top_partner: pickTopPartner(agg.partners),
    top_metric: pickTopMetric(agg.metrics),
  };
}

/**
 * Partition the P11.139 per-pair hot-cells envelope BY transition and pick
 * a per-bucket top-partner + top-KPI winner PER bucket. Complements the
 * P11.141 blended scalar summary with a per-transition drill-down so the
 * urgent-but-quieter degradation cluster never gets buried inside the
 * blended winner picks.
 *
 * Per-bucket winner tie-break for top_partner and top_metric:
 *   cells DESC → sum_hot_score DESC → identity ASC.
 */
export function computeDigestSnapshotPerTransitionHotCellsDrilldown(
  hotCells: DigestSnapshotPerPairHotCells,
): DigestSnapshotPerTransitionHotCellsDrilldown {
  const aggregators: Record<TransitionBucketKey, BucketAggregator> = {
    improved: emptyBucketAgg(),
    degraded: emptyBucketAgg(),
    rotated: emptyBucketAgg(),
    undecidable: emptyBucketAgg(),
  };

  let total_hot_cells = 0;

  for (const r of hotCells.rows) {
    if (!isBucketKey(r.transition)) continue;
    total_hot_cells += 1;

    const agg = aggregators[r.transition];
    agg.cells += 1;
    agg.sum_hot_score += r.hot_score;
    if (r.hot_score > agg.max_hot_score) agg.max_hot_score = r.hot_score;

    const partner = agg.partners.get(r.reseller_code) ?? {
      cells: 0,
      sum_hot_score: 0,
      max_hot_score: 0,
    };
    partner.cells += 1;
    partner.sum_hot_score += r.hot_score;
    if (r.hot_score > partner.max_hot_score) partner.max_hot_score = r.hot_score;
    agg.partners.set(r.reseller_code, partner);

    const metric = agg.metrics.get(r.key) ?? {
      metric_name: r.metric_name,
      cells: 0,
      sum_hot_score: 0,
      max_hot_score: 0,
    };
    metric.cells += 1;
    metric.sum_hot_score += r.hot_score;
    if (r.hot_score > metric.max_hot_score) metric.max_hot_score = r.hot_score;
    agg.metrics.set(r.key, metric);
  }

  return {
    window_size: hotCells.window_size,
    first_week: hotCells.first_week,
    last_week: hotCells.last_week,
    sustained_p90_threshold: hotCells.sustained_p90_threshold,
    threshold: hotCells.threshold,
    total_hot_cells,
    buckets: {
      improved: finaliseBucket(aggregators.improved),
      degraded: finaliseBucket(aggregators.degraded),
      rotated: finaliseBucket(aggregators.rotated),
      undecidable: finaliseBucket(aggregators.undecidable),
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

function bucketLabel(k: TransitionBucketKey): string {
  if (k === "improved") return "improved &uarr;";
  if (k === "degraded") return "degraded &darr;";
  if (k === "rotated") return "rotated &harr;";
  return "undecidable ?";
}

function renderWinnerCell(
  bucket: PerTransitionBucket,
  which: "partner" | "metric",
): string {
  if (which === "partner") {
    const w = bucket.top_partner;
    if (w === null) return "&mdash;";
    return `<strong>${escapeHtml(w.reseller_code)}</strong> (${w.cells} cells, sum ${w.sum_hot_score}, max ${w.max_hot_score})`;
  }
  const w = bucket.top_metric;
  if (w === null) return "&mdash;";
  return `<strong>${escapeHtml(w.metric_name)}</strong> (${w.cells} cells, sum ${w.sum_hot_score}, max ${w.max_hot_score})`;
}

/**
 * Render the per-transition hot-cells drill-down as a table: one row per
 * non-empty transition bucket with per-bucket totals + per-bucket top-
 * partner + per-bucket top-KPI winners. Designed to splice IMMEDIATELY
 * BELOW the P11.141 scalar summary and IMMEDIATELY ABOVE the P11.139
 * granular per-pair hot-cells table so the hierarchy descends
 * per-metric ranking (P11.137) → per-pair hot-cells SUMMARY (P11.141) →
 * per-transition DRILL-DOWN (P11.143) → per-pair hot-cells GRANULAR
 * (P11.139) → per-pair scalar distribution (P11.130). Ops reads the
 * blended executive-summary lead first, then the per-transition drill-
 * down to spot urgent-but-quieter buckets, then the granular table for
 * the specific cells behind each bucket.
 *
 * Returns "" when window_size < 3 (matches every downstream grain
 * suppression on the same short-window guard) OR when total_hot_cells
 * is 0 (nothing to drill into — the granular P11.139 table and P11.141
 * scalar summary also suppress in this case so the whole hot-cells
 * block collapses).
 *
 * Empty buckets are OMITTED from the visual table but STAY on the JSONL
 * envelope with zero scalars + null winners so a JSONL consumer never
 * sees a truncated set.
 */
export function formatDigestSnapshotPerTransitionHotCellsDrilldownSection(
  snapshot: DigestSnapshotPerTransitionHotCellsDrilldown,
): string {
  if (snapshot.window_size < 3) return "";
  if (snapshot.total_hot_cells === 0) return "";

  const firstWeek = snapshot.first_week ? escapeHtml(snapshot.first_week) : "";
  const lastWeek = snapshot.last_week ? escapeHtml(snapshot.last_week) : "";
  const thresholdPct = (snapshot.threshold * 100).toFixed(1);

  const rowsHtml = BUCKET_KEYS.filter((k) => snapshot.buckets[k].cells > 0)
    .map((k) => {
      const b = snapshot.buckets[k];
      return `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${bucketLabel(k)}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${b.cells}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${b.sum_hot_score}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${b.max_hot_score}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${renderWinnerCell(b, "partner")}</td><td style="padding:4px 8px;border-bottom:1px solid #eee">${renderWinnerCell(b, "metric")}</td></tr>`;
    })
    .join("");

  return `
    <h3 style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px">Per-transition hot-cells drill-down across the ${snapshot.window_size}-week window (${firstWeek} &rarr; ${lastWeek}) at the ${thresholdPct}% magnitude threshold, sustained bar p90 &ge; ${snapshot.sustained_p90_threshold}</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Partitions the ${snapshot.total_hot_cells} hot cells above BY transition so an urgent-but-quieter degradation bucket does not get buried inside the blended scalar summary. Per-bucket top-partner + top-KPI winners tie-break cells DESC &rarr; sum_hot_score DESC &rarr; identity ASC. Empty buckets omitted from this table but stay on the JSONL envelope with zero scalars + null winners.</p>
    <table style="font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;margin-top:4px">
      <thead>
        <tr><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">transition</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">cells</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">sum hot_score</th><th style="padding:4px 8px;text-align:right;border-bottom:2px solid #333">max hot_score</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">loudest partner</th><th style="padding:4px 8px;text-align:left;border-bottom:2px solid #333">loudest KPI</th></tr>
      </thead>
      <tbody>${rowsHtml}
      </tbody>
    </table>`;
}
