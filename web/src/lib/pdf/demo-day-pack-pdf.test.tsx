// Demo-day pack PDF (G21 P2-C) — colocated suite (pdf vitest project).
//
//   - 1 cover + exactly one page per selected startup (the page budget);
//   - each page carries the Assessment Card (SVI, evidence confidence,
//     verification), the strengths / gaps and the dossier link;
//   - an empty selection renders the cover with the "shortlist first" line;
//   - the human-decision line and the operator footer are on the cover.

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { buildAssessmentCard } from "@/lib/svi/assessment-card";
import { pdfPageCount } from "./page-count";
import { DEMO_DAY_HUMAN_LINE, DEMO_DAY_PACK_FOOTER, renderDemoDayPackPdf, type DemoDayPackEntry } from "./demo-day-pack-pdf";

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

function entry(name: string, svi: number): DemoDayPackEntry {
  const card = buildAssessmentCard(
    { name, stageLabel: "MVP", sector: "SaaS", verificationLevel: 2 },
    { total: svi, dimensions: (["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const).map((dim, i) => ({ dim, score: 40 + i * 5, weight: 12.5, assessed: true, level: i % 2 ? "document_uploaded" : null })) },
    {},
    { generatedAt: "2026-09-20T00:00:00Z", evidenceConfidence: 52 },
  );
  return { card, strengths: ["Strongest on Strategic Vision & Moat", "BlockID Verified L2"], gaps: ["Biggest gap Founder & Team"], dossierUrl: `/workspace/evaluations/ev-${name}`, profileUrl: `/s/${name.toLowerCase()}` };
}

describe("renderDemoDayPackPdf", () => {
  it("cover + one page per selected startup with the card, strengths, gaps and links", async () => {
    const entries = [entry("Alpha", 71), entry("Beta", 64), entry("Gamma", 58)];
    const { buffer, pages } = await renderDemoDayPackPdf({ cohortName: "Cohort 5", programName: "Acme Accelerator", generatedAt: "2026-09-20T03:00:00Z", entries, base: "https://blockid.au" });
    expect(pages).toBe(1 + entries.length);
    expect(pdfPageCount(buffer)).toBe(pages);
    const text = await fullText(buffer);
    expect(text).toContain("Cohort 5");
    expect(text).toContain("Prepared by Acme Accelerator");
    expect(text).toContain(DEMO_DAY_HUMAN_LINE);
    expect(text).toContain("1. Alpha");
    expect(text).toContain("3. Gamma");
    expect(text).toContain("SVI 71");
    expect(text).toContain("52 %");
    expect(text).toContain("BlockID Verified L2");
    expect(text).toContain("Strongest on Strategic Vision & Moat");
    expect(text).toContain("Biggest gap Founder & Team");
    expect(text).toContain("https://blockid.au/workspace/evaluations/ev-Alpha");
    expect(text).toContain("https://blockid.au/s/beta");
    expect(text).toContain(DEMO_DAY_PACK_FOOTER);
    expect(text).toContain(LEGAL_ENTITY.operator);
    expect(text).toContain(`page 4/4`);
  });

  it("an empty selection is a one-page cover with the shortlist line", async () => {
    const { buffer, pages } = await renderDemoDayPackPdf({ cohortName: "Cohort 5", programName: null, generatedAt: "2026-09-20T03:00:00Z", entries: [] });
    expect(pages).toBe(1);
    const text = await fullText(buffer);
    expect(text).toContain("No selected startup yet");
    expect(text).not.toContain("Prepared by");
  });
});
