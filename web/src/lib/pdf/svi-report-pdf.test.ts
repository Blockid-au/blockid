import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractSignals, computeSVI } from "@/lib/svi-analysis";
import { SVIReportPDF } from "@/lib/pdf/svi-report-pdf";

// Smoke test: the SCN report (native SVG infographics + 5-layer narrative) must
// render to a non-trivial PDF buffer from real analysis data without throwing.
describe("SVIReportPDF (SCN template)", () => {
  it("renders a real analysis to a PDF buffer with native SVG charts", async () => {
    const signals = extractSignals({
      rawText:
        "Acme AI is a SaaS startup with two experienced co-founders. We have a live MVP, " +
        "paying customers, growing MRR, a pitch deck, a cap table with vesting, an ABN, and " +
        "early traction. Validated problem with customer interviews. Targeting a seed raise.",
    });
    const analysis = computeSVI(signals);

    const buffer = await renderToBuffer(
      SVIReportPDF({ analysis, startupName: "Acme AI", email: "founder@acme.ai", tier: "premium" }),
    );

    expect(buffer.length).toBeGreaterThan(5000);
    // PDF magic header
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("renders a minimal/empty-evidence analysis without throwing", async () => {
    const signals = extractSignals({ rawText: "A new idea." });
    const analysis = computeSVI(signals);
    const buffer = await renderToBuffer(SVIReportPDF({ analysis }));
    expect(buffer.length).toBeGreaterThan(5000);
  });
});
