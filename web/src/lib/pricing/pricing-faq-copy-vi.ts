// pricing-faq-copy-vi — Vietnamese mirrors of the /pricing FAQ sentences
// that name a one-off price (/vi/pricing FAQ JSON-LD). Same contract as
// pricing-faq-copy.ts: flag OFF reproduces today's /vi/pricing text
// character-for-character; flag ON returns the v5 copy. Kept apart from the
// English module so the English-only public-claims guard
// (lib/marketing/claims.ts CLAIM_TREES) scans just the English sentences.

import { paygSingleReportSentenceVi, type PaygView } from "@/lib/pricing/payg-copy";

/** VI single-report sentence. OFF = today's /vi/pricing text. */
export function singleReportFaqSentenceVi(view: PaygView): string {
  return view.enabled
    ? paygSingleReportSentenceVi(view)
    : `Không có gói thì mỗi Trusted Business Report là ${view.reportEntry} cho một startup.`;
}

/** VI refund answer. OFF = today's /vi/pricing text. */
export function refundFaqAnswerVi(view: PaygView): string {
  const oneOff = view.enabled
    ? "Báo cáo lẻ (Snapshot, Full, Verified, Money Finder) và gói tín dụng không hoàn tiền sau khi đã giao, trừ khi Luật Người tiêu dùng Úc yêu cầu; báo cáo Verified còn đang được xem xét sẽ được hoàn đủ khi bạn yêu cầu."
    : `Báo cáo lẻ ${view.reportEntry} và gói tín dụng không hoàn tiền sau khi đã giao, trừ khi Luật Người tiêu dùng Úc yêu cầu.`;
  return `Hoàn tiền 100% trong 7 ngày cho khoản thanh toán gói tháng đầu tiên, không cần lý do — email hỗ trợ và chúng tôi hoàn tiền trong 3 ngày làm việc. Gói năm được hoàn theo tỷ lệ nếu huỷ trong 14 ngày. ${oneOff} Quyền lợi của bạn theo Luật Người tiêu dùng Úc không bao giờ bị loại trừ. Chính sách đầy đủ: /legal/terms#refunds.`;
}
