import type { Metadata } from "next";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { Building2, Check } from "lucide-react";
import { FAQV2 } from "@/components/landing/faq-v2";
import { SegmentTabs } from "@/components/landing/segment-tabs";
import { PricingMatrix } from "@/components/landing/pricing-matrix";
import { FAQJsonLd } from "@/components/seo/json-ld";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — BlockID.au",
  description:
    "12-SKU pricing across Founder, Investor, Advisor and Accelerator tiers. Every monthly plan includes a 7-day free trial. Cancel anytime before Day 8 — no charge.",
  alternates: {
    canonical: "https://blockid.au/pricing",
  },
  openGraph: {
    title: "Pricing — BlockID.au",
    description:
      "12-SKU pricing across Founder, Investor, Advisor and Accelerator tiers. Every monthly plan includes a 7-day free trial.",
    url: "https://blockid.au/pricing",
    siteName: "BlockID.au",
    type: "website",
    locale: "en_AU",
    images: [
      {
        url: "https://blockid.au/og/pricing.png",
        width: 1200,
        height: 630,
        alt: "BlockID.au — 12-SKU pricing matrix with 7-day trial",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — BlockID.au",
    description:
      "12-SKU pricing across Founder, Investor, Advisor and Accelerator tiers. 7-day trial included.",
    images: ["https://blockid.au/og/pricing.png"],
  },
  robots: { index: true, follow: true },
};

const FAQ_JSONLD = [
  {
    question: "What happens after the 7-day free trial?",
    answer:
      "Your plan auto-charges on Day 8 unless you cancel at least 24 hours before the trial ends. We email reminders at T-3, T-1, and T-0 so you always know what's coming.",
  },
  {
    question: "Is a credit card required to start the trial?",
    answer:
      "Yes — a card is saved via Stripe SetupIntent, but you are only charged on Day 8. If you don't add a payment method, the subscription cancels automatically at trial end.",
  },
  {
    question: "Can I switch plans mid-trial?",
    answer:
      "Yes. Upgrade or downgrade any time from Billing settings; prorated changes apply immediately.",
  },
  {
    question: "What's the refund policy?",
    answer:
      "7-day money-back guarantee on your first paid month. Contact support and we'll process within 3 business days.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  return (
    <MarketingShell>
      <FAQJsonLd items={FAQ_JSONLD} />
      <PageViewTracker event="pricing_viewed" params={{}} />

      <MarketingHero
        eyebrow="Pricing v2.0"
        title="Get fundable in 7 days. Then choose your plan."
        subtitle="Every monthly plan includes a 7-day free trial. Card required at signup, charged only on Day 8. Cancel anytime before with no charge."
      />

      <section
        aria-label="Pricing guarantees"
        className="mx-auto max-w-5xl px-6 pb-4"
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[var(--fintech-ink-muted)]">
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-[var(--fintech-accent)]" />
            7-day free trial on all monthly plans
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-[var(--fintech-accent)]" />
            No lock-in — cancel any time
          </span>
          <span className="inline-flex items-center gap-2">
            <Check aria-hidden="true" className="h-4 w-4 text-[var(--fintech-accent)]" />
            AUD pricing, GST-inclusive
          </span>
        </div>
      </section>

      {/* Segment tabs + pricing matrix — client interactivity kept intact */}
      <section
        aria-label="Pricing matrix"
        className="mx-auto max-w-7xl px-6 py-8 sm:py-12"
      >
        <SegmentTabs>
          <PricingMatrix />
        </SegmentTabs>
      </section>

      {/* FAQ */}
      <section
        aria-label="Frequently asked questions"
        className="mx-auto max-w-7xl px-6 pb-12 pt-4"
      >
        <FAQV2 />
      </section>

      {/* Enterprise CTA — bespoke enough to render inline rather than through
          MarketingCtaStrip so we can keep the two-CTA layout intact. */}
      <MarketingSection
        tone="elevated"
        title="Need custom pricing or equity-in-lieu?"
        kicker="Enterprise"
      >
        <div className="flex flex-col items-start gap-6 text-center sm:items-center">
          <Building2 aria-hidden="true" className="h-10 w-10 text-[var(--fintech-accent)]" />
          <p className="max-w-xl text-[var(--fintech-ink-muted)]">
            Enterprise multi-entity plans with SSO, API access, dedicated
            CSM, or our compliance-gated equity-for-solution arrangement
            (5–10% equity in lieu of cash).
          </p>
        </div>
      </MarketingSection>

      <MarketingCtaStrip
        headline="Talk to sales for a bespoke fit."
        primary={{ href: "/contact", label: "Talk to sales" }}
        secondary={{
          href: "/workspace/equity-offer",
          label: "Explore equity-for-solution",
        }}
      />

      <p className="mx-auto mb-16 max-w-5xl px-6 text-center text-xs text-[var(--fintech-ink-muted)]">
        Not financial advice. Equity arrangements require independent legal
        and tax review. Auschain PTY LTD · Sydney NSW.
      </p>
    </MarketingShell>
  );
}
