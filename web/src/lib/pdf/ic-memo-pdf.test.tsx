// IC memo / one-pager PDF (G13-W5-D3) — colocated suite.
//
//   - one_page renders to exactly ONE page (S6) with the header numbers, the
//     decision, the valuation line and the footer "Prepared with BlockID.au
//     · Auschain PTY LTD · not financial advice";
//   - memo renders 2–4 pages with Valuation, Risks and questions and Seat
//     views (each seat's decision / conviction / top risk — F3);
//   - the raw "Weight" column appears only when weightsShown (F3 / R5);
//     the weighted score column is always there;
//   - private notes never reach the PDF (the record has none by
//     construction — pinned by text search on a sentinel).

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { buildIcSections } from "@/lib/evaluations/ic-reports";
import { fakeView } from "@/lib/evaluations/ic-reports.fixture";
import { pdfPageCount } from "./page-count";
import { IC_MEMO_FOOTER, IC_MEMO_MAX_PAGES, renderIcMemoPdf } from "./ic-memo-pdf";

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

const demo = demoReportV2();
const radar = demo.cover.visuals.find((v) => v.kind === "radar") ?? null;
const rangeBars = demo.valuation.visuals.find((v) => v.kind === "range_bars") ?? null;

describe("renderIcMemoPdf — one_page (Scout)", () => {
  it("is exactly one page with the decision record, valuation line and the S6 footer; no raw weights", async () => {
    const sections = buildIcSections(fakeView(), "one_page", { weightsShown: false });
    const { buffer, pages } = await renderIcMemoPdf({ kind: "one_page", sections, radar, rangeBars, weightsShown: false, generatedAt: "2026-09-16T00:00:00Z", generatedBy: "Sam Scout" });
    expect(pages).toBe(1);
    expect(pdfPageCount(buffer)).toBe(1);
    const text = await fullText(buffer);
    // The kicker is letter-spaced uppercase — compare without whitespace.
    expect(text.replace(/\s/g, "")).toContain("INVESTORONE-PAGER");
    expect(text).toContain("Acme Robotics");
    expect(text).toContain("PROCEED");
    expect(text).toContain("Thesis fit 71%");
    expect(text).toMatch(/Consensus A\$4(\.0)?M/);
    expect(text).toContain(IC_MEMO_FOOTER);
    expect(text).toContain("Auschain PTY LTD");
    expect(text).toContain("page 1/1");
    expect(text.replace(/\s|-/g, "")).not.toMatch(/DIMENSIONWEIGHTSCORE/);
    expect(text.replace(/\s|-/g, "")).toContain("SCOREWEIGHTEDP50");
    expect(text).not.toContain("PRIVATE-NOTE-BODY");
    expect(text).not.toContain("Seat views");
  });
});

describe("renderIcMemoPdf — memo (Firm / Program)", () => {
  it("renders 2–4 pages with valuation, risks / questions and seat views; the Weight column only when weightsShown", async () => {
    const view = fakeView();
    const plain = buildIcSections(view, "memo", { weightsShown: false });
    const a = await renderIcMemoPdf({ kind: "memo", sections: plain, radar, rangeBars, weightsShown: false, generatedAt: "2026-09-16T00:00:00Z", generatedBy: "Mia" });
    expect(a.pages).toBeGreaterThanOrEqual(2);
    expect(a.pages).toBeLessThanOrEqual(IC_MEMO_MAX_PAGES);
    const textA = await fullText(a.buffer);
    expect(textA.replace(/\s/g, "")).toContain("INVESTMENTCOMMITTEEMEMO");
    expect(textA).toContain("Valuation");
    expect(textA).toContain("AU comparables");
    expect(textA).toContain("Risks and questions");
    expect(textA).toContain("Licence renewal");
    expect(textA).toContain("When does the licence renew?");
    expect(textA).toContain("Seat views");
    expect(textA).toContain("Ben");
    expect(textA).toContain("Churn");
    expect(textA).toContain("Firm consensus (2/2)");
    expect(textA).toContain("split decision");
    expect(textA).toContain(`page ${a.pages}/${a.pages}`);
    expect(textA).not.toContain("PRIVATE-NOTE-BODY");
    expect(textA.replace(/\s|-/g, "")).not.toMatch(/DIMENSIONWEIGHTSCORE/);

    const weighted = buildIcSections(view, "memo", { weightsShown: true });
    const b = await renderIcMemoPdf({ kind: "memo", sections: weighted, radar, rangeBars, weightsShown: true, generatedAt: "2026-09-16T00:00:00Z", generatedBy: "Program owner" });
    const textB = await fullText(b.buffer);
    expect(textB.replace(/\s|-/g, "")).toMatch(/DIMENSIONWEIGHTSCORE/);
    expect(textB).toContain("generated 16 September 2026 by Program owner");
  });

  it("degrades without visuals or an assessment (no radar, no range bars, empty decision)", async () => {
    const sections = buildIcSections(fakeView({ mine: null, consensus: null }), "memo", { weightsShown: false });
    const { buffer, pages } = await renderIcMemoPdf({ kind: "memo", sections, radar: null, rangeBars: null, weightsShown: false, generatedAt: "bad-date", generatedBy: "x" });
    expect(pages).toBeGreaterThanOrEqual(2);
    const text = await fullText(buffer);
    expect(text).toContain("NONE YET");
    expect(text).toContain("Single seat");
  });
});
