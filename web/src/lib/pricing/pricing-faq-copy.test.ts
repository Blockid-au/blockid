// pricing-faq-copy — flag OFF must reproduce the pre-v5 FAQ sentences
// character for character (EN + VI); flag ON must carry the v5 copy.

import { describe, expect, it } from "vitest";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW, paygRefundSentence, paygView } from "@/lib/pricing/payg-copy";
import {
  moneyFinderFaqAnswer,
  refundFaqAnswer,
  refundFaqAnswerVi,
  singleReportFaqSentence,
  singleReportFaqSentenceVi,
} from "./pricing-faq-copy";

const PRE_V5_REFUND =
  "7-day money-back guarantee on your first monthly subscription payment, no questions asked — email support and we refund within 3 business days. Annual plans are refunded pro-rata if you cancel within 14 days. One-off A$3 reports and credit packs are non-refundable once delivered, except where the Australian Consumer Law requires a refund. Your Australian Consumer Law guarantees are never excluded. Full policy: /legal/terms#refunds.";
const PRE_V5_REFUND_VI =
  "Hoàn tiền 100% trong 7 ngày cho khoản thanh toán gói tháng đầu tiên, không cần lý do — email hỗ trợ và chúng tôi hoàn tiền trong 3 ngày làm việc. Gói năm được hoàn theo tỷ lệ nếu huỷ trong 14 ngày. Báo cáo lẻ A$3 và gói tín dụng không hoàn tiền sau khi đã giao, trừ khi Luật Người tiêu dùng Úc yêu cầu. Quyền lợi của bạn theo Luật Người tiêu dùng Úc không bao giờ bị loại trừ. Chính sách đầy đủ: /legal/terms#refunds.";
const PRE_V5_MONEY_FINDER =
  "A ranked scan of Australian grants, programs and events your startup qualifies for. Free = the preview (how many you match, top 3 named) and the open-grants directory · A$3 = the full Money Finder report per startup — ranked matches, eligibility checklist, 12-month timeline, PDF · Starter A$29 = Founder Radar deadline alerts and monthly re-match, with full reports included · Growth A$69 = the same, with 45 credits a month for application drafts. A grants consultant charges A$500–2,000 for this scan.";

describe("flag OFF — today's sentences, character-identical", () => {
  it("single report", () => {
    expect(singleReportFaqSentence(PAYG_OFF_VIEW)).toBe("Without a subscription, every full Trusted Business Report is A$3 per startup.");
    expect(singleReportFaqSentenceVi(PAYG_OFF_VIEW)).toBe("Không có gói thì mỗi Trusted Business Report là A$3 cho một startup.");
  });
  it("refund (EN + VI) — paygRefundSentence(OFF) is the pre-v5 clause", () => {
    expect(refundFaqAnswer(PAYG_OFF_VIEW)).toBe(PRE_V5_REFUND);
    expect(PRE_V5_REFUND).toContain(paygRefundSentence(PAYG_OFF_VIEW));
    expect(refundFaqAnswerVi(PAYG_OFF_VIEW)).toBe(PRE_V5_REFUND_VI);
  });
  it("Money Finder", () => {
    expect(moneyFinderFaqAnswer(PAYG_OFF_VIEW)).toBe(PRE_V5_MONEY_FINDER);
  });
});

describe("flag ON — v5 copy from the view", () => {
  it("single report = the plan §6.7 sentence (EN) and its VI mirror", () => {
    expect(singleReportFaqSentence(PAYG_ON_VIEW)).toBe(
      "Without a subscription, buy a single report: Snapshot A$19, Full A$49 or Verified A$149 (all AUD, GST-inclusive).",
    );
    expect(singleReportFaqSentenceVi(PAYG_ON_VIEW)).toContain("Snapshot A$19, Full A$49 hoặc Verified A$149");
  });
  it("refund follows Terms v2.2 (Verified in review refunded in full); no A$3 left", () => {
    for (const s of [refundFaqAnswer(PAYG_ON_VIEW), refundFaqAnswerVi(PAYG_ON_VIEW)]) {
      expect(s).not.toMatch(/A\$3(?![\d,.])/);
      expect(s).toContain("/legal/terms#refunds");
    }
    expect(refundFaqAnswer(PAYG_ON_VIEW)).toContain("a Verified report still in review is refunded in full on request");
    expect(refundFaqAnswer(PAYG_ON_VIEW)).toContain("Your Australian Consumer Law guarantees are never excluded.");
  });
  it("Money Finder at the D25 price; display prices follow platform_config", () => {
    expect(moneyFinderFaqAnswer(PAYG_ON_VIEW)).toContain("A$19 = the full Money Finder report per startup");
    const custom = paygView({ payg_enabled: true, payg_snapshot_cents: 2100, payg_full_cents: 5500, payg_verified_cents: 16000 });
    expect(singleReportFaqSentence(custom)).toContain("Snapshot A$21, Full A$55 or Verified A$160");
  });
});
