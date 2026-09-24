import { CRITERIA } from "@/lib/evaluation-criteria";
import type { ReportV2 } from "./schema";

export const CRITERIA_SUMMARY_ID = "tbr-criteria-summary";
export function criteriaSummaryStrings(locale: string) {
  return locale === "vi"
    ? { title: "Tổng hợp tiêu chí đánh giá", criterion: "Tiêu chí", score: "Điểm đã lưu", finding: "Kết quả", evidence: "Bằng chứng liên kết", missing: "Chưa có đánh giá được lưu", locked: "Chi tiết trong báo cáo đầy đủ" }
    : { title: "Assessment criteria summary", criterion: "Criterion", score: "Saved score", finding: "Finding", evidence: "Linked evidence", missing: "No saved assessment", locked: "Details in the full report" };
}

/** Reads stored criterion findings only. Missing is not zero; locked rows reveal no result or count. */
export function buildCriteriaSummary(report: ReportV2, locale: string, lockCards = report.tier === "free") {
  const text = criteriaSummaryStrings(locale);
  return CRITERIA.map(def => {
    const chapter = report.dimensions.find(ch => ch.criteria.some(c => c.key === def.key));
    const criterion = chapter?.criteria.find(c => c.key === def.key);
    // A criterion may be referenced in multiple dimensions. Any gated occurrence
    // must not be exposed by selecting an earlier open chapter.
    const locked = Boolean(lockCards && report.dimensions.some(ch => ch.renderAs === "card" && ch.criteria.some(c => c.key === def.key)));
    return {
      key: def.key,
      title: locale === "vi" ? def.titleVi : def.title,
      dim: locked ? undefined : chapter?.dim,
      state: locked ? "locked" : criterion ? "assessed" : "missing",
      finding: locked ? text.locked : criterion?.verdict || text.missing,
      score: locked || !criterion ? null : criterion.score,
      evidenceCount: locked || !criterion ? null : new Set(criterion.citations.map(c => c.evidence_id)).size,
    };
  });
}
