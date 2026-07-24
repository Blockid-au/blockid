import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_TOP_N,
  computeDigestSnapshotTopMovers,
  formatDigestSnapshotTopMoversSection,
} from "./digest-snapshot-top-movers";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotTopMovers — shape", () => {
  it("passes through window metadata from the trend envelope", () => {
    const snaps = [9900, 19700].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend);
    expect(top.window_size).toBe(2);
    expect(top.first_week).toBe("2026-W28");
    expect(top.last_week).toBe("2026-W29");
    expect(top.top_n).toBe(DEFAULT_TOP_N);
  });

  it("returns empty rows on an empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const top = computeDigestSnapshotTopMovers(trend);
    expect(top.window_size).toBe(0);
    expect(top.rows).toEqual([]);
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const top = computeDigestSnapshotTopMovers({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      rows: undefined as unknown as never,
    });
    expect(top.rows).toEqual([]);
    expect(top.window_size).toBe(4);
  });

  it("coerces topN < 1 to DEFAULT_TOP_N", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(computeDigestSnapshotTopMovers(trend, 0).top_n).toBe(DEFAULT_TOP_N);
    expect(computeDigestSnapshotTopMovers(trend, -3).top_n).toBe(DEFAULT_TOP_N);
    expect(computeDigestSnapshotTopMovers(trend, NaN).top_n).toBe(DEFAULT_TOP_N);
  });

  it("respects an explicit topN and truncates the row list", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 100 },
            { reseller_code: "BBB", mrr_cents: i === 0 ? 0 : 200 },
            { reseller_code: "CCC", mrr_cents: i === 0 ? 0 : 300 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend, 2);
    expect(top.top_n).toBe(2);
    expect(top.rows.map((r) => r.reseller_code)).toEqual(["CCC", "BBB"]);
  });
});

describe("computeDigestSnapshotTopMovers — ranking", () => {
  it("ranks movers by |delta| desc across metrics AND resellers", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: i === 0 ? 9900 : 12900 }, // +3000
            { reseller_code: "BBB", mrr_cents: i === 0 ? 9900 : 4900 }, // -5000
          ],
        },
        attributed_churn_30d: {
          rows: [
            { reseller_code: "AAA", churned_count: i === 0 ? 0 : 4 }, // +4
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend, 5);
    expect(top.rows[0].reseller_code).toBe("BBB");
    expect(top.rows[0].abs_delta).toBe(5000);
    expect(top.rows[1].reseller_code).toBe("AAA");
    expect(top.rows[1].key).toBe("attributed_mrr");
    expect(top.rows[1].abs_delta).toBe(3000);
    expect(top.rows[2].key).toBe("attributed_churn_30d");
    expect(top.rows[2].abs_delta).toBe(4);
  });

  it("tiebreaks equal |delta| by reseller_code asc, then key asc", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "ZED", mrr_cents: i === 0 ? 0 : 500 },
            { reseller_code: "ALPHA", mrr_cents: i === 0 ? 0 : 500 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend, 5);
    // Both have |delta|=500; ALPHA comes before ZED.
    const codes = top.rows.map((r) => r.reseller_code);
    expect(codes.indexOf("ALPHA")).toBeLessThan(codes.indexOf("ZED"));
  });

  it("excludes null-delta rows (partner with fewer than 2 non-null points)", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: 9900 }],
        },
      }),
      snap("2026-W29", T(7), {
        // AAA absent → its row will have only 1 non-null point → delta null
        attributed_mrr: { rows: [] },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend);
    expect(top.rows.find((r) => r.reseller_code === "AAA")).toBeUndefined();
  });

  it("excludes zero-delta rows (flat lines are not movers)", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "FLAT", mrr_cents: 9900 },
            { reseller_code: "MOVER", mrr_cents: i === 0 ? 9900 : 12900 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend);
    expect(top.rows.map((r) => r.reseller_code)).toEqual(["MOVER"]);
  });
});

describe("formatDigestSnapshotTopMoversSection", () => {
  it("returns empty string on single-snapshot window", () => {
    const one = snap("2026-W28", T(0), {
      attributed_mrr: { rows: [{ reseller_code: "AAA", mrr_cents: 9900 }] },
    });
    const trend = computeDigestSnapshotPerResellerRollingTrend([one]);
    const top = computeDigestSnapshotTopMovers(trend);
    expect(formatDigestSnapshotTopMoversSection(top)).toBe("");
  });

  it("returns empty string when no row passes the null/zero delta filter", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "FLAT", mrr_cents: 9900 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend);
    expect(formatDigestSnapshotTopMoversSection(top)).toBe("");
  });

  it("renders an HTML table with formatted cents + delta + week range", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: i === 0 ? 9900 : 14800 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend);
    const html = formatDigestSnapshotTopMoversSection(top);
    expect(html).toContain("Top 1 movers");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W29");
    expect(html).toContain("AAA");
    expect(html).toContain("A$99.00");
    expect(html).toContain("A$148.00");
    expect(html).toContain("+A$49.00");
  });

  it("escapes HTML in reseller codes and week labels", () => {
    const snaps = [0, 1].map((i) =>
      snap(`<w${i}>`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "<b>x</b>", mrr_cents: i === 0 ? 0 : 100 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend);
    const html = formatDigestSnapshotTopMoversSection(top);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&lt;w0&gt;");
    expect(html).toContain("&lt;w1&gt;");
  });

  it("renders count-unit metrics without the A$ prefix", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_churn_30d: {
          rows: [
            { reseller_code: "AAA", churned_count: i === 0 ? 0 : 3 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const top = computeDigestSnapshotTopMovers(trend);
    const html = formatDigestSnapshotTopMoversSection(top);
    expect(html).toContain(">3<");
    expect(html).toContain("+3");
    expect(html).not.toContain("A$3");
  });
});
