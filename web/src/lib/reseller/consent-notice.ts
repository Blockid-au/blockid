// APP 5.2 collection notice — pure text module.
//
// Rendered by web/src/components/onboarding/reseller-consent-modal.tsx the
// moment a reseller code is validated. Text authored per
// docs/plans/reseller-module-plan.md § U.15.7 (supersedes E.1 EN + VI).
//
// Extracted to a pure module so the P10 au-compliance gate can lock in
// APP 5.2 (a)–(j) coverage via unit tests without dragging a "use client"
// component through the vitest boundary.

export type ConsentNoticeLocale = "en" | "vi";

export interface ConsentNoticeStrings {
  title: string;
  accept: string;
  decline: string;
  /** APP 5.2 (a)–(j) body, parametrised on the reseller display name. */
  body: (resellerName: string) => string;
}

const EN: ConsentNoticeStrings = {
  title: "Data sharing with your reseller",
  accept: "Accept and continue",
  decline: "Remove code",
  body: (name: string) =>
    `Auschain PTY LTD (ACN 659 615 111, registered NSW; contact ` +
    `privacy@blockid.au, admin@blockid.au — postal: c/o Sydney NSW), ` +
    `trading as BlockID.au, collects and shares information about your ` +
    `BlockID account with ${name} because you signed up using their ` +
    `reseller code. Collection is contractual — not required or authorised ` +
    `by any Australian law. (b) The data is either supplied by you at ` +
    `signup or derived from your ongoing account activity. (d) Primary ` +
    `purpose: to enable ${name} to operate its reseller relationship with ` +
    `you. We share: your company name and contact email, your subscription ` +
    `plan, billing status (active / trial / past-due / cancelled), ` +
    `subscription-start and trial-end dates, month-to-date aggregate ` +
    `feature-usage counts (bucketed to protect privacy), AI-credit balance ` +
    `and monthly consumption totals, and the reseller code used. We do NOT ` +
    `share: uploaded documents, cap table, data room, SVI signals and ` +
    `reasoning, ESOP records, token records, notification content, session ` +
    `data, or in-app messages. (e) You can remove the reseller code any ` +
    `time in Settings — BlockID access is unchanged. (i)/(j) Data may be ` +
    `processed overseas by our sub-processors: Stripe (US) for payments, AI ` +
    `providers (US) for generation. (g) Access, correction and complaint ` +
    `rights are set out at blockid.au/privacy. Complaints: privacy@blockid.au, ` +
    `or the OAIC (oaic.gov.au / 1300 363 992).`,
};

const VI: ConsentNoticeStrings = {
  title: "Chia sẻ dữ liệu với đại lý",
  accept: "Đồng ý và tiếp tục",
  decline: "Gỡ mã",
  body: (name: string) =>
    `Auschain PTY LTD (ACN 659 615 111, đăng ký tại NSW; liên hệ ` +
    `privacy@blockid.au, admin@blockid.au — bưu điện: c/o Sydney NSW), ` +
    `hoạt động dưới tên BlockID.au, thu thập và chia sẻ thông tin về tài ` +
    `khoản BlockID của bạn với ${name} vì bạn đăng ký bằng mã đại lý của ` +
    `họ. Việc thu thập là theo hợp đồng — không do luật Úc yêu cầu hoặc cho ` +
    `phép. (b) Dữ liệu được bạn cung cấp tại đăng ký hoặc bắt nguồn từ hoạt ` +
    `động tài khoản đang diễn ra. (d) Mục đích chính: để ${name} vận hành ` +
    `mối quan hệ đại lý với bạn. Chúng tôi chia sẻ: tên công ty và email ` +
    `liên hệ, gói đăng ký, trạng thái thanh toán (hoạt động / dùng thử / ` +
    `quá hạn / hủy), ngày bắt đầu và kết thúc dùng thử, tổng lượt sử dụng ` +
    `tính năng trong tháng (đã phân nhóm bảo vệ riêng tư), số dư và tiêu ` +
    `thụ AI credit hàng tháng, và mã đại lý bạn dùng. Chúng tôi KHÔNG chia ` +
    `sẻ: tài liệu tải lên, cap table, data room, tín hiệu và lý do SVI, ` +
    `ESOP, token, nội dung thông báo, phiên đăng nhập, hoặc tin nhắn trong ` +
    `ứng dụng. (e) Bạn có thể gỡ mã đại lý bất kỳ lúc nào trong Cài đặt — ` +
    `không ảnh hưởng đến việc dùng BlockID. (i)/(j) Dữ liệu có thể được xử ` +
    `lý ở nước ngoài bởi sub-processor: Stripe (Mỹ) cho thanh toán, các ` +
    `nhà cung cấp AI (Mỹ) cho tạo nội dung. (g) Quyền truy cập, sửa đổi và ` +
    `khiếu nại được trình bày tại blockid.au/privacy. Khiếu nại: ` +
    `privacy@blockid.au, hoặc OAIC (oaic.gov.au / 1300 363 992).`,
};

export const CONSENT_NOTICE_STRINGS: Record<ConsentNoticeLocale, ConsentNoticeStrings> = {
  en: EN,
  vi: VI,
};

/** Ten APP 5.2 clauses per Australian Privacy Principles. */
export const APP_5_2_CLAUSES = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
] as const;

export type App52Clause = (typeof APP_5_2_CLAUSES)[number];

/**
 * Programmatic APP 5.2 coverage check. Each clause is asserted by looking
 * for a distinctive substring anchored in the notice body — literal "(b)",
 * "(d)", "(e)", "(g)", "(i)/(j)" markers plus keyword anchors for the four
 * clauses that are not marker-tagged (a, c, f, h).
 */
export function auditApp52Coverage(body: string): Record<App52Clause, boolean> {
  const has = (needle: string) => body.toLowerCase().includes(needle.toLowerCase());
  return {
    // (a) APP entity identity + contact
    a: has("Auschain PTY LTD") && has("ACN 659 615 111") && has("privacy@blockid.au"),
    // (b) fact and circumstances of collection
    b: has("(b)"),
    // (c) whether collection required or authorised by law — explicit negation
    c: has("not required or authorised") || has("không do luật Úc yêu cầu"),
    // (d) purposes
    d: has("(d)"),
    // (e) main consequences if info not collected (framed as removal path)
    e: has("(e)"),
    // (f) any other APP entity or body to whom data usually disclosed
    //     — reseller (parametrised) + sub-processors named inline
    f: has("sub-processor") || has("stripe"),
    // (g) privacy policy access + complaints
    g: has("(g)") && (has("blockid.au/privacy") || has("privacy@blockid.au")),
    // (h) whether privacy policy has info on complaints mechanism (OAIC)
    h: has("oaic"),
    // (i) whether entity likely to disclose to overseas recipients
    i: has("(i)/(j)"),
    // (j) countries where recipients likely located
    j: has("(US)") || has("(Mỹ)"),
  };
}
