// Colocated tests for AnalyzeResults.
//
// The dynamic imports for SVIRadarChart / SVIValuation only run in the
// browser (ssr:false), so `renderToStaticMarkup` renders the shell —
// StageBanner + SviScoreRing + gaps/actions/findings. That's exactly
// what we need to pin: the results panel always shows the banner and
// score ring, regardless of which agent findings arrived first.

import { readFileSync } from "node:fs";
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

describe("AnalyzeResults — customer-facing labels", () => {
  // Findings used to be headed "Agent findings" and tagged CHRO / CDO / CTO —
  // our org chart, shown to a founder reading about their own company. The
  // labels now name the area of *their* business the finding came from.
  it("names business areas, never internal role acronyms", () => {
    const src = readFileSync(
      new URL("./analyze-results.tsx", import.meta.url),
      "utf8",
    );
    const labelBlock = src.slice(
      src.indexOf("const AGENT_LABEL"),
      src.indexOf("const SEVERITY_STYLE"),
    );
    for (const acronym of ["CHRO", "CDO", "CISO", "CMO", "CRO", "CLO", "CPO", "COO"]) {
      expect(labelBlock, `AGENT_LABEL must not surface "${acronym}"`).not.toContain(
        `"${acronym}"`,
      );
    }
    expect(labelBlock).toContain("Team & people");
    expect(labelBlock).toContain("Finances & valuation");
  });
});
