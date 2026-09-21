// Length gate (C.9-5 / risk R6): the free fixture must fit 10 pages; the
// estimate must be monotone in content and count every visual. G27: the
// sections are the v3 order (dashboard → investment view → key points →
// valuation → 8 chapters → risk matrix → plan → money → appendix).

import { describe, expect, it } from "vitest";
import { demoReportV2, freeFixtureReportV2 } from "./fixtures";
import { ensureInvestmentView } from "./investment-view";
import { STANDARD_WORD_BUDGET, estimatePages, withinFreeBudget } from "./page-estimate";
import { FREE_PAGE_BUDGET } from "./schema";

describe("estimatePages", () => {
  it("free fixture fits the 10-page budget", () => {
    const free = freeFixtureReportV2();
    const est = estimatePages(free);
    expect(est.pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(withinFreeBudget(free)).toBe(true);
    expect(est.sections.map((s) => s.id)).toContain("dim-cgh");
    // G27: v3 section ids in order.
    const ids = est.sections.map((s) => s.id);
    expect(ids.slice(0, 4)).toEqual(["dashboard", "investment-view", "key-points", "valuation"]);
    expect(ids.slice(-4)).toEqual(["risk-matrix", "plan", "money", "appendix"]);
    // The dashboard is one page; the investment view + key points + risk matrix + plan carry their spec § 5 costs.
    const cost = (id: string) => est.sections.find((s) => s.id === id)!.pages;
    expect(cost("dashboard")).toBe(1);
    expect(cost("investment-view")).toBeGreaterThanOrEqual(0.7);
    expect(cost("key-points")).toBeGreaterThanOrEqual(0.2);
    expect(cost("risk-matrix")).toBeGreaterThanOrEqual(0.2);
    expect(cost("plan")).toBeGreaterThanOrEqual(0.3);
    // With the investment view built, the risk rows / plan steps add words but the fixture still fits.
    const withView = estimatePages(ensureInvestmentView(free));
    expect(withView.pages).toBeGreaterThanOrEqual(est.pages);
    expect(withView.pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(withView.sections.find((s) => s.id === "risk-matrix")!.pages).toBeGreaterThanOrEqual(0.4);
  });

  it("standard report is longer than the free one and counts secondary visuals", () => {
    const std = estimatePages(demoReportV2());
    const free = estimatePages(freeFixtureReportV2());
    expect(std.pages).toBeGreaterThan(free.pages);
    expect(std.visuals).toBeGreaterThan(free.visuals);
    expect(std.words).toBeGreaterThan(free.words);
  });

  // G19-S44: the standard demo stays within the word budget once the chapter
  // bullets stop duplicating the cards and the phase lens is one row.
  it("standard demo fixture renders ≤ 1,500 words (KPI: ≥ 60 % non-boilerplate; G27 +100 for the investment view)", () => {
    const est = estimatePages(demoReportV2());
    expect(STANDARD_WORD_BUDGET).toBe(1_500);
    expect(est.words).toBeLessThanOrEqual(STANDARD_WORD_BUDGET);
    // The per-chapter phase-lens sentence is not rendered, so it is not counted.
    const r = demoReportV2();
    const before = estimatePages(r).words;
    r.dimensions[0].phaseLens = { ...r.dimensions[0].phaseLens, whatMattersNow: Array.from({ length: 50 }, () => "word").join(" ") };
    expect(estimatePages(r).words).toBe(before);
    // Chapter bullets that duplicate a card bullet are not counted twice.
    const dup = demoReportV2();
    const base = estimatePages(dup).words;
    dup.dimensions[0].strengths = [...dup.dimensions[0].strengths, dup.dimensions[0].criteria[0].strengths[0]];
    expect(estimatePages(dup).words).toBe(base);
  });

  it("adding words adds pages", () => {
    const r = demoReportV2();
    const before = estimatePages(r).pages;
    r.dimensions[0].strengths = [...r.dimensions[0].strengths, Array.from({ length: 800 }, () => "word").join(" ")];
    expect(estimatePages(r).pages).toBeGreaterThan(before + 1);
  });

  // G19-S41 → G27: the ledger tables are compact and sit in the appendix — the
  // standard demo stays ≤ 20 estimated pages with all 8 of them, and a ledger
  // costs more than a single pending line.
  it("standard demo with 8 ledger tables stays ≤ 20 estimated pages; a ledger table costs more than a pending line, a pre-S41 chapter nothing; the cost sits in the appendix", () => {
    const r = demoReportV2();
    expect(r.dimensions.every((d) => d.scoreBreakdown?.assessed)).toBe(true);
    const withLedger = estimatePages(r).pages;
    expect(withLedger).toBeLessThanOrEqual(20);
    const appendix = (report: typeof r) => estimatePages(report).sections.find((s) => s.id === "appendix")!.pages;
    const chapter = (report: typeof r) => estimatePages(report).sections.find((s) => s.id === "dim-tre")!.pages;
    const pending = demoReportV2();
    for (const d of pending.dimensions) d.scoreBreakdown = { base: 40, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    const none = demoReportV2();
    for (const d of none.dimensions) delete d.scoreBreakdown;
    expect(estimatePages(pending).pages).toBeLessThan(withLedger);
    expect(estimatePages(none).pages).toBeLessThanOrEqual(estimatePages(pending).pages);
    expect(withLedger - estimatePages(none).pages).toBeLessThanOrEqual(1.2);
    expect(appendix(r)).toBeGreaterThan(appendix(none));
    expect(chapter(r)).toBe(chapter(none));
  });

  // G27 § 6: a free chapter costs no chart and no criterion cards; a locked card is cheaper than a full chapter.
  it("free chapters cost less than paid ones and a locked card less than a full chapter", () => {
    const free = freeFixtureReportV2();
    const paid = { ...free, tier: "standard" as const };
    const at = (report: typeof free, id: string) => estimatePages(report).sections.find((s) => s.id === id)!.pages;
    expect(at(free, "dim-tre")).toBeLessThan(at(paid, "dim-tre"));
    expect(at(free, "dim-cgh")).toBeLessThan(at(free, "dim-tre"));
    expect(estimatePages(free).visuals).toBe(1);
    expect(estimatePages(paid).visuals).toBeGreaterThan(8);
  });
});
