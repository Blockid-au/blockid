// Colocated suite for the distribution statement renderer (S25-B). The
// register renderer has its own suite: dividend-register-pdf.test.tsx.
//
// Reads the text back with pdf-parse and pins:
//   - one A4 page; every s 202-80 field (entity + ABN/ACN, date paid, gross,
//     franked, unfranked, franking credit, franking %, corporate tax rate,
//     TFN withheld, holding, statement date, statement number);
//   - the paying entity is the FOUNDER's company — never Auschain / BlockID's
//     ACN or ABN — while the BlockID not-tax-advice disclaimer is present;
//   - never "PhD";
//   - the TFN withholding line on a no-TFN partially franked statement;
//   - watermark when a recipient label is given, clean page otherwise;
//   - VOID banner; content hash printed in full.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { DIVIDEND_STATEMENT_DISCLAIMER, renderDividendStatementPdf } from "./dividend-statement-pdf";
import { watermarkLabel } from "./watermark";
import { SAMPLE_STATEMENT, SAMPLE_STATEMENT_WITHHELD } from "@/lib/dividends/fixtures";

const HASH = "blockid:v1:" + "ab".repeat(32);

async function pageTexts(buffer: Buffer): Promise<string[]> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " "));
  } finally {
    await parser.destroy();
  }
}

describe("renderDividendStatementPdf", () => {
  it("renders one A4 page with every required field, the founder's entity and the not-tax-advice disclaimer", async () => {
    const buf = await renderDividendStatementPdf({ data: SAMPLE_STATEMENT, contentHash: HASH, watermark: null });
    expect(pdfPageCount(buf)).toBe(1);
    const [text] = await pageTexts(buf);

    // Entity — the founder's, as entered. (Letter-spaced uppercase labels
    // come back from pdf-parse with spaces between glyphs, so the body text
    // — not the "PAYING ENTITY" label — is what gets pinned.)
    expect(text).toContain("Acme Robotics Pty Ltd ACN 123 456 789 · ABN 12 345 678 901 · Sydney NSW");
    // Never BlockID's own entity as the payer.
    expect(text).not.toContain("Auschain");
    expect(text).not.toContain("659 615 111");
    expect(text).not.toContain("PPL Food");

    // Statement identity + dates.
    expect(text).toContain("Distribution statement");
    expect(text).toContain("DS-7K3MP-Q9X2A");
    expect(text).toContain("made 16 July 2026");
    expect(text).toContain("15 July 2026"); // date paid
    expect(text).toContain("June 2026");

    // Shareholder + holding.
    expect(text).toContain("Jane Founder");
    expect(text).toContain("founder");
    expect(text).toContain("Ordinary");
    expect(text).toContain("600,000");
    expect(text).toContain("60%");
    expect(text).toContain("Yes"); // TFN / ABN quoted

    // Amounts.
    expect(text).toContain("Amount of dividend (gross)");
    expect(text).toContain("A$30,000.00");
    expect(text).toContain("Franked amount (100% franked)");
    expect(text).toContain("Unfranked amount");
    expect(text).toContain("A$0.00");
    expect(text).toContain("Franking credit");
    expect(text).toContain("A$10,000.00");
    expect(text).toContain("25% (base rate entity)");
    expect(text).toContain("TFN amount withheld");
    expect(text).toContain("Net amount paid to shareholder");
    expect(text).toContain("Grossed-up (assessable) amount");
    expect(text).toContain("A$40,000.00");
    expect(text).toContain("corporate tax rate for imputation 25% (base rate entity)");
    expect(text).toContain("A$0.050000");
    expect(text).toContain("s 202-80");

    // Disclaimer + hash.
    expect(text).toContain(DIVIDEND_STATEMENT_DISCLAIMER);
    expect(text).toContain("not tax, legal, accounting or personal financial product advice");
    expect(text).toContain("does not hold an Australian Financial Services Licence (AFSL)");
    expect(text).toContain("prepared with BlockID.au");
    expect(text).toContain(HASH);
    expect(text).not.toMatch(/PhD/);
    expect(text).not.toContain("VOID");
  });

  it("no TFN + partially franked at 30 %: prints the 47 % withholding line and the split", async () => {
    const buf = await renderDividendStatementPdf({ data: SAMPLE_STATEMENT_WITHHELD, contentHash: HASH, watermark: null });
    const [text] = await pageTexts(buf);
    expect(text).toContain("Seed Investor Pty Ltd");
    expect(text).toContain("Franked amount (50% franked)");
    expect(text).toContain("A$10,000.00"); // franked and unfranked halves
    expect(text).toContain("TFN amount withheld (47% of the unfranked amount)");
    expect(text).toContain("A$4,700.00");
    expect(text).toContain("A$15,300.00"); // net paid
    expect(text).toContain("A$4,285.71"); // 10,000 × 3/7
    expect(text).toContain("30%");
    expect(text).not.toContain("base rate entity");
    expect(text).toContain("No TFN or ABN was quoted");
    expect(text).toContain("No");
  });

  it("burns the watermark when a recipient is given and prints the VOID banner when voided", async () => {
    const wm = watermarkLabel({ recipient: "Jane Founder", date: "2026-07-16" });
    const buf = await renderDividendStatementPdf({ data: SAMPLE_STATEMENT, contentHash: HASH, watermark: wm, voidedAt: "2026-07-20T00:00:00Z", voidReason: "wrong holding" });
    const [text] = await pageTexts(buf);
    expect(wm).toMatch(/^Prepared for Jane Founder · 16 Jul\w* 2026 · BlockID\.au$/);
    expect(text).toContain("Prepared for Jane Founder");
    expect(text).toContain("VOID");
    expect(text).toContain("20 July 2026");
    expect(text).toContain("wrong holding");

    const clean = await pageTexts(await renderDividendStatementPdf({ data: SAMPLE_STATEMENT, contentHash: HASH, watermark: null }));
    expect(clean[0]).not.toContain("Prepared for");
  });
});
