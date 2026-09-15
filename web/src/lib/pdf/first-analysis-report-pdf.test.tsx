// Colocated suite for the first-analysis PDF (S32-B), on the
// dividend-statement model: render, read the text back with pdf-parse, pin.
//
//   - free variant: >= FIRST_ANALYSIS_MIN_PAGES pages (the promise), and in
//     practice the seventeen the structure dictates; the company name on the
//     cover; the echo, SVI, valuation, every C-level voice, the 30-day plan,
//     glossary and disclaimer are all present;
//   - a report with NO agent sections still clears the floor (each voice's
//     page carries an honest "could not be written" note);
//   - unlimited variant adds the appendices (more pages);
//   - never "PhD"; the doctoral sentence verbatim; entity line present;
//   - no revenue → the SVI-based note is printed, never a revenue multiple.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { FIRST_ANALYSIS_MIN_PAGES, renderFirstAnalysisReportPdf } from "./first-analysis-report-pdf";
import { sampleReport } from "@/lib/analyses/first-analysis/fixtures";

async function fullText(buffer: Buffer): Promise<string> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " ")).join("\n");
  } finally {
    await parser.destroy();
  }
}

describe("renderFirstAnalysisReportPdf", () => {
  it("free variant: at least ten pages, the company name, and every section", async () => {
    const report = sampleReport();
    const { buffer, pages } = await renderFirstAnalysisReportPdf({ report, variant: "free" });
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pages).toBeGreaterThanOrEqual(FIRST_ANALYSIS_MIN_PAGES);
    expect(pages).toBeGreaterThanOrEqual(17);

    const text = await fullText(buffer);
    expect(text).toContain("Kelpie Rostering");
    expect(text).toContain("What we read");
    expect(text).toContain("Your Startup Value Index");
    expect(text).toContain("Indicative valuation");
    expect(text).toContain("Four views of the same company");
    for (const role of ["CEO", "CFO", "CMO", "CTO", "CPO", "CLO", "CHRO"]) {
      expect(text).toContain(role);
    }
    expect(text).toContain("Next steps");
    expect(text).toContain("Your first 30 days");
    expect(text).toContain("Day 0");
    expect(text).toContain("Glossary");
    expect(text).toContain("Disclaimers");
    expect(text).toContain("Auschain PTY LTD");
    expect(text).toContain("659 615 111");
    expect(text).toContain("grounded in the founder's doctoral research (DBA) on startup valuation");
    expect(text).not.toContain("PhD");
    // Revenue-anchored fixture → the honest basis line.
    expect(text).toContain("Revenue-anchored");
    expect(text).toContain("A$18,500");
  }, 60_000);

  it("clears the floor even with no agent sections, and says so honestly", async () => {
    const report = sampleReport({ agents: false });
    const { buffer, pages } = await renderFirstAnalysisReportPdf({ report, variant: "free" });
    expect(pages).toBeGreaterThanOrEqual(FIRST_ANALYSIS_MIN_PAGES);
    const text = await fullText(buffer);
    expect(text).toContain("could not be written in this run");
  }, 60_000);

  it("unlimited variant adds the appendices", async () => {
    const report = sampleReport();
    const free = await renderFirstAnalysisReportPdf({ report, variant: "free" });
    const paid = await renderFirstAnalysisReportPdf({ report, variant: "unlimited" });
    expect(paid.pages).toBeGreaterThan(free.pages);
    const text = await fullText(paid.buffer);
    expect(text).toContain("Appendix A");
    expect(text).toContain("Appendix B");
    expect(text).toContain("Appendix C");
  }, 90_000);

  it("prints the SVI-based note when no revenue was provided", async () => {
    const report = sampleReport({ rawText: "An idea for a marketplace for surplus building materials. Pre-revenue, two founders, no product yet." });
    const { buffer } = await renderFirstAnalysisReportPdf({ report, variant: "free" });
    const text = await fullText(buffer);
    expect(text).toContain("SVI-based");
    expect(text).toContain("No revenue was provided");
    expect(text).not.toContain("Revenue-anchored");
  }, 60_000);
});
