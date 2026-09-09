import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";

import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { FREE_SUMMARY_PAGE_COUNT } from "@/lib/analyses/free-summary";

import { pdfPageCount, pdfPageCountsAgree } from "./page-count";
import { SVISummaryPDF } from "./svi-summary-pdf";

// A dense, fully-evidenced input — the case most likely to overflow a page
// and quietly turn five pages into six.
const RICH = [
  "Northwind Freight is an Australian B2B logistics SaaS founded in Sydney by two",
  "technical co-founders who previously scaled a warehouse management platform.",
  "We have a live product in production, 140 paying customers, A$68,000 MRR growing",
  "14 per cent month on month, gross margin of 81 per cent, net revenue retention of",
  "118 per cent and churn under 2 per cent. We hold an ABN and an ACN, we have a",
  "registered trademark, a cap table with four-year founder vesting and a one-year",
  "cliff, an employee share option plan approved by the board, signed customer",
  "contracts, audited financial statements, a data room, a pitch deck, forty customer",
  "interviews, two patents pending, ISO 27001 certification in progress, an advisory",
  "board of three, and a Series A raise planned for the next two quarters.",
].join(" ");

const SPARSE = "An idea for an app.";

async function render(rawText: string, startupName?: string) {
  const analysis = computeSVI(extractSignals({ rawText }));
  return renderToBuffer(SVISummaryPDF({ analysis, startupName }));
}

describe("SVISummaryPDF", () => {
  it("is exactly five pages for a dense, fully-evidenced analysis", async () => {
    // The whole free tier rests on this number. `wrap={false}` on every Page
    // plus the hard slice budgets are what make it true; this reads the count
    // back out of the produced file rather than trusting the source.
    const buffer = await render(RICH, "Northwind Freight");
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdfPageCountsAgree(buffer)).toBe(true);
    expect(pdfPageCount(buffer)).toBe(FREE_SUMMARY_PAGE_COUNT);
  }, 120_000);

  it("is exactly five pages for a near-empty analysis too", async () => {
    // The other failure mode: a thin input producing no gaps and no actions
    // must not collapse a page or leave one blank.
    const buffer = await render(SPARSE);
    expect(pdfPageCount(buffer)).toBe(FREE_SUMMARY_PAGE_COUNT);
  }, 120_000);

  it("is exactly five pages with no startup name supplied", async () => {
    const buffer = await render(RICH);
    expect(pdfPageCount(buffer)).toBe(FREE_SUMMARY_PAGE_COUNT);
  }, 120_000);

  it("renders a substantial document, not a stub", async () => {
    const buffer = await render(RICH, "Northwind Freight");
    expect(buffer.length).toBeGreaterThan(20_000);
  }, 120_000);

  it("is materially smaller than the paid report it upsells", async () => {
    const { SVIReportPDF } = await import("./svi-report-pdf");
    const analysis = computeSVI(extractSignals({ rawText: RICH }));
    const free = await renderToBuffer(SVISummaryPDF({ analysis }));
    const paid = await renderToBuffer(
      SVIReportPDF({ analysis, tier: "standard" }),
    );
    expect(pdfPageCount(free)).toBeLessThan(pdfPageCount(paid));
    expect(pdfPageCount(paid)).toBeGreaterThanOrEqual(10);
  }, 180_000);

  it("does not throw on an analysis with an unusual stage", async () => {
    const analysis = computeSVI(extractSignals({ rawText: RICH }));
    const buffer = await renderToBuffer(
      SVISummaryPDF({
        analysis: { ...analysis, stage: 7, percentileRank: undefined },
        startupName: "Edge Case Co",
        reportDate: "1 January 2026",
      }),
    );
    expect(pdfPageCount(buffer)).toBe(FREE_SUMMARY_PAGE_COUNT);
  }, 120_000);
});
