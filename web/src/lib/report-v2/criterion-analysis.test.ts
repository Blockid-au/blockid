import { describe, expect, it } from "vitest";
import type { AgentAnalysisResult, SectionAuditRecord } from "@/lib/report-pipeline/types";
import { demoReportV2 } from "./fixtures";
import { withCriterionAnalysis } from "./criterion-analysis";
import { projectBusinessFindings } from "./business-findings";
import { reportV2Schema } from "./schema";
import { projectForTier } from "./free-tier";
function setup() {
  const report = demoReportV2(); report.quality.consistencyIssues = [];
  const card = report.dimensions[0].criteria[0]; const row = report.dimensions[0].evidence[0];
  const content = `Acme's delivery depends on the two named engineers. The customer pilot supports feasibility, but does not establish scalable support capacity. [ev:${row.evidence_id}]`;
  const result: AgentAnalysisResult = { criterion: card.key, agentRole: card.agent, score: 60, content, highlights: [], dataPoints: {}, risks: [], nextSteps: [], visuals: [], confidence: .8, wordCount: 35, durationMs: 1, grounded: true, citations: [{ evidence_id: row.evidence_id, quote: "Two engineers" }, { evidence_id: "unresolved", quote: "invented" }] };
  const audit: SectionAuditRecord = { sectionId: card.key, uncitedClaims: [], findings: [], revised: true, grounded: true, llmAudited: true };
  return { report, card, result, audit, results: new Map([[card.key, result]]), content };
}
describe("final criterion narrative publication", () => {
  it("preserves revised business narrative through schema and findings without changing input", () => {
    const x = setup();
    x.card.detailedAnalysis = { status: "supported", source: "post_audit_criterion", auditKind: "citation_only", narrative: "Rejected old claim: Acme earns $10 million.", citations: [] };
    const out = withCriterionAnalysis(x.report, x.results, [x.audit]);
    const detail = out.dimensions[0].criteria[0].detailedAnalysis!;
    expect(detail.narrative).toBe(x.content); expect(detail.citations).toHaveLength(1);
    expect(detail.auditKind).toBe("model_and_citation");
    expect(reportV2Schema.parse(out).dimensions[0].criteria[0].detailedAnalysis).toEqual(detail);
    expect(projectBusinessFindings({ report: out })[0].criteria[0].detailedAnalysis).toEqual(detail);
    expect(x.report.dimensions[0].criteria[0].detailedAnalysis?.narrative).toContain("Rejected old claim");
    expect(detail.narrative).not.toContain("$10 million");
  });
  it.each(["rejected", "uncited", "degraded", "conflict"])("withholds stale financial prose when %s", reason => {
    const x = setup(); x.result.content = "Old unsupported revenue is $10 million and valuation $80 million.";
    if (reason === "rejected") x.audit.hadIssues = true;
    if (reason === "uncited") x.audit.uncitedClaims = ["Old unsupported revenue"];
    if (reason === "degraded") x.result.degraded = true;
    if (reason === "conflict") x.report.quality.consistencyIssues.push({ type: "contradiction", severity: "high", criteria: [x.card.key], description: "Financial amounts conflict" });
    const detail = withCriterionAnalysis(x.report, x.results, [x.audit]).dimensions[0].criteria[0].detailedAnalysis!;
    expect(detail.status).toBe("withheld"); expect(detail.narrative).toBe(""); expect(detail.citations).toEqual([]);
  });
  it("does not treat missing, duplicate or chapter audits as criterion approval", () => {
    const x = setup(); const prior = withCriterionAnalysis(x.report, x.results, [x.audit]);
    for (const audits of [[], [x.audit, x.audit], [{ ...x.audit, sectionId: "dim:ftv" }]]) {
      expect(withCriterionAnalysis(prior, x.results, audits).dimensions[0].criteria[0].detailedAnalysis).toBeUndefined();
    }
  });
  it("labels citation-only checks and retains free baseline detail while respecting print trimming", () => {
    const x = setup(); x.audit.llmAudited = false; x.report.tier = "free";
    const out = withCriterionAnalysis(x.report, x.results, [x.audit]);
    expect(out.dimensions[0].criteria[0].detailedAnalysis?.auditKind).toBe("citation_only");
    expect(projectForTier(out, 0).report.dimensions[0].criteria[0].detailedAnalysis?.narrative).toBe(x.content);
    out.dimensions[0].renderAs = "full";
    expect(projectForTier(out, 2).report.dimensions[0].criteria[0].detailedAnalysis).toBeUndefined();
  });
  it("rejects withheld persisted records that contain rejected text", () => {
    const x = setup(); const out = withCriterionAnalysis(x.report, x.results, [x.audit]);
    out.dimensions[0].criteria[0].detailedAnalysis!.status = "withheld";
    expect(reportV2Schema.safeParse(out).success).toBe(false);
  });
});
