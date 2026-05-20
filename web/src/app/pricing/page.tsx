import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  Check,
  X as XIcon,
  HelpCircle,
  ArrowRight,
  Star,
  Building2,
  CreditCard,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing — BlockID.au",
  description:
    "Simple, transparent pricing for Australian startups. Start free with 2 credits, upgrade to Founding 50 or Growth as you scale. Credit packs available.",
};

// ---------------------------------------------------------------------------
// Plan card data
// ---------------------------------------------------------------------------

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    credits: "2 credits",
    badge: null,
    features: [
      "1 SVI analysis",
      "Investor-Ready Score",
      "Basic dilution calculator",
      "Shareable web link",
      "1 project",
    ],
    cta: "Get Started",
    ctaHref: "/#svi",
    ctaStyle: "secondary" as const,
  },
  {
    id: "founding50",
    name: "Founding 50",
    price: "A$49",
    period: "one-off",
    credits: "50 credits",
    badge: "Most Popular",
    features: [
      "50 SVI analyses",
      "PDF Export",
      "Evidence Vault",
      "Term Sheet AI",
      "3 projects",
      "Referral credits",
      "30-Day Growth Plan",
      "Co-founder matching",
    ],
    cta: "Get Founding 50",
    ctaHref: "/founding-50",
    ctaStyle: "primary" as const,
  },
  {
    id: "growth",
    name: "Growth",
    price: "A$99",
    period: "/mo (early-bird)",
    credits: "100 credits/mo",
    badge: null,
    features: [
      "100 SVI analyses/mo",
      "PDF Export",
      "Evidence Vault",
      "Term Sheet AI (unlimited)",
      "10 projects",
      "Referral credits",
      "Investor data room",
      "Custom branding",
      "Priority support",
      "Dedicated account manager",
    ],
    cta: "Start Growth Plan",
    ctaHref: "/auth/login?plan=growth",
    ctaStyle: "primary" as const,
  },
];

// ---------------------------------------------------------------------------
// Credit packs
// ---------------------------------------------------------------------------

const CREDIT_PACKS = [
  { credits: 10, price: "$5", savings: null },
  { credits: 25, price: "$9", savings: "Save 28%" },
  { credits: 50, price: "$15", savings: "Save 40%" },
  { credits: 100, price: "$25", savings: "Save 50%" },
];

// ---------------------------------------------------------------------------
// Feature comparison
// ---------------------------------------------------------------------------

const COMPARISON_ROWS: { feature: string; free: string; founding: string; growth: string }[] = [
  { feature: "SVI Analyses", free: "1 free", founding: "50", growth: "100/mo" },
  { feature: "PDF Export", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Evidence Vault", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Term Sheet AI", free: "-", founding: "Yes", growth: "Unlimited" },
  { feature: "Projects", free: "1", founding: "3", growth: "10" },
  { feature: "Referral credits", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Priority support", free: "-", founding: "-", growth: "Yes" },
];

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

const FAQ_ITEMS = [
  {
    q: "What is a credit?",
    a: "Credits are the currency used across BlockID features. A standard SVI analysis costs 0.50 credits, while advanced features like Term Sheet AI cost 1 credit. Free features like evidence upload and investor score cost 0 credits.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes. You can upgrade from Free to Founding 50 or Growth at any time. Your existing credits and data carry over. Founding 50 members get priority upgrade pricing.",
  },
  {
    q: "Is there a free trial?",
    a: "Every new account starts with 2 free credits, enough for about 4 standard SVI analyses. No credit card required. If you need more, grab a credit pack or upgrade to a plan.",
  },
  {
    q: "How does billing work?",
    a: "Founding 50 is a one-off A$49 payment. Growth is billed monthly at A$99/mo (early-bird pricing). Credit packs are one-off purchases. All prices are in AUD and processed securely via Stripe.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Growth plan subscriptions can be cancelled at any time from your billing page. Your credits remain available until the end of the billing period. Founding 50 has no recurring charges to cancel.",
  },
  {
    q: "Do you offer refunds?",
    a: "Growth plan includes a 30-day money-back guarantee. For Founding 50, we assess refund requests on a case-by-case basis within 14 days of purchase. Credit packs are non-refundable once used.",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  return (
    <div className="min-h-svh bg-surface-50 text-ink-800">
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 pt-16 pb-24">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 mb-6">
            <CreditCard strokeWidth={1.75} className="h-3.5 w-3.5 text-brand-600" />
            <span className="text-xs font-medium text-brand-700 uppercase tracking-[0.15em]">
              Pricing
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-ink-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-ink-600 max-w-xl mx-auto leading-relaxed">
            Start free. Scale when you&rsquo;re ready.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-20">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border bg-white p-6 shadow-sm flex flex-col ${
                plan.badge
                  ? "border-brand-300 ring-2 ring-brand-100"
                  : "border-surface-200"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
                  <Star strokeWidth={1.75} className="h-3 w-3" />
                  {plan.badge}
                </span>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-ink-900 mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold text-ink-900 font-mono">
                    {plan.price}
                  </span>
                  <span className="text-sm text-ink-500">{plan.period}</span>
                </div>
                <p className="text-sm text-brand-600 font-medium mt-2">
                  {plan.credits}
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2.5 text-sm text-ink-700">
                    <Check strokeWidth={2} className="h-4 w-4 text-brand-500 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href={plan.ctaHref}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all duration-200 ${
                  plan.ctaStyle === "primary"
                    ? "bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
                    : "bg-white hover:bg-surface-50 text-ink-700 border border-surface-300 shadow-sm"
                }`}
              >
                {plan.cta}
                <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>

        {/* Credit packs */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-ink-900 mb-2">Credit Packs</h2>
            <p className="text-ink-600">
              Buy credits for individual analyses. No subscription required.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.credits}
                className="relative rounded-2xl border border-surface-200 bg-white p-5 text-center shadow-sm hover:border-brand-200 hover:shadow-md transition-all"
              >
                {pack.savings && (
                  <span className="absolute -top-2.5 right-3 inline-block rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[10px] font-semibold text-brand-700">
                    {pack.savings}
                  </span>
                )}
                <p className="text-3xl font-bold text-ink-900 font-mono">{pack.credits}</p>
                <p className="text-xs text-ink-500 mb-2">credits</p>
                <p className="text-lg font-bold text-brand-600 font-mono">{pack.price}</p>
                <p className="text-[10px] text-ink-400 mt-1">AUD, one-off</p>
              </div>
            ))}
          </div>
        </div>

        {/* Feature comparison table */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-ink-900 mb-2">Feature Comparison</h2>
            <p className="text-ink-600">Everything you need at every stage.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-ink-700">
                    Feature
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-ink-700">
                    Free
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-brand-700 bg-brand-50/50 rounded-t-lg">
                    Founding 50
                  </th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-ink-700">
                    Growth
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-surface-100">
                    <td className="py-3 px-4 text-sm text-ink-700 font-medium">
                      {row.feature}
                    </td>
                    {[row.free, row.founding, row.growth].map((val, i) => (
                      <td
                        key={i}
                        className={`py-3 px-4 text-center text-sm ${
                          i === 1 ? "bg-brand-50/30" : ""
                        }`}
                      >
                        {val === "-" ? (
                          <XIcon
                            strokeWidth={1.75}
                            className="h-4 w-4 text-surface-300 mx-auto"
                          />
                        ) : val === "Yes" || val === "Unlimited" ? (
                          <span className="inline-flex items-center gap-1 text-brand-600 font-medium">
                            <Check strokeWidth={2} className="h-4 w-4" />
                            {val !== "Yes" && val}
                          </span>
                        ) : (
                          <span className="text-ink-700 font-medium">{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-4 py-1.5 mb-4">
              <HelpCircle strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-500" />
              <span className="text-xs font-medium text-ink-600 uppercase tracking-[0.15em]">
                FAQ
              </span>
            </div>
            <h2 className="text-2xl font-bold text-ink-900">Frequently Asked Questions</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {FAQ_ITEMS.map(({ q, a }) => (
              <div
                key={q}
                className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm"
              >
                <p className="text-sm font-semibold text-ink-800 mb-2">{q}</p>
                <p className="text-sm text-ink-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="rounded-2xl border border-surface-200 bg-white p-8 md:p-12 text-center shadow-sm">
          <Building2 strokeWidth={1.5} className="h-10 w-10 text-brand-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-ink-900 mb-2">
            Need custom pricing?
          </h2>
          <p className="text-ink-600 mb-6 max-w-md mx-auto">
            Enterprise plans with custom credit allocations, dedicated support, SSO, and SLAs.
            Let&rsquo;s talk.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 text-sm font-semibold transition-colors shadow-sm"
          >
            Contact Us
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
