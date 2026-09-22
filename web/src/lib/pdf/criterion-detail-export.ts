import type { CriterionCard, EvidenceRow } from "@/lib/report-v2/schema";
import { stripCitationMarkers } from "@/lib/report-v2/citations";
import { proseParagraphs } from "@/lib/report-v2/paragraphs";

/** Export saved post-audit prose only; never promote it to independently verified research. */
export function criterionDetailExport(card: CriterionCard, evidence: readonly EvidenceRow[], locale: "en" | "vi") {
  const detail = card.detailedAnalysis;
  if (detail?.status !== "supported" || detail.source !== "post_audit_criterion"
    || !["model_and_citation", "citation_only"].includes(detail.auditKind) || !detail.narrative.trim()) return null;
  const vi = locale === "vi";
  const sources = new Map(evidence.filter(row => row.status !== "missing").map(row => [row.evidence_id, row]));
  const quotes = detail.citations.flatMap(citation => {
    const source = sources.get(citation.evidence_id);
    if (!source || !detail.narrative.includes(`[ev:${citation.evidence_id}]`) || !citation.quote.trim()) return [];
    return [`${stripCitationMarkers(source.label)}: "${stripCitationMarkers(citation.quote)}"`];
  });
  return {
    heading: vi ? "Phân tích AI đã lưu" : "Saved AI analysis",
    disclosure: vi
      ? `Đã kiểm tra ${detail.auditKind === "citation_only" ? "trích dẫn" : "bằng mô hình và trích dẫn"}; không phải xác minh độc lập hoặc nghiên cứu thị trường mới.`
      : `${detail.auditKind === "citation_only" ? "Citation checks" : "Model and citation checks"} completed; not independent verification or fresh market research.`,
    paragraphs: proseParagraphs(stripCitationMarkers(detail.narrative)),
    sourcesHeading: vi ? "Trích dẫn trong phân tích đã lưu" : "Sources quoted in the saved analysis",
    quotes: [...new Set(quotes)],
  };
}
