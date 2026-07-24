// P12b — pin the ch09+ investor-readiness pack exit-benchmark section
// shape so the AU comparable-exits fixture stays in lockstep with the
// pack contract. Sector fallback + disclaimer + row projection all
// deterministic against the shipping fixture in
// `web/src/lib/exits/au-benchmark.ts`.

import { describe, it, expect } from "vitest";
import {
  buildExitBenchmarkSection,
  type ExitBenchmarkSection,
} from "./exit-benchmark-section";
import { AU_EXIT_DISCLAIMER } from "@/lib/exits/au-benchmark";

describe("buildExitBenchmarkSection", () => {
  it("defaults: returns 6 rows sorted newest-first, uses the full fixture, and carries the fixed disclaimer", () => {
    const section = buildExitBenchmarkSection();
    expect(section.sector).toBeNull();
    expect(section.usedFallback).toBe(false);
    expect(section.topExits).toHaveLength(6);
    expect(section.disclaimer).toBe(AU_EXIT_DISCLAIMER);

    // Newest-first sort inherited from getAuComparableExits.
    for (let i = 1; i < section.topExits.length; i++) {
      expect(section.topExits[i - 1].year).toBeGreaterThanOrEqual(
        section.topExits[i].year,
      );
    }
    // Every row carries an https source URL and a positive AUD valuation.
    for (const row of section.topExits) {
      expect(row.sourceUrl).toMatch(/^https?:\/\//);
      expect(row.valuationAud).toBeGreaterThan(0);
    }
  });

  it("honours limit override and never returns < 1 row", () => {
    const three = buildExitBenchmarkSection({ limit: 3 });
    expect(three.topExits).toHaveLength(3);
    const clamped = buildExitBenchmarkSection({ limit: 0 });
    expect(clamped.topExits.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by sector (case-insensitive via the fixture helper)", () => {
    const section = buildExitBenchmarkSection({ sector: "SaaS" });
    expect(section.sector).toBe("SaaS");
    expect(section.usedFallback).toBe(false);
    expect(section.topExits.length).toBeGreaterThan(0);
    // Summary counts should reflect saas-only rows (all buyerType strategic
    // + secondary + ipo + pe live in the fixture's SaaS slice).
    expect(section.summary.count).toBeGreaterThan(0);
  });

  it("falls back to the full fixture when the sector filter matches zero rows", () => {
    const section: ExitBenchmarkSection = buildExitBenchmarkSection({
      sector: "quantum-hardware",
    });
    expect(section.sector).toBe("quantum-hardware");
    expect(section.usedFallback).toBe(true);
    expect(section.topExits.length).toBeGreaterThan(0);
  });

  it("null / whitespace sector normalises to null (no sector filter)", () => {
    const nullSector = buildExitBenchmarkSection({ sector: null });
    const blankSector = buildExitBenchmarkSection({ sector: "  " });
    expect(nullSector.sector).toBeNull();
    expect(blankSector.sector).toBeNull();
    expect(nullSector.usedFallback).toBe(false);
    expect(blankSector.usedFallback).toBe(false);
  });

  it("summary aggregates cover count + median + buyerType breakdown + latestYear", () => {
    const section = buildExitBenchmarkSection();
    expect(section.summary.count).toBeGreaterThan(0);
    expect(section.summary.medianValuationAud).not.toBeNull();
    expect(section.summary.latestYear).not.toBeNull();
    expect(section.summary.latestYear).toBeGreaterThanOrEqual(2023);
    const totalByBuyerType = Object.values(section.summary.byBuyerType).reduce(
      (s, n) => s + n,
      0,
    );
    expect(totalByBuyerType).toBe(section.summary.count);
  });

  it("minYear filter drops earlier deals (Xero 2007 excluded at default minYear=2010)", () => {
    const section = buildExitBenchmarkSection({ limit: 100 });
    const companies = section.topExits.map((r) => r.company);
    expect(companies).not.toContain("Xero");
    // Explicit lower minYear pulls Xero back in.
    const older = buildExitBenchmarkSection({ minYear: 2000, limit: 100 });
    const olderCompanies = older.topExits.map((r) => r.company);
    expect(olderCompanies).toContain("Xero");
  });

  it("row shape preserves company + buyer + buyerType + valuation + revenueMultiple + year + source", () => {
    const [row] = buildExitBenchmarkSection({ limit: 1 }).topExits;
    expect(row).toEqual(
      expect.objectContaining({
        company: expect.any(String),
        buyerType: expect.any(String),
        valuationAud: expect.any(Number),
        year: expect.any(Number),
        sourceUrl: expect.any(String),
        sourceNote: expect.any(String),
      }),
    );
    // buyer + revenueMultiple are legitimately nullable.
    expect(row.buyer === null || typeof row.buyer === "string").toBe(true);
    expect(
      row.revenueMultiple === null || typeof row.revenueMultiple === "number",
    ).toBe(true);
  });
});
