// Colocated suite for the per-recipient watermark (S21-A).
//
// Pins, by reading the text back out of the produced bytes with pdf-parse:
//   - the "Prepared for <recipient> · <date> · BlockID.au" line is present on
//     EVERY page of a multi-page document, not just the first;
//   - toggling the watermark off produces clean pages (no "Prepared for");
//   - `watermarkLabel()` returns null for a blank recipient so an empty
//     watermark is never drawn.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { renderDataRoomDocumentPdf, parseBlocks } from "./data-room-document-pdf";
import { watermarkLabel, watermarkDate } from "./watermark";

async function pageTexts(buffer: Buffer): Promise<string[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " "));
  } finally {
    await parser.destroy();
  }
}

// Long enough to spill across three or more A4 pages.
const LONG_BODY = [
  "# Financial projections",
  "",
  "| Year | Revenue | Gross margin |",
  "|---|---|---|",
  "| FY27 | A$1.2M | 71% |",
  "| FY28 | A$3.4M | 76% |",
  "",
  ...Array.from({ length: 60 }, (_, i) => [
    `## Section ${i + 1}`,
    "",
    "The projections in this section are estimates based on stated assumptions and **do not** constitute financial advice. Consult a qualified accountant before relying on them. ".repeat(3),
    "",
    `- Assumption ${i + 1}a: churn under 2% monthly`,
    `- Assumption ${i + 1}b: CAC payback inside nine months`,
    "",
  ]).flat(),
].join("\n");

describe("watermarkLabel", () => {
  it("builds the Prepared-for line with an en-AU date and the brand", () => {
    const label = watermarkLabel({ recipient: "jane@blackbird.vc", date: "2026-09-12T00:00:00Z" });
    expect(label).toBe("Prepared for jane@blackbird.vc · 12 Sept 2026 · BlockID.au");
  });

  it("returns null for a blank recipient so an empty mark is never drawn", () => {
    expect(watermarkLabel({ recipient: "" })).toBeNull();
    expect(watermarkLabel({ recipient: "   " })).toBeNull();
    expect(watermarkLabel({ recipient: null })).toBeNull();
  });

  it("collapses whitespace and caps a hostile recipient at 80 chars", () => {
    const label = watermarkLabel({ recipient: `  ${"x".repeat(200)}  \n y `, date: "2026-01-01" });
    expect(label).toMatch(/^Prepared for x{80} · /);
  });

  it("formats an invalid date as today rather than throwing", () => {
    expect(watermarkDate("not a date")).toMatch(/\d{4}$/);
  });
});

describe("DataRoomDocumentPDF watermark", () => {
  it("stamps the recipient line on every page of a multi-page document", async () => {
    const label = watermarkLabel({ recipient: "Jane Chen · Blackbird", date: "2026-09-12" })!;
    const buffer = await renderDataRoomDocumentPdf({
      startupName: "Northwind Freight",
      roomName: "Northwind Freight data room",
      folder: "3. Financial Projections",
      documentName: "Financial projections",
      body: LONG_BODY,
      watermark: label,
    });
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
    const pages = pdfPageCount(buffer);
    expect(pages).toBeGreaterThanOrEqual(3);
    const texts = await pageTexts(buffer);
    expect(texts.length).toBe(pages);
    for (const t of texts) {
      expect(t).toContain("Prepared for Jane Chen · Blackbird");
      expect(t).toContain("BlockID.au");
    }
  }, 120_000);

  it("renders clean pages when the watermark is off", async () => {
    const buffer = await renderDataRoomDocumentPdf({
      startupName: "Northwind Freight",
      roomName: "Northwind Freight data room",
      folder: "3. Financial Projections",
      documentName: "Financial projections",
      body: LONG_BODY,
      watermark: null,
    });
    const texts = await pageTexts(buffer);
    expect(texts.length).toBeGreaterThanOrEqual(3);
    for (const t of texts) expect(t).not.toContain("Prepared for");
    // The body itself still renders.
    expect(texts.join(" ")).toContain("Financial projections");
    expect(texts.join(" ")).toContain("not financial product advice");
  }, 120_000);
});

describe("parseBlocks", () => {
  it("parses headings, bullets, tables, rules and paragraphs and strips inline markers", () => {
    const blocks = parseBlocks(
      ["# Title", "", "Some **bold** and `code` text", "continued line", "", "- one", "- two", "", "---", "", "| a | b |", "|---|---|", "| 1 | 2 |"].join("\n"),
    );
    expect(blocks).toEqual([
      { kind: "h", level: 1, text: "Title" },
      { kind: "p", text: "Some bold and code text continued line" },
      { kind: "ul", items: ["one", "two"] },
      { kind: "rule" },
      { kind: "table", header: ["a", "b"], rows: [["1", "2"]] },
    ]);
  });

  it("returns no blocks for an empty body", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("\n\n  \n")).toEqual([]);
  });
});
