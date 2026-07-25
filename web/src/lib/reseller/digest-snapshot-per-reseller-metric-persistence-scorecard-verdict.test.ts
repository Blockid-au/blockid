import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { computeDigestSnapshotPerResellerMetricPersistenceScorecard } from "./digest-snapshot-per-reseller-metric-persistence-scorecard";
import {
  computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict,
  DEFAULT_SUSTAINED_P90_THRESHOLD,
  formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict";

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

function scorecardFromSnaps(snaps: ReturnType<typeof mrrSnap>[]) {
  const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
  return computeDigestSnapshotPerResellerMetricPersistenceScorecard(trend);
}

describe("computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict — envelope", () => {
  it("carries window metadata + sustained_p90_threshold + magnitude threshold through", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    expect(v.window_size).toBe(3);
    expect(v.sustained_p90_threshold).toBe(DEFAULT_SUSTAINED_P90_THRESHOLD);
    expect(v.threshold).toBe(scorecard.threshold);
    expect(v.first_week).toBe(scorecard.first_week);
    expect(v.last_week).toBe(scorecard.last_week);
  });

  it("preserves scorecard rows in the same (spec order + reseller_code asc) order", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [
        { reseller_code: "ZEBRA", mrr_cents: 100 },
        { reseller_code: "ACME", mrr_cents: 100 },
        { reseller_code: "MID", mrr_cents: 100 },
      ]),
      mrrSnap(1, [
        { reseller_code: "ZEBRA", mrr_cents: 200 },
        { reseller_code: "ACME", mrr_cents: 200 },
        { reseller_code: "MID", mrr_cents: 200 },
      ]),
      mrrSnap(2, [
        { reseller_code: "ZEBRA", mrr_cents: 400 },
        { reseller_code: "ACME", mrr_cents: 400 },
        { reseller_code: "MID", mrr_cents: 400 },
      ]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    expect(
      v.rows.map((r) => `${r.reseller_code}:${r.key}`),
    ).toEqual(scorecard.rows.map((r) => `${r.reseller_code}:${r.key}`));
  });

  it("emits empty rows[] when scorecard has zero qualifying rows", () => {
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    expect(v.rows).toEqual([]);
  });

  it("passes through metric_name, key, and unit on every row", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    const row = v.rows.find((r) => r.reseller_code === "ACME");
    expect(row).toBeDefined();
    expect(row!.key).toBe("attributed_mrr");
    expect(row!.metric_name).toBe("mrr_cents");
    expect(row!.unit).toBe("cents");
  });
});

describe("computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict — ladder per row", () => {
  it("emits `insufficient_window` for every row when window_size < 3", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    for (const row of v.rows) {
      expect(row.verdict).toBe("insufficient_window");
      expect(row.direction_sustained).toBe(false);
      expect(row.magnitude_sustained).toBe(false);
      expect(row.summary).toContain("Insufficient window");
    }
  });

  it("emits `sustained_both_axes` for a pair that persists on both axes", () => {
    // MRR doubling every week for ACME → 4 same-sign +100% steps. Both axes
    // hit length=4 for (ACME × attributed_mrr).
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    const acme = v.rows.find((r) => r.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.verdict).toBe("sustained_both_axes");
    expect(acme!.direction_sustained).toBe(true);
    expect(acme!.magnitude_sustained).toBe(true);
    expect(acme!.summary).toContain("BOTH axes");
    expect(acme!.summary).toContain("direction length=4");
    expect(acme!.summary).toContain("magnitude length=4");
    expect(acme!.summary).toContain("ACME × mrr_cents");
  });

  it("emits `sustained_direction_only` when direction persists but magnitude stays inside the amber band", () => {
    // +2%/+2%/+2%/+2% MRR for ACME — direction runs length 4. Magnitude never
    // clears 25% → zero magnitude streaks (magnitude block zero-filled).
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 10000 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 10200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 10404 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 10612 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 10824 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    const acme = v.rows.find((r) => r.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.verdict).toBe("sustained_direction_only");
    expect(acme!.direction_sustained).toBe(true);
    expect(acme!.magnitude_sustained).toBe(false);
    expect(acme!.summary).toContain("DIRECTION axis only");
    expect(acme!.summary).toContain("magnitude length=0");
  });

  it("emits `flat` for a hand-constructed pair with zero-filled BOTH axes", () => {
    // The P11.119 scorecard skips pairs missing from BOTH axes, so to observe
    // the `flat` verdict directly, hand-construct a scorecard row with a
    // qualifying window but zero-filled blocks.
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict({
        window_size: 3,
        first_week: "2026-W28",
        last_week: "2026-W30",
        min_streak_length: 2,
        threshold: 0.25,
        rows: [
          {
            reseller_code: "QUIET",
            key: "attributed_mrr",
            metric_name: "Attributed MRR",
            unit: "cents",
            direction: {
              length: 0,
              streak_direction: null,
              first_week: "",
              last_week: "",
              cumulative_delta: 0,
            },
            magnitude: {
              length: 0,
              first_week: "",
              last_week: "",
              max_abs_pct: 0,
              min_abs_pct: 0,
            },
          },
        ],
      });
    expect(v.rows[0].verdict).toBe("flat");
    expect(v.rows[0].summary).toContain("flat");
    expect(v.rows[0].direction_sustained).toBe(false);
    expect(v.rows[0].magnitude_sustained).toBe(false);
  });

  it("emits `volatile` when both axes have qualifying streaks but neither clears the sustained bar", () => {
    // Hand-construct a pair with dirLen=2 and magLen=2 — both above the
    // min_streak_length=2 emission bar but below sustainedP90Threshold=3.
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict({
        window_size: 4,
        first_week: "2026-W28",
        last_week: "2026-W31",
        min_streak_length: 2,
        threshold: 0.25,
        rows: [
          {
            reseller_code: "WOBBLY",
            key: "attributed_mrr",
            metric_name: "Attributed MRR",
            unit: "cents",
            direction: {
              length: 2,
              streak_direction: "up",
              first_week: "2026-W28",
              last_week: "2026-W29",
              cumulative_delta: 500,
            },
            magnitude: {
              length: 2,
              first_week: "2026-W28",
              last_week: "2026-W29",
              max_abs_pct: 40,
              min_abs_pct: 30,
            },
          },
        ],
      });
    expect(v.rows[0].verdict).toBe("volatile");
    expect(v.rows[0].direction_sustained).toBe(false);
    expect(v.rows[0].magnitude_sustained).toBe(false);
    expect(v.rows[0].summary).toContain("volatile");
    expect(v.rows[0].summary).toContain("direction length=2");
    expect(v.rows[0].summary).toContain("magnitude length=2");
  });

  it("emits `sustained_magnitude_only` for a hand-constructed pair with sustained magnitude but short direction", () => {
    // Hand-construct: magLen=4 (sustained), dirLen=1 (below emission bar, but
    // upstream would zero-fill to 0 — here we assert length=0 branch still
    // resolves the magnitude-only verdict correctly).
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict({
        window_size: 5,
        first_week: "2026-W28",
        last_week: "2026-W32",
        min_streak_length: 2,
        threshold: 0.25,
        rows: [
          {
            reseller_code: "SPIKY",
            key: "attributed_mrr",
            metric_name: "Attributed MRR",
            unit: "cents",
            direction: {
              length: 0,
              streak_direction: null,
              first_week: "",
              last_week: "",
              cumulative_delta: 0,
            },
            magnitude: {
              length: 4,
              first_week: "2026-W28",
              last_week: "2026-W31",
              max_abs_pct: 80,
              min_abs_pct: 30,
            },
          },
        ],
      });
    expect(v.rows[0].verdict).toBe("sustained_magnitude_only");
    expect(v.rows[0].direction_sustained).toBe(false);
    expect(v.rows[0].magnitude_sustained).toBe(true);
    expect(v.rows[0].summary).toContain("MAGNITUDE axis only");
    expect(v.rows[0].summary).toContain("|Δ%| length=4");
    expect(v.rows[0].summary).toContain("direction length=0");
  });

  it("respects a stricter sustained_p90_threshold override across every row", () => {
    // Same doubling-MRR case (length=4 on both axes) — at threshold=5 neither
    // axis clears, so the verdict falls to `volatile`.
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const strict =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
        5,
      );
    expect(strict.sustained_p90_threshold).toBe(5);
    const acme = strict.rows.find((r) => r.reseller_code === "ACME");
    expect(acme!.verdict).toBe("volatile");
    expect(acme!.direction_sustained).toBe(false);
    expect(acme!.magnitude_sustained).toBe(false);
  });

  it("labels the pair as 'reseller_code × metric_name' in every summary string", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "INFOVISION", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "INFOVISION", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "INFOVISION", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "INFOVISION", mrr_cents: 800 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    const row = v.rows.find((r) => r.reseller_code === "INFOVISION");
    expect(row).toBeDefined();
    expect(row!.summary).toContain("INFOVISION × mrr_cents");
  });
});

describe("formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection", () => {
  it("returns '' when window_size < 3", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    expect(
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection(
        v,
      ),
    ).toBe("");
  });

  it("returns '' when zero rows carry a renderable verdict (all flat/insufficient)", () => {
    const scorecard =
      computeDigestSnapshotPerResellerMetricPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    expect(
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection(
        v,
      ),
    ).toBe("");
  });

  it("suppresses `flat` and `insufficient_window` rows so only actionable pairs render", () => {
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection({
        window_size: 4,
        first_week: "2026-W28",
        last_week: "2026-W31",
        sustained_p90_threshold: DEFAULT_SUSTAINED_P90_THRESHOLD,
        threshold: 0.25,
        rows: [
          {
            reseller_code: "ACME",
            key: "attributed_mrr",
            metric_name: "Attributed MRR",
            unit: "cents",
            verdict: "sustained_both_axes",
            direction_sustained: true,
            magnitude_sustained: true,
            summary: "ACME × Attributed MRR sustained on BOTH axes.",
          },
          {
            reseller_code: "QUIET",
            key: "attributed_churn_30d",
            metric_name: "Attributed churn 30d",
            unit: "count",
            verdict: "flat",
            direction_sustained: false,
            magnitude_sustained: false,
            summary: "QUIET × Attributed churn 30d flat.",
          },
        ],
      });
    expect(html).toContain("ACME");
    expect(html).toContain("sustained_both_axes");
    expect(html).not.toContain("QUIET");
    expect(html).not.toContain("QUIET × Attributed churn 30d flat");
  });

  it("renders the sustained bar + magnitude threshold in the caption", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection(
        v,
      );
    expect(html).toContain("Per-(partner &times; metric) persistence verdict");
    expect(html).toContain("sustained bar length &ge; 3");
    // Mirrors P11.111 posture: the emitted threshold percent uses
    // `(verdict.threshold * 100).toFixed(1)`. Assert the same derivation.
    const thresholdPct = (v.threshold * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
    expect(html).toContain("sustained_both_axes");
  });

  it("renders BOTH Partner and Metric columns so pairs are visually joined", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "INFOVISION", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "INFOVISION", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "INFOVISION", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "INFOVISION", mrr_cents: 800 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdict(
        scorecard,
      );
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection(
        v,
      );
    expect(html).toContain("<th>Partner</th>");
    expect(html).toContain("<th>Metric</th>");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("mrr_cents");
  });

  it("escapes HTML meta-characters in reseller_code, metric_name, verdict token, and summary", () => {
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictSection({
        window_size: 3,
        first_week: "2026-W28",
        last_week: "2026-W30",
        sustained_p90_threshold: DEFAULT_SUSTAINED_P90_THRESHOLD,
        threshold: 0.25,
        rows: [
          {
            reseller_code: "<b>ACME</b> & 'quoted'",
            key: "attributed_mrr",
            metric_name: "<i>MRR</i>",
            unit: "cents",
            verdict: "volatile",
            direction_sustained: false,
            magnitude_sustained: false,
            summary: "<script>alert(1)</script> & 'quotes'",
          },
        ],
      });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>ACME</b>");
    expect(html).not.toContain("<i>MRR</i>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;ACME&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;MRR&lt;/i&gt;");
    expect(html).toContain("&amp;");
  });
});
