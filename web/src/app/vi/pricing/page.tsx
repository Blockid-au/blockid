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
import { OG_IMAGE } from "@/lib/seo/page-meta";
import { getPaygView } from "@/lib/pricing/payg-view.server";
import type { PaygView } from "@/lib/pricing/payg-copy";
import { refundFaqAnswerVi, singleReportFaqSentenceVi } from "@/lib/pricing/pricing-faq-copy-vi";
import { PaygBlock } from "@/components/pricing/payg-block";

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
        // W1 links: /og/pricing.png never existed (404 on every share) — the
        // site OG card is what the EN /pricing page ships too.
        {
          url: OG_IMAGE.url,
          width: OG_IMAGE.width,
          height: OG_IMAGE.height,
          alt: "BlockID.au — Bảng giá 12 SKU, 7 ngày dùng thử",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t(m, "meta.pricing.title"),
      description: t(m, "meta.pricing.description"),
      images: [OG_IMAGE.url],
    },
    robots: { index: true, follow: true },
  };
}

// FAQ JSON-LD in Vietnamese — AU regulatory shorthand (s708, s766B, ACN,
// ABN, GST) is preserved verbatim per the human-translation policy.
// Pricing v5 P5: the single-report and refund sentences follow
// platform_config.payg_enabled (lib/pricing/pricing-faq-copy) — OFF keeps
// today's text.
function faqJsonLdVi(view: PaygView): { question: string; answer: string }[] {
  return [
  {
    question: "Sau 7 ngày dùng thử miễn phí thì sao?",
    answer:
      "Gói của bạn sẽ tự động tính phí khi hết 7 ngày dùng thử, trừ khi bạn huỷ trước khi hết hạn dùng thử (gói Intake link, Cohort 25 và Cohort 100 cho vườn ươm và chương trình có 14 ngày dùng thử). Chúng tôi gửi email nhắc vào T-3, T-1 và T-0 để bạn luôn nắm được lịch.",
  },
  {
    question: "Nhà sáng lập, Nhà đánh giá hay Chương trình — tôi thấy gói nào?",
    answer:
      "Dùng nút chuyển phía trên bảng giá. Nhà sáng lập: Free, Starter A$29, Growth A$69. Nhà đánh giá: Scout A$79, Firm A$149, Program A$349, Fund A$999 (dùng thử 7 ngày, cần thẻ). Chương trình: Intake link A$2,490/năm, Cohort 25 A$5,000/năm, Cohort 100 A$15,000/năm, thanh toán theo năm, dùng thử 14 ngày. " +
      singleReportFaqSentenceVi(view),
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
    answer: refundFaqAnswerVi(view),
  },
  ];
}

interface ViPricingPageProps {
  searchParams: Promise<{
    segment?: string | string[];
    persona?: string | string[];
    tab?: string | string[];
    tier?: string | string[];
  }>;
}

export default async function ViPricingPage({ searchParams }: ViPricingPageProps) {
  const [annualAvailable, purchasable, payg] = await Promise.all([annualAvailablePlanIds(), purchasablePlanIds(), getPaygView()]);
  const m = await getMessages("vi");
  const sp = await searchParams;
  // Same precedence as tabFromLocation() on /pricing: segment > persona
  // (deck v3 alias, G14 §2.4) > tab > legacy tier.
  const initialTab = resolvePricingTab(sp?.segment ?? sp?.persona ?? sp?.tab ?? sp?.tier);

  return (
    <MarketingShell>
      <FAQJsonLd items={faqJsonLdVi(payg)} />
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
          payg={payg}
        />
        {/* Pricing v5 P5: "Trả theo lần dùng" — nothing while payg_enabled is off. */}
        <PaygBlock view={payg} locale="vi" />
      </Section>

      <Section id="faq-band" ariaLabel={t(m, "pricing.faq.title")} spacing="sm">
        <FAQV2 payg={payg} />
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
