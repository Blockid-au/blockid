// BlockID's own investor deck: the Business Model slide must print the live
// founder ladder (live QA 2026-09-13 found the retired "Founding 100 A$5 /
// Growth A$99 · 100 credits" copy still in the PDF).
import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";
import { renderToBuffer } from "@react-pdf/renderer";
import { PLANS_V2 } from "@/lib/plans-v2";
import { PitchDeckPDF } from "./pitch-deck-pdf";

async function fullText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text.replace(/\s+/g, " ")).join("\n");
  } finally {
    await parser.destroy();
  }
}

describe("pitch deck — business model slide tracks lib/plans-v2", () => {
  it("prints Starter / Growth live prices and credits, never the retired ladder", async () => {
    const buf = await renderToBuffer(PitchDeckPDF());
    const text = await fullText(Buffer.from(buf));
    const starter = PLANS_V2.find((p) => p.id === "founder_starter")!;
    const growth = PLANS_V2.find((p) => p.id === "founder_growth")!;
    expect(text).toContain(`A$${starter.monthly_aud}/mo`);
    expect(text).toContain(`A$${growth.monthly_aud}/mo`);
    expect(text).toContain("45 AI credits");
    expect(text).not.toContain("Founding 100");
    expect(text).not.toContain("A$99");
    expect(text).not.toContain("100 credits");
  }, 60_000);
});
