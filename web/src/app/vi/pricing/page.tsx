import type { Metadata } from "next";
import { Building2, Check } from "lucide-react";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { FAQV2 } from "@/components/landing/faq-v2";
import { SegmentTabs } from "@/components/landing/segment-tabs";
import { PricingMatrix } from "@/components/landing/pricing-matrix";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
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
      "Gói của bạn sẽ tự động tính phí vào ngày thứ 8, trừ khi bạn huỷ ít nhất 24 giờ trước khi hết hạn dùng thử. Chúng tôi gửi email nhắc vào T-3, T-1 và T-0 để bạn luôn nắm được lịch.",
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
      "Bảo hành hoàn tiền 7 ngày cho tháng trả phí đầu tiên. Liên hệ hỗ trợ và chúng tôi xử lý trong 3 ngày làm việc.",
  },
];

export default async function ViPricingPage() {
  const m = await getMessages("vi");

  return (
    <MarketingShell>
      <FAQJsonLd items={FAQ_JSONLD_VI} />
      <PageViewTracker event="pricing_viewed" params={{}} />

      <MarketingHero
        eyebrow={t(m, "pricing.eyebrow")}
        title={t(m, "pricing.title")}
        subtitle={t(m, "pricing.subtitle")}
      />

      <section
        aria-label="Cam kết bảng giá"
        className="mx-auto max-w-5xl px-6 pb-4"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[var(--fintech-ink-muted)]">
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-[var(--fintech-accent)]" />
            {t(m, "pricing.guarantee.trial")}
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-[var(--fintech-accent)]" />
            {t(m, "pricing.guarantee.nolock")}
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-[var(--fintech-accent)]" />
            {t(m, "pricing.guarantee.aud")}
          </span>
        </div>
      </section>

      {/* SegmentTabs + PricingMatrix — SKU names/prices are proper nouns
          (AUD), so we do NOT localise them. */}
      <section
        aria-label="Bảng giá theo phân khúc"
        className="mx-auto max-w-7xl px-6 py-8 sm:py-12"
      >
        <SegmentTabs>
          <PricingMatrix />
        </SegmentTabs>
      </section>

      <section
        aria-label={t(m, "pricing.faq.title")}
        className="mx-auto max-w-7xl px-6 pb-12 pt-4"
      >
        <FAQV2 />
      </section>

      <MarketingSection
        tone="elevated"
        title={t(m, "pricing.enterprise.title")}
        kicker={t(m, "pricing.enterprise.kicker")}
      >
        <div className="flex flex-col items-start gap-6 text-center sm:items-center">
          <Building2 aria-hidden="true" className="h-10 w-10 text-[var(--fintech-accent)]" />
          <p className="max-w-xl text-[var(--fintech-ink-muted)]">
            {t(m, "pricing.enterprise.body")}
          </p>
        </div>
      </MarketingSection>

      <MarketingCtaStrip
        headline={t(m, "pricing.enterprise.title")}
        primary={{ href: "/contact", label: t(m, "pricing.enterprise.cta.primary") }}
        secondary={{
          href: "/workspace/equity-offer",
          label: t(m, "pricing.enterprise.cta.secondary"),
        }}
      />

      <p className="mx-auto mb-16 max-w-5xl px-6 text-center text-xs text-[var(--fintech-ink-muted)]">
        {t(m, "pricing.legal.disclaimer")}
      </p>
    </MarketingShell>
  );
}
