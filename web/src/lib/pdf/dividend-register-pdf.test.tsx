// Colocated suite for the dividend register renderer (S25-B; added in the
// S25 post-ship review — the register only had a describe inside the
// statement suite).
//
// Renders to a buffer, reads the text back with pdf-parse and pins:
//   - one landscape A4 page; header, period, generated / declared / paid;
//   - the paying entity is the FOUNDER's company (name + ABN/ACN) — never
//     Auschain / BlockID's own ABN/ACN — while the BlockID not-tax-advice
//     disclaimer is present; never "PhD";
//   - one row per statement (number, shareholder, role, "no TFN"), the
//     totals row (issued count, shares, gross, franking credits, net) and
//     the reconciliation line against the declared total;
//   - a voided statement is listed "(VOID)", counted as voided and struck
//     from the totals; a variance is flagged; an empty register says so;
//   - the watermark is burnt in when a recipient label is given.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { DIVIDEND_STATEMENT_DISCLAIMER } from "./dividend-statement-pdf";
import { renderDividendRegisterPdf } from "./dividend-register-pdf";
import { buildDividendRegister, buildDividendStatement } from "@/lib/dividends/statement";
import { SAMPLE_COMPANY, SAMPLE_NOW, SAMPLE_PAYOUTS, SAMPLE_RECORD, SAMPLE_REGISTER, SAMPLE_STATEMENT } from "@/lib/dividends/fixtures";

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

describe("renderDividendRegisterPdf", () => {
  it("lists every statement with totals and the reconciliation line on one landscape page, under the founder's entity", async () => {
    const buf = await renderDividendRegisterPdf({ data: SAMPLE_REGISTER, watermark: null });
    expect(pdfPageCount(buf)).toBe(1);
    const [text] = await pageTexts(buf);

    // Header + period + dates.
    expect(text).toContain("Dividend register");
    expect(text).toContain("June 2026");
    expect(text).toContain("16 July 2026"); // generated
    expect(text).toContain("1 July 2026"); // declared
    expect(text).toContain("15 July 2026"); // paid
    expect(text).toContain("100% franked");
    expect(text).toContain("25% (base rate entity)");
    expect(text).toContain("A$0.050000 per share");

    // Entity — the founder's, never BlockID's.
    expect(text).toContain("Acme Robotics Pty Ltd");
    expect(text).toContain("ABN 12 345 678 901");
    expect(text).toContain("ACN 123 456 789");
    expect(text).not.toContain("Auschain");
    expect(text).not.toContain("659 615 111");
    expect(text).not.toContain("PPL Food");

    // Rows.
    expect(text).toContain("DS-7K3MP-Q9X2A");
    expect(text).toContain("DS-ABCDE-FGHJK");
    expect(text).toContain("Jane Founder · founder");
    expect(text).toContain("Seed Investor Pty Ltd · investor · no TFN");
    expect(text).toContain("600,000");
    expect(text).toContain("400,000");
    expect(text).toContain("A$30,000.00");
    expect(text).toContain("A$20,000.00");
    expect(text).not.toContain("(VOID)");

    // Totals row.
    expect(text).toContain("Totals");
    expect(text).toContain("2 issued");
    expect(text).not.toContain("voided");
    expect(text).toContain("1,000,000");
    expect(text).toContain("A$50,000.00"); // gross total = declared total
    expect(text).toContain("A$16,666.67"); // 10,000 + 6,666.67 franking credits

    // Reconciliation line. The KV labels are letter-spaced uppercase, which
    // pdf-parse returns with a space between glyphs ("TOTA L D I V I D E N D"),
    // so the label + value pairs are pinned on the space-stripped text.
    const tight = text.replace(/\s+/g, "");
    expect(tight).toContain("TOTALDIVIDENDDECLAREDA$50,000.00");
    expect(tight).toContain("TOTALONISSUEDSTATEMENTSA$50,000.00");
    expect(tight).toContain("RECONCILIATIONReconciled");
    expect(tight).toContain("TOTALFRANKINGCREDITSA$16,666.67");
    expect(text).not.toContain("Variance");
    expect(text).not.toContain("do not add up");

    // Disclaimer + footer.
    expect(text).toContain(DIVIDEND_STATEMENT_DISCLAIMER);
    expect(text).toContain("not tax, legal, accounting or personal financial product advice");
    expect(text).toContain("Acme Robotics Pty Ltd · Dividend register June 2026");
    expect(text).not.toMatch(/PhD/);
    expect(text).not.toContain("Prepared for");
  });

  it("a voided statement is listed (VOID), counted as voided and struck from the totals → variance flagged", async () => {
    const data = buildDividendRegister({
      company: SAMPLE_COMPANY,
      record: SAMPLE_RECORD,
      statements: [
        { payload: SAMPLE_STATEMENT, statementNo: SAMPLE_STATEMENT.statementNo, voidedAt: null },
        {
          payload: buildDividendStatement(
            { company: SAMPLE_COMPANY, record: SAMPLE_RECORD, payout: SAMPLE_PAYOUTS[1], shareholder: { id: null, name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 400_000, tfnOnFile: false }, now: SAMPLE_NOW },
            "DS-ABCDE-FGHJK",
          ),
          statementNo: "DS-ABCDE-FGHJK",
          voidedAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      now: SAMPLE_NOW,
    });
    expect(data.totals).toMatchObject({ statementsIssued: 1, statementsVoided: 1, grossAud: 30_000, sharesHeld: 600_000 });
    expect(data.reconciled).toBe(false);

    const buf = await renderDividendRegisterPdf({ data, watermark: null });
    expect(pdfPageCount(buf)).toBe(1);
    const [text] = await pageTexts(buf);
    expect(text).toContain("DS-ABCDE-FGHJK (VOID)");
    expect(text).toContain("1 issued · 1 voided");
    expect(text).toContain("A$30,000.00");
    const tight = text.replace(/\s+/g, "");
    expect(tight).toContain("TOTALDIVIDENDDECLAREDA$50,000.00");
    expect(tight).toContain("TOTALONISSUEDSTATEMENTSA$30,000.00");
    expect(tight).toContain("RECONCILIATIONVariance-A$20,000.00");
    expect(text).toContain("do not add up to the declared total");
    expect(text).toContain("Acme Robotics Pty Ltd");
  });

  it("an empty register says so; the watermark is burnt in when a recipient is given", async () => {
    const empty = { ...SAMPLE_REGISTER, rows: [], totals: { ...SAMPLE_REGISTER.totals, grossAud: 0, statementsIssued: 0 }, reconciled: true, varianceAud: 0 };
    const [t1] = await pageTexts(await renderDividendRegisterPdf({ data: empty, watermark: null }));
    expect(t1).toContain("No statements have been issued for this dividend yet.");
    expect(t1).toContain("0 issued");
    expect(t1).toContain("Reconciled");

    const [t2] = await pageTexts(await renderDividendRegisterPdf({ data: SAMPLE_REGISTER, watermark: "Prepared for auditor · 16 Jul 2026 · BlockID.au" }));
    expect(t2).toContain("Prepared for auditor");
    expect(t2).toContain("Reconciled");
  });
});
