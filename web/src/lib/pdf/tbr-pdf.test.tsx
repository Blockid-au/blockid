// Trusted Business Report v2 PDF (S-R4) — colocated suite.
//
//   - standard demo renders; every chapter title appears IN ORDER and the
//     order equals the web TOC (`tbrV2Toc`) — goal doc §6 verification 2
//     (identical chapter structure on every surface);
//   - free fixture: the RENDERED page count is ≤ FREE_PAGE_BUDGET (goal doc
//     §6 verification 5), the file still carries all 15 sections, card
//     chapters print their upgrade line + a11y table, and the trim level
//     is reported;
//   - a caller-supplied "Prepared with <model via provider>" line is kept
//     verbatim; the default names the pipeline version;
//   - every rendered page count agrees between the two page-count readers.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { tbrV2Toc } from "@/components/tbr/v2/report";
import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { levelForEstimate, projectForTier } from "@/lib/report-v2/free-tier";
import { FREE_PAGE_BUDGET } from "@/lib/report-v2/schema";
import { pdfPageCount, pdfPageCountsAgree } from "./page-count";
import { defaultPreparedWith, renderTbrPdf, tbrPdfOutline } from "./tbr-pdf";
import { pdfFontFiles, pdfFontsForLocale } from "./fonts";

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

/** Positions of each label in the text, asserting they are all present and ascending. */
function assertOrdered(text: string, labels: string[]): void {
  let last = -1;
  for (const label of labels) {
    const needle = label.replace(/\s+/g, " ").replace(/[×]/g, "×");
    const idx = text.indexOf(needle, last + 1);
    expect(idx, `"${label}" missing or out of order`).toBeGreaterThan(last);
    last = idx;
  }
}

describe("renderTbrPdf — standard tier", () => {
  it("renders the demo report with every section in the web's chapter order", async () => {
    const report = demoReportV2();
    const { buffer, pages, level, overBudget } = await renderTbrPdf(report);
    expect(level).toBe(0);
    expect(overBudget).toBe(false);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pdfPageCountsAgree(buffer)).toBe(true);
    expect(pages).toBeGreaterThanOrEqual(12);

    const text = await fullText(buffer);
    expect(text).toContain("Sample SME Compliance SaaS (demo)");
    // Web ↔ PDF parity: same labels, same order.
    const web = tbrV2Toc(report).map((e) => e.label);
    const pdf = tbrPdfOutline(report).map((e) => e.label);
    expect(pdf).toEqual(web);
    assertOrdered(text, pdf);
    // Paid detail present.
    expect(text).toContain("Revenue multiple");
    expect(text).toContain("Risk-factor summation");
    expect(text).toContain("AU comparables");
    expect(text).toContain("Auditor log");
    expect(text).toContain(defaultPreparedWith(report));
    expect(text).toContain("Auschain PTY LTD");
    expect(text).not.toContain("Unlock the full");
  }, 60_000);

  it("keeps a caller-supplied 'Prepared with <model via provider>' line verbatim", async () => {
    const report = demoReportV2();
    const { buffer } = await renderTbrPdf(report, { preparedWith: "Prepared with DeepSeek-V4-Flash via DeepInfra." });
    const text = await fullText(buffer);
    expect(text).toContain("Prepared with DeepSeek-V4-Flash via DeepInfra.");
  }, 60_000);
});

describe("renderTbrPdf — locale vi uses the bundled Noto Sans (S-R5, W4 review c)", () => {
  it("Vietnamese diacritics survive in the rendered text; English still renders with Helvetica (stripped)", async () => {
    expect(pdfFontFiles()).not.toBeNull();
    const report = { ...demoReportV2(), locale: "vi" as const };
    report.cover.startupName = "Định giá khởi nghiệp Việt";
    const vi = await renderTbrPdf(report, { locale: "vi" });
    const viText = await fullText(vi.buffer);
    expect(viText).toContain("Định giá khởi nghiệp Việt");
    expect(vi.buffer.toString("latin1")).toContain("NotoSans");

    const en = await renderTbrPdf({ ...demoReportV2(), locale: "en" }, { locale: "en" });
    expect(en.buffer.toString("latin1")).not.toContain("NotoSans");
    expect(en.buffer.toString("latin1")).toContain("Helvetica");
    expect(pdfFontsForLocale("en").unicode).toBe(false);
    expect(pdfFontsForLocale("vi")).toMatchObject({ regular: "Noto Sans", unicode: true });
  }, 120_000);
});

describe("renderTbrPdf — free tier page-count gate", () => {
  it("free fixture renders within the 10-page budget (real page count), all 15 sections present", async () => {
    const report = freeFixtureReportV2();
    expect(report.tier).toBe("free");
    const { buffer, pages, level, overBudget } = await renderTbrPdf(report);
    expect(pages).toBe(pdfPageCount(buffer));
    expect(pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(overBudget).toBe(false);
    expect(level).toBeGreaterThanOrEqual(levelForEstimate(report));

    const text = await fullText(buffer);
    assertOrdered(text, tbrPdfOutline(report).map((e) => e.label));
    // Chapters 6–9 are cards with the upgrade line; their a11y table is printed.
    const cards = report.dimensions.filter((d) => d.renderAs === "card");
    expect(cards.map((d) => d.dim)).toEqual(["cgh", "iri", "lco", "svm"]);
    for (const c of cards) expect(text).toContain(`Unlock the full ${c.title} chapter`);
    expect(text).toContain("Free tier (10-page budget) omits");
    expect(text).toContain("page 1/");
  }, 90_000);

  it("a free report padded with long verdicts still lands within budget by stepping the trim level", async () => {
    const report = freeFixtureReportV2();
    const pad = Array.from({ length: 70 }, (_, i) => `word${i}`).join(" ");
    report.dimensions = report.dimensions.map((d) => ({ ...d, verdict: `${d.verdict} ${pad}`, strengths: [...d.strengths, pad, pad], gaps: [...d.gaps, pad, pad] }));
    const { pages, level, overBudget } = await renderTbrPdf(report);
    expect(overBudget).toBe(false);
    expect(pages).toBeLessThanOrEqual(FREE_PAGE_BUDGET);
    expect(level).toBeGreaterThan(0);
  }, 120_000);

  it("maxPages override forces a tighter budget", async () => {
    const report = freeFixtureReportV2();
    const r = await renderTbrPdf(report, { maxPages: 8 });
    // Level 4 is the ceiling; the result reports honestly either way.
    expect(r.level).toBeGreaterThanOrEqual(2);
    expect(r.pages).toBe(pdfPageCount(r.buffer));
  }, 120_000);
});

describe("projectForTier", () => {
  it("is the identity for paid tiers and projects the free tier without touching chapter data validity", () => {
    const std = demoReportV2();
    const p = projectForTier(std, 3);
    expect(p.report).toBe(std);
    expect(p.level).toBe(0);
    expect(p.dropped).toEqual([]);

    const free = freeFixtureReportV2();
    const f0 = projectForTier(free, 0);
    expect(f0.free).toBe(true);
    expect(f0.report.dimensions.every((d) => d.secondaryVisuals.length === 0)).toBe(true);
    expect(f0.report.dimensions.filter((d) => d.renderAs === "card").every((d) => d.criteria.length === 1)).toBe(true);
    expect(f0.report.actionPlan.steps.length).toBeLessThanOrEqual(5);
    expect(f0.report.moneyOnTable.grants.length).toBeLessThanOrEqual(3);
    expect(f0.show).toEqual({ evidenceTables: true, phaseLens: true, criterionDetail: true });
    // Evidence rows are never stripped (the schema's "no evidence ⇒ not real" rule still holds).
    expect(f0.report.dimensions.map((d) => d.evidence.length)).toEqual(free.dimensions.map((d) => d.evidence.length));
    const f2 = projectForTier(free, 2);
    expect(f2.show.evidenceTables).toBe(false);
    expect(f2.dropped).toContain("evidence tables");
    const f4 = projectForTier(free, 4);
    expect(f4.report.executive.visuals).toEqual([]);
    expect(f4.report.appendix.evidenceRegister).toEqual([]);
  });
});
