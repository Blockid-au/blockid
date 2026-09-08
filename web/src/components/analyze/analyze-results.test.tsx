// Colocated tests for AnalyzeResults.
//
// The dynamic imports for SVIRadarChart / SVIValuation only run in the
// browser (ssr:false), so `renderToStaticMarkup` renders the shell —
// StageBanner + SviScoreRing + gaps/actions/findings. That's exactly
// what we need to pin: the results panel always shows the banner and
// score ring, regardless of which agent findings arrived first.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalyzeResults } from "./analyze-results";

const FIXTURE = {
  stage: "seed" as const,
  score: 74,
  gaps: [
    {
      dimension: "tre",
      label: "Traction",
      severity: "high" as const,
      detail: "No revenue evidence in deck",
    },
  ],
  actions: [
    {
      title: "Line up 3 design partners",
      detail: "Convert warm intros to signed pilot LOIs.",
      priority: "P0" as const,
    },
  ],
  findings: [
    {
      agent: "cfo" as const,
      headline: "Valuation range A$4–7M pre-money",
      bullets: ["Comparable AU seed FinTech multiples", "Discount for pre-revenue"],
    },
  ],
};

describe("AnalyzeResults", () => {
  it("renders the stage banner", () => {
    const out = renderToStaticMarkup(<AnalyzeResults {...FIXTURE} />);
    expect(out).toContain('data-testid="stage-banner"');
    expect(out).toContain("Seed"); // canonical label prefix
  });

  it("renders the SVI score ring", () => {
    const out = renderToStaticMarkup(<AnalyzeResults {...FIXTURE} />);
    expect(out).toContain('role="img"');
    expect(out).toContain("Startup Value Index");
    expect(out).toContain(">74<");
  });

  it("renders gaps + actions sections", () => {
    const out = renderToStaticMarkup(<AnalyzeResults {...FIXTURE} />);
    expect(out).toContain('data-testid="analyze-gaps"');
    expect(out).toContain('data-testid="analyze-actions"');
    expect(out).toContain("Traction");
    expect(out).toContain("Line up 3 design partners");
  });

  it("renders findings accordion header", () => {
    const out = renderToStaticMarkup(<AnalyzeResults {...FIXTURE} />);
    expect(out).toContain('data-testid="analyze-findings"');
    expect(out).toContain("Valuation range A$4–7M pre-money");
  });

  it("renders download PDF link when href provided", () => {
    const out = renderToStaticMarkup(
      <AnalyzeResults {...FIXTURE} pdfHref="/tmp/report.pdf" />,
    );
    expect(out).toContain('data-testid="analyze-pdf-link"');
    expect(out).toContain("/tmp/report.pdf");
  });
});
