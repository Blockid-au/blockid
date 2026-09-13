// Colocated suite for the annual tax statement renderer (S28-A).
//
// Reads the text back with pdf-parse and pins:
//   - one A4 page; the FY range, statement number TS-<FY>-<n>, version;
//   - the founder's entity — never Auschain / BlockID's ACN or ABN;
//   - the annual totals (franked, unfranked, franking credits, TFN withheld,
//     net cash, grossed-up), the distribution count, each payment date;
//   - the DRIP line when shares were allotted;
//   - the "may be reported to the ATO / assessable income / offset" wording
//     and the not-tax-advice disclaimer; never "PhD";
//   - watermark when a recipient label is given; SUPERSEDED banner.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { TAX_STATEMENT_DISCLAIMER, fyRangeLabel, renderShareholderTaxStatementPdf } from "./shareholder-tax-statement-pdf";
import { watermarkLabel } from "./watermark";
import { SAMPLE_TAX_STATEMENT } from "@/lib/dividends/fixtures";
import { TAX_STATEMENT_ATO_NOTE } from "@/lib/dividends/fy-summary";

const HASH = "blockid:v1:" + "cd".repeat(32);

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

describe("renderShareholderTaxStatementPdf", () => {
  it("renders one A4 page with the FY totals, every distribution date, the founder's entity and the ATO / not-tax-advice wording", async () => {
    const buf = await renderShareholderTaxStatementPdf({ data: SAMPLE_TAX_STATEMENT, contentHash: HASH, watermark: null, version: 1 });
    expect(pdfPageCount(buf)).toBe(1);
    const [text] = await pageTexts(buf);

    // Entity — the founder's, as entered; never BlockID's own.
    expect(text).toContain("Acme Robotics Pty Ltd ACN 123 456 789 · ABN 12 345 678 901 · Sydney NSW");
    expect(text).not.toContain("Auschain");
    expect(text).not.toContain("659 615 111");
    expect(text).not.toContain("PPL Food");

    // Identity.
    expect(text).toContain("Annual dividend statement 2025-26");
    expect(text).toContain("TS-2025-26-1");
    expect(text).toContain("version 1");
    expect(text).toContain("made 20 July 2026");
    expect(fyRangeLabel(SAMPLE_TAX_STATEMENT.fy)).toBe("1 July 2025 – 30 June 2026");
    expect(text).toContain("1 July 2025 – 30 June 2026");

    // Shareholder.
    expect(text).toContain("Jane Founder");
    expect(text).toContain("600,000");
    expect(text).toContain("Yes");

    // Totals: 2 × A$30,000 fully franked at 25 % → A$20,000 credits, A$80,000 grossed-up.
    expect(SAMPLE_TAX_STATEMENT.totals).toMatchObject({ distributions: 2, grossAud: 60_000, frankedAud: 60_000, unfrankedAud: 0, frankingCreditAud: 20_000, tfnWithheldAud: 0, netPaidAud: 60_000, grossedUpAud: 80_000, dripShares: 10_948, dripReinvestedAud: 14_998.76 });
    expect(text).toContain("Total dividends paid (gross)");
    expect(text).toContain("A$60,000.00");
    expect(text).toContain("Total franked dividends");
    expect(text).toContain("Total unfranked dividends");
    expect(text).toContain("A$0.00");
    expect(text).toContain("Total franking credits");
    expect(text).toContain("A$20,000.00");
    expect(text).toContain("Total TFN amounts withheld");
    expect(text).toContain("Net cash paid to shareholder");
    expect(text).toContain("Grossed-up (assessable) amount");
    expect(text).toContain("A$80,000.00");
    expect(text).toContain("2"); // distributions in the year

    // DRIP.
    expect(text).toContain("Of which reinvested under the DRIP (10,948 shares)");
    expect(text).toContain("A$14,998.76");
    expect(text).toContain("10,948 shares were allotted under the dividend reinvestment plan");

    // Distribution rows with payment dates and statement numbers.
    expect(text).toContain("31 March 2026");
    expect(text).toContain("30 June 2026");
    expect(text).toContain("DS-7K3MP-Q9X2A (100% franked)");
    expect(text).toContain("DS-DRIP1-DRIP1 (100% franked)");
    expect(text).toContain("A$30,000.00");
    expect(text).toContain("A$10,000.00");
    // The 15 Jul 2026 statement is next FY — never on this page.
    expect(text).not.toContain("DS-ABCDE-FGHJK");
    expect(text).not.toContain("Seed Investor");

    // Wording.
    expect(text).toContain(TAX_STATEMENT_ATO_NOTE);
    expect(text).toContain("may be reported to the Australian Taxation Office (ATO)");
    expect(text).toContain("franking credits as assessable income");
    expect(text).toContain("claim the franking credits as a tax offset");
    expect(text).toContain("general information only");
    expect(text).toContain("not tax advice");
    expect(text).toContain(TAX_STATEMENT_DISCLAIMER);
    expect(text).toContain("not tax, legal, accounting or personal financial product advice");
    expect(text).toContain("does not hold an Australian Financial Services Licence (AFSL)");
    expect(text).toContain(HASH);
    expect(text).not.toMatch(/PhD/);
    expect(text).not.toContain("SUPERSEDED");
  });

  it("burns the watermark and prints the SUPERSEDED banner for an old version", async () => {
    const wm = watermarkLabel({ recipient: "Jane's accountant", date: "2026-07-20" });
    const buf = await renderShareholderTaxStatementPdf({ data: SAMPLE_TAX_STATEMENT, contentHash: HASH, watermark: wm, version: 1, supersededAt: "2026-08-01T00:00:00Z" });
    const [text] = await pageTexts(buf);
    expect(text).toContain("Prepared for Jane's accountant");
    expect(text).toContain("SUPERSEDED");
    expect(text).toContain("1 August 2026");

    const clean = await pageTexts(await renderShareholderTaxStatementPdf({ data: SAMPLE_TAX_STATEMENT, contentHash: HASH, watermark: null }));
    expect(clean[0]).not.toContain("Prepared for");
    expect(clean[0]).not.toContain("SUPERSEDED");
  });
});
