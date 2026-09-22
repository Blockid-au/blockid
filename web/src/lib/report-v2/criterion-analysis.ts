import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { AgentAnalysisResult, SectionAuditRecord } from "@/lib/report-pipeline/types";
import type { ReportV2 } from "./schema";

/** Publish only the final, criterion-specific audited narrative. Chapter cards
 * precede the audit and cannot safely preserve the original model prose. */
export function withCriterionAnalysis(
  report: ReportV2,
  results: ReadonlyMap<CriterionKey, AgentAnalysisResult>,
  audits: readonly SectionAuditRecord[],
): ReportV2 {
  return { ...report, dimensions: report.dimensions.map(chapter => ({ ...chapter,
    criteria: chapter.criteria.map(card => {
      const result = results.get(card.key);
      const matches = audits.filter(audit => audit.sectionId === card.key);
      // Missing or ambiguous audit identity must not resurrect stale detail.
      if (!result || matches.length !== 1) {
        const { detailedAnalysis: _previous, ...rest } = card;
        return rest;
      }
      const audit = matches[0];
      const conflict = report.quality.consistencyIssues.some(issue => issue.severity === "high"
        && (!issue.criteria.length || issue.criteria.includes(card.key)));
      const supported = !conflict && audit.grounded && !audit.hadIssues && !audit.uncitedClaims.length
        && !result.degraded && Boolean(result.content.trim());
      const allowed = new Set([...chapter.evidence, ...report.appendix.evidenceRegister]
        .filter(row => row.status !== "missing").map(row => row.evidence_id));
      const citations = supported ? (result.citations ?? []).filter(citation =>
        allowed.has(citation.evidence_id) && result.content.includes(`[ev:${citation.evidence_id}]`)) : [];
      return { ...card, detailedAnalysis: {
        status: supported ? "supported" as const : "withheld" as const,
        source: "post_audit_criterion" as const,
        auditKind: audit.llmAudited ? "model_and_citation" as const : "citation_only" as const,
        narrative: supported ? result.content : "",
        citations,
      } };
    }),
  })) };
}
