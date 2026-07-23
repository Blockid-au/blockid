/**
 * /legal/acceptable-use — BlockID Acceptable Use Policy (AUP).
 *
 * Linked from the reseller sandbox banner (CLO D4-CLO-06). Deliberately short
 * (< 400 words per section) and bilingual EN/VI on the same page so the
 * language selector on the marketing shell doesn't need to route to a
 * separate slug.
 *
 * Static content — no MDX pipeline needed. Reuses `MarketingShell` /
 * `MarketingHero` / `MarketingCtaStrip` for visual consistency with the
 * rest of `/legal/*`.
 */

import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

const SITE_URL = "https://blockid.au";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — BlockID.au",
  description:
    "Acceptable Use Policy for the BlockID.au platform — customer personal information, prohibited content, monitoring, and reseller sandbox rules.",
  alternates: { canonical: `${SITE_URL}/legal/acceptable-use` },
  robots: { index: true, follow: true },
};

interface Rule {
  heading: string;
  body: string;
}

const EN_RULES: Rule[] = [
  {
    heading: "1. No real customer personal information without consent",
    body:
      "You must not upload, paste, or otherwise submit real personal information (name, email, phone, ID document, financial data) belonging to a customer, prospect, or third party into any BlockID workspace — including reseller sandbox workspaces — unless you have that person's clear, written consent to do so.",
  },
  {
    heading: "2. No illegal or infringing content",
    body:
      "You must not use BlockID to store, transmit, or generate content that is unlawful under Australian federal or state law, that infringes intellectual-property rights, that promotes violence, or that violates export-control regulations.",
  },
  {
    heading: "3. No attempts to bypass reseller scope",
    body:
      "If you are a reseller admin, you must access only the customer records attributed to your reseller organisation. Attempts to enumerate, scrape, or reach data outside your scope — including via crafted API calls, cookie tampering, or shared credentials — are prohibited and may result in immediate termination.",
  },
  {
    heading: "4. Usage is monitored",
    body:
      "BlockID logs authentication events, API access, and administrative actions. Anomalous access patterns are reviewed by our security team and may be reported to law-enforcement or the Office of the Australian Information Commissioner (OAIC) where required by law.",
  },
  {
    heading: "5. Questions",
    body:
      "For questions about this policy, contact legal@blockid.au. For security incidents, contact security@blockid.au — we aim to acknowledge within one business day.",
  },
];

const VI_RULES: Rule[] = [
  {
    heading: "1. Không nhập thông tin cá nhân thật khi chưa có sự đồng ý",
    body:
      "Bạn không được tải lên, dán hoặc gửi thông tin cá nhân thật (họ tên, email, số điện thoại, giấy tờ tùy thân, dữ liệu tài chính) của khách hàng, khách hàng tiềm năng hoặc bên thứ ba vào bất kỳ workspace nào của BlockID — kể cả workspace thử nghiệm của đại lý — nếu chưa có sự đồng ý rõ ràng, bằng văn bản của người đó.",
  },
  {
    heading: "2. Không lưu trữ nội dung bất hợp pháp hoặc vi phạm bản quyền",
    body:
      "Bạn không được sử dụng BlockID để lưu trữ, truyền tải hoặc tạo ra nội dung vi phạm pháp luật liên bang hoặc tiểu bang Úc, xâm phạm quyền sở hữu trí tuệ, cổ vũ bạo lực hoặc vi phạm quy định về kiểm soát xuất khẩu.",
  },
  {
    heading: "3. Không được cố gắng vượt qua phạm vi đại lý",
    body:
      "Nếu bạn là quản trị viên đại lý, bạn chỉ được truy cập hồ sơ khách hàng thuộc tổ chức đại lý của mình. Mọi hành vi liệt kê, thu thập hoặc truy cập dữ liệu ngoài phạm vi — bao gồm gọi API tùy chỉnh, thay đổi cookie, hoặc dùng chung tài khoản — đều bị nghiêm cấm và có thể dẫn tới chấm dứt tài khoản ngay lập tức.",
  },
  {
    heading: "4. Việc sử dụng được giám sát",
    body:
      "BlockID ghi lại các sự kiện xác thực, truy cập API và thao tác quản trị. Các mẫu truy cập bất thường sẽ được đội ngũ bảo mật xem xét và có thể được báo cáo cho cơ quan thực thi pháp luật hoặc Văn phòng Ủy viên Thông tin Úc (OAIC) khi pháp luật yêu cầu.",
  },
  {
    heading: "5. Câu hỏi",
    body:
      "Mọi thắc mắc về chính sách này xin gửi tới legal@blockid.au. Với sự cố bảo mật, xin liên hệ security@blockid.au — chúng tôi sẽ phản hồi trong vòng một ngày làm việc.",
  },
];

function RuleList({
  lang,
  title,
  intro,
  rules,
}: {
  lang: "en" | "vi";
  title: string;
  intro: string;
  rules: Rule[];
}) {
  return (
    <section
      lang={lang}
      aria-labelledby={`aup-${lang}-title`}
      className="rounded-3xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-8 sm:p-10"
    >
      <h2
        id={`aup-${lang}-title`}
        className="text-2xl font-bold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
      >
        {title}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--fintech-ink-muted)] sm:text-base">
        {intro}
      </p>
      <ol className="mt-6 space-y-6">
        {rules.map((r) => (
          <li key={r.heading}>
            <h3 className="text-base font-semibold text-[var(--fintech-ink)] sm:text-lg">
              {r.heading}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
              {r.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function AcceptableUsePolicyPage() {
  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Legal"
        title="Acceptable Use Policy"
        subtitle="How BlockID.au expects its users — including reseller admins in sandbox workspaces — to handle personal information and platform access."
      />

      <div className="mx-auto max-w-3xl space-y-8 px-6 pb-16">
        <RuleList
          lang="en"
          title="English"
          intro="These rules apply to every user of BlockID.au. Breaches may result in suspension, termination, and where applicable, notification to authorities."
          rules={EN_RULES}
        />
        <RuleList
          lang="vi"
          title="Tiếng Việt"
          intro="Các quy tắc sau đây áp dụng cho mọi người dùng BlockID.au. Vi phạm có thể dẫn tới tạm ngưng, chấm dứt tài khoản và nếu cần thiết, sẽ được báo cáo cho cơ quan có thẩm quyền."
          rules={VI_RULES}
        />
      </div>

      <MarketingCtaStrip
        headline="Questions about acceptable use?"
        primary={{ href: "/contact?topic=legal", label: "Contact legal" }}
        secondary={{ href: "/legal/privacy", label: "Privacy Policy" }}
      />
    </MarketingShell>
  );
}
