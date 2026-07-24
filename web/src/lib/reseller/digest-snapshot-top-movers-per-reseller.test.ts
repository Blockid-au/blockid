import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_TOP_N_PER_RESELLER,
  computeDigestSnapshotTopMoversPerReseller,
  formatDigestSnapshotTopMoversPerResellerSection,
} from "./digest-snapshot-top-movers-per-reseller";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotTopMoversPerReseller — shape", () => {
  it("passes through window metadata from the trend envelope", () => {
    const snaps = [9900, 19700].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    expect(perReseller.window_size).toBe(2);
    expect(perReseller.first_week).toBe("2026-W28");
    expect(perReseller.last_week).toBe("2026-W29");
    expect(perReseller.top_n_per_reseller).toBe(DEFAULT_TOP_N_PER_RESELLER);
  });

  it("returns empty rows on an empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    expect(perReseller.window_size).toBe(0);
    expect(perReseller.rows).toEqual([]);
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const perReseller = computeDigestSnapshotTopMoversPerReseller({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      rows: undefined as unknown as never,
      top_n_per_reseller: 0,
    } as never);
    expect(perReseller.rows).toEqual([]);
    expect(perReseller.window_size).toBe(4);
  });

  it("coerces topNPerReseller < 1 to DEFAULT_TOP_N_PER_RESELLER", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotTopMoversPerReseller(trend, 0).top_n_per_reseller,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER);
    expect(
      computeDigestSnapshotTopMoversPerReseller(trend, -3).top_n_per_reseller,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER);
    expect(
      computeDigestSnapshotTopMoversPerReseller(trend, NaN).top_n_per_reseller,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER);
  });
});

describe("computeDigestSnapshotTopMoversPerReseller — per-reseller coverage", () => {
  it("guarantees a spotlight for each reseller with a non-null-non-zero mover", () => {
    // AAA has a small +100 mover; BBB dominates with +999000 cents on MRR.
    // P11.24 raw-|delta| ranking would put BBB at rank 1 and AAA outside
    // the top-N. This section separates them so both partners get coverage.
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 100 },
            { reseller_code: "BBB", mrr_cents: i === 0 ? 0 : 999000 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    const codes = perReseller.rows.map((r) => r.reseller_code);
    expect(codes).toContain("AAA");
    expect(codes).toContain("BBB");
  });

  it("orders reseller groups by reseller_code asc", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "ZED", mrr_cents: i === 0 ? 0 : 100 },
            { reseller_code: "MID", mrr_cents: i === 0 ? 0 : 200 },
            { reseller_code: "ALPHA", mrr_cents: i === 0 ? 0 : 300 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    expect(perReseller.rows.map((r) => r.reseller_code)).toEqual([
      "ALPHA",
      "MID",
      "ZED",
    ]);
  });

  it("picks the biggest |delta| within each reseller group", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "PARTNER", mrr_cents: i === 0 ? 0 : 100 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "PARTNER", churned_count: i === 0 ? 0 : 5 }],
        },
        ledger_drift_events: {
          rows: [
            {
              reseller_code: "PARTNER",
              total_drift_count: i === 0 ? 0 : 3,
            },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend, 1);
    expect(perReseller.rows).toHaveLength(1);
    expect(perReseller.rows[0].reseller_code).toBe("PARTNER");
    expect(perReseller.rows[0].abs_delta).toBe(100);
    expect(perReseller.rows[0].key).toBe("attributed_mrr");
    expect(perReseller.rows[0].rank_in_reseller).toBe(1);
  });

  it("respects topNPerReseller > 1 and emits ranks 1..N per reseller", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "PARTNER", mrr_cents: i === 0 ? 0 : 100 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "PARTNER", churned_count: i === 0 ? 0 : 5 }],
        },
        ledger_drift_events: {
          rows: [
            {
              reseller_code: "PARTNER",
              total_drift_count: i === 0 ? 0 : 3,
            },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend, 2);
    expect(perReseller.rows).toHaveLength(2);
    expect(perReseller.rows[0].rank_in_reseller).toBe(1);
    expect(perReseller.rows[1].rank_in_reseller).toBe(2);
    // |delta| desc — 100 (mrr) > 5 (churn) > 3 (drift)
    expect(perReseller.rows[0].abs_delta).toBe(100);
    expect(perReseller.rows[1].abs_delta).toBe(5);
  });

  it("tiebreaks equal |delta| by HEADLINE_METRICS spec order within a reseller group", () => {
    // Both mrr and churn move by an equal raw magnitude of 5. Spec order:
    // mrr is spec[4], churn is spec[6] — mrr must come first.
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "PARTNER", mrr_cents: i === 0 ? 0 : 5 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "PARTNER", churned_count: i === 0 ? 0 : 5 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend, 2);
    const keys = perReseller.rows.map((r) => r.key);
    const specOrder = HEADLINE_METRICS.map((s) => s.key);
    expect(specOrder.indexOf(keys[0])).toBeLessThan(specOrder.indexOf(keys[1]));
    expect(keys[0]).toBe("attributed_mrr");
    expect(keys[1]).toBe("attributed_churn_30d");
  });

  it("excludes null-delta rows (partner with fewer than 2 non-null points)", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: 9900 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { rows: [] },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    expect(perReseller.rows.find((r) => r.reseller_code === "AAA")).toBeUndefined();
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
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    expect(perReseller.rows.map((r) => r.reseller_code)).toEqual(["MOVER"]);
  });

  it("omits resellers with no non-null-non-zero movers (no forced empty spotlight)", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "FLAT", mrr_cents: 9900 },
            { reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 200 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    const codes = perReseller.rows.map((r) => r.reseller_code);
    expect(codes).not.toContain("FLAT");
    expect(codes).toContain("AAA");
  });
});

describe("formatDigestSnapshotTopMoversPerResellerSection", () => {
  it("returns empty string on single-snapshot window", () => {
    const one = snap("2026-W28", T(0), {
      attributed_mrr: { rows: [{ reseller_code: "AAA", mrr_cents: 9900 }] },
    });
    const trend = computeDigestSnapshotPerResellerRollingTrend([one]);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    expect(formatDigestSnapshotTopMoversPerResellerSection(perReseller)).toBe(
      "",
    );
  });

  it("returns empty string when no reseller produced a spotlight", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "FLAT", mrr_cents: 9900 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    expect(formatDigestSnapshotTopMoversPerResellerSection(perReseller)).toBe(
      "",
    );
  });

  it("renders an HTML table with formatted cents + delta + week range + rank", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: i === 0 ? 9900 : 14800 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    const html = formatDigestSnapshotTopMoversPerResellerSection(perReseller);
    expect(html).toContain("mover per reseller");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W29");
    expect(html).toContain("AAA");
    expect(html).toContain("#1");
    expect(html).toContain("A$99.00");
    expect(html).toContain("A$148.00");
    expect(html).toContain("+A$49.00");
  });

  it("pluralises the section heading when top_n_per_reseller > 1", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 100 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "AAA", churned_count: i === 0 ? 0 : 3 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend, 2);
    const html = formatDigestSnapshotTopMoversPerResellerSection(perReseller);
    expect(html).toContain("Top 2 movers per reseller");
  });

  it("escapes HTML in reseller codes and week labels", () => {
    const snaps = [0, 1].map((i) =>
      snap(`<w${i}>`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "<b>x</b>", mrr_cents: i === 0 ? 0 : 100 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    const html = formatDigestSnapshotTopMoversPerResellerSection(perReseller);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&lt;w0&gt;");
    expect(html).toContain("&lt;w1&gt;");
  });

  it("renders count-unit metrics without the A$ prefix", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_churn_30d: {
          rows: [{ reseller_code: "AAA", churned_count: i === 0 ? 0 : 3 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotTopMoversPerReseller(trend);
    const html = formatDigestSnapshotTopMoversPerResellerSection(perReseller);
    expect(html).toContain(">3<");
    expect(html).toContain("+3");
    expect(html).not.toContain("A$3");
  });
});
