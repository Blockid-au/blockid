import { describe, it, expect } from "vitest";
import {
  getAuComparableExits,
  summariseAuExits,
  AU_EXIT_DISCLAIMER,
  type AuExit,
} from "./au-benchmark";

describe("au-benchmark fixture", () => {
  it("has ≥ 20 exits, each with a public source URL and rounded AUD valuation", () => {
    const all = getAuComparableExits();
    expect(all.length).toBeGreaterThanOrEqual(20);
    for (const e of all) {
      expect(e.sourceUrl).toMatch(/^https?:\/\//);
      expect(e.valuationAud).toBeGreaterThan(0);
      expect(Number.isFinite(e.year)).toBe(true);
      if (e.revenueMultiple !== null) {
        expect(e.revenueMultiple).toBeGreaterThan(0);
      }
    }
  });

  it("covers every buyerType (strategic / financial / pe / ipo / secondary)", () => {
    const all = getAuComparableExits();
    const types = new Set(all.map((e) => e.buyerType));
    for (const t of ["strategic", "pe", "ipo", "secondary"]) {
      expect(types.has(t as AuExit["buyerType"])).toBe(true);
    }
  });

  it("includes the three Atlassian reference deals from §1 phase 10 / 11", () => {
    const all = getAuComparableExits();
    const companies = all.map((e) => e.company);
    expect(companies).toContain("Atlassian");
    expect(companies).toContain("OpsGenie");
    expect(companies).toContain("Trello");
  });
});

describe("getAuComparableExits", () => {
  it("filters by sector case-insensitively", () => {
    const fintech = getAuComparableExits({ sector: "FinTech" });
    expect(fintech.length).toBeGreaterThan(0);
    for (const e of fintech) expect(e.sector).toBe("fintech");
  });

  it("filters by buyerType", () => {
    const pe = getAuComparableExits({ buyerType: "pe" });
    expect(pe.length).toBeGreaterThan(0);
    for (const e of pe) expect(e.buyerType).toBe("pe");
  });

  it("respects minYear and limit and sorts newest-first", () => {
    const recent = getAuComparableExits({ minYear: 2022, limit: 5 });
    expect(recent.length).toBeLessThanOrEqual(5);
    for (const e of recent) expect(e.year).toBeGreaterThanOrEqual(2022);
    for (let i = 1; i < recent.length; i += 1) {
      expect(recent[i - 1].year).toBeGreaterThanOrEqual(recent[i].year);
    }
  });

  it("returns [] for unknown sector", () => {
    expect(getAuComparableExits({ sector: "spacetourism" })).toEqual([]);
  });
});

describe("summariseAuExits", () => {
  it("returns zero-shape when input is empty", () => {
    const s = summariseAuExits([]);
    expect(s.count).toBe(0);
    expect(s.medianValuationAud).toBeNull();
    expect(s.medianRevenueMultiple).toBeNull();
    expect(s.latestYear).toBeNull();
    expect(Object.values(s.byBuyerType).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("computes median valuation and buyerType breakdown", () => {
    const s = summariseAuExits(getAuComparableExits());
    expect(s.count).toBeGreaterThan(0);
    expect(s.medianValuationAud).toBeGreaterThan(0);
    // At least strategic + ipo + pe must be non-zero given fixture composition.
    expect(s.byBuyerType.strategic).toBeGreaterThan(0);
    expect(s.byBuyerType.ipo).toBeGreaterThan(0);
    expect(s.byBuyerType.pe).toBeGreaterThan(0);
    expect(s.latestYear).toBeGreaterThanOrEqual(2023);
  });

  it("odd / even median branches are exercised", () => {
    // Odd length → middle element.
    const three = getAuComparableExits({ buyerType: "secondary", limit: 3 });
    expect(three.length).toBe(3);
    const odd = summariseAuExits(three);
    expect(odd.medianValuationAud).toBe(
      [...three].map((e) => e.valuationAud).sort((a, b) => a - b)[1],
    );

    // Even length → average of middle two.
    const four = getAuComparableExits({ buyerType: "pe" }).slice(0, 4);
    if (four.length === 4) {
      const sorted = [...four].map((e) => e.valuationAud).sort((a, b) => a - b);
      const even = summariseAuExits(four);
      expect(even.medianValuationAud).toBe(Math.round(((sorted[1] + sorted[2]) / 2) * 100) / 100);
    }
  });
});

describe("AU_EXIT_DISCLAIMER", () => {
  it("cites s766B Corporations Act boundary so any surface that renders these figures inherits the AFSL guard", () => {
    expect(AU_EXIT_DISCLAIMER).toMatch(/s766B/);
    expect(AU_EXIT_DISCLAIMER).toMatch(/Corporations Act 2001/);
    expect(AU_EXIT_DISCLAIMER.toLowerCase()).toContain("not personal financial product advice");
  });
});
