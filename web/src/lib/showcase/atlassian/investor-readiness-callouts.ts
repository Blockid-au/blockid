// Atlassian ↔ BlockID investor-readiness callouts, one per 12-phase key.
//
// Data-only fixture consumed by the sibling agent's /showcase/atlassian
// walkthrough surface to render "you are here" / next-step tiles that
// pair the Atlassian real-world moment with the BlockID surface a live
// founder would use at the same journey point.
//
// Source of truth: docs/plans/atlassian-standard-mapping-goal.md §1
// (phase gap matrix) + §4 (walkthrough surface mapping).
//
// AFSL boundary: copy is descriptive, never prescriptive. No numbers,
// no personal advice — just "here is the analogous BlockID surface".

import { PHASE_COUNT, PHASE_LABELS } from "../gallery";

export type InvestorReadinessCallout = {
  /** 12-phase key, 1..12 — matches PHASE_LABELS in gallery.ts. */
  phase: number;
  /** English + Vietnamese phase labels re-exported for the walkthrough shell. */
  phase_label_en: string;
  phase_label_vi: string;
  /** Real-world Atlassian moment cited in the goal doc §1. */
  atlassian_moment: string;
  /** BlockID surface a live founder at this phase would land on. */
  blockid_route: string;
  /** Founder-mentor callout copy — descriptive, not prescriptive. */
  callout_copy_en: string;
  callout_copy_vi: string;
};

// Ordinal-keyed for O(1) lookup and stable serialisation. Each entry is
// hand-authored from goal §1 + §4; do not machine-regenerate without
// re-running the AFSL boundary check on the copy fields.
export const INVESTOR_READINESS_CALLOUTS: Record<number, InvestorReadinessCallout> = {
  1: {
    phase: 1,
    phase_label_en: PHASE_LABELS[1].en,
    phase_label_vi: PHASE_LABELS[1].vi,
    atlassian_moment:
      "2002 — Mike Cannon-Brookes + Scott Farquhar leave UNSW with a A$10K credit card, decide against the PwC job offers.",
    blockid_route: "/guide/01-vision",
    callout_copy_en:
      "Every founder starts here. Type your one-liner into BlockID's Chapter 1 — the same intent Cannon-Brookes and Farquhar committed to on paper before the ABN existed.",
    callout_copy_vi:
      "Mọi nhà sáng lập đều bắt đầu ở đây. Nhập một câu tóm tắt vào Chương 1 của BlockID — đúng ý định mà Cannon-Brookes và Farquhar đã cam kết trước cả khi có mã ABN.",
  },
  2: {
    phase: 2,
    phase_label_en: PHASE_LABELS[2].en,
    phase_label_vi: PHASE_LABELS[2].vi,
    atlassian_moment:
      "2002 — Atlassian builds Jira as its own internal issue tracker; the founders are themselves the target user, which shortcuts the discovery loop.",
    blockid_route: "/svi",
    callout_copy_en:
      "Score your idea against the 13 SVI criteria. Atlassian validated by being their own user — you validate by capturing 5 discovery interviews plus a landing-page waitlist before Chapter 3.",
    callout_copy_vi:
      "Chấm điểm ý tưởng theo 13 tiêu chí SVI. Atlassian xác thực bằng cách là chính người dùng của mình — bạn xác thực bằng 5 buổi phỏng vấn khám phá và một trang đăng ký chờ trước Chương 3.",
  },
  3: {
    phase: 3,
    phase_label_en: PHASE_LABELS[3].en,
    phase_label_vi: PHASE_LABELS[3].vi,
    atlassian_moment:
      "2002-2003 — Atlassian identifies that dev teams globally are under-served by heavyweight enterprise tools; a low-price self-serve wedge is the market gap.",
    blockid_route: "/guide/03-market-research",
    callout_copy_en:
      "Size your TAM/SAM/SOM against ABS and industry-body data. The BlockID CMO agent runs a deep pass — Atlassian's wedge only became obvious in hindsight; yours can be defensible on paper today.",
    callout_copy_vi:
      "Định cỡ TAM/SAM/SOM dựa trên dữ liệu ABS và hiệp hội ngành. Tác nhân CMO của BlockID chạy một lượt phân tích sâu — điểm chèn của Atlassian chỉ rõ ràng khi nhìn lại; điểm chèn của bạn có thể được chứng minh ngay hôm nay.",
  },
  4: {
    phase: 4,
    phase_label_en: PHASE_LABELS[4].en,
    phase_label_vi: PHASE_LABELS[4].vi,
    atlassian_moment:
      "2002 — Jira v1.0 ships; 2004 — Confluence v1.0 ships. Both go out with zero salespeople — the product-led legend starts here.",
    blockid_route: "/guide/04-mvp",
    callout_copy_en:
      "Publish a landing page with an analytics ID stamped, and store the founder + contractor IP Assignment Deeds in the data room. If a contractor writes code before the deed is signed, that is a raise-blocker later.",
    callout_copy_vi:
      "Xuất bản trang landing đã gắn ID analytics, và lưu Bản chuyển giao IP của nhà sáng lập + nhà thầu vào data room. Nếu nhà thầu viết mã trước khi ký, việc gọi vốn sau này sẽ bị chặn.",
  },
  5: {
    phase: 5,
    phase_label_en: PHASE_LABELS[5].en,
    phase_label_vi: PHASE_LABELS[5].vi,
    atlassian_moment:
      "2003 — First US$1M revenue; American Airlines buys Jira via fax with no human sales contact. The retention curve is what turned that fluke into a business.",
    blockid_route: "/dashboard",
    callout_copy_en:
      "Wire Stripe in test-mode and watch the cohort retention curve populate. Chapter 5's PMF signal doc — retention slope + revenue slope + a Sean Ellis \"very disappointed %\" survey — is what unlocks Chapter 7 in one click instead of a two-week project.",
    callout_copy_vi:
      "Kết nối Stripe ở chế độ test và theo dõi đường cong giữ chân theo cohort. Tài liệu tín hiệu PMF của Chương 5 — độ dốc giữ chân + độ dốc doanh thu + khảo sát Sean Ellis \"very disappointed %\" — là thứ mở khóa Chương 7 chỉ bằng một cú click thay vì một dự án hai tuần.",
  },
  6: {
    phase: 6,
    phase_label_en: PHASE_LABELS[6].en,
    phase_label_vi: PHASE_LABELS[6].vi,
    atlassian_moment:
      "2003-2010 — Atlassian reaches ~US$100M revenue with essentially no sales team; product-led growth defines the era (Atlassian S-1 MD&A, 2015).",
    blockid_route: "/dashboard/cfo",
    callout_copy_en:
      "Author the 3-year P&L + cash-flow + burn model in base / bull / bear. If trailing-12-month turnover clears A$75k, BlockID's compliance-calendar surfaces the GST-registration nudge, and the R&D Tax Incentive registration deadline sits 10 months after your FY end.",
    callout_copy_vi:
      "Xây mô hình P&L + dòng tiền + burn ba năm theo kịch bản cơ bản / lạc quan / bi quan. Nếu doanh thu 12 tháng gần nhất vượt 75.000 AUD, lịch tuân thủ của BlockID sẽ nhắc bạn đăng ký GST, và hạn nộp đăng ký R&D Tax Incentive là 10 tháng sau khi kết thúc năm tài chính.",
  },
  7: {
    phase: 7,
    phase_label_en: PHASE_LABELS[7].en,
    phase_label_vi: PHASE_LABELS[7].vi,
    atlassian_moment:
      "2005 — First profitable year; the ShipIt hackathon starts, and Pledge 1% is co-founded the year after.",
    blockid_route: "/dashboard/integrations",
    callout_copy_en:
      "Connect GA4 and Stripe live-mode. Weekly SVI delta emails begin from here, and the growth playbook plus referrals scaffold light up in the workspace shell.",
    callout_copy_vi:
      "Kết nối GA4 và Stripe live-mode. Email chênh lệch SVI hằng tuần bắt đầu từ đây, và sổ tay tăng trưởng cùng khung giới thiệu bạn bè sẽ sáng lên trong workspace.",
  },
  8: {
    phase: 8,
    phase_label_en: PHASE_LABELS[8].en,
    phase_label_vi: PHASE_LABELS[8].vi,
    atlassian_moment:
      "2005 ShipIt starts, 2006 Foundation + Pledge 1%, 2007 five core values codified — Atlassian's culture stack is documented before the board scales in 2012.",
    blockid_route: "/dashboard/team",
    callout_copy_en:
      "Draft your ESOP scheme rules and run BlockID's 8-point Div 83A start-up eligibility check (ITAA97 s83A-33 / s83A-45). Fair Work Award mapping and the six-month hiring plan sit alongside the CHRO agent output — general information only, not personal financial product advice.",
    callout_copy_vi:
      "Soạn quy chế ESOP và chạy 8 điểm kiểm tra điều kiện start-up Div 83A của BlockID (ITAA97 s83A-33 / s83A-45). Ánh xạ Fair Work Award và kế hoạch tuyển dụng sáu tháng nằm ngay cạnh đầu ra của tác nhân CHRO — chỉ mang tính thông tin chung, không phải tư vấn sản phẩm tài chính cá nhân.",
  },
  9: {
    phase: 9,
    phase_label_en: PHASE_LABELS[9].en,
    phase_label_vi: PHASE_LABELS[9].vi,
    atlassian_moment:
      "2010 — Atlassian is ~US$55M cash-on-hand and profitable before Accel Partners even calls. The readiness came from operating cashflow, not investor pitching (TechCrunch 2010-07-14).",
    blockid_route: "/dashboard/fundraise",
    callout_copy_en:
      "The BlockID data-room shell is Atlassian-S-1-shaped: 12 folders, 102 documents, LLM-audited for inconsistencies. Run the ESIC self-assessment (ITAA97 Div 360) before you approach anyone, and keep the AFSL disclaimer visible on every valuation output.",
    callout_copy_vi:
      "Khung data-room của BlockID được thiết kế theo mẫu S-1 của Atlassian: 12 thư mục, 102 tài liệu, được LLM kiểm tra tính nhất quán. Hãy chạy đánh giá ESIC (ITAA97 Div 360) trước khi tiếp cận nhà đầu tư, và luôn hiển thị tuyên bố từ chối AFSL trên mọi đầu ra định giá.",
  },
  10: {
    phase: 10,
    phase_label_en: PHASE_LABELS[10].en,
    phase_label_vi: PHASE_LABELS[10].vi,
    atlassian_moment:
      "2010 Accel US$60M and 2014 T. Rowe Price US$150M — both rounds were 100% secondary; 2014 UK Plc reorg enabled the dual-class structure; NASDAQ IPO 2015-12-10.",
    blockid_route: "/dashboard/fundraise",
    callout_copy_en:
      "Chapter 10 splits primary versus secondary rounds — the Atlassian-defining pattern. Wholesale-investor gating (Corps Act s708(8) + s708(11)) runs against a running 12-month s708(1) small-scale counter so no round accidentally crosses the retail-disclosure boundary.",
    callout_copy_vi:
      "Chương 10 tách rõ vòng gọi vốn sơ cấp và thứ cấp — mô hình đặc trưng của Atlassian. Cổng nhà đầu tư chuyên nghiệp (Corps Act s708(8) + s708(11)) chạy song song với bộ đếm ngưỡng nhỏ s708(1) trong 12 tháng để không vòng nào vô tình vượt ngưỡng công bố bán lẻ.",
  },
  11: {
    phase: 11,
    phase_label_en: PHASE_LABELS[11].en,
    phase_label_vi: PHASE_LABELS[11].vi,
    atlassian_moment:
      "2010 Bitbucket, 2017 Trello, 2018 OpsGenie, 2020 Team Anywhere, 2022 Delaware redomicile, 2023 Loom, FY25 US$5.2B revenue and 83% gross margin.",
    blockid_route: "/dashboard/portfolio",
    callout_copy_en:
      "Monthly board packs (SVI + KPIs + runway + asks) plus a compliance calendar for BAS, ASIC annual review, WGEA and Modern Slavery thresholds. Cap-table snapshots can hash to the private EVM chain when you want a durable evidentiary trail.",
    callout_copy_vi:
      "Bộ tài liệu hội đồng hằng tháng (SVI + KPI + runway + đề nghị) cùng lịch tuân thủ BAS, kiểm tra định kỳ ASIC, ngưỡng WGEA và Modern Slavery. Ảnh chụp cap-table có thể được băm lên chuỗi EVM riêng khi bạn cần bằng chứng lâu dài.",
  },
  12: {
    phase: 12,
    phase_label_en: PHASE_LABELS[12].en,
    phase_label_vi: PHASE_LABELS[12].vi,
    atlassian_moment:
      "2022 UK Plc → Delaware redomicile via Scheme of Arrangement, 2024 Rovo AI + Cannon-Brookes as sole CEO, FY25 US$1.5B additional Class A buyback.",
    blockid_route: "/guide/12-exit",
    callout_copy_en:
      "Chapter 12 assembles the exit-readiness pack: comparable-exits benchmark, strategic-versus-financial valuation views, equity cleanup punchlist and — for accelerator resellers — the anonymised LP report slot with a k-threshold policy in place.",
    callout_copy_vi:
      "Chương 12 tập hợp bộ tài liệu sẵn sàng thoái vốn: chuẩn benchmark thoái vốn so sánh, quan điểm định giá chiến lược so với tài chính, danh sách dọn dẹp vốn cổ phần, và — với các đối tác reseller là accelerator — khe báo cáo LP ẩn danh với chính sách ngưỡng k đã cấu hình.",
  },
};

// Convenience accessors — kept alongside the fixture so the walkthrough
// shell does not need to depend on Object.keys() ordering or Number() casts.

export function getInvestorReadinessCallout(phase: number): InvestorReadinessCallout | undefined {
  return INVESTOR_READINESS_CALLOUTS[phase];
}

export function listInvestorReadinessCallouts(): InvestorReadinessCallout[] {
  const out: InvestorReadinessCallout[] = [];
  for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
    const entry = INVESTOR_READINESS_CALLOUTS[phase];
    if (entry) out.push(entry);
  }
  return out;
}
