import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { extractSignals, computeSVI } from "@/lib/svi-analysis";
import { SVIReportPDF } from "@/lib/pdf/svi-report-pdf";
import * as P from "@/lib/pdf/svi-report-pdf";
import { pdfPageCount, pdfPageCountsAgree } from "@/lib/pdf/page-count";
import { PDFParse } from "pdf-parse";
import { publishPercentile } from "@/lib/benchmarks/publication-rules";

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

// ── The exported primitives ────────────────────────────────────────────────
//
// `svi-summary-pdf.tsx` (the free 5-page summary) composes itself from these
// rather than duplicating a second set of report furniture. That makes them a
// public surface, so their existence and shape is pinned here: deleting or
// renaming one has to fail this suite, not the free tier in production.
describe("SVIReportPDF exported primitives", () => {
  it("exports the palette and stylesheet the summary renderer builds on", () => {
    expect(typeof P.C).toBe("object");
    expect(P.C.brand600).toMatch(/^#[0-9a-f]{6}$/i);
    expect(typeof P.s).toBe("object");
    expect(P.DIM_LABELS.ftv).toBe("Founder & Team Value");
  });

  it("exports the scale helpers", () => {
    expect(P.barColor(90)).toBe(P.C.emerald600);
    expect(P.scoreColor(10)).toBe(P.C.red600);
    expect(P.sviLabel(105)).toBe("Average");
    expect(P.formatAud(4_200_000)).toBe("A$4.20M");
    expect(P.formatAud(180_000)).toBe("A$180K");
  });

  it("exports the page furniture and chart components as functions", () => {
    for (const name of [
      "HeaderBar",
      "Footer",
      "PageTitle",
      "MetricCard",
      "ScoreGauge",
      "InsightBox",
      "ActionItem",
      "DimensionBar",
      "Bullet",
      "RadarChartSVG",
      "PercentileBandSVG",
      "ValuationRangeSVG",
    ] as const) {
      expect(typeof P[name], name).toBe("function");
    }
  });
});

// ── The claim the homepage makes about the paid report ─────────────────────
//
// The three-tier ladder says the A$3 report is "10+ pages". That is a
// checkable number, so it is checked: render a real analysis and read the page
// count back out of the produced file.
describe("SVIReportPDF page count", () => {
  it("renders at least the ten pages the site advertises", async () => {
    const signals = extractSignals({
      rawText:
        "Northwind Freight is an Australian logistics SaaS with two technical co-founders, " +
        "a live product, 40 paying customers, A$18k MRR growing 12% month on month, an ABN, " +
        "a cap table with founder vesting, customer interviews, and a seed raise planned.",
    });
    const analysis = computeSVI(signals);
    const buffer = await renderToBuffer(
      SVIReportPDF({ analysis, startupName: "Northwind Freight", tier: "standard" }),
    );
    expect(pdfPageCountsAgree(buffer)).toBe(true);
    expect(pdfPageCount(buffer)).toBeGreaterThanOrEqual(10);
  }, 120_000);

  // G21 P1 review (score-governance § 7): the Position page ranks the founder
  // only against a published cohort, with n; `percentileRank` never prints.
  it("prints 'Top N%' + the stage median only from a published cohort (with n); otherwise the not-enough line", async () => {
    async function fullText(buffer: Buffer): Promise<string> {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return result.pages.map((p) => p.text.replace(/\s+/g, " ")).join("\n");
      } finally {
        await parser.destroy();
      }
    }
    const analysis = computeSVI(extractSignals({ rawText: "Acme AI is a SaaS startup with two co-founders, a live MVP, paying customers and an ABN." }));
    const none = await fullText(await renderToBuffer(SVIReportPDF({ analysis: { ...analysis, percentileRank: 80, cohortPercentile: undefined }, startupName: "Acme AI", tier: "standard" })));
    expect(none).not.toMatch(/Top \d+%/);
    expect(none).not.toMatch(/ahead of/);
    expect(none).toContain("No cohort benchmark yet (n = 0)");
    const published = publishPercentile({ percentile: 80, n: 47, segment: "AU stage cohort" })!;
    const withCohort = await fullText(
      await renderToBuffer(
        SVIReportPDF({
          analysis: { ...analysis, cohortPercentile: { percentile: 80, source: "real_cohort", cohortSize: 47, stageMatched: analysis.stage, band: "benchmark", label: published.label, published, median: 141, p25: 120, p75: 165 } },
          startupName: "Acme AI",
          tier: "standard",
        }),
      ),
    );
    expect(withCohort).toContain("Top 20%");
    expect(withCohort).toContain("benchmark (n = 47)");
    expect(withCohort).toContain("median 141, p25–p75 120–165 (n = 47)");
  }, 180_000);
});
