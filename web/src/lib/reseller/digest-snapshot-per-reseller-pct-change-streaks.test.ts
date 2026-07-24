import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPerResellerPctChangeStreaks,
  formatDigestSnapshotPerResellerPctChangeStreaksSection,
} from "./digest-snapshot-per-reseller-pct-change-streaks";

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

function mrrSnap(
  idx: number,
  rows: Array<{ reseller_code: string; mrr_cents: number }>,
) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows },
  });
}

describe("computeDigestSnapshotPerResellerPctChangeStreaks — shape", () => {
  it("passes through window metadata + defaults", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]), // +30
      mrrSnap(2, [mrrRow("INFOVISION", 9750)]), // -25
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    expect(streaks.window_size).toBe(3);
    expect(streaks.first_week).toBe("2026-W28");
    expect(streaks.last_week).toBe("2026-W30");
    expect(streaks.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(streaks.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns empty rows on empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    expect(streaks.rows).toEqual([]);
    expect(streaks.window_size).toBe(0);
  });

  it("coerces non-array rows to empty", () => {
    const streaks = computeDigestSnapshotPerResellerPctChangeStreaks({
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
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 0)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, -3)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, NaN)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("floors fractional minStreakLength", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 3.7)
        .min_streak_length,
    ).toBe(3);
  });

  it("coerces non-positive threshold to PCT_CHANGE_MATERIAL_THRESHOLD", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 2, 0).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 2, -5).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 2, NaN).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreaks — streak walker", () => {
  it("surfaces a length-3 run of sign-alternating |pct| swings for one partner", () => {
    // INFOVISION: 10000 → 13000 (+30%) → 9750 (-25%) → 12200 (+25.1%)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9750)]),
      mrrSnap(3, [mrrRow("INFOVISION", 12200)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const row = streaks.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    );
    expect(row).toBeDefined();
    expect(row!.length).toBe(3);
    expect(row!.first_week).toBe("2026-W28");
    expect(row!.last_week).toBe("2026-W31");
    expect(row!.transitions.map((t) => t.pct_change)).toEqual([30, -25, 25.1]);
  });

  it("breaks the streak on a sub-threshold transition", () => {
    // 10000 → 13000 (+30%) → 13800 (+6.2%, sub) → 18000 (+30.4%)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 13800)]),
      mrrSnap(3, [mrrRow("INFOVISION", 18000)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 2);
    // Two isolated length-1 material transitions — neither reaches min 2.
    expect(
      streaks.rows.find((r) => r.reseller_code === "INFOVISION"),
    ).toBeUndefined();
  });

  it("breaks the streak on a launch-week (prev=0) transition", () => {
    // 0 → 5000 (undef) → 7000 (+40) → 3000 (-57.1) → 4000 (+33.3)
    // Streak starts at the 5000 → 7000 transition (0 → 5000 suppressed).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 0)]),
      mrrSnap(1, [mrrRow("INFOVISION", 5000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 7000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 3000)]),
      mrrSnap(4, [mrrRow("INFOVISION", 4000)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const row = streaks.rows.find(
      (r) => r.reseller_code === "INFOVISION",
    );
    expect(row).toBeDefined();
    expect(row!.length).toBe(3);
    expect(row!.first_week).toBe("2026-W29");
    expect(row!.last_week).toBe("2026-W32");
  });

  it("null (partner-absent) point breaks the streak across the gap", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]), // +50
      mrrSnap(2, []), // INFOVISION absent → null
      mrrSnap(3, [mrrRow("INFOVISION", 20000)]),
      mrrSnap(4, [mrrRow("INFOVISION", 30000)]), // +50
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    // Two isolated length-1 runs — neither reaches min 2.
    expect(
      streaks.rows.find((r) => r.reseller_code === "INFOVISION"),
    ).toBeUndefined();
  });

  it("captures min/max |pct| per row", () => {
    // +30, -50, +26 → max 50, min 26
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 6500)]),
      mrrSnap(3, [mrrRow("INFOVISION", 8190)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const row = streaks.rows.find(
      (r) => r.reseller_code === "INFOVISION",
    )!;
    expect(row.max_abs_pct).toBe(50);
    expect(row.min_abs_pct).toBe(26);
  });

  it("respects a caller-widened min streak length", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]), // +30
      mrrSnap(2, [mrrRow("INFOVISION", 9750)]), // -25
    ]);
    const rowsDefault =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 2);
    expect(rowsDefault.rows).toHaveLength(1);
    const rowsWide =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend, 3);
    expect(rowsWide.rows).toEqual([]);
  });

  it("keeps the earlier-starting run on tied lengths (per partner)", () => {
    // +30, +40, -9.9 (sub), +30, +40 → two length-2 runs; earlier one wins.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 18200)]),
      mrrSnap(3, [mrrRow("INFOVISION", 16400)]),
      mrrSnap(4, [mrrRow("INFOVISION", 21320)]),
      mrrSnap(5, [mrrRow("INFOVISION", 29850)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const row = streaks.rows.find(
      (r) => r.reseller_code === "INFOVISION",
    )!;
    expect(row.length).toBe(2);
    expect(row.first_week).toBe("2026-W28");
    expect(row.last_week).toBe("2026-W30");
  });

  it("surfaces counter-balanced partners the portfolio walker would miss", () => {
    // INFOVISION oscillates materially (+30, -30, +30) while ACME oscillates
    // materially in mirror (-30, +30, -30). Portfolio total stays roughly flat
    // yet each partner runs a length-3 |pct|-material streak — the exact case
    // P11.51 was authored to expose against P11.49.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000), mrrRow("ACME", 7000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9100), mrrRow("ACME", 9100)]),
      mrrSnap(3, [mrrRow("INFOVISION", 11830), mrrRow("ACME", 6370)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const info = streaks.rows.find((r) => r.reseller_code === "INFOVISION")!;
    const acme = streaks.rows.find((r) => r.reseller_code === "ACME")!;
    expect(info.length).toBe(3);
    expect(acme.length).toBe(3);
  });

  it("sorts qualified rows by length desc, reseller_code asc, spec order", () => {
    // INFOVISION: length-3 |pct| streak. ACME + ZETA: length-2 |pct| streaks.
    // Expect INFOVISION first (length 3), then ACME before ZETA (alpha).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [
        mrrRow("INFOVISION", 10000),
        mrrRow("ACME", 1000),
        mrrRow("ZETA", 1000),
      ]),
      mrrSnap(1, [
        mrrRow("INFOVISION", 13000), // +30
        mrrRow("ACME", 1400), // +40
        mrrRow("ZETA", 1400), // +40
      ]),
      mrrSnap(2, [
        mrrRow("INFOVISION", 9100), // -30
        mrrRow("ACME", 900), // -35.7
        mrrRow("ZETA", 900), // -35.7
      ]),
      mrrSnap(3, [
        mrrRow("INFOVISION", 12000), // +31.9
        mrrRow("ACME", 900), // flat → sub-threshold
        mrrRow("ZETA", 900), // flat → sub-threshold
      ]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const codes = streaks.rows
      .filter((r) => r.key === "attributed_mrr")
      .map((r) => r.reseller_code);
    expect(codes[0]).toBe("INFOVISION");
    const lengthTwo = codes.slice(1);
    expect(lengthTwo).toEqual(
      [...lengthTwo].sort((a, b) => a.localeCompare(b)),
    );
    for (let i = 1; i < streaks.rows.length; i++) {
      expect(streaks.rows[i].length).toBeLessThanOrEqual(
        streaks.rows[i - 1].length,
      );
    }
  });
});

describe("formatDigestSnapshotPerResellerPctChangeStreaksSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeStreaksSection(streaks),
    ).toBe("");
  });

  it("returns empty on zero qualifying rows", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 10100)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10200)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeStreaksSection(streaks),
    ).toBe("");
  });

  it("renders headers, reseller_code, length column and transitions cell", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]), // +30
      mrrSnap(2, [mrrRow("INFOVISION", 9750)]), // -25
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreaksSection(streaks);
    expect(html).toContain("Per-reseller sustained |pct|-material streaks");
    expect(html).toContain("Reseller");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("Length");
    expect(html).toContain("Transitions");
    expect(html).toContain("+30.0%");
    expect(html).toContain("-25.0%");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
  });

  it("HTML-escapes reseller_code + week labels", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<w0>", T(0), {
        attributed_mrr: { rows: [mrrRow("<PWN>", 10000)] },
      }),
      snap("<w1>", T(7), {
        attributed_mrr: { rows: [mrrRow("<PWN>", 13000)] },
      }),
      snap("<w2>", T(14), {
        attributed_mrr: { rows: [mrrRow("<PWN>", 9750)] },
      }),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreaksSection(streaks);
    expect(html).not.toContain("<PWN>");
    expect(html).toContain("&lt;PWN&gt;");
    expect(html).not.toContain("<w0>");
    expect(html).toContain("&lt;w0&gt;");
    expect(html).toContain("&lt;w2&gt;");
  });

  it("references the threshold constant in the preamble", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9750)]),
    ]);
    const streaks =
      computeDigestSnapshotPerResellerPctChangeStreaks(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreaksSection(streaks);
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
  });
});
