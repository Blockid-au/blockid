import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { computeDigestSnapshotDirectionStreaks } from "./digest-snapshot-direction-streaks";
import { computeDigestSnapshotPctChangeStreaks } from "./digest-snapshot-pct-change-streaks";
import { computeDigestSnapshotPersistenceScorecard } from "./digest-snapshot-persistence-scorecard";
import {
  computeDigestSnapshotPersistenceScorecardVerdict,
  DEFAULT_SUSTAINED_P90_THRESHOLD,
  formatDigestSnapshotPersistenceScorecardVerdictSection,
} from "./digest-snapshot-persistence-scorecard-verdict";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

function mrrSnap(idx: number, cents: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: cents }] },
  });
}

function bothSnap(idx: number, cents: number, churn: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: cents }] },
    attributed_churn_30d: { rows: [{ churned_count: churn }] },
  });
}

function scorecardFor(snaps: ReturnType<typeof mrrSnap>[]) {
  const trend = computeDigestSnapshotRollingTrend(snaps);
  const dir = computeDigestSnapshotDirectionStreaks(trend);
  const mag = computeDigestSnapshotPctChangeStreaks(trend);
  return computeDigestSnapshotPersistenceScorecard(dir, mag);
}

describe("computeDigestSnapshotPersistenceScorecardVerdict — ladder", () => {
  it("emits `insufficient_window` when window_size < 3", () => {
    const scorecard = scorecardFor([mrrSnap(0, 100), mrrSnap(1, 200)]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.verdict).toBe("insufficient_window");
    expect(v.direction_sustained).toBe(false);
    expect(v.magnitude_sustained).toBe(false);
    expect(v.summary).toContain("Insufficient window");
  });

  it("emits `flat` when window is long enough but both axes have zero streaks", () => {
    // Three constant-value snapshots: no direction transitions, no |Δ%|
    // material moves. Both axes zero-fill.
    const scorecard = scorecardFor([
      mrrSnap(0, 100),
      mrrSnap(1, 100),
      mrrSnap(2, 100),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.verdict).toBe("flat");
    expect(v.direction_sustained).toBe(false);
    expect(v.magnitude_sustained).toBe(false);
    expect(v.summary).toContain("Flat portfolio");
  });

  it("emits `sustained_both_axes` when both axes clear the p90 bar", () => {
    // MRR + churn each build one length-4 sustained-direction streak that
    // ALSO clears 25% on every transition. p90 = 4 on both axes ≥ 3.
    const scorecard = scorecardFor([
      bothSnap(0, 100, 100),
      bothSnap(1, 200, 60),
      bothSnap(2, 400, 30),
      bothSnap(3, 800, 15),
      bothSnap(4, 1600, 5),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.verdict).toBe("sustained_both_axes");
    expect(v.direction_sustained).toBe(true);
    expect(v.magnitude_sustained).toBe(true);
    expect(v.summary).toContain("BOTH axes");
    expect(v.summary).toContain("direction p90=4");
    expect(v.summary).toContain("magnitude p90=4");
  });

  it("emits `sustained_direction_only` when direction persists but magnitude stays flat", () => {
    // MRR moves +2%/+2%/+2%/+2% (sustained direction but well below 25%
    // magnitude bar). Direction: one length-4 streak, p90=4. Magnitude:
    // zero streaks.
    const scorecard = scorecardFor([
      mrrSnap(0, 10000),
      mrrSnap(1, 10200),
      mrrSnap(2, 10404),
      mrrSnap(3, 10612),
      mrrSnap(4, 10824),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.verdict).toBe("sustained_direction_only");
    expect(v.direction_sustained).toBe(true);
    expect(v.magnitude_sustained).toBe(false);
    expect(v.summary).toContain("DIRECTION axis only");
    expect(v.summary).toContain("magnitude p90=0");
  });

  it("emits `volatile` when streaks exist but neither axis p90 clears the bar", () => {
    // Two length-2 up-streaks separated by a length-1 down (which is below
    // min_streak_length=2 and gets filtered). Direction: streaks exist with
    // p90=2 < 3 → not sustained. Magnitude: sub-1% moves stay well inside
    // the amber band → zero streaks. Verdict = volatile (direction streaks
    // exist but do not clear the bar; magnitude is empty).
    const scorecard = scorecardFor([
      mrrSnap(0, 10000),
      mrrSnap(1, 10200),
      mrrSnap(2, 10404),
      mrrSnap(3, 10300),
      mrrSnap(4, 10400),
      mrrSnap(5, 10504),
      mrrSnap(6, 10400),
      mrrSnap(7, 10500),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.verdict).toBe("volatile");
    expect(v.direction_sustained).toBe(false);
    expect(v.magnitude_sustained).toBe(false);
    expect(v.summary).toContain("volatile");
    expect(v.summary).toContain("neither axis p90 clears");
  });
});

describe("computeDigestSnapshotPersistenceScorecardVerdict — threshold override", () => {
  it("respects a stricter sustained_p90_threshold override", () => {
    // Same input as the `sustained_both_axes` case above (p90=4 on both
    // axes). At default threshold=3 → sustained_both. At threshold=5 →
    // neither axis clears the bar → volatile.
    const scorecard = scorecardFor([
      bothSnap(0, 100, 100),
      bothSnap(1, 200, 60),
      bothSnap(2, 400, 30),
      bothSnap(3, 800, 15),
      bothSnap(4, 1600, 5),
    ]);
    const strict = computeDigestSnapshotPersistenceScorecardVerdict(
      scorecard,
      5,
    );
    expect(strict.verdict).toBe("volatile");
    expect(strict.sustained_p90_threshold).toBe(5);
    expect(strict.direction_sustained).toBe(false);
    expect(strict.magnitude_sustained).toBe(false);
  });

  it("carries the default threshold constant onto the emitted envelope", () => {
    const scorecard = scorecardFor([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.sustained_p90_threshold).toBe(DEFAULT_SUSTAINED_P90_THRESHOLD);
    expect(DEFAULT_SUSTAINED_P90_THRESHOLD).toBe(3);
  });
});

describe("formatDigestSnapshotPersistenceScorecardVerdictSection", () => {
  it("returns empty string for insufficient_window (matches scorecard formatter suppression)", () => {
    const scorecard = scorecardFor([mrrSnap(0, 100), mrrSnap(1, 200)]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.verdict).toBe("insufficient_window");
    expect(formatDigestSnapshotPersistenceScorecardVerdictSection(v)).toBe("");
  });

  it("returns empty string for flat (matches scorecard formatter suppression)", () => {
    const scorecard = scorecardFor([
      mrrSnap(0, 100),
      mrrSnap(1, 100),
      mrrSnap(2, 100),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    expect(v.verdict).toBe("flat");
    expect(formatDigestSnapshotPersistenceScorecardVerdictSection(v)).toBe("");
  });

  it("renders sustained_both_axes caption with the token badge + summary", () => {
    const scorecard = scorecardFor([
      bothSnap(0, 100, 100),
      bothSnap(1, 200, 60),
      bothSnap(2, 400, 30),
      bothSnap(3, 800, 15),
      bothSnap(4, 1600, 5),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    const html = formatDigestSnapshotPersistenceScorecardVerdictSection(v);
    expect(html).toContain("Portfolio persistence verdict");
    expect(html).toContain("sustained_both_axes");
    expect(html).toContain("BOTH axes");
    expect(html).toContain("direction p90=4");
    expect(html).toContain("magnitude p90=4");
  });

  it("renders volatile caption with the disambiguating summary", () => {
    const scorecard = scorecardFor([
      mrrSnap(0, 10000),
      mrrSnap(1, 10200),
      mrrSnap(2, 10404),
      mrrSnap(3, 10300),
      mrrSnap(4, 10400),
      mrrSnap(5, 10504),
      mrrSnap(6, 10400),
      mrrSnap(7, 10500),
    ]);
    const v = computeDigestSnapshotPersistenceScorecardVerdict(scorecard);
    const html = formatDigestSnapshotPersistenceScorecardVerdictSection(v);
    expect(v.verdict).toBe("volatile");
    expect(html).toContain("volatile");
    expect(html).toContain("neither axis p90 clears");
  });

  it("escapes HTML meta-characters in the summary and token", () => {
    const html = formatDigestSnapshotPersistenceScorecardVerdictSection({
      verdict: "volatile",
      sustained_p90_threshold: 3,
      direction_sustained: false,
      magnitude_sustained: false,
      summary: "<script>alert(1)</script> & 'quotes'",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });
});
