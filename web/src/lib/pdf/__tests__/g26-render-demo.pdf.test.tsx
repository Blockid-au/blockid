// G26 lane R — one-off render harness (not a guard): writes the demo TBR
// PDF + the score / pitch-deck PDFs to the scratchpad so page 1–3 can be
// rasterised and inspected. Runs only when G26_RENDER_OUT is set.
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.env.G26_RENDER_OUT;

describe.skipIf(!OUT)("G26 render harness", () => {
  it("writes the demo TBR PDF", async () => {
    const { renderTbrPdf } = await import("@/lib/pdf/tbr-pdf");
    const { demoReportV2 } = await import("@/lib/report-v2/fixtures");
    const { buffer } = await renderTbrPdf(demoReportV2());
    mkdirSync(OUT!, { recursive: true });
    writeFileSync(path.join(OUT!, "tbr-demo.pdf"), buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  }, 180_000);
});
