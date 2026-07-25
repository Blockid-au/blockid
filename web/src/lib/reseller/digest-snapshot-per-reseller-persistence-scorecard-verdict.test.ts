import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { computeDigestSnapshotPerResellerPersistenceScorecard } from "./digest-snapshot-per-reseller-persistence-scorecard";
import {
  computeDigestSnapshotPerResellerPersistenceScorecardVerdict,
  DEFAULT_SUSTAINED_P90_THRESHOLD,
  formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection,
} from "./digest-snapshot-per-reseller-persistence-scorecard-verdict";

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
  return computeDigestSnapshotPerResellerPersistenceScorecard(trend);
}

describe("computeDigestSnapshotPerResellerPersistenceScorecardVerdict — envelope", () => {
  it("carries window metadata + sustained_p90_threshold + magnitude threshold through", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    expect(v.window_size).toBe(3);
    expect(v.sustained_p90_threshold).toBe(DEFAULT_SUSTAINED_P90_THRESHOLD);
    expect(v.threshold).toBe(scorecard.threshold);
    expect(v.first_week).toBe(scorecard.first_week);
    expect(v.last_week).toBe(scorecard.last_week);
  });

  it("preserves scorecard rows in the same order (no re-sort)", () => {
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
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    expect(v.rows.map((r) => r.reseller_code)).toEqual(
      scorecard.rows.map((r) => r.reseller_code),
    );
  });

  it("emits empty rows[] when scorecard has zero qualifying rows", () => {
    const scorecard = computeDigestSnapshotPerResellerPersistenceScorecard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    const v =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    expect(v.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerResellerPersistenceScorecardVerdict — ladder per row", () => {
  it("emits `insufficient_window` for every row when window_size < 3", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    for (const row of v.rows) {
      expect(row.verdict).toBe("insufficient_window");
      expect(row.direction_sustained).toBe(false);
      expect(row.magnitude_sustained).toBe(false);
      expect(row.summary).toContain("Insufficient window");
    }
  });

  it("emits `sustained_both_axes` for a partner that persists on both axes", () => {
    // MRR doubling every week for ACME → 4 same-sign +100% steps. Both axes
    // hit p90=4 for ACME.
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    const acme = v.rows.find((r) => r.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.verdict).toBe("sustained_both_axes");
    expect(acme!.direction_sustained).toBe(true);
    expect(acme!.magnitude_sustained).toBe(true);
    expect(acme!.summary).toContain("BOTH axes");
    expect(acme!.summary).toContain("direction p90=4");
    expect(acme!.summary).toContain("magnitude p90=4");
  });

  it("emits `sustained_direction_only` when direction persists but magnitude stays inside the amber band", () => {
    // +2%/+2%/+2%/+2% MRR for ACME — direction runs length 4. Magnitude
    // never clears 25% → zero magnitude streaks.
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 10000 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 10200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 10404 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 10612 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 10824 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    const acme = v.rows.find((r) => r.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.verdict).toBe("sustained_direction_only");
    expect(acme!.direction_sustained).toBe(true);
    expect(acme!.magnitude_sustained).toBe(false);
    expect(acme!.summary).toContain("DIRECTION axis only");
    expect(acme!.summary).toContain("magnitude p90=0");
  });

  it("emits `flat` for a partner with zero streaks on both axes", () => {
    // The scorecard skips a partner missing from BOTH axes, so to observe
    // the `flat` verdict directly, hand-construct a scorecard row with a
    // qualifying window but zero-filled axes.
    const v = computeDigestSnapshotPerResellerPersistenceScorecardVerdict({
      window_size: 3,
      first_week: "2026-W28",
      last_week: "2026-W30",
      min_streak_length: 2,
      threshold: 0.25,
      rows: [
        {
          reseller_code: "QUIET",
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
    expect(v.rows[0].verdict).toBe("flat");
    expect(v.rows[0].summary).toContain("flat");
    expect(v.rows[0].direction_sustained).toBe(false);
    expect(v.rows[0].magnitude_sustained).toBe(false);
  });

  it("respects a stricter sustained_p90_threshold override across every row", () => {
    // Same doubling-MRR case (p90=4 on both axes) — at threshold=5 neither
    // axis clears, so the verdict falls to `volatile`.
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
      mrrSnap(2, [{ reseller_code: "ACME", mrr_cents: 400 }]),
      mrrSnap(3, [{ reseller_code: "ACME", mrr_cents: 800 }]),
      mrrSnap(4, [{ reseller_code: "ACME", mrr_cents: 1600 }]),
    ]);
    const strict =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(
        scorecard,
        5,
      );
    expect(strict.sustained_p90_threshold).toBe(5);
    const acme = strict.rows.find((r) => r.reseller_code === "ACME");
    expect(acme!.verdict).toBe("volatile");
    expect(acme!.direction_sustained).toBe(false);
    expect(acme!.magnitude_sustained).toBe(false);
  });
});

describe("formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection", () => {
  it("returns '' when window_size < 3", () => {
    const scorecard = scorecardFromSnaps([
      mrrSnap(0, [{ reseller_code: "ACME", mrr_cents: 100 }]),
      mrrSnap(1, [{ reseller_code: "ACME", mrr_cents: 200 }]),
    ]);
    const v =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection(v),
    ).toBe("");
  });

  it("returns '' when zero rows carry a renderable verdict (all flat/insufficient)", () => {
    const scorecard = computeDigestSnapshotPerResellerPersistenceScorecard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    const v =
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection(v),
    ).toBe("");
  });

  it("suppresses `flat` and `insufficient_window` rows so only actionable partners render", () => {
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection({
        window_size: 4,
        first_week: "2026-W28",
        last_week: "2026-W31",
        sustained_p90_threshold: DEFAULT_SUSTAINED_P90_THRESHOLD,
        threshold: 0.25,
        rows: [
          {
            reseller_code: "ACME",
            verdict: "sustained_both_axes",
            direction_sustained: true,
            magnitude_sustained: true,
            summary: "ACME sustained on BOTH axes.",
          },
          {
            reseller_code: "QUIET",
            verdict: "flat",
            direction_sustained: false,
            magnitude_sustained: false,
            summary: "QUIET flat.",
          },
        ],
      });
    expect(html).toContain("ACME");
    expect(html).toContain("sustained_both_axes");
    expect(html).not.toContain("QUIET");
    expect(html).not.toContain("QUIET flat");
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
      computeDigestSnapshotPerResellerPersistenceScorecardVerdict(scorecard);
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection(v);
    expect(html).toContain("Per-partner persistence verdict");
    expect(html).toContain("sustained bar p90 &ge; 3");
    // Mirrors P11.109 posture: the emitted threshold percent uses
    // `(scorecard.threshold * 100).toFixed(1)`. Assert the same derivation
    // so future threshold-scaling fixes track at the source.
    const thresholdPct = (scorecard.threshold * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
    expect(html).toContain("sustained_both_axes");
  });

  it("escapes HTML meta-characters in reseller_code, verdict token, and summary", () => {
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardVerdictSection({
        window_size: 3,
        first_week: "2026-W28",
        last_week: "2026-W30",
        sustained_p90_threshold: DEFAULT_SUSTAINED_P90_THRESHOLD,
        threshold: 0.25,
        rows: [
          {
            reseller_code: "<b>ACME</b> & 'quoted'",
            verdict: "volatile",
            direction_sustained: false,
            magnitude_sustained: false,
            summary: "<script>alert(1)</script> & 'quotes'",
          },
        ],
      });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>ACME</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;ACME&lt;/b&gt;");
    expect(html).toContain("&amp;");
  });
});
