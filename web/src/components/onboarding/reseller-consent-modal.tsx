"use client";

// APP 5.2 collection-notice modal — shown the moment a reseller code is
// validated. Text verbatim from docs/plans/reseller-module-plan.md § U.15.7
// (EN + VI, ~220 words each). Covers all ten APP 5.2 requirements per
// D4-CLO-01.
//
// Consumers wire this via reseller-code-field.tsx onValidated callback:
//   const [consent, setConsent] = useState<Consent | null>(null);
//   <ResellerCodeField onValidated={(p) => setConsent({ ... p })} .../>
//   {consent && (
//     <ResellerConsentModal
//        locale={locale}
//        resellerName={consent.reseller.display_name}
//        onAccept={() => { setConsent(null); ... }}
//        onDecline={() => { setConsent(null); clearVia(); ... }}
//     />
//   )}

import { useEffect, useRef } from "react";

type Locale = "en" | "vi";

interface Props {
  locale?: Locale;
  resellerName: string;
  onAccept: () => void;
  onDecline: () => void;
}

const STRINGS = {
  en: {
    title: "Data sharing with your reseller",
    accept: "Accept and continue",
    decline: "Remove code",
    /**
     * Body — APP 5.2 (a)–(j) coverage. Parametrised on {name}. See § U.15.7.
     */
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
  },
  vi: {
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
  },
} as const;

export function ResellerConsentModal({ locale = "en", resellerName, onAccept, onDecline }: Props) {
  const t = STRINGS[locale];
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    acceptRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecline();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDecline]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reseller-consent-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
        <h2 id="reseller-consent-title" className="text-lg font-semibold text-ink-900">
          {t.title}
        </h2>
        <p className="mt-3 max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-ink-700">
          {t.body(resellerName)}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-md border border-surface-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-100"
          >
            {t.decline}
          </button>
          <button
            ref={acceptRef}
            type="button"
            onClick={onAccept}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
