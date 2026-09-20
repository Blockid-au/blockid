// Length gate (C.9-5 / risk R6): the free fixture must fit 10 pages; the
// estimate must be monotone in content and count every visual.

import { describe, expect, it } from "vitest";
import { demoReportV2, freeFixtureReportV2 } from "./fixtures";
import { estimatePages, withinFreeBudget } from "./page-estimate";
import { FREE_PAGE_BUDGET } from "./schema";

describe("estimatePages", () => {
  it("free fixture fits the 10-page budget", () => {
    const free = freeFixtureReportV2();
    const est = estimatePages(free);
    expect(est.pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(withinFreeBudget(free)).toBe(true);
    expect(est.sections.map((s) => s.id)).toContain("dim-cgh");
  });

  it("standard report is longer than the free one and counts secondary visuals", () => {
    const std = estimatePages(demoReportV2());
    const free = estimatePages(freeFixtureReportV2());
    expect(std.pages).toBeGreaterThan(free.pages);
    expect(std.visuals).toBeGreaterThan(free.visuals);
    expect(std.words).toBeGreaterThan(free.words);
  });

  it("adding words adds pages", () => {
    const r = demoReportV2();
    const before = estimatePages(r).pages;
    r.dimensions[0].strengths = [...r.dimensions[0].strengths, Array.from({ length: 800 }, () => "word").join(" ")];
    expect(estimatePages(r).pages).toBeGreaterThan(before + 1);
  });

  // G19-S41: the ledger tables are compact — the standard demo stays ≤ 16 pages
  // with all 8 of them, and a ledger costs more than a single pending line.
  it("standard demo with 8 ledger tables stays ≤ 16 estimated pages; a ledger table costs more than a pending line, a pre-S41 chapter nothing", () => {
    const r = demoReportV2();
    expect(r.dimensions.every((d) => d.scoreBreakdown?.assessed)).toBe(true);
    const withLedger = estimatePages(r).pages;
    expect(withLedger).toBeLessThanOrEqual(16);
    const pending = demoReportV2();
    for (const d of pending.dimensions) d.scoreBreakdown = { base: 40, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    const none = demoReportV2();
    for (const d of none.dimensions) delete d.scoreBreakdown;
    expect(estimatePages(pending).pages).toBeLessThan(withLedger);
    expect(estimatePages(none).pages).toBeLessThanOrEqual(estimatePages(pending).pages);
    expect(withLedger - estimatePages(none).pages).toBeLessThanOrEqual(1.2);
  });
});
