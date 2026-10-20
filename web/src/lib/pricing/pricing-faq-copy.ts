// pricing-faq-copy — the /pricing FAQ sentences that name a one-off price,
// shared by the page's FAQPage JSON-LD (app/(marketing)/pricing/page.tsx),
// the visible <FAQV2 /> (components/landing/faq-v2.tsx) and the legacy
// FAQ_ITEMS (lib/pricing-data.ts), so the schema text can never drift from
// the visible text (Pricing v5 wave P5, docs/pricing-v5-plan.md §6.7).
//
// Every function takes the PaygView: flag OFF reproduces today's sentence
// character-for-character (the amounts are derived from the legacy SKU rows,
// never typed); flag ON returns the v5 copy. Pure, isomorphic.

import { paygRefundSentence, paygSingleReportSentence, type PaygView } from "@/lib/pricing/payg-copy";

/** "Without a subscription, …" — the single-report sentence closing the plan-switch FAQ answer. */
export function singleReportFaqSentence(view: PaygView): string {
  return view.enabled
    ? paygSingleReportSentence(view)
    : `Without a subscription, every full Trusted Business Report is ${view.reportEntry} per startup.`;
}

/** The ONE refund answer (Terms clause 3A) — /pricing JSON-LD, FAQV2 and pricing-data. */
export function refundFaqAnswer(view: PaygView): string {
  return `7-day money-back guarantee on your first monthly subscription payment, no questions asked — email support and we refund within 3 business days. Annual plans are refunded pro-rata if you cancel within 14 days. ${paygRefundSentence(view)} Your Australian Consumer Law guarantees are never excluded. Full policy: /legal/terms#refunds.`;
}

/** The Money Finder ladder answer — D25 prices the full report at `view.funding`. */
export function moneyFinderFaqAnswer(view: PaygView): string {
  return `A ranked scan of Australian grants, programs and events your startup qualifies for. Free = the preview (how many you match, top 3 named) and the open-grants directory · ${view.funding} = the full Money Finder report per startup — ranked matches, eligibility checklist, 12-month timeline, PDF · Starter A$29 = Founder Radar deadline alerts and monthly re-match, with full reports included · Growth A$69 = the same, with 45 credits a month for application drafts. A grants consultant charges A$500–2,000 for this scan.`;
}

// ─── Vietnamese mirrors (/vi/pricing) ───────────────────────────────────────

/** VI single-report sentence. OFF = today's /vi/pricing text. */
export function singleReportFaqSentenceVi(view: PaygView): string {
  return view.enabled
    ? `Không có gói thì bạn có thể mua từng báo cáo: Snapshot ${view.snapshot}, Full ${view.full} hoặc Verified ${view.verified} (tất cả bằng AUD, đã gồm GST).`
    : `Không có gói thì mỗi Trusted Business Report là ${view.reportEntry} cho một startup.`;
}

/** VI refund answer. OFF = today's /vi/pricing text. */
export function refundFaqAnswerVi(view: PaygView): string {
  const oneOff = view.enabled
    ? "Báo cáo lẻ (Snapshot, Full, Verified, Money Finder) và gói tín dụng không hoàn tiền sau khi đã giao, trừ khi Luật Người tiêu dùng Úc yêu cầu; báo cáo Verified còn đang được xem xét sẽ được hoàn đủ khi bạn yêu cầu."
    : `Báo cáo lẻ ${view.reportEntry} và gói tín dụng không hoàn tiền sau khi đã giao, trừ khi Luật Người tiêu dùng Úc yêu cầu.`;
  return `Hoàn tiền 100% trong 7 ngày cho khoản thanh toán gói tháng đầu tiên, không cần lý do — email hỗ trợ và chúng tôi hoàn tiền trong 3 ngày làm việc. Gói năm được hoàn theo tỷ lệ nếu huỷ trong 14 ngày. ${oneOff} Quyền lợi của bạn theo Luật Người tiêu dùng Úc không bao giờ bị loại trừ. Chính sách đầy đủ: /legal/terms#refunds.`;
}
