import type { CriterionCard, CriterionResearchCoverage, ReportV2 } from "./schema";

/** Retrieval coverage only. A fetched page is not a verified comparison or a
 * business-specific investment implication. Old reports remain explicit. */
export function criterionResearchCoverage(card: Pick<CriterionCard, "key">, report: ReportV2): CriterionResearchCoverage {
  const result = report.appendix.publicResearch;
  const base: CriterionResearchCoverage = { status: "not_recorded", retrievedSourceIds: [], comparison: "not_assessed", businessImplication: "not_recorded" };
  if (!result || result.task.criterion !== card.key) return base;
  const retrievedSourceIds = result.sources.filter(source => source.status === "found" && /^[a-f0-9]{64}$/i.test(source.contentSha256 ?? "") && Boolean(source.fetchedAt) && Boolean(source.excerpt.trim())).map(source => source.id);
  // Never promote a found summary without an actual recorded source snapshot.
  const status = retrievedSourceIds.length ? "sources_retrieved" : result.status === "found" ? "not_recorded" : result.status;
  return { ...base, status, question: result.task.question, retrievedSourceIds };
}

export function withCriterionResearchCoverage(report: ReportV2): ReportV2 {
  return { ...report, dimensions: report.dimensions.map(chapter => ({ ...chapter,
    criteria: chapter.criteria.map(card => ({ ...card, researchCoverage: criterionResearchCoverage(card, report) })),
  })) };
}
