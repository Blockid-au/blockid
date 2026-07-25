// Startup Package — Guided founder interview definition.
//
// Ship-1 guided interview: 8 questions bucketed by the 12-phase growth spec
// (see web/src/lib/startup-growth-phases.ts). Each step captures the founder's
// answer, feeds it to the phase's lead agent, and drives an SVI recompute.
//
// This module is pure data + types. It's imported by both the client wizard
// (interview-wizard.tsx) and the server routes (save-answer, analyze,
// svi-recompute). Keep it dependency-free so it stays test-friendly.
//
// Design notes:
// - `key` is stable and appears in `startup_package_interview.step_key` +
//   `assembled_reports.report_type` (as `package_step_<key>`), so DO NOT
//   rename existing entries — add new ones instead.
// - `creditCost` is DISPLAY-ONLY. Server-side spendCredits() reads from
//   FEATURE_COSTS in web/src/lib/credits.ts (single source of truth for
//   billing). The values here match FEATURE_COSTS["package_agent_analysis"]
//   at the time of authoring; if you change one, change the other.
// - `minChars` gates the "Next" button in the wizard; `targetWords` is a
//   soft target shown in the character counter chip.
// - Bilingual EN/VI to match memory `feedback_report_visuals` — Ship-1
//   ships EN copy; VI slots are populated with EN-passthrough for now and
//   translated in a follow-up tick.

import type { AgentRole } from "@/lib/report-pipeline/types";

/** Stable enum of guided-interview step keys. */
export type InterviewStepKey =
  | "idea_and_problem"
  | "target_customers"
  | "revenue_hypothesis"
  | "one_line_pitch"
  | "mentor_feedback"
  | "founder_and_equity"
  | "gtm_channels"
  | "first_traction";

/** Growth-phase id — kept loose as string to avoid a circular import. */
export type GrowthPhaseId =
  | "vision"
  | "customer_dev"
  | "revenue_model"
  | "pitch"
  | "mentor_review"
  | "legal_equity"
  | "go_to_market"
  | "product_dev";

export interface Bilingual {
  en: string;
  vi: string;
}

export interface InterviewStep {
  key: InterviewStepKey;
  /** Alias for {@link key} — integration.test.ts + external callers expect
   * `step.id`. Populated identically at build time. */
  id: InterviewStepKey;
  phaseId: GrowthPhaseId;
  order: number;
  prompt: Bilingual;
  placeholder: Bilingual;
  helpText: Bilingual;
  minChars: number;
  targetWords: number;
  leadAgent: AgentRole;
  /** Display cost — real charge lives in FEATURE_COSTS["package_agent_analysis"]. */
  creditCost: number;
}

// Backed by raw literals below; a .map() adorns each entry with `id = key`
// so callers that expect `step.id` (integration tests + external consumers)
// find it without duplicating the key literal in every row.
const RAW_INTERVIEW_STEPS: readonly Omit<InterviewStep, "id">[] = Object.freeze([
  {
    key: "idea_and_problem",
    phaseId: "vision",
    order: 1,
    leadAgent: "cto",
    minChars: 80,
    targetWords: 200,
    creditCost: 1.0,
    prompt: {
      en: "What problem are you solving, and why does it matter now?",
      vi: "Bạn đang giải quyết vấn đề gì, và tại sao lúc này lại quan trọng?",
    },
    placeholder: {
      en: "e.g. Australian SMBs waste 8+ hrs/week reconciling GST across Xero, Stripe and their bank. Our tool auto-matches transactions in under 2 minutes...",
      vi: "Ví dụ: Doanh nghiệp nhỏ Úc lãng phí hơn 8 giờ/tuần đối soát GST...",
    },
    helpText: {
      en: "Describe the pain, the trigger event, and why incumbents miss it. Aim for ~200 words.",
      vi: "Mô tả nỗi đau, sự kiện kích hoạt, và tại sao các đối thủ hiện tại bỏ lỡ. Nhắm ~200 từ.",
    },
  },
  {
    key: "target_customers",
    phaseId: "customer_dev",
    order: 2,
    leadAgent: "cmo",
    minChars: 80,
    targetWords: 200,
    creditCost: 0.75,
    prompt: {
      en: "Who is your ideal early adopter, and how have you validated the pain?",
      vi: "Ai là khách hàng sớm lý tưởng của bạn, và bạn đã xác thực nỗi đau như thế nào?",
    },
    placeholder: {
      en: "e.g. Bookkeepers at 5-50 employee AU professional-services firms. Interviewed 14; 11 said they'd pay A$99/mo. LOIs from 3 firms attached.",
      vi: "Ví dụ: Kế toán tại các công ty dịch vụ chuyên nghiệp 5-50 nhân viên...",
    },
    helpText: {
      en: "Persona + validation proof: interviews, LOIs, waitlist size, WTP data.",
      vi: "Persona + bằng chứng: phỏng vấn, LOI, quy mô waitlist, dữ liệu WTP.",
    },
  },
  {
    key: "revenue_hypothesis",
    phaseId: "revenue_model",
    order: 3,
    leadAgent: "cfo",
    minChars: 80,
    targetWords: 200,
    creditCost: 1.0,
    prompt: {
      en: "How will you make money — and what's your pricing hypothesis?",
      vi: "Bạn sẽ kiếm tiền bằng cách nào — và giả thuyết định giá là gì?",
    },
    placeholder: {
      en: "e.g. SaaS subscription, A$99/mo Starter and A$299/mo Growth. Assume 3% conversion off free trial → A$30K MRR at 300 paid seats by month 12.",
      vi: "Ví dụ: Đăng ký SaaS, A$99/tháng Starter và A$299/tháng Growth...",
    },
    helpText: {
      en: "Model: subscription, transaction, marketplace, licensing. Include price points + 12-mo revenue target.",
      vi: "Mô hình: subscription, giao dịch, marketplace, cấp phép. Bao gồm điểm giá + mục tiêu doanh thu 12 tháng.",
    },
  },
  {
    key: "one_line_pitch",
    phaseId: "pitch",
    order: 4,
    leadAgent: "cmo",
    minChars: 80,
    targetWords: 120,
    creditCost: 0.5,
    prompt: {
      en: "Write your one-line pitch — the version you'd say at a coffee shop.",
      vi: "Viết pitch một câu — phiên bản bạn nói ở quán cà phê.",
    },
    placeholder: {
      en: "e.g. We're Xero for GST reconciliation — bookkeepers save 8 hours a week, and their firm keeps 100% of the fee.",
      vi: "Ví dụ: Chúng tôi là Xero cho đối soát GST — kế toán tiết kiệm 8 giờ mỗi tuần...",
    },
    helpText: {
      en: "One sentence: what you do, for whom, and the outcome. Refine 2-3 versions if needed.",
      vi: "Một câu: bạn làm gì, cho ai, và kết quả. Tinh chỉnh 2-3 phiên bản nếu cần.",
    },
  },
  {
    key: "mentor_feedback",
    phaseId: "mentor_review",
    order: 5,
    leadAgent: "chro",
    minChars: 80,
    targetWords: 200,
    creditCost: 0.5,
    prompt: {
      en: "What feedback have mentors, advisors or design partners given you so far?",
      vi: "Người cố vấn, advisor hoặc đối tác thiết kế đã cho bạn phản hồi gì?",
    },
    placeholder: {
      en: "e.g. Two Xero-alumni advisors said pricing was too low; suggested Growth tier at A$399. A design partner flagged integration friction with MYOB — building it now.",
      vi: "Ví dụ: Hai advisor cựu nhân viên Xero nói giá quá thấp...",
    },
    helpText: {
      en: "Named advisors, key criticisms, what you changed as a result.",
      vi: "Advisor có tên, phê bình chính, bạn đã thay đổi gì sau đó.",
    },
  },
  {
    key: "founder_and_equity",
    phaseId: "legal_equity",
    order: 6,
    leadAgent: "clo",
    minChars: 80,
    targetWords: 200,
    creditCost: 0.75,
    prompt: {
      en: "Who's on the founding team, and how is equity split?",
      vi: "Ai trong đội sáng lập, và cổ phần được chia thế nào?",
    },
    placeholder: {
      en: "e.g. 2 co-founders — Alice (CEO, 55%, 10y product) and Ben (CTO, 45%, ex-Canva). 4-year vesting, 1-year cliff. Reserved 10% ESOP.",
      vi: "Ví dụ: 2 đồng sáng lập — Alice (CEO, 55%, 10 năm sản phẩm)...",
    },
    helpText: {
      en: "Founders + roles + %. Include vesting, cliff, ESOP reserve, cap-table anomalies.",
      vi: "Sáng lập + vai trò + %. Bao gồm vesting, cliff, dự trữ ESOP.",
    },
  },
  {
    key: "gtm_channels",
    phaseId: "go_to_market",
    order: 7,
    leadAgent: "cmo",
    minChars: 80,
    targetWords: 200,
    creditCost: 0.75,
    prompt: {
      en: "What are your top 3 go-to-market channels — and what's the CAC evidence?",
      vi: "3 kênh go-to-market hàng đầu của bạn là gì — và bằng chứng CAC?",
    },
    placeholder: {
      en: "e.g. (1) Xero App Store partnership — early CAC A$40, (2) LinkedIn to bookkeeper communities, (3) content-led SEO on 'AU GST reconciliation'. First 20 users cost A$800 blended.",
      vi: "Ví dụ: (1) Đối tác Xero App Store — CAC ban đầu A$40...",
    },
    helpText: {
      en: "Channel, why it's a fit, cost/acquisition evidence (even directional).",
      vi: "Kênh, lý do phù hợp, bằng chứng chi phí/acquisition.",
    },
  },
  {
    key: "first_traction",
    phaseId: "product_dev",
    order: 8,
    leadAgent: "cto",
    minChars: 80,
    targetWords: 200,
    creditCost: 1.0,
    prompt: {
      en: "What have you shipped so far, and what real usage or revenue can you show?",
      vi: "Bạn đã ship gì, và bạn có thể hiện thị usage hoặc doanh thu thực nào?",
    },
    placeholder: {
      en: "e.g. MVP live on Vercel + Supabase, 8 paying pilots (A$1.2K MRR), 42 waitlist. GitHub repo has 380 commits, CI green.",
      vi: "Ví dụ: MVP đang chạy trên Vercel + Supabase, 8 khách hàng trả phí...",
    },
    helpText: {
      en: "Product shipped, paying users, MRR/ARR, key metrics (retention, NPS, latency).",
      vi: "Sản phẩm đã ship, khách hàng trả phí, MRR/ARR, chỉ số chính.",
    },
  },
]);

export const INTERVIEW_STEPS: readonly InterviewStep[] = Object.freeze(
  RAW_INTERVIEW_STEPS.map((s) => ({ ...s, id: s.key })),
);

/** Look up a step by key — throws if unknown (safer than optional). */
export function getInterviewStep(key: InterviewStepKey): InterviewStep {
  const step = INTERVIEW_STEPS.find((s) => s.key === key);
  if (!step) throw new Error(`Unknown interview step: ${key}`);
  return step;
}

/** Type guard for raw route input. */
export function isInterviewStepKey(v: unknown): v is InterviewStepKey {
  return (
    typeof v === "string" &&
    INTERVIEW_STEPS.some((s) => (s.key as string) === v)
  );
}

/** Total steps constant so the wizard progress agrees with this file. */
export const INTERVIEW_TOTAL_STEPS = INTERVIEW_STEPS.length;
