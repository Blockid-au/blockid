import { cookies } from "next/headers";

export type Locale = "en" | "vi";

/**
 * Read the preferred locale from the `blockid_lang` cookie (server-side).
 * Falls back to "en" when the cookie is absent or invalid.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const raw = jar.get("blockid_lang")?.value;
  return raw === "vi" ? "vi" : "en";
}

/** Vietnamese AI instruction — prepend to system prompt when locale=vi */
export const VI_AI_INSTRUCTION = `IMPORTANT: Respond ENTIRELY in Vietnamese (tiếng Việt). All section titles, analysis text, recommendations, evidence gap descriptions, and action items must be in Vietnamese. Keep technical terms in English where standard (SVI, ESIC, SAFE, MRR, ARR, CAC, LTV, etc.) but explain them in Vietnamese. Use professional Vietnamese business language.`;

/** Translation map for UI labels */
const translations: Record<string, Record<Locale, string>> = {
  executive_summary: { en: "Executive Summary", vi: "Tóm Tắt Điều Hành" },
  market_problem: { en: "Market & Problem", vi: "Thị Trường & Vấn Đề" },
  product_technical: { en: "Product & Technical", vi: "Sản Phẩm & Kỹ Thuật" },
  traction_revenue: { en: "Traction & Revenue", vi: "Sức Kéo & Doanh Thu" },
  cap_table: { en: "Cap Table & Governance", vi: "Bảng Vốn & Quản Trị" },
  investor_readiness: { en: "Investor Readiness", vi: "Sẵn Sàng Đầu Tư" },
  legal_compliance: { en: "Legal & Compliance", vi: "Pháp Lý & Tuân Thủ" },
  strategic_moat: { en: "Strategic Moat", vi: "Lợi Thế Cạnh Tranh" },
  risk_assessment: { en: "Risk Assessment", vi: "Đánh Giá Rủi Ro" },
  evidence_gaps: { en: "Evidence Gaps & Action Plan", vi: "Thiếu Sót Bằng Chứng & Kế Hoạch" },
  next_steps: { en: "Next Steps & Recommendations", vi: "Bước Tiếp Theo & Khuyến Nghị" },
  strengths: { en: "Strengths", vi: "Điểm Mạnh" },
  weaknesses: { en: "Areas to Improve", vi: "Cần Cải Thiện" },
  svi_score: { en: "SVI Score", vi: "Điểm SVI" },
  get_svi: { en: "Get My SVI", vi: "Lấy Điểm SVI" },
  try_example: { en: "Try an Example", vi: "Thử Ví Dụ" },
  first_free: { en: "First analysis FREE", vi: "Phân tích đầu tiên MIỄN PHÍ" },
  no_credit_card: { en: "No credit card", vi: "Không cần thẻ" },
  no_signup: { en: "No signup required", vi: "Không cần đăng ký" },
  describe_idea: { en: "Describe your startup idea, business plan, or paste key details…", vi: "Mô tả ý tưởng startup, kế hoạch kinh doanh, hoặc dán chi tiết…" },
  analyzing: { en: "Analyzing…", vi: "Đang phân tích…" },
  page_of: { en: "of", vi: "trong" },
  view_report: { en: "View Full Report", vi: "Xem Báo Cáo Đầy Đủ" },
  sign_in: { en: "Sign in to Dashboard", vi: "Đăng Nhập Dashboard" },
  upload_evidence: { en: "Upload Evidence", vi: "Tải Lên Bằng Chứng" },
  create_account: { en: "Create Free Account", vi: "Tạo Tài Khoản Miễn Phí" },
  share_score: { en: "Share via Email", vi: "Chia Sẻ Qua Email" },
  copy_link: { en: "Copy link", vi: "Sao Chép Liên Kết" },
  new_analysis: { en: "Analyze another idea", vi: "Phân tích ý tưởng khác" },
  email_subject_report: { en: "Your BlockID Startup Value Report is Ready", vi: "Báo Cáo Giá Trị Startup BlockID Đã Sẵn Sàng" },
  email_heading: { en: "Your Startup Value Report is Ready", vi: "Báo Cáo Giá Trị Startup Đã Sẵn Sàng" },
  your_idea: { en: "Your Idea", vi: "Ý Tưởng Của Bạn" },
};

/** Get translation for a key */
export function tx(key: string, locale: Locale): string {
  return translations[key]?.[locale] ?? translations[key]?.en ?? key;
}
