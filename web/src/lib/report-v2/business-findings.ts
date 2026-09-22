import type { IntakeResult } from "@/lib/intake/analyze-input";
import type { ReportV2, CriterionCard, EvidenceConfidence } from "./schema";

export type FindingsLocale = "en" | "vi";
export interface BusinessFinding {
  id: string;
  reportId?: string;
  snapshotId?: string;
  generatedAt?: string;
  title: string;
  summary: string;
  state: "final" | "limited" | "preliminary";
  assessment: string[];
  criticalIssues: string[];
  auditLimit: string | null;
  implication: string;
  uncertainty: string[];
  requests: string[];
  sources: Array<{
    id: string;
    label: string;
    detail?: string;
    observedAt?: string;
    confidence?: EvidenceConfidence;
  }>;
  criteria: Array<{
    id: string;
    title: string;
    verdict: string;
    strengths: string[];
    gaps: string[];
    request: string;
    grounded: boolean;
    quality: CriterionCard["quality"];
    citations: Array<{ id: string; quote: string; sourceRecorded: boolean }>;
  }>;
}

// Reading guidance is not a generated business conclusion. Every unassessed
// area remains explicit until the report supplies its own supported findings.
const AREAS = [
  [
    "ftv",
    "Team & execution",
    "Đội ngũ và thực thi",
    "team",
    "Who has delivered comparable work, and what responsibilities or essential skills are uncovered?",
    "Ai đã thực hiện công việc tương tự, ai chịu trách nhiệm và còn thiếu năng lực thiết yếu nào?",
    "Execution capacity affects whether the business can deliver its milestones.",
    "Năng lực thực thi ảnh hưởng đến khả năng hoàn thành các mốc kinh doanh.",
  ],
  [
    "mpc-problem",
    "Customer problem",
    "Vấn đề của khách hàng",
    "problem",
    "Who experiences the problem, how often, what does it cost them, and who decides to pay? Request customer records or paid-pilot evidence.",
    "Ai gặp vấn đề, tần suất và chi phí là bao nhiêu, ai quyết định chi tiền? Cần hồ sơ khách hàng hoặc bằng chứng thử nghiệm có trả phí.",
    "Problem severity and willingness to pay determine whether a described need can support demand; a clear description alone does not establish either.",
    "Mức độ nghiêm trọng và khả năng trả tiền quyết định nhu cầu kinh doanh; mô tả rõ chưa đủ chứng minh hai yếu tố này.",
  ],
  [
    "mpc-market",
    "Reachable market",
    "Thị trường có thể tiếp cận",
    "market",
    "Provide eligible customer counts, geography, annual spend and distribution constraints. Separate total market (TAM), serviceable market (SAM) and realistically obtainable market (SOM), with sources and dates.",
    "Cần số khách hàng phù hợp, địa bàn, chi tiêu hằng năm và giới hạn phân phối. Tách tổng thị trường (TAM), phần có thể phục vụ (SAM) và phần thực tế có thể giành được (SOM), kèm nguồn và ngày.",
    "A large industry total does not establish this business’s reachable revenue. Customer eligibility, pricing and delivery capacity determine whether market claims support growth assumptions.",
    "Quy mô toàn ngành không chứng minh doanh thu doanh nghiệp có thể tiếp cận. Khách hàng phù hợp, giá và năng lực phục vụ quyết định cơ sở của giả định tăng trưởng.",
  ],
  [
    "ptd",
    "Product & delivery",
    "Sản phẩm và cung ứng",
    "product",
    "Show the product or service in use, customer outcomes, delivery dependencies and what has been tested. Technical evidence should fit the business model.",
    "Cần sản phẩm hoặc dịch vụ đang được sử dụng, kết quả khách hàng, phụ thuộc trong cung ứng và phần đã kiểm thử. Bằng chứng kỹ thuật phải phù hợp mô hình kinh doanh.",
    "Delivery evidence separates an intended solution from demonstrated capability and helps assess execution risk.",
    "Bằng chứng cung ứng phân biệt giải pháp dự kiến với năng lực đã chứng minh và giúp đánh giá rủi ro thực thi.",
  ],
  [
    "tre",
    "Revenue & traction",
    "Doanh thu và tăng trưởng",
    "traction",
    "Provide dated customer and revenue records, recurring versus one-off sales, refunds, retention and costs for matching periods.",
    "Cần hồ sơ khách hàng và doanh thu có kỳ đo, tách doanh thu lặp lại và một lần, hoàn tiền, giữ chân khách hàng và chi phí cùng kỳ.",
    "Revenue quality and retention affect repeatability; comparable periods and costs are needed before using growth or unit economics in valuation.",
    "Chất lượng doanh thu và giữ chân khách hàng ảnh hưởng khả năng lặp lại; cần kỳ đo và chi phí phù hợp trước khi dùng tăng trưởng hoặc hiệu quả đơn vị trong định giá.",
  ],
  [
    "cgh",
    "Ownership & governance",
    "Sở hữu và quản trị",
    "other",
    "Request the current cap table, share rights, decision authority and outstanding instruments or obligations.",
    "Cần bảng vốn hiện tại, quyền cổ phần, thẩm quyền quyết định và công cụ vốn hoặc nghĩa vụ còn tồn tại.",
    "Ownership and decision rights affect dilution, control and the terms an investor would receive.",
    "Sở hữu và quyền quyết định ảnh hưởng pha loãng, kiểm soát và điều khoản nhà đầu tư nhận được.",
  ],
  [
    "iri",
    "Funding & investor readiness",
    "Gọi vốn và mức sẵn sàng",
    "ask",
    "Provide the funding amount, instrument and terms, use of funds, cash runway and measurable milestones financed by the raise.",
    "Cần số vốn, công cụ và điều khoản, mục đích sử dụng, thời gian duy trì tiền mặt và mốc đo lường được từ vòng vốn.",
    "Funding needs must connect to achievable milestones and deal terms before assessing whether the proposed raise is suitable.",
    "Nhu cầu vốn phải gắn với mốc khả thi và điều khoản trước khi đánh giá sự phù hợp của vòng vốn.",
  ],
  [
    "lco",
    "Legal & operating requirements",
    "Pháp lý và điều kiện hoạt động",
    "other",
    "Identify the operating entity, jurisdictions and applicable permissions or obligations; provide the relevant records for specialist review where needed.",
    "Xác định pháp nhân, địa bàn và giấy phép hoặc nghĩa vụ áp dụng; cung cấp hồ sơ liên quan để chuyên gia xem xét khi cần.",
    "Unresolved operating requirements may constrain launch or expansion; missing documents alone do not prove non-compliance.",
    "Điều kiện hoạt động chưa rõ có thể giới hạn triển khai hoặc mở rộng; thiếu hồ sơ không tự chứng minh vi phạm.",
  ],
  [
    "svm",
    "Strategic vision & moat",
    "Tầm nhìn và lợi thế bền vững",
    "solution",
    "Identify the customer’s current alternative and evidence for differentiation. Compare relevant alternatives using retrieved product and pricing sources when research is available.",
    "Xác định giải pháp khách hàng đang dùng và bằng chứng khác biệt. So sánh lựa chọn phù hợp bằng nguồn sản phẩm và giá đã đọc khi có nghiên cứu.",
    "Differentiation matters only where customers value it and alternatives cannot readily replace it; absence of named competitors does not establish uniqueness.",
    "Khác biệt có ý nghĩa khi khách hàng coi trọng và khó bị lựa chọn khác thay thế; thiếu tên đối thủ không chứng minh tính độc nhất.",
  ],
] as const;

export function projectBusinessFindings({
  report,
  intake,
  locale = "en",
}: {
  report?: ReportV2 | null;
  intake?: IntakeResult;
  locale?: FindingsLocale;
}): BusinessFinding[] {
  const vi = locale === "vi";
  if (report)
    return report.dimensions.map((chapter) => {
      const issues = report.quality.consistencyIssues.filter(
        (issue) =>
          !issue.criteria.length ||
          issue.criteria.some((key) =>
            chapter.criteria.some((c) => c.key === key),
          ),
      );
      const limited =
        report.source !== "pipeline" ||
        chapter.degraded === true ||
        chapter.scoreBreakdown?.assessed === false;
      return {
        id: chapter.dim,
        reportId: report.reportId,
        snapshotId: report.snapshotId,
        generatedAt: report.generatedAt,
        title: vi ? chapter.titleVi : chapter.title,
        summary:
          chapter.verdict ||
          (vi
            ? "Chưa có nhận định trong báo cáo này."
            : "No assessment recorded in this report."),
        state: limited ? "limited" : "final",
        assessment: chapter.strengths,
        criticalIssues: issues
          .filter((issue) => issue.severity === "high")
          .map((issue) => issue.description),
        auditLimit: !chapter.audit.grounded
          ? vi
            ? "Bước kiểm tra chưa xác nhận đầy đủ cơ sở của các nhận định."
            : "The audit has not confirmed sufficient support for all claims."
          : null,
        // The schema does not yet contain a separate verified implication record.
        // Preserve its existing phase context; do not manufacture an investment opinion.
        implication:
          chapter.phaseLens.whatMattersNow ||
          (vi
            ? "Báo cáo chưa ghi nhận tác động riêng cho nhà đầu tư."
            : "A separate investor implication has not been recorded."),
        uncertainty: [
          ...chapter.gaps,
          ...issues.map((issue) => issue.description),
          ...(limited
            ? [
                vi
                  ? "Phần này có dữ liệu hoặc phân tích hạn chế; không coi điểm số là bằng chứng đầy đủ."
                  : "This section has limited data or analysis; its score is not sufficient evidence.",
              ]
            : []),
        ],
        requests: chapter.nextAction.title ? [chapter.nextAction.title] : [],
        sources: chapter.evidence.map((e) => ({
          id: e.evidence_id,
          label: `${e.label} · ${e.source} · ${e.status}`,
          detail: e.value,
          observedAt: e.observedAt,
          confidence: e.confidence,
        })),
        criteria: chapter.criteria.map((c) => ({
          id: c.key,
          title: c.title,
          verdict: c.verdict,
          strengths: c.strengths,
          gaps: c.gaps,
          request: c.nextAction,
          grounded: c.grounded,
          quality: c.quality,
          citations: c.citations.map((citation) => ({
            id: citation.evidence_id,
            quote: citation.quote,
            sourceRecorded: chapter.evidence.some(
              (e) => e.evidence_id === citation.evidence_id,
            ),
          })),
        })),
      };
    });
  return AREAS.map(
    ([id, enTitle, viTitle, section, enRequest, viRequest, enWhy, viWhy]) => {
      // Section assignment is only an intake hint. Show exact input excerpts,
      // never model-written summaries masquerading as the original document.
      const excerpts =
        section === "other"
          ? []
          : (intake?.structured?.deckSections?.[section] ?? []).filter(
              (text) => text.trim() && intake?.rawText?.includes(text),
            );
      return {
        id,
        title: vi ? viTitle : enTitle,
        state: "preliminary",
        summary: excerpts.length
          ? vi
            ? "Có nội dung trong đầu vào; cần kiểm chứng trước khi kết luận."
            : "The input discusses this area; validation is needed before drawing a conclusion."
          : vi
            ? "Chưa có phân tích đầy đủ cho mục này."
            : "A complete assessment is not available for this area.",
        criticalIssues: [],
        auditLimit: null,
        assessment: [
          vi
            ? "Đây là hướng dẫn kiểm tra từ đầu vào ban đầu, chưa phải kết luận nghiên cứu về doanh nghiệp."
            : "This is an initial review guide, not a researched conclusion about the business.",
        ],
        implication: vi ? viWhy : enWhy,
        uncertainty: [
          vi
            ? "Chưa có kết quả nghiên cứu bên ngoài được xác minh trong phần xem trước này. Thiếu thông tin không có nghĩa doanh nghiệp không có năng lực này."
            : "No verified external research result is available in this preview. Missing information does not mean the business lacks this capability.",
        ],
        requests: [vi ? viRequest : enRequest],
        sources: excerpts.map((text, i) => ({
          id: `${id}-input-${i}`,
          label: vi
            ? "Trích nguyên văn đầu vào — chưa kiểm chứng độc lập"
            : "Exact input excerpt — not independently verified",
          detail: text,
        })),
        criteria: [],
      };
    },
  );
}
