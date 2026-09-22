import { describe, expect, it, vi } from "vitest";
import { PDFParse } from "pdf-parse";
import JSZip from "jszip";
import { mkdirSync, writeFileSync } from "node:fs";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { criterionDetailExport } from "./criterion-detail-export";
import { renderTbrPdf } from "./tbr-pdf";
vi.mock("server-only", () => ({}));
import { generateTbrDocx } from "@/lib/docx/tbr-docx";

function fixture() {
  const report = demoReportV2();
  const chapter = report.dimensions.find(ch => ch.criteria.length)!;
  const card = chapter.criteria[0];
  const evidence = chapter.evidence.find(row => row.status !== "missing") ?? report.appendix.evidenceRegister.find(row => row.status !== "missing")!;
  card.detailedAnalysis = {
    status: "supported", source: "post_audit_criterion", auditKind: "citation_only",
    narrative: `Distinctive business findings establish a narrow customer segment. [ev:${evidence.evidence_id}]\n\nThe investor should validate repeat purchases before assuming durable demand.`,
    citations: [{ evidence_id: evidence.evidence_id, quote: "Distinctive supporting quotation." }],
  };
  return { report, card, evidence };
}
async function exportsText(report: ReturnType<typeof demoReportV2>, artifact = false) {
  const { buffer } = await renderTbrPdf(report);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let text: string;
  try { text = (await parser.getText()).text.replace(/\s+/g, " "); } finally { await parser.destroy(); }
  const docx = await generateTbrDocx(report);
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file("word/document.xml")!.async("string");
  if (artifact && process.env.G30_EXPORT_RENDER_EVIDENCE === "1") {
    mkdirSync("tmp/pdfs", { recursive: true });
    writeFileSync("tmp/pdfs/criterion-detail.pdf", buffer);
    writeFileSync("tmp/pdfs/criterion-detail.docx", docx);
  }
  return [text, xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")];
}
describe("criterion detail export", () => {
  it("retains supported prose and human source labels with an explicit limitation", async () => {
    for (const text of await exportsText(fixture().report, true)) {
      expect(text).toContain("Saved AI analysis");
      expect(text).toContain("Distinctive business findings");
      expect(text).toContain("Distinctive supporting quotation");
      expect(text).toContain("not independent verification or fresh market research");
      expect(text).not.toContain("[ev:");
    }
  }, 120000);
  it("withheld narrative and quotes never leak even if stored fields remain populated", async () => {
    const { report, card } = fixture();
    card.detailedAnalysis!.status = "withheld";
    for (const text of await exportsText(report)) {
      expect(text).not.toContain("Saved AI analysis");
      expect(text).not.toContain("Distinctive business findings");
      expect(text).not.toContain("Distinctive supporting quotation");
    }
  }, 120000);
  it("free export retains compact policy and hides detail and quotations", async () => {
    const { report } = fixture();
    report.tier = "free";
    for (const text of await exportsText(report)) {
      expect(text).not.toContain("Saved AI analysis");
      expect(text).not.toContain("Distinctive business findings");
      expect(text).not.toContain("Distinctive supporting quotation");
    }
  }, 120000);
  it("rejects invalid provenance and missing evidence; Vietnamese disclosure remains explicit", () => {
    const { card, evidence } = fixture();
    const detail = criterionDetailExport(card, [], "vi")!;
    expect(detail.quotes).toEqual([]);
    expect(detail.disclosure).toContain("không phải xác minh độc lập");
    expect(criterionDetailExport(card, [{ ...evidence, status: "missing" }], "en")!.quotes).toEqual([]);
    card.detailedAnalysis!.citations.push({ evidence_id: "unknown", quote: "Unadmitted quote" });
    expect(criterionDetailExport(card, [evidence], "en")!.quotes.join(" ")).not.toContain("Unadmitted quote");
    card.detailedAnalysis!.source = "unreviewed" as never;
    expect(criterionDetailExport(card, [evidence], "en")).toBeNull();
  });
});
