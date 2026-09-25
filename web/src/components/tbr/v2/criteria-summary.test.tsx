import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { TbrCriteriaSummary } from "./criteria-summary";
import { TbrNumberNotes } from "./number-notes";

describe("investor criterion disclosure", () => {
  it("keeps the saved zero score and exposes its actual role, quotes and missing formula explanation", () => {
    const report = demoReportV2();
    const criterion = report.dimensions[0].criteria[0];
    criterion.score = 0;
    criterion.citations = [{ evidence_id: "source-1", quote: "A retained source quote" }];
    const before = JSON.stringify(report);
    const html = renderToStaticMarkup(<TbrCriteriaSummary report={report} locale="en" />);
    expect(html).toContain("Why this score?");
    expect(html).toContain("A retained source quote");
    expect(html).toContain(criterion.agent.toUpperCase());
    expect(html).toContain("criterion formula is not inferred");
    expect(html).toMatch(/tabular-nums text-primary">0<\/span>/);
    expect(html).not.toMatch(/<details[^>]*\bopen[= >]/);
    expect(JSON.stringify(report)).toBe(before);
  });

  it("never puts locked details into the DOM, even when duplicated into an open chapter", () => {
    const report = freeFixtureReportV2();
    const locked = report.dimensions.find(ch => ch.renderAs === "card")!;
    const open = report.dimensions.find(ch => ch.renderAs === "full")!;
    const criterion = locked.criteria[0];
    criterion.verdict = "PRIVATE VERDICT";
    criterion.citations = [{ evidence_id: "PRIVATE ID", quote: "PRIVATE QUOTE" }];
    criterion.detailedAnalysis = { status: "supported", source: "post_audit_criterion", auditKind: "citation_only", narrative: "PRIVATE NARRATIVE", citations: [] };
    open.criteria.unshift(criterion);
    const html = renderToStaticMarkup(<TbrCriteriaSummary report={report} locale="en" />);
    expect(html).not.toContain("PRIVATE");
    expect(html).toContain("Details in the full report");
  });

  it("withholds rejected narratives and localises the read-more prompt", () => {
    const report = demoReportV2();
    report.dimensions[0].criteria[0].detailedAnalysis = { status: "withheld", source: "post_audit_criterion", auditKind: "model_and_citation", narrative: "REJECTED NARRATIVE", citations: [] };
    const html = renderToStaticMarkup(<TbrCriteriaSummary report={report} locale="vi" />);
    expect(html).not.toContain("REJECTED NARRATIVE");
    expect(html).toContain("Vì sao có điểm này?");
  });

  it("explains that the index, evidence confidence and monetary value are different quantities", () => {
    const report = demoReportV2();
    const html = renderToStaticMarkup(<TbrNumberNotes report={report} />);
    expect(html).toContain("not money, a success probability or an international standard score");
    expect(html).toContain(report.pipelineVersion);
    expect(html).toContain(report.generatedAt);
    expect(html).toContain("Model identity, verification and approval are not inferred");
  });
});
