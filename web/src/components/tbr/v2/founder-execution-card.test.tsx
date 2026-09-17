// Static-render tests for the FTV "Founder Execution" card (G14-S37).
// renderToStaticMarkup — this workspace does not install
// @testing-library/react (see report.test.tsx).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import type { DimensionChapter } from "@/lib/report-v2/schema";
import { TbrChapter } from "./chapter";
import { FOUNDER_EXECUTION_MODULE_ID, FounderExecutionCard, founderExecutionFromChapter } from "./founder-execution-card";

const MODULE = {
  id: FOUNDER_EXECUTION_MODULE_ID,
  output: {
    executionScore: 70,
    rawScore: 96,
    capped: true,
    capReason: "Self-reported profile — capped at 70 until an evaluator checks references or the LinkedIn export confirms years / employers.",
    structured: true,
    rubricVersion: "1.0",
    breakdown: [
      { key: "exits", label: "Prior exits", points: 30, max: 30, evidence: "Loom (acquisition 2020, 10m-50m)", source: "founder" },
      { key: "raises", label: "Prior raises", points: 15, max: 15, evidence: "Loom series b plus 20m+ 2019", source: "founder" },
      { key: "years_in_domain", label: "Years in domain", points: 20, max: 20, evidence: "12 years in domain (scored at the 10-year cap)", source: "founder" },
      { key: "roles", label: "Role coverage", points: 15, max: 15, evidence: "CEO: Ada, CTO: Charles, CPO: Grace, CFO: Alan", source: "founder" },
      { key: "full_time", label: "Full-time commitment", points: 10, max: 10, evidence: "100% full-time", source: "founder" },
      { key: "worked_together", label: "Worked together before", points: 5, max: 5, evidence: "founders have worked together before", source: "founder" },
      { key: "github", label: "GitHub activity", points: 1, max: 5, evidence: "GitHub URL only", source: "founder" },
    ],
  },
};

function ftvChapter(withModule: boolean): DimensionChapter {
  const ch = demoReportV2().dimensions.find((d) => d.dim === "ftv");
  if (!ch) throw new Error("demo report has no FTV chapter");
  return { ...ch, renderAs: "full", modules: withModule ? [...ch.modules, MODULE] : ch.modules.filter((m) => m.id !== FOUNDER_EXECUTION_MODULE_ID) };
}

describe("founderExecutionFromChapter", () => {
  it("reads the module output into card data (score, cap, seven rows) and returns null without the module or off the FTV dim", () => {
    const data = founderExecutionFromChapter(ftvChapter(true));
    expect(data).not.toBeNull();
    expect(data?.executionScore).toBe(70);
    expect(data?.rawScore).toBe(96);
    expect(data?.capped).toBe(true);
    expect(data?.breakdown).toHaveLength(7);
    expect(data?.breakdown[0]).toMatchObject({ key: "exits", label: "Prior exits", points: 30, max: 30 });
    expect(founderExecutionFromChapter(ftvChapter(false))).toBeNull();
    expect(founderExecutionFromChapter({ dim: "mpc", modules: [MODULE] })).toBeNull();
  });

  it("tolerates a sparse module output (no breakdown, string numbers)", () => {
    const data = founderExecutionFromChapter({ dim: "ftv", modules: [{ id: FOUNDER_EXECUTION_MODULE_ID, output: { executionScore: "42" } }] });
    expect(data).toMatchObject({ executionScore: 42, rawScore: 42, capped: false, structured: false, breakdown: [] });
  });
});

describe("<TbrChapter> FTV", () => {
  it("renders the Founder Execution card with the score, the rubric rows and the cap notice when the module is present", () => {
    const html = renderToStaticMarkup(<TbrChapter chapter={ftvChapter(true)} index={4} />);
    expect(html).toContain('data-testid="founder-execution-card"');
    expect(html).toContain('data-execution-score="70"');
    expect(html).toContain('data-execution-capped="true"');
    expect(html).toContain("Founder Execution");
    expect(html).toContain('data-execution-row="exits"');
    expect(html).toContain('data-execution-row="github"');
    expect(html).toContain('data-testid="founder-execution-cap"');
    expect(html).toContain("capped at 70");
    expect(html).toContain("rubric 96, shown at the cap");
  });

  it("renders no card when the analysis had no founder profile (module absent)", () => {
    const html = renderToStaticMarkup(<TbrChapter chapter={ftvChapter(false)} index={4} />);
    expect(html).not.toContain('data-testid="founder-execution-card"');
  });

  it("the compact card omits the evidence column; an uncapped card omits the cap notice", () => {
    const data = founderExecutionFromChapter(ftvChapter(true));
    if (!data) throw new Error("no card data");
    const lifted = { ...data, capped: false, executionScore: 96, capLiftedBy: "references_checked" };
    const html = renderToStaticMarkup(<FounderExecutionCard data={lifted} compact />);
    expect(html).not.toContain('data-testid="founder-execution-cap"');
    expect(html).not.toContain("Loom (acquisition 2020");
    expect(html).toContain("references checked by an evaluator");
    expect(html).toContain('data-execution-score="96"');
  });
});
