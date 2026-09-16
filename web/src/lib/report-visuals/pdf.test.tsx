// <VisualPdf> — every visual kind renders through react-pdf (S-R4).
//
//   - all 21 kinds from the shared kind fixtures render to a %PDF buffer
//     without throwing (one Document, one Page per kind);
//   - the demo report's real visuals (cover, chapters, valuation …) render;
//   - parity: the twin draws exactly the shapes the web SVG carries (shape
//     count from the parsed renderer output = elements emitted), and it is
//     sized to the print rule (≤ 170 mm);
//   - glyphs Helvetica cannot draw are mapped, never dropped silently for
//     the common arrows / ticks.

import { Document, Page, renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { ALL_VISUAL_KINDS, renderVisual } from "./index";
import { specForKind } from "./kind-fixtures";
import { PDF_CHART_MAX_WIDTH_PT, VisualPdf, visualPdfGeometry } from "./pdf";
import { pdfSafeText } from "./pdf-text";
import { countShapes, parseVisualSvg } from "./svg-ast";
import type { VisualSpecV2 } from "./types";

async function renderSpecs(specs: VisualSpecV2[]): Promise<Buffer> {
  const doc = (
    <Document>
      {specs.map((s) => (
        <Page key={s.id} size="A4" style={{ padding: 40 }}>
          <VisualPdf spec={s} />
        </Page>
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}

describe("VisualPdf", () => {
  it("renders every kind without throwing", async () => {
    const specs = ALL_VISUAL_KINDS.map((k) => specForKind(k));
    const buf = await renderSpecs(specs);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(2000);
  }, 30_000);

  it("renders each kind on its own too (isolates a broken twin)", async () => {
    for (const kind of ALL_VISUAL_KINDS) {
      const buf = await renderSpecs([specForKind(kind)]);
      expect(buf.subarray(0, 4).toString("latin1"), kind).toBe("%PDF");
    }
  }, 60_000);

  it("renders the demo report's visuals (cover + 8 primaries + valuation + gates + money + plan)", async () => {
    const r = demoReportV2();
    const specs = [
      ...r.cover.visuals,
      ...r.executive.visuals,
      ...r.dimensions.map((d) => d.primaryVisual),
      ...r.dimensions.flatMap((d) => d.secondaryVisuals),
      ...r.valuation.visuals,
      ...r.phaseGates.visuals,
      ...r.moneyOnTable.visuals,
      ...r.actionPlan.visuals,
    ];
    expect(specs.length).toBeGreaterThanOrEqual(15);
    const buf = await renderSpecs(specs);
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  }, 30_000);

  it("geometry parity: the twin consumes the same renderer output as the web", () => {
    for (const kind of ALL_VISUAL_KINDS) {
      const spec = specForKind(kind);
      const web = parseVisualSvg(renderVisual(spec));
      const twin = visualPdfGeometry(spec);
      expect(countShapes(twin.root), kind).toBe(countShapes(web));
      expect(twin.widthPt, kind).toBeLessThanOrEqual(PDF_CHART_MAX_WIDTH_PT);
      expect(twin.heightPt, kind).toBeGreaterThan(0);
    }
  });

  it("scales to a requested point width keeping the aspect ratio", () => {
    const spec = specForKind("funnel");
    const a = visualPdfGeometry(spec, { widthPt: 200 });
    const b = visualPdfGeometry(spec, { widthPt: 400 });
    expect(b.widthPt).toBe(400);
    expect(Math.abs(b.heightPt / b.widthPt - a.heightPt / a.widthPt)).toBeLessThan(0.01);
    const capped = visualPdfGeometry(spec, { widthPt: 10_000 });
    expect(capped.widthPt).toBe(PDF_CHART_MAX_WIDTH_PT);
  });

  it("pdfSafeText maps non-WinAnsi glyphs and keeps Latin-1", () => {
    expect(pdfSafeText("A → B ✓ ▲ Δ ≥ 3")).toBe("A -> B OK ^ delta  >= 3");
    expect(pdfSafeText("café — A$1.2M … × 2")).toBe("café — A$1.2M … × 2");
    expect(pdfSafeText("Hà Nội Đông")).toBe("Hà Nôi Dông"); // Latin-1 marks kept, others stripped
    expect(pdfSafeText("emoji 🚀 gone")).toBe("emoji  gone");
  });
});
