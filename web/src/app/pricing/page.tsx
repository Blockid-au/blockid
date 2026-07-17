import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { Building2, ArrowRight, Check, Sparkles } from "lucide-react";
import { FAQV2 } from "@/components/landing/faq-v2";
import { SegmentTabs } from "@/components/landing/segment-tabs";
import { PricingMatrix } from "@/components/landing/pricing-matrix";
import { FAQJsonLd } from "@/components/seo/json-ld";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — BlockID.au",
  description:
    "12-SKU pricing across Founder, Investor, Advisor and Accelerator tiers. Every monthly plan includes a 7-day free trial. Cancel anytime before Day 8 — no charge.",
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
    <div data-theme="lux" className="min-h-svh bg-brand-navy-deep text-brand-ink">
      <FAQJsonLd items={FAQ_JSONLD} />
      <PageViewTracker event="pricing_viewed" params={{}} />
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 pt-24 pb-24">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
            Pricing v2.0
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-brand-ink sm:text-5xl">
            <span className="lux-heading">Get Fundable in 7 Days.</span>{" "}
            Then choose your plan.
          </h1>
          <p className="mt-4 text-lg text-brand-ink-muted">
            Every monthly plan includes a 7-day free trial. Card required at signup, charged only on Day 8. Cancel anytime before with no charge.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-sm text-brand-ink-muted">
            <span className="inline-flex items-center gap-2">
              <Check aria-hidden="true" className="h-4 w-4 text-brand-cyan" />
              7-day free trial on all monthly plans
            </span>
            <span className="inline-flex items-center gap-2">
              <Check aria-hidden="true" className="h-4 w-4 text-brand-cyan" />
              No lock-in — cancel any time
            </span>
            <span className="inline-flex items-center gap-2">
              <Check aria-hidden="true" className="h-4 w-4 text-brand-cyan" />
              AUD pricing, GST-inclusive
            </span>
          </div>
        </div>

        {/* Segment tabs + pricing matrix */}
        <div className="mt-16">
          <SegmentTabs>
            <PricingMatrix />
          </SegmentTabs>
        </div>

        {/* FAQ */}
        <div className="mt-24">
          <FAQV2 />
        </div>

        {/* Enterprise CTA */}
        <div className="mt-16 rounded-3xl border border-brand-cyan/20 bg-brand-navy-elev-1 p-10 text-center shadow-lg lux-glow-cyan">
          <Building2 aria-hidden="true" className="mx-auto mb-4 h-10 w-10 text-brand-cyan" />
          <h2 className="text-2xl font-bold text-brand-ink">
            Need custom pricing or equity-in-lieu?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-ink-muted">
            Enterprise multi-entity plans with SSO, API access, dedicated CSM, or our compliance-gated equity-for-solution arrangement (5–10% equity in lieu of cash).
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Talk to sales
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/workspace/equity-offer"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-cyan/40 px-6 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Explore equity-for-solution
            </Link>
          </div>
          <p className="mt-6 text-xs text-brand-ink-muted">
            Not financial advice. Equity arrangements require independent legal + tax review. Auschain PTY LTD · Sydney NSW.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
