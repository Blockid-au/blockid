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
});
