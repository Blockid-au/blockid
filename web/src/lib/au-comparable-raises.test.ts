// Vitest coverage for the P3-au-comparable-raises dataset that powers the
// Chapter 3 (Market Research) benchmark + investor-pack-assembler comps
// section. Closes the "no colocated test file" gap flagged in the atlassian
// goal follow-up chain — the module has shipped since 2026-07-20 but the
// filter/summarise contract has been unpinned. A drift in stage
// normalisation, sort order, or median arithmetic here silently corrupts
// every founder-facing benchmark surface, so we pin the branch matrix.

import { describe, expect, it } from "vitest";

import {
  getComparableRaises,
  summariseComparables,
  type ComparableRaise,
} from "./au-comparable-raises";

describe("getComparableRaises", () => {
  it("returns only rows matching the normalised stage", () => {
    const rows = getComparableRaises({ stage: "seriesA" });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.stage).toBe("seriesA");
    }
  });

  it("filters by sector when supplied (case-insensitive)", () => {
    const fintechLower = getComparableRaises({ sector: "fintech", stage: "seriesB" });
    const fintechMixed = getComparableRaises({ sector: "FinTech", stage: "seriesB" });
    expect(fintechLower.length).toBeGreaterThan(0);
    expect(fintechMixed.length).toBe(fintechLower.length);
    for (const row of fintechLower) {
      expect(row.sector).toBe("fintech");
      expect(row.stage).toBe("seriesB");
    }
  });

  it("returns empty when the sector matches no seeded row", () => {
    expect(getComparableRaises({ sector: "spacetech", stage: "seed" })).toEqual([]);
  });

  it("sorts newest year first, then by round size descending within the same year", () => {
    const rows = getComparableRaises({ stage: "seriesB" });
    expect(rows.length).toBeGreaterThan(1);
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      if (prev.year === curr.year) {
        expect(prev.roundAud).toBeGreaterThanOrEqual(curr.roundAud);
      } else {
        expect(prev.year).toBeGreaterThan(curr.year);
      }
    }
  });

  it("respects the limit option", () => {
    const rows = getComparableRaises({ stage: "seed", limit: 2 });
    expect(rows.length).toBeLessThanOrEqual(2);
    const unlimited = getComparableRaises({ stage: "seed" });
    expect(unlimited.length).toBeGreaterThanOrEqual(rows.length);
  });

  it("normalises loose stage inputs — 'A', 'series_a', 'Series A' all resolve to seriesA", () => {
    const canonical = getComparableRaises({ stage: "seriesA" });
    const short = getComparableRaises({ stage: "A" });
    const snake = getComparableRaises({ stage: "series_a" });
    const spaced = getComparableRaises({ stage: "Series A" });
    expect(short.length).toBe(canonical.length);
    expect(snake.length).toBe(canonical.length);
    expect(spaced.length).toBe(canonical.length);
  });

  it("normalises 'pre-seed' variants to preseed", () => {
    const rows = getComparableRaises({ stage: "pre-seed" });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.stage).toBe("preseed");
    }
  });
});

describe("summariseComparables", () => {
  it("returns a null-filled summary for an empty input", () => {
    expect(summariseComparables([])).toEqual({
      medianRoundAud: null,
      medianValuationAud: null,
      count: 0,
    });
  });

  it("computes the median round size for an odd-length sample", () => {
    const raises: ComparableRaise[] = [
      { company: "A", sector: "saas", stage: "seed", roundAud: 1_000_000, valuationAud: null, year: 2024, leadInvestor: null, sourceNote: "test" },
      { company: "B", sector: "saas", stage: "seed", roundAud: 5_000_000, valuationAud: null, year: 2024, leadInvestor: null, sourceNote: "test" },
      { company: "C", sector: "saas", stage: "seed", roundAud: 3_000_000, valuationAud: null, year: 2024, leadInvestor: null, sourceNote: "test" },
    ];
    const summary = summariseComparables(raises);
    expect(summary.medianRoundAud).toBe(3_000_000);
    expect(summary.medianValuationAud).toBeNull();
    expect(summary.count).toBe(3);
  });

  it("averages the two middle values for an even-length sample", () => {
    const raises: ComparableRaise[] = [
      { company: "A", sector: "saas", stage: "seriesA", roundAud: 10_000_000, valuationAud: 40_000_000, year: 2024, leadInvestor: null, sourceNote: "test" },
      { company: "B", sector: "saas", stage: "seriesA", roundAud: 20_000_000, valuationAud: 80_000_000, year: 2024, leadInvestor: null, sourceNote: "test" },
      { company: "C", sector: "saas", stage: "seriesA", roundAud: 30_000_000, valuationAud: 120_000_000, year: 2024, leadInvestor: null, sourceNote: "test" },
      { company: "D", sector: "saas", stage: "seriesA", roundAud: 40_000_000, valuationAud: 160_000_000, year: 2024, leadInvestor: null, sourceNote: "test" },
    ];
    const summary = summariseComparables(raises);
    expect(summary.medianRoundAud).toBe(25_000_000);
    expect(summary.medianValuationAud).toBe(100_000_000);
    expect(summary.count).toBe(4);
  });

  it("computes a valuation median from only the rows that have one", () => {
    const raises: ComparableRaise[] = [
      { company: "A", sector: "saas", stage: "seed", roundAud: 1_000_000, valuationAud: null, year: 2024, leadInvestor: null, sourceNote: "test" },
      { company: "B", sector: "saas", stage: "seed", roundAud: 2_000_000, valuationAud: 10_000_000, year: 2024, leadInvestor: null, sourceNote: "test" },
      { company: "C", sector: "saas", stage: "seed", roundAud: 3_000_000, valuationAud: null, year: 2024, leadInvestor: null, sourceNote: "test" },
    ];
    const summary = summariseComparables(raises);
    expect(summary.medianRoundAud).toBe(2_000_000);
    expect(summary.medianValuationAud).toBe(10_000_000);
    expect(summary.count).toBe(3);
  });
});

describe("seed integrity", () => {
  it("all seeded companies are uniquely keyed", () => {
    const all = [
      ...getComparableRaises({ stage: "preseed" }),
      ...getComparableRaises({ stage: "seed" }),
      ...getComparableRaises({ stage: "seriesA" }),
      ...getComparableRaises({ stage: "seriesB" }),
    ];
    const names = all.map((r) => r.company);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every row has a positive AUD round amount and a sane year", () => {
    const all = [
      ...getComparableRaises({ stage: "preseed" }),
      ...getComparableRaises({ stage: "seed" }),
      ...getComparableRaises({ stage: "seriesA" }),
      ...getComparableRaises({ stage: "seriesB" }),
    ];
    for (const row of all) {
      expect(row.roundAud).toBeGreaterThan(0);
      expect(row.year).toBeGreaterThanOrEqual(2015);
      expect(row.year).toBeLessThanOrEqual(2030);
      if (row.valuationAud !== null) {
        expect(row.valuationAud).toBeGreaterThan(0);
        expect(row.valuationAud).toBeGreaterThanOrEqual(row.roundAud);
      }
    }
  });
});
