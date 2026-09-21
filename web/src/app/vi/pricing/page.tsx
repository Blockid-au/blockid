import type { Metadata } from "next";
import { Building2, Check } from "lucide-react";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { FAQV2 } from "@/components/landing/faq-v2";
import { PricingSegmentSwitch } from "@/components/landing/pricing-segment-switch";
import { annualAvailablePlanIds, purchasablePlanIds } from "@/lib/plans/annual-available";
import { resolvePricingTab } from "@/components/landing/pricing-tab";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { CtaBand, PageHero, Section } from "@/components/marketing/template";
import { getMessages, t } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  return {
    title: t(m, "meta.pricing.title"),
    description: t(m, "meta.pricing.description"),
    alternates: {
      canonical: "https://blockid.au/vi/pricing",
      languages: {
        en: "https://blockid.au/pricing",
        vi: "https://blockid.au/vi/pricing",
        "x-default": "https://blockid.au/pricing",
      },
    },
    openGraph: {
      title: t(m, "meta.pricing.title"),
      description: t(m, "meta.pricing.description"),
      url: "https://blockid.au/vi/pricing",
      siteName: "BlockID.au",
      type: "website",
      locale: "vi_VN",
      images: [
        {
          url: "https://blockid.au/og/pricing.png",
          width: 1200,
          height: 630,
          alt: "BlockID.au — Bảng giá 12 SKU, 7 ngày dùng thử",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t(m, "meta.pricing.title"),
      description: t(m, "meta.pricing.description"),
      images: ["https://blockid.au/og/pricing.png"],
    },
    robots: { index: true, follow: true },
  };
}

// FAQ JSON-LD in Vietnamese — AU regulatory shorthand (s708, s766B, ACN,
// ABN, GST) is preserved verbatim per the human-translation policy.
const FAQ_JSONLD_VI = [
  {
    question: "Sau 7 ngày dùng thử miễn phí thì sao?",
    answer:
      "Gói của bạn sẽ tự động tính phí khi hết 7 ngày dùng thử, trừ khi bạn huỷ trước khi hết hạn dùng thử (gói Intake link, Cohort 25 và Cohort 100 cho vườn ươm và chương trình có 14 ngày dùng thử). Chúng tôi gửi email nhắc vào T-3, T-1 và T-0 để bạn luôn nắm được lịch.",
  },
  {
    question: "Nhà sáng lập, Nhà đánh giá hay Chương trình — tôi thấy gói nào?",
    answer:
      "Dùng nút chuyển phía trên bảng giá. Nhà sáng lập: Free, Starter A$29, Growth A$69. Nhà đánh giá: Scout A$79, Firm A$149, Program A$349, Fund A$999 (dùng thử 7 ngày, cần thẻ). Chương trình: Intake link A$2,490/năm, Cohort 25 A$5,000/năm, Cohort 100 A$15,000/năm, thanh toán theo năm, dùng thử 14 ngày. Không có gói thì mỗi Trusted Business Report là A$3 cho một startup.",
  },
  {
    question: "Có cần thẻ tín dụng để bắt đầu dùng thử không?",
    answer:
      "Có — thẻ được lưu qua Stripe SetupIntent, nhưng bạn chỉ bị tính phí vào ngày thứ 8. Nếu không thêm phương thức thanh toán, gói sẽ tự động huỷ khi hết hạn dùng thử.",
  },
  {
    question: "Tôi có thể đổi gói trong lúc dùng thử không?",
    answer:
      "Được. Nâng cấp hoặc hạ cấp bất kỳ lúc nào từ trang Billing; chênh lệch được tính theo tỷ lệ và áp dụng ngay.",
  },
  {
    question: "Chính sách hoàn tiền như thế nào?",
    answer:
      "Hoàn tiền 100% trong 7 ngày cho khoản thanh toán gói tháng đầu tiên, không cần lý do — email hỗ trợ và chúng tôi hoàn tiền trong 3 ngày làm việc. Gói năm được hoàn theo tỷ lệ nếu huỷ trong 14 ngày. Báo cáo lẻ A$3 và gói tín dụng không hoàn tiền sau khi đã giao, trừ khi Luật Người tiêu dùng Úc yêu cầu. Quyền lợi của bạn theo Luật Người tiêu dùng Úc không bao giờ bị loại trừ. Chính sách đầy đủ: /legal/terms#refunds.",
  },
];

interface ViPricingPageProps {
  searchParams: Promise<{
    segment?: string | string[];
    persona?: string | string[];
    tab?: string | string[];
    tier?: string | string[];
  }>;
}

export default async function ViPricingPage({ searchParams }: ViPricingPageProps) {
  const [annualAvailable, purchasable] = await Promise.all([annualAvailablePlanIds(), purchasablePlanIds()]);
  const m = await getMessages("vi");
  const sp = await searchParams;
  // Same precedence as tabFromLocation() on /pricing: segment > persona
  // (deck v3 alias, G14 §2.4) > tab > legacy tier.
  const initialTab = resolvePricingTab(sp?.segment ?? sp?.persona ?? sp?.tab ?? sp?.tier);

  return (
    <MarketingShell>
      <FAQJsonLd items={FAQ_JSONLD_VI} />
      <PageViewTracker event="pricing_viewed" params={{}} />

      <PageHero
        eyebrow={t(m, "pricing.eyebrow")}
        title={t(m, "pricing.title")}
        sub={t(m, "pricing.subtitle")}
        align="start"
      />

      <Section id="guarantees" ariaLabel="Cam kết bảng giá" spacing="sm" divider={false}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-secondary">
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            {t(m, "pricing.guarantee.trial")}
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            {t(m, "pricing.guarantee.nolock")}
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-action" />
            {t(m, "pricing.guarantee.aud")}
          </span>
        </div>
      </Section>

      {/* Founder | Evaluator | Programs switch (G12 T0268 + Pricing v4) —
          same three ladders as /pricing. SKU names/prices are proper nouns
          (AUD), so we do NOT localise them; only the tab labels are
          Vietnamese. */}
      <Section id="pricing-matrix" ariaLabel="Bảng giá theo phân khúc" spacing="sm" divider={false}>
        <PricingSegmentSwitch
          initialSegment={initialTab}
          locale="vi"
          annualAvailable={annualAvailable}
          purchasable={purchasable}
          labels={{
            founder: { label: "Nhà sáng lập", sub: "Xây dựng, định giá, gọi vốn" },
            evaluator: { label: "Nhà đánh giá", sub: "Angel · công ty tư vấn · quỹ VC" },
            programs: { label: "Chương trình", sub: "Vườn ươm · accelerator · đại học" },
          }}
        />
      </Section>

      <Section id="faq-band" ariaLabel={t(m, "pricing.faq.title")} spacing="sm">
        <FAQV2 />
      </Section>

      <Section id="enterprise"
        tone="sunken"
        title={t(m, "pricing.enterprise.title")}
        eyebrow={t(m, "pricing.enterprise.kicker")}
      >
        <div className="flex flex-col items-start gap-6 text-center sm:items-center">
          <Building2 aria-hidden="true" className="h-10 w-10 text-action" />
          <p className="max-w-xl text-secondary">
            {t(m, "pricing.enterprise.body")}
          </p>
        </div>
      </Section>

      <CtaBand
        title={t(m, "pricing.enterprise.title")}
        primary={{ href: "/contact", label: t(m, "pricing.enterprise.cta.primary") }}
        secondary={{
          href: "/workspace/esop/offers",
          label: t(m, "pricing.enterprise.cta.secondary"),
        }}/>

      <p className="mx-auto mb-16 max-w-5xl px-6 text-center text-xs text-secondary">
        {t(m, "pricing.legal.disclaimer")}
      </p>
    </MarketingShell>
  );
}
