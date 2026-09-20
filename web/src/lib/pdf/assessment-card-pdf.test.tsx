// G21 P3-C — the Assessment Card twins: `assessmentCardLines` (DOCX + PDF)
// carries the stale-connector line only when a source is past its proof TTL,
// and the PDF block renders it.

import { describe, expect, it } from "vitest";
import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { PDFParse } from "pdf-parse";
import { assessmentCardFromReport } from "@/lib/svi/assessment-card";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { HELVETICA } from "./fonts";
import { AssessmentCardPdf, assessmentCardLines, staleConnectorsLine } from "./assessment-card-pdf";

async function text(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const out = await parser.getText();
    return out.pages.map((p) => p.text.replace(/\s+/g, " ")).join("\n");
  } finally {
    await parser.destroy();
  }
}

describe("assessmentCardLines — stale connectors (G21 P3-C)", () => {
  it("no line without stale connectors; one label · value line with them", () => {
    const base = assessmentCardFromReport(demoReportV2());
    expect(assessmentCardLines(base).map((l) => l.label)).not.toContain("Stale connectors");
    const lines = assessmentCardLines({ ...base, staleConnectors: 2 });
    expect(lines.at(-1)).toEqual({ label: "Stale connectors", value: staleConnectorsLine(2) });
    expect(staleConnectorsLine(1)).toBe("1 connected source past the 90-day refresh window — its proof has expired; resync to restore it");
    expect(staleConnectorsLine(3)).toMatch(/^3 connected sources /);
  });

  it("the PDF block prints the line", async () => {
    const card = { ...assessmentCardFromReport(demoReportV2()), staleConnectors: 1 };
    const buf = await renderToBuffer(
      <Document>
        <Page size="A4">
          <AssessmentCardPdf data={card} font={HELVETICA} />
        </Page>
      </Document>,
    );
    const t = await text(Buffer.from(buf));
    // labels are letter-spaced uppercase in the PDF → compare with whitespace stripped
    expect(t.replace(/\s+/g, "").toUpperCase()).toContain("STALECONNECTORS");
    expect(t).toContain("past the 90-day refresh window");
  });
});
