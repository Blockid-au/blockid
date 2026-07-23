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

  it("accepts null branding without throwing (retains default palette)", async () => {
    const signals = extractSignals({ rawText: "Idea stage startup." });
    const analysis = computeSVI(signals);
    const buffer = await renderToBuffer(SVIReportPDF({ analysis, branding: null }));
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("applies BrandSettings when provided (paid-tier white-label)", async () => {
    const signals = extractSignals({ rawText: "SaaS with customers and revenue." });
    const analysis = computeSVI(signals);
    const buffer = await renderToBuffer(
      SVIReportPDF({
        analysis,
        startupName: "Custom Co",
        branding: {
          logoUrl: null, // null falls back to embedded logo, no remote fetch
          primaryColor: "#00aa88",
          accentColor: "#ff00aa",
          reportHeader: "Custom Header",
          footerText: "© Custom Co — Prepared for the Board",
        },
      }),
    );
    expect(buffer.length).toBeGreaterThan(5000);
    expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("does not crash on malformed primaryColor — falls back to default", async () => {
    const signals = extractSignals({ rawText: "Idea." });
    const analysis = computeSVI(signals);
    const buffer = await renderToBuffer(
      SVIReportPDF({
        analysis,
        branding: {
          logoUrl: null,
          primaryColor: "not-a-hex-color",
          accentColor: "",
          reportHeader: "",
          footerText: "",
        },
      }),
    );
    expect(buffer.length).toBeGreaterThan(5000);
  });
});
