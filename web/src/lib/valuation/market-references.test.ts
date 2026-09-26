import { describe, expect, it } from "vitest";
import { sampleMarketResearch } from "@/lib/research/market-research-fixtures";
import { marketResearchAnalysisContext } from "@/lib/research/market-research-context";
import { marketReferenceCrossCheck, marketReferencesFor } from "./market-references";

describe("market references block", () => {
  it("lists figures with links and dates from ≤ 5 sources, with the revenue-multiple range", () => {
    const b = marketReferencesFor(sampleMarketResearch())!;
    expect(b.sourceCount).toBe(2);
    expect(b.sources.length).toBeLessThanOrEqual(5);
    expect(b.rows.map((r) => [r.kind, r.subject, r.figure, r.date])).toEqual([
      ["market_size", "Market size (Australian)", "A$4.2 billion", "2025"],
      ["comparable", "BetaPay", "8× revenue", "2025"],
      ["comparable", "Gamma Ledger", "US$1.5 billion valuation", "2024"],
      ["competitor", "BetaPay", "raised A$30 million", null],
    ]);
    expect(b.rows.every((r) => r.url.startsWith("https://"))).toBe(true);
    expect(b.revenueMultiples).toEqual({ n: 1, low: 8, median: 8, high: 8 });
  });

  it("nothing when research found no facts / did not run", () => {
    expect(marketReferencesFor(null)).toBeNull();
    expect(marketReferencesFor(sampleMarketResearch({ status: "unavailable" }))).toBeNull();
  });

  it("the cross-check row needs the company's OWN qualified ARR — references never create a number", () => {
    const b = marketReferencesFor(sampleMarketResearch());
    expect(marketReferenceCrossCheck(b, 0)).toBeNull();
    expect(marketReferenceCrossCheck(b, null)).toBeNull();
    const row = marketReferenceCrossCheck(b, 1_200_000)!;
    expect(row).toMatchObject({ lowAud: 9_600_000, midAud: 9_600_000, highAud: 9_600_000, n: 1, asOf: "2026-09-26" });
    expect(row.label).toContain("Public market references (2 sources)");
    expect(row.source).toMatch(/not independently verified; reference range only, not part of the weighted estimate/);
    // No revenue multiple researched → no row even with ARR.
    const noMultiple = sampleMarketResearch();
    noMultiple.facts.comparables = noMultiple.facts.comparables.filter((c) => c.metric !== "revenue_multiple");
    expect(marketReferenceCrossCheck(marketReferencesFor(noMultiple), 1_200_000)).toBeNull();
  });

  it("feeds the MPC (market criterion) prompt a competitor table marked public / unverified", () => {
    const ctx = marketResearchAnalysisContext(sampleMarketResearch())!;
    expect(ctx).toContain("| Competitor | Funding | Valuation | Stage | Source |");
    expect(ctx).toContain("| BetaPay | A$30 million | — | — | https://www.startupdaily.net/acme-pay-series-a |");
    expect(ctx).toMatch(/unverified — tier T3/);
    expect(marketResearchAnalysisContext(sampleMarketResearch({ status: "no_facts" }))).toBeNull();
  });
});
