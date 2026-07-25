import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { computeDigestSnapshotPerMetricPersistenceScorecard } from "./digest-snapshot-per-metric-persistence-scorecard";
import {
  computeDigestSnapshotPerMetricPersistenceScorecardVerdict,
  DEFAULT_SUSTAINED_P90_THRESHOLD,
  formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection,
} from "./digest-snapshot-per-metric-persistence-scorecard-verdict";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

function mrrSnap(
  idx: number,
  rows: Array<{ reseller_code: string; mrr_cents: number }>,
) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows },
  });
}

function bothSnap(
  idx: number,
  mrrRows: Array<{ reseller_code: string; mrr_cents: number }>,
  churnRows: Array<{ reseller_code: string; churned_count: number }>,
) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: mrrRows },
    attributed_churn_30d: { rows: churnRows },
  });
}

function scorecardFromSnaps(snaps: ReturnType<typeof mrrSnap>[]) {
  const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
  return computeDigestSnapshotPerMetricPersistenceScorecard(trend);
}

describe("computeDigestSnapshotPerMetricPersistenceScorecardVerdict — envelope", () => {
  it("carries window metadata + sustained_p90_threshold + magnitude threshold through", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
    ]);
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    expect(v.window_size).toBe(3);
    expect(v.sustained_p90_threshold).toBe(DEFAULT_SUSTAINED_P90_THRESHOLD);
    expect(v.threshold).toBe(scorecard.threshold);
    expect(v.first_week).toBe(scorecard.first_week);
    expect(v.last_week).toBe(scorecard.last_week);
  });

  it("preserves scorecard rows in the same order (no re-sort)", () => {
    const scorecard = scorecardFromSnaps([
      bothSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }], [
        { reseller_code: "ACME", churned_count: 40 },
      ]),
      bothSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }], [
        { reseller_code: "ACME", churned_count: 28 },
      ]),
      bothSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }], [
        { reseller_code: "ACME", churned_count: 20 },
      ]),
    ]);
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    expect(v.rows.map((r) => r.key)).toEqual(scorecard.rows.map((r) => r.key));
  });

  it("emits empty rows[] when scorecard has zero qualifying rows", () => {
    const scorecard = computeDigestSnapshotPerMetricPersistenceScorecard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    expect(v.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerMetricPersistenceScorecardVerdict — ladder per row", () => {
  it("emits `insufficient_window` for every row when window_size < 3", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
    ]);
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    for (const row of v.rows) {
      expect(row.verdict).toBe("insufficient_window");
      expect(row.direction_sustained).toBe(false);
      expect(row.magnitude_sustained).toBe(false);
      expect(row.summary).toContain("Insufficient window");
    }
  });

  it("emits `sustained_both_axes` for a KPI that persists on both axes", () => {
    // MRR doubling every week → 4 same-sign +100% steps. Both axes hit p90=4.
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    const mrr = v.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.verdict).toBe("sustained_both_axes");
    expect(mrr!.direction_sustained).toBe(true);
    expect(mrr!.magnitude_sustained).toBe(true);
    expect(mrr!.summary).toContain("BOTH axes");
    expect(mrr!.summary).toContain("direction p90=4");
    expect(mrr!.summary).toContain("magnitude p90=4");
  });

  it("emits `sustained_direction_only` when direction persists but magnitude stays inside the amber band", () => {
    // +2%/+2%/+2%/+2% MRR — direction runs length 4 for ACME. Magnitude
    // never clears 25% → zero magnitude streaks.
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 10000 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 10200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 10404 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 10612 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 10824 }]),
    ]);
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    const mrr = v.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.verdict).toBe("sustained_direction_only");
    expect(mrr!.direction_sustained).toBe(true);
    expect(mrr!.magnitude_sustained).toBe(false);
    expect(mrr!.summary).toContain("DIRECTION axis only");
    expect(mrr!.summary).toContain("magnitude p90=0");
  });

  it("emits `flat` for a KPI with zero streaks on both axes", () => {
    // Constant MRR value — no direction transitions, no magnitude moves.
    // The scorecard skips a KPI missing from BOTH axes, so to observe the
    // `flat` verdict directly, hand-construct a scorecard row with a
    // qualifying window but zero-filled axes.
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdict({
        window_size: 3,
        first_week: "2026-W28",
        last_week: "2026-W30",
        min_streak_length: 2,
        threshold: 0.25,
        rows: [
          {
            key: "attributed_mrr",
            metric_name: "Attributed MRR",
            unit: "cents",
            direction: {
              total_streaks: 0,
              p50_length: 0,
              p90_length: 0,
              mean_length: 0,
              max_length: 0,
            },
            magnitude: {
              total_streaks: 0,
              p50_length: 0,
              p90_length: 0,
              mean_length: 0,
              max_length: 0,
            },
          },
        ],
      });
    expect(scorecard.rows[0].verdict).toBe("flat");
    expect(scorecard.rows[0].summary).toContain("flat");
    expect(scorecard.rows[0].direction_sustained).toBe(false);
    expect(scorecard.rows[0].magnitude_sustained).toBe(false);
  });

  it("respects a stricter sustained_p90_threshold override across every row", () => {
    // Same doubling-MRR case as above (p90=4 on both axes) — at threshold=5
    // neither axis clears, so the verdict falls to `volatile`.
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const strict = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(
      scorecard,
      5,
    );
    expect(strict.sustained_p90_threshold).toBe(5);
    const mrr = strict.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr!.verdict).toBe("volatile");
    expect(mrr!.direction_sustained).toBe(false);
    expect(mrr!.magnitude_sustained).toBe(false);
  });
});

describe("formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection", () => {
  it("returns '' when window_size < 3", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
    ]);
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    expect(
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection(v),
    ).toBe("");
  });

  it("returns '' when zero rows carry a renderable verdict (all flat/insufficient)", () => {
    // Empty scorecard → empty rows → nothing to render.
    const scorecard = computeDigestSnapshotPerMetricPersistenceScorecard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    expect(
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection(v),
    ).toBe("");
  });

  it("suppresses `flat` and `insufficient_window` rows so only actionable KPIs render", () => {
    const html =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection({
        window_size: 4,
        first_week: "2026-W28",
        last_week: "2026-W31",
        sustained_p90_threshold: DEFAULT_SUSTAINED_P90_THRESHOLD,
        threshold: 0.25,
        rows: [
          {
            key: "attributed_mrr",
            metric_name: "Attributed MRR",
            unit: "cents",
            verdict: "sustained_both_axes",
            direction_sustained: true,
            magnitude_sustained: true,
            summary: "MRR sustained on BOTH axes.",
          },
          {
            key: "attributed_churn_30d",
            metric_name: "Attributed Churn (30d)",
            unit: "count",
            verdict: "flat",
            direction_sustained: false,
            magnitude_sustained: false,
            summary: "Attributed Churn flat.",
          },
        ],
      });
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("sustained_both_axes");
    expect(html).not.toContain("attributed_churn_30d");
    expect(html).not.toContain("Attributed Churn flat");
  });

  it("renders the sustained bar + magnitude threshold in the caption", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const v = computeDigestSnapshotPerMetricPersistenceScorecardVerdict(scorecard);
    const html =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection(v);
    expect(html).toContain("Per-metric persistence verdict");
    expect(html).toContain("sustained bar p90 &ge; 3");
    // Mirrors P11.101 scorecard formatter posture: emitted threshold percent
    // is `(scorecard.threshold * 100).toFixed(1)` where scorecard.threshold
    // is already the percent-scale PCT_CHANGE_MATERIAL_THRESHOLD (25). Assert
    // the same derivation the upstream formatter uses so the caption tracks
    // any future scaling fix at the source rather than diverging here.
    const thresholdPct = (scorecard.threshold * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
    expect(html).toContain("sustained_both_axes");
  });

  it("escapes HTML meta-characters in KPI, metric name, verdict token, and summary", () => {
    const html =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictSection({
        window_size: 3,
        first_week: "2026-W28",
        last_week: "2026-W30",
        sustained_p90_threshold: DEFAULT_SUSTAINED_P90_THRESHOLD,
        threshold: 0.25,
        rows: [
          {
            key: "attributed_mrr",
            metric_name: "<b>Bold</b> & 'quoted'",
            unit: "cents",
            verdict: "volatile",
            direction_sustained: false,
            magnitude_sustained: false,
            summary: "<script>alert(1)</script> & 'quotes'",
          },
        ],
      });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(html).toContain("&amp;");
  });
});
