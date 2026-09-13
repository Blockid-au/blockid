// Colocated suite for the board resolution renderer (S26-B) — one pdf-parse
// pass per kind (share issue / dividend / ESOP) pinning:
//   - A4, the FOUNDER's company block (never Auschain / BlockID's ACN as the
//     company), the s 248A "passed when signed by all directors" basis (or
//     s 248B for a sole director), every RESOLVED THAT paragraph, the key
//     facts, the director signature blocks (named, or blank lines), the
//     advice disclaimer footer and the full content hash;
//   - watermark when a recipient label is given;
//   - never "PhD".

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { BOARD_RESOLUTION_NOTE, renderBoardResolutionPdf, renderDividendResolutionPdf, renderEsopResolutionPdf, renderShareIssueResolutionPdf } from "./board-resolution-pdf";
import { PDF_GENERAL_ADVICE_DISCLAIMER } from "./advice-disclaimer";
import { watermarkLabel } from "./watermark";
import { buildDividendResolution, buildEsopResolution, buildShareIssueResolution } from "@/lib/board-resolutions/build";
import { FIXTURE_COMPANY, FIXTURE_DIRECTORS, FIXTURE_DIVIDEND, FIXTURE_ESOP, FIXTURE_SHARE_ISSUE } from "@/lib/board-resolutions/fixtures";

const HASH = "blockid:v1:" + "cd".repeat(32);
const NOW = new Date("2026-09-13T01:00:00Z");

async function text(buffer: Buffer): Promise<string> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text).join("\n").replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

function common(t: string) {
  expect(t).toContain("Acme Robotics Pty Ltd ACN 123 456 789 · ABN 12 345 678 901 · Sydney NSW");
  expect(t).toContain("Circulating resolution — Corporations Act 2001 (Cth) s 248A. Passed when signed by all directors entitled to vote");
  expect(t).toContain("Jane Founder");
  expect(t).toContain("Raj Cofounder");
  expect(t).toContain("Director · Date:");
  expect(t).toContain("Each of the undersigned, being a director of the Company entitled to vote");
  expect(t).toContain(PDF_GENERAL_ADVICE_DISCLAIMER);
  expect(t).toContain("not legal, tax or accounting advice");
  expect(t).toContain(BOARD_RESOLUTION_NOTE);
  expect(t).toContain(HASH);
  expect(t).toContain("Prepared 13 September 2026");
  expect(t).not.toMatch(/PhD/);
  expect(t).not.toContain("Prepared for");
}

describe("renderBoardResolutionPdf", () => {
  it("share issue: class, number, price, allottee, consideration, s 254X reminder", async () => {
    const data = buildShareIssueResolution({ company: FIXTURE_COMPANY, record: FIXTURE_SHARE_ISSUE, directors: FIXTURE_DIRECTORS, now: NOW });
    const buf = await renderShareIssueResolutionPdf({ data, contentHash: HASH, watermark: null });
    expect(pdfPageCount(buf)).toBeLessThanOrEqual(2);
    const t = await text(buf);
    common(t);
    expect(t).toContain("Circulating resolution of the directors — issue of shares");
    expect(t).toContain("Seed Investor Pty Ltd (investor)");
    expect(t).toContain("400,000");
    expect(t).toContain("A$0.2500 per share");
    expect(t).toContain("A$100,000.00");
    expect(t).toContain("1 August 2026");
    expect(t).toContain("1. RESOLVED THAT the Company issue and allot 400,000 fully paid Ordinary shares");
    expect(t).toContain("4. RESOLVED THAT any director or the company secretary is authorised to lodge the notice");
    expect(t).toContain("Form 484");
    expect(t).toContain("within 28 days of the issue (Corporations Act s 254X)");
  });

  it("dividend: s 254T statement, amount, per share, franking, payment date", async () => {
    const data = buildDividendResolution({ company: FIXTURE_COMPANY, record: FIXTURE_DIVIDEND, directors: FIXTURE_DIRECTORS, now: NOW });
    const buf = await renderDividendResolutionPdf({ data, contentHash: HASH, watermark: null });
    const t = await text(buf);
    common(t);
    expect(t).toContain("Circulating resolution of the directors — declaration of dividend");
    expect(t).toContain("assets exceed its liabilities and the excess is sufficient for the payment of the dividend");
    expect(t).toContain("does not materially prejudice the Company's ability to pay its creditors (Corporations Act 2001 (Cth) s 254T)");
    expect(t).toContain("fully franked dividend of A$0.050000 per share, totalling A$50,000.00");
    expect(t).toContain("June 2026");
    expect(t).toContain("15 July 2026");
    expect(t).toContain("100% (fully franked)");
    expect(t).toContain("25%");
    expect(t).toContain("s 202-80");
  });

  it("ESOP: pool size, %, vesting defaults; sole director → s 248B and one signature block", async () => {
    const data = buildEsopResolution({ company: FIXTURE_COMPANY, record: FIXTURE_ESOP, directors: [{ name: "Jane Founder" }], now: NOW });
    const buf = await renderEsopResolutionPdf({ data, contentHash: HASH, watermark: null });
    const t = await text(buf);
    expect(t).toContain("Circulating resolution of the directors — adoption of employee share option plan");
    expect(t).toContain("Sole director's resolution — Corporations Act 2001 (Cth) s 248B");
    expect(t).toContain("Signed by the sole director");
    expect(t).toContain("Sole director · Date:");
    expect(t).not.toContain("Raj Cofounder");
    expect(t).toContain("1,000,000 shares (10% of the fully diluted capital)");
    expect(t).toContain("48 months with a 12-month cliff");
    expect(t).toContain("Acme Robotics Pty Ltd Employee Share Option Plan (the Plan)");
    expect(t).toContain("Div 83A");
    expect(t).toContain(PDF_GENERAL_ADVICE_DISCLAIMER);
    expect(t).toContain(HASH);
  });

  it("no directors stored → two blank signature lines; watermark burned when a recipient is given", async () => {
    const data = buildShareIssueResolution({ company: { ...FIXTURE_COMPANY, acn: null, abn: null, address: null }, record: FIXTURE_SHARE_ISSUE, directors: [], now: NOW });
    const wm = watermarkLabel({ recipient: "Jane Founder", date: "2026-09-13" });
    const t = await text(await renderBoardResolutionPdf({ data, contentHash: HASH, watermark: wm }));
    expect(t.match(/Director name: _+/g)?.length).toBe(2);
    expect(t).toContain("ACN not supplied · ABN not supplied");
    expect(t).toContain("Prepared for Jane Founder");
    // The disclaimer names BlockID's entity as the PRODUCER; the company block never does.
    expect(t).not.toContain("Company Auschain");
  });
});
