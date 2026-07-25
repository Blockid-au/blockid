import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { computeDigestSnapshotDirectionStreaks } from "./digest-snapshot-direction-streaks";
import { computeDigestSnapshotPctChangeStreaks } from "./digest-snapshot-pct-change-streaks";
import {
  computeDigestSnapshotPersistenceScorecard,
  formatDigestSnapshotPersistenceScorecardSection,
} from "./digest-snapshot-persistence-scorecard";

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

describe("computeDigestSnapshotPersistenceScorecard — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    expect(scorecard.window_size).toBe(3);
    expect(scorecard.first_week).toBe("2026-W28");
    expect(scorecard.last_week).toBe("2026-W30");
    expect(scorecard.min_streak_length).toBe(dir.min_streak_length);
    expect(scorecard.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero-filled blocks when both inputs are empty", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    expect(scorecard.direction.total_streaks).toBe(0);
    expect(scorecard.direction.p50_length).toBe(0);
    expect(scorecard.direction.p90_length).toBe(0);
    expect(scorecard.direction.mean_length).toBe(0);
    expect(scorecard.magnitude.total_streaks).toBe(0);
    expect(scorecard.magnitude.p50_length).toBe(0);
    expect(scorecard.magnitude.p90_length).toBe(0);
    expect(scorecard.magnitude.mean_length).toBe(0);
  });

  it("carries a widened magnitude threshold through the envelope", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend, 2, 0.5);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    expect(scorecard.threshold).toBe(0.5);
  });
});

describe("computeDigestSnapshotPersistenceScorecard — values", () => {
  it("mirrors P11.89 direction scalars + P11.91 magnitude scalars when both axes qualify", () => {
    // MRR + churn each build one length-4 sustained-direction streak that
    // ALSO clears 25% on every transition. Sorted lengths = [4, 4].
    // p50 = 4, p90 = 4, mean = 4, max = 4 on BOTH axes.
    const trend = computeDigestSnapshotRollingTrend([
      bothSnap(0, 100, 100),
      bothSnap(1, 200, 60),
      bothSnap(2, 400, 30),
      bothSnap(3, 800, 15),
      bothSnap(4, 1600, 5),
    ]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    expect(scorecard.direction.total_streaks).toBe(2);
    expect(scorecard.direction.p50_length).toBe(4);
    expect(scorecard.direction.p90_length).toBe(4);
    expect(scorecard.direction.mean_length).toBe(4);
    expect(scorecard.direction.max_length).toBe(4);
    expect(scorecard.magnitude.total_streaks).toBe(2);
    expect(scorecard.magnitude.p50_length).toBe(4);
    expect(scorecard.magnitude.p90_length).toBe(4);
    expect(scorecard.magnitude.mean_length).toBe(4);
    expect(scorecard.magnitude.max_length).toBe(4);
  });

  it("captures the direction-persistent-but-not-magnitude-persistent asymmetry", () => {
    // MRR moves +2%/+2%/+2% (sustained direction but well below 25%).
    // Direction axis: one length-3 streak. Magnitude axis: zero qualifying
    // streaks. Scorecard should show direction populated + magnitude zero-
    // filled so ops can see the asymmetry at a glance.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10200),
      mrrSnap(2, 10404),
      mrrSnap(3, 10612),
    ]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    expect(scorecard.direction.total_streaks).toBe(1);
    expect(scorecard.direction.max_length).toBe(3);
    expect(scorecard.magnitude.total_streaks).toBe(0);
    expect(scorecard.magnitude.p50_length).toBe(0);
    expect(scorecard.magnitude.mean_length).toBe(0);
  });
});

describe("formatDigestSnapshotPersistenceScorecardSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
    ]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    expect(formatDigestSnapshotPersistenceScorecardSection(scorecard)).toBe("");
  });

  it("returns '' when BOTH axes have zero streaks (flat portfolio week)", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    expect(formatDigestSnapshotPersistenceScorecardSection(scorecard)).toBe("");
  });

  it("renders a single consolidated table with a twin-block header + threshold caption", () => {
    const trend = computeDigestSnapshotRollingTrend([
      bothSnap(0, 100, 100),
      bothSnap(1, 200, 60),
      bothSnap(2, 400, 30),
    ]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    const html = formatDigestSnapshotPersistenceScorecardSection(scorecard);
    expect(html).toContain("<table");
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(1);
    expect(html).toContain("Direction axis");
    expect(html).toContain("Magnitude axis");
    expect(html).toContain("P11.89");
    expect(html).toContain("P11.91");
    const thresholdPct = (PCT_CHANGE_MATERIAL_THRESHOLD * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
  });

  it("renders when only one axis qualifies (direction populated, magnitude zero-filled)", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10200),
      mrrSnap(2, 10404),
      mrrSnap(3, 10612),
    ]);
    const dir = computeDigestSnapshotDirectionStreaks(trend);
    const mag = computeDigestSnapshotPctChangeStreaks(trend);
    const scorecard = computeDigestSnapshotPersistenceScorecard(dir, mag);
    const html = formatDigestSnapshotPersistenceScorecardSection(scorecard);
    expect(html).toContain("<table");
    expect(scorecard.direction.total_streaks).toBeGreaterThan(0);
    expect(scorecard.magnitude.total_streaks).toBe(0);
  });
});
