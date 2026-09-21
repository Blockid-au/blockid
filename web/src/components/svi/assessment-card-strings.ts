// G21-P1-B — labels for the Assessment Card and the dimension explainability
// card. EN + VI (the ReportV2 locales with their own strings); ES / JA read
// the English labels, exactly as the valuation chapter does. No React.

import type { TbrLocale } from "@/lib/i18n/tbr-strings";

export interface AssessmentCardStrings {
  kicker: string;
  svi: string;
  outOf: string;
  evidenceConfidence: string;
  verification: string;
  stage: string;
  sector: string;
  benchmark: string;
  /** `segment` (G21 P3-B) names the comparison set ("Stage 4 · SaaS / Software"); absent = "stage median". */
  benchmarkLine: (median: number, n: number, label: string, segment?: string) => string;
  benchmarkLabel: Record<"indicative" | "benchmark" | "segmented", string>;
  topStrength: string;
  topGap: string;
  unverifiedClaims: string;
  lastUpdated: string;
  methodology: string;
  pending: string;
  pendingDims: (n: number, of: number) => string;
  none: string;
  // dimension card
  score: string;
  confidence: string;
  why: string;
  evidence: string;
  missing: string;
  nextAction: string;
  verified: string;
  weight: (w: number) => string;
  lift: (n: number) => string;
  pendingLine: string;
  noEvidence: string;
  complete: string;
  openChapter: string;
}

const EN: AssessmentCardStrings = {
  kicker: "BlockID Assessment Card",
  svi: "SVI",
  outOf: "/ 100",
  evidenceConfidence: "Evidence Confidence",
  verification: "Verification",
  stage: "Stage",
  sector: "Sector",
  benchmark: "Benchmark",
  benchmarkLine: (median, n, label, segment) => `${segment ? `${segment} median` : "stage median"} ${median} (n = ${n}) · ${label}`,
  benchmarkLabel: { indicative: "indicative", benchmark: "benchmark", segmented: "segmented benchmark" },
  topStrength: "Top strength",
  topGap: "Top gap",
  unverifiedClaims: "Unverified material claims",
  lastUpdated: "Last updated",
  methodology: "Methodology",
  pending: "Pending",
  pendingDims: (n, of) => `${n} of ${of} dimensions pending`,
  none: "—",
  score: "Score",
  confidence: "Confidence",
  why: "Why",
  evidence: "Evidence",
  missing: "Missing",
  nextAction: "Next action",
  verified: "verified",
  weight: (w) => `weight ${w}%`,
  lift: (n) => `+${n} SVI`,
  pendingLine: "Not assessed yet — no real input has moved this dimension.",
  noEvidence: "No evidence item on file yet.",
  complete: "Every catalogue item for this dimension is on file.",
  openChapter: "Open chapter",
};

const VI: AssessmentCardStrings = {
  kicker: "Thẻ đánh giá BlockID",
  svi: "SVI",
  outOf: "/ 100",
  evidenceConfidence: "Độ tin cậy bằng chứng",
  verification: "Xác minh",
  stage: "Giai đoạn",
  sector: "Ngành",
  benchmark: "Chuẩn tham chiếu",
  benchmarkLine: (median, n, label, segment) => `${segment ? `trung vị ${segment}` : "trung vị giai đoạn"} ${median} (n = ${n}) · ${label}`,
  benchmarkLabel: { indicative: "tham khảo", benchmark: "chuẩn tham chiếu", segmented: "chuẩn theo phân khúc" },
  topStrength: "Điểm mạnh nhất",
  topGap: "Khoảng trống lớn nhất",
  unverifiedClaims: "Tuyên bố trọng yếu chưa xác minh",
  lastUpdated: "Cập nhật lần cuối",
  methodology: "Phương pháp",
  pending: "Chưa đánh giá",
  pendingDims: (n, of) => `${n}/${of} chiều chưa đánh giá`,
  none: "—",
  score: "Điểm",
  confidence: "Độ tin cậy",
  why: "Vì sao",
  evidence: "Bằng chứng",
  missing: "Còn thiếu",
  nextAction: "Hành động tiếp theo",
  verified: "đã xác minh",
  weight: (w) => `trọng số ${w}%`,
  lift: (n) => `+${n} SVI`,
  pendingLine: "Chưa đánh giá — chưa có dữ liệu thực nào tác động đến chiều này.",
  noEvidence: "Chưa có bằng chứng nào được lưu.",
  complete: "Mọi hạng mục bằng chứng của chiều này đã có.",
  openChapter: "Mở chương",
};

export function assessmentStrings(locale: TbrLocale | undefined): AssessmentCardStrings {
  return locale === "vi" ? VI : EN;
}

export function formatCardDate(iso: string, locale: TbrLocale | undefined): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tag = locale === "vi" ? "vi-VN" : locale === "es" ? "es-ES" : locale === "ja" ? "ja-JP" : "en-AU";
  return d.toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
