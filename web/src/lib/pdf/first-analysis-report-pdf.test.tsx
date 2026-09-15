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
import { sampleAgentSection, sampleReport } from "@/lib/analyses/first-analysis/fixtures";
import { BENCHMARK_TAG } from "@/lib/analyses/first-analysis/types";

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
    // S32-C: the cover says which model actually wrote the sections (the
    // fixture's stub provider/model), folded from the sections when no meta.
    expect(text).toContain("Prepared with stub via test");
  }, 60_000);

  it("S32-C: prints report.meta's Prepared-with line when the job wrote one", async () => {
    const report = sampleReport();
    report.meta = {
      sections: { ceo: { provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4-Flash", taskClass: "synthesis" } },
      models: ["DeepSeek-V4-Flash via DeepInfra"],
      preparedWith: "Prepared with DeepSeek-V4-Flash via DeepInfra.",
    };
    const { buffer } = await renderFirstAnalysisReportPdf({ report, variant: "free" });
    const text = await fullText(buffer);
    expect(text).toContain("Prepared with DeepSeek-V4-Flash via DeepInfra");
    expect(text).not.toContain("stub via test");
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
  // S32-E: a partial report (4 of 7 voices) still clears the floor by
  // structure, says "to follow" on the missing pages, and an unavailable
  // voice gets the honest one-liner.
  it("S32-E: a 4-of-7 partial renders part 1 — ≥ 10 pages, 'to follow' notes, part-1 cover line", async () => {
    const report = sampleReport();
    delete report.agents.cpo;
    delete report.agents.clo;
    delete report.agents.chro;
    report.sections = { cpo: { status: "failed", attempts: 1 }, clo: { status: "failed", attempts: 2 }, chro: { status: "failed", attempts: 1 } };
    report.partialAt = "2026-09-15T00:05:00.000Z";
    delete report.completedAt;
    const { buffer, pages } = await renderFirstAnalysisReportPdf({ report, variant: "free", part: "partial" });
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pages).toBeGreaterThanOrEqual(FIRST_ANALYSIS_MIN_PAGES);
    expect(pages).toBeGreaterThanOrEqual(17);
    const text = await fullText(buffer);
    expect(text).toContain("(part 1)");
    expect(text).toMatch(/Part 1 — 4 of 7 written · 3 to\s+follow/);
    expect(text).toContain("3 sections are still being written (CPO, CLO, CHRO)");
    expect(text).toMatch(/To follow — the CLO section for Kelpie is still being written/);
    expect(text).not.toContain("could not be written in this run");
  }, 60_000);

  it("S32-E: an unavailable voice prints the honest after-three-attempts line; the benchmark footer prints under a tagged section", async () => {
    const report = sampleReport();
    delete report.agents.chro;
    report.sections = { chro: { status: "unavailable", attempts: 3, error: "ungrounded" } };
    report.agents.cfo = sampleAgentSection("cfo", {
      body: `Plan a budget of A$140k ${BENCHMARK_TAG} for two hires. ${report.agents.cfo!.body}`,
      benchmarkFigures: ["A$140k"],
    });
    const { buffer, pages } = await renderFirstAnalysisReportPdf({ report, variant: "free", part: "single" });
    expect(pages).toBeGreaterThanOrEqual(17);
    const text = await fullText(buffer);
    expect(text).toMatch(/CHRO section for Kelpie could not be written after 3 attempts/);
    expect(text).toMatch(/6 of 7 written · 1 un-? ?available/);
    expect(text).toContain("Figures marked as benchmarks are market references, not your data");
    expect(text).toContain("(benchmark — not from your data)");
  }, 60_000);
});
