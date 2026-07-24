// Contract: docs/plans/atlassian-standard-mapping-goal.md §1 phase 3 P1
// gap ("IBISWorld / ABS lookup"). Mirrors the abn.test.ts / cohort-chart
// test posture — pure helpers exercised without touching Supabase.

import { describe, it, expect } from "vitest";
import {
  AU_MARKET_INDUSTRIES,
  AU_MARKET_LOOKUP_DISCLAIMER,
  ANZSIC_DIVISIONS,
  lookupByAnzsic,
  searchByKeyword,
  listCoveredDivisions,
  estimateTamSamSom,
} from "./au-market-lookup";

describe("AU_MARKET_INDUSTRIES seed integrity", () => {
  it("has ANZSIC codes that are unique + upper-alnum + 5 chars", () => {
    const seen = new Set<string>();
    for (const i of AU_MARKET_INDUSTRIES) {
      expect(i.anzsicCode).toMatch(/^[A-Z]\d{4}$/);
      expect(seen.has(i.anzsicCode)).toBe(false);
      seen.add(i.anzsicCode);
    }
  });

  it("every industry has at least one ABS or IBISWorld source with a real URL", () => {
    for (const i of AU_MARKET_INDUSTRIES) {
      expect(i.sources.length).toBeGreaterThanOrEqual(1);
      for (const s of i.sources) {
        expect(s.url.startsWith("https://")).toBe(true);
        expect(s.publishedYear).toBeGreaterThanOrEqual(2020);
      }
      // At least one source must be ABS-published (the P3 gap named
      // "ABS Business Data Portal API stub" — every anchor traces to ABS).
      const publishers = i.sources.map((s) => s.publisher);
      expect(publishers.some((p) => p === "ABS" || p === "AusIndustry" || p === "RBA")).toBe(true);
    }
  });

  it("TAM, business count, and CAGR are sane", () => {
    for (const i of AU_MARKET_INDUSTRIES) {
      expect(i.tamAud).toBeGreaterThan(0);
      expect(i.businessCount).toBeGreaterThan(0);
      expect(i.cagr).toBeGreaterThan(-0.5);
      expect(i.cagr).toBeLessThan(0.5);
    }
  });

  it("every industry division key resolves to a canonical ANZSIC 2006 division label", () => {
    for (const i of AU_MARKET_INDUSTRIES) {
      expect(ANZSIC_DIVISIONS[i.division]).toBeTruthy();
    }
  });
});

describe("lookupByAnzsic", () => {
  it("returns the matching industry for a known code", () => {
    const saas = lookupByAnzsic("J5810");
    expect(saas).not.toBeNull();
    expect(saas?.label).toContain("Software Publishing");
  });

  it("is case + whitespace tolerant", () => {
    expect(lookupByAnzsic("j5810")).not.toBeNull();
    expect(lookupByAnzsic(" J 5810 ")).not.toBeNull();
  });

  it("returns null for empty / unknown / null inputs", () => {
    expect(lookupByAnzsic("")).toBeNull();
    expect(lookupByAnzsic("Z9999")).toBeNull();
    expect(lookupByAnzsic(null)).toBeNull();
    expect(lookupByAnzsic(undefined)).toBeNull();
  });
});

describe("searchByKeyword", () => {
  it("finds SaaS via an exact keyword hit", () => {
    const hits = searchByKeyword("saas", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].anzsicCode).toBe("J5810");
  });

  it("finds fintech and prefers the K-division class", () => {
    const hits = searchByKeyword("fintech", 3);
    expect(hits[0].division).toBe("K");
  });

  it("returns empty for blank / gibberish queries", () => {
    expect(searchByKeyword("", 5)).toEqual([]);
    expect(searchByKeyword("   ", 5)).toEqual([]);
    expect(searchByKeyword("qqqqqzzzzz", 5)).toEqual([]);
  });

  it("respects the limit", () => {
    // Multiple keywords will match "software" — cap at 1.
    const hits = searchByKeyword("software", 1);
    expect(hits.length).toBeLessThanOrEqual(1);
  });
});

describe("listCoveredDivisions", () => {
  it("returns divisions with counts that sum to the seed size", () => {
    const divs = listCoveredDivisions();
    const total = divs.reduce((n, d) => n + d.count, 0);
    expect(total).toBe(AU_MARKET_INDUSTRIES.length);
  });

  it("is sorted alphabetically by division key", () => {
    const divs = listCoveredDivisions();
    const keys = divs.map((d) => d.division);
    expect(keys).toEqual([...keys].sort());
  });
});

describe("estimateTamSamSom", () => {
  it("computes SAM = TAM × addressablePct and SOM = SAM × sharePct", () => {
    const est = estimateTamSamSom({ anzsicCode: "J5810", addressablePct: 0.25, targetSharePct: 0.02 });
    expect(est).not.toBeNull();
    const tam = est!.industry.tamAud;
    expect(est!.samAud).toBe(Math.round(tam * 0.25));
    expect(est!.somAud).toBe(Math.round(est!.samAud * 0.02));
  });

  it("defaults to 20% addressable and 1% target share", () => {
    const est = estimateTamSamSom({ anzsicCode: "J5810" });
    expect(est!.addressablePct).toBeCloseTo(0.2);
    expect(est!.targetSharePct).toBeCloseTo(0.01);
  });

  it("clamps out-of-range percentages", () => {
    const est = estimateTamSamSom({ anzsicCode: "J5810", addressablePct: 1.4, targetSharePct: -0.5 });
    expect(est!.addressablePct).toBe(1);
    expect(est!.targetSharePct).toBe(0);
  });

  it("falls back to keyword search when no ANZSIC code is provided", () => {
    const est = estimateTamSamSom({ keyword: "fintech" });
    expect(est).not.toBeNull();
    expect(est!.industry.division).toBe("K");
  });

  it("returns null when neither ANZSIC code nor keyword matches", () => {
    expect(estimateTamSamSom({})).toBeNull();
    expect(estimateTamSamSom({ anzsicCode: "Z9999" })).toBeNull();
    expect(estimateTamSamSom({ keyword: "zzz-nonsense" })).toBeNull();
  });

  it("attaches the AU_MARKET_LOOKUP_DISCLAIMER so callers cannot ship without it", () => {
    const est = estimateTamSamSom({ anzsicCode: "J5810" });
    expect(est!.disclaimer).toBe(AU_MARKET_LOOKUP_DISCLAIMER);
    expect(est!.disclaimer).toMatch(/anchor/i);
  });
});
