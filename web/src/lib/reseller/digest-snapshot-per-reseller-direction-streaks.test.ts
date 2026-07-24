import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerDirectionStreaks,
  formatDigestSnapshotPerResellerDirectionStreaksSection,
} from "./digest-snapshot-per-reseller-direction-streaks";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

function mrrRow(code: string, cents: number) {
  return { reseller_code: code, mrr_cents: cents };
}

function mrrSnap(idx: number, rows: Array<{ reseller_code: string; mrr_cents: number }>) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows },
  });
}

describe("computeDigestSnapshotPerResellerDirectionStreaks — shape", () => {
  it("passes through window metadata from the per-reseller trend envelope", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend);
    expect(streaks.window_size).toBe(3);
    expect(streaks.first_week).toBe("2026-W28");
    expect(streaks.last_week).toBe("2026-W30");
    expect(streaks.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("returns empty rows on empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend);
    expect(streaks.window_size).toBe(0);
    expect(streaks.rows).toEqual([]);
  });

  it("handles a malformed trend (non-array rows coerced to empty)", () => {
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      rows: undefined as unknown as never,
    });
    expect(streaks.rows).toEqual([]);
    expect(streaks.window_size).toBe(4);
  });

  it("coerces minStreakLength < 1 to DEFAULT_MIN_STREAK_LENGTH", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerDirectionStreaks(trend, 0).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerResellerDirectionStreaks(trend, -5).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerResellerDirectionStreaks(trend, NaN).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("floors fractional minStreakLength", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerDirectionStreaks(trend, 3.7).min_streak_length,
    ).toBe(3);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreaks — detection", () => {
  it("detects a length-2 up streak for a single partner", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend);
    const row = streaks.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    );
    expect(row).toBeDefined();
    expect(row!.direction).toBe("up");
    expect(row!.length).toBe(2);
    expect(row!.first_week).toBe("2026-W28");
    expect(row!.last_week).toBe("2026-W30");
    expect(row!.start_total).toBe(9900);
    expect(row!.end_total).toBe(15000);
    expect(row!.cumulative_delta).toBe(5100);
  });

  it("detects a length-3 down streak for one partner while another is flat", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 20000), mrrRow("ACME", 5000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 18000), mrrRow("ACME", 5000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 14000), mrrRow("ACME", 5000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 5000)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend);
    const info = streaks.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    );
    expect(info!.direction).toBe("down");
    expect(info!.length).toBe(3);
    expect(info!.cumulative_delta).toBe(-10000);
    // ACME is flat — no streak row.
    expect(
      streaks.rows.find(
        (r) => r.key === "attributed_mrr" && r.reseller_code === "ACME",
      ),
    ).toBeUndefined();
  });

  it("surfaces counter-balanced partners the portfolio walker would miss", () => {
    // INFOVISION slides -5000/week for 3 weeks (-15000 cumulative) while ACME
    // climbs +5000/week for 3 weeks (+15000 cumulative). Portfolio total is
    // flat every single week yet each partner ran a length-3 same-sign streak
    // — the exact case P11.32 was authored to expose.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 20000), mrrRow("ACME", 5000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000), mrrRow("ACME", 10000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 15000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 5000), mrrRow("ACME", 20000)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend);
    const info = streaks.rows.find((r) => r.reseller_code === "INFOVISION")!;
    const acme = streaks.rows.find((r) => r.reseller_code === "ACME")!;
    expect(info.direction).toBe("down");
    expect(info.length).toBe(3);
    expect(info.cumulative_delta).toBe(-15000);
    expect(acme.direction).toBe("up");
    expect(acme.length).toBe(3);
    expect(acme.cumulative_delta).toBe(15000);
  });

  it("excludes a partner whose longest streak is below minStreakLength", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 8000)]), // sign flip → longest = 1
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    expect(
      streaks.rows.find(
        (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
      ),
    ).toBeUndefined();
  });

  it("zero transition breaks the streak", () => {
    // 100 → 200 → 200 → 300 → 400: two length-1 up runs bracketing a flat.
    // Longest = length 2 (trailing 200→300→400).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 200)]),
      mrrSnap(3, [mrrRow("INFOVISION", 300)]),
      mrrSnap(4, [mrrRow("INFOVISION", 400)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    const row = streaks.rows.find((r) => r.reseller_code === "INFOVISION")!;
    expect(row.direction).toBe("up");
    expect(row.length).toBe(2);
    expect(row.start_total).toBe(200);
    expect(row.end_total).toBe(400);
  });

  it("null point does not extend a streak across the gap", () => {
    // Partner absent on middle snapshot → point.total === null for that week.
    // Pre-gap length 1, post-gap length 1, min=2 → no row.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, []), // INFOVISION absent → null point
      mrrSnap(3, [mrrRow("INFOVISION", 300)]),
      mrrSnap(4, [mrrRow("INFOVISION", 400)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    expect(
      streaks.rows.find((r) => r.reseller_code === "INFOVISION"),
    ).toBeUndefined();
  });

  it("all-flat partner produces no streak row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 100)]),
      mrrSnap(2, [mrrRow("INFOVISION", 100)]),
      mrrSnap(3, [mrrRow("INFOVISION", 100)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    expect(streaks.rows).toEqual([]);
  });

  it("sorts qualified rows by length desc primary, reseller_code asc secondary", () => {
    // INFOVISION: length-4 down streak. ACME: length-2 up streak. ZETA:
    // length-2 up streak. Expected order: INFOVISION (length 4), ACME
    // (length 2 alpha-first), ZETA (length 2 alpha-second).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [
        mrrRow("INFOVISION", 10000),
        mrrRow("ACME", 100),
        mrrRow("ZETA", 500),
      ]),
      mrrSnap(1, [
        mrrRow("INFOVISION", 9000),
        mrrRow("ACME", 200),
        mrrRow("ZETA", 600),
      ]),
      mrrSnap(2, [
        mrrRow("INFOVISION", 8000),
        mrrRow("ACME", 300),
        mrrRow("ZETA", 700),
      ]),
      mrrSnap(3, [
        mrrRow("INFOVISION", 7000),
        mrrRow("ACME", 300), // flat → ACME length stays at 2
        mrrRow("ZETA", 700), // flat → ZETA length stays at 2
      ]),
      mrrSnap(4, [
        mrrRow("INFOVISION", 6000),
        mrrRow("ACME", 300),
        mrrRow("ZETA", 700),
      ]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    const codes = streaks.rows
      .filter((r) => r.key === "attributed_mrr")
      .map((r) => r.reseller_code);
    expect(codes[0]).toBe("INFOVISION"); // length 4 dominates
    // Remaining length-2 rows sort alphabetically.
    const lengthTwo = codes.slice(1);
    expect(lengthTwo).toEqual([...lengthTwo].sort((a, b) => a.localeCompare(b)));
    // Global length monotonicity.
    for (let i = 1; i < streaks.rows.length; i++) {
      expect(streaks.rows[i].length).toBeLessThanOrEqual(
        streaks.rows[i - 1].length,
      );
    }
  });
});

describe("formatDigestSnapshotPerResellerDirectionStreaksSection", () => {
  it("returns empty string when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    expect(formatDigestSnapshotPerResellerDirectionStreaksSection(streaks)).toBe("");
  });

  it("returns empty string when no partner qualifies", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 100)]), // sign flip → length 1
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    expect(formatDigestSnapshotPerResellerDirectionStreaksSection(streaks)).toBe("");
  });

  it("renders an HTML table with reseller_code + direction arrow + formatted cells", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 20000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 5000)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotPerResellerDirectionStreaksSection(streaks);
    expect(html).toContain("Per-reseller sustained-direction streaks");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W31");
    expect(html).toContain("&darr;");
    expect(html).toContain("down");
    expect(html).toContain("A$200.00");
    expect(html).toContain("A$50.00");
    expect(html).toContain("-A$150.00");
  });

  it("renders count-unit metrics without the A$ prefix", () => {
    const snaps = [1, 2, 3, 4].map((n, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_churn_30d: {
          rows: [{ reseller_code: "INFOVISION", churned_count: n }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotPerResellerDirectionStreaksSection(streaks);
    expect(html).toContain("INFOVISION");
    expect(html).toContain("&uarr;");
    expect(html).toContain("+3"); // cumulative 1 → 4
    expect(html).not.toContain("A$3");
  });

  it("escapes HTML in reseller_code + week labels", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<w0>", T(0), {
        attributed_mrr: { rows: [mrrRow("<PWN>", 100)] },
      }),
      snap("<w1>", T(7), {
        attributed_mrr: { rows: [mrrRow("<PWN>", 200)] },
      }),
      snap("<w2>", T(14), {
        attributed_mrr: { rows: [mrrRow("<PWN>", 300)] },
      }),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotPerResellerDirectionStreaksSection(streaks);
    expect(html).not.toContain("<PWN>");
    expect(html).toContain("&lt;PWN&gt;");
    expect(html).not.toContain("<w0>");
    expect(html).toContain("&lt;w0&gt;");
    expect(html).toContain("&lt;w2&gt;");
  });

  it("highlights down streaks and leaves up streaks unhighlighted", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 300), mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200), mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 100), mrrRow("ACME", 300)]),
    ]);
    const streaks = computeDigestSnapshotPerResellerDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotPerResellerDirectionStreaksSection(streaks);
    expect(html).toContain("background:#fff8e1");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("ACME");
    // Both directions present — the highlight is scoped per row, not the
    // whole table.
    expect(html).toContain("&uarr;");
    expect(html).toContain("&darr;");
  });
});
