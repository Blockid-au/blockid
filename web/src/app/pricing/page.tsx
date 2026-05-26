import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import {
  Check,
  X as XIcon,
  HelpCircle,
  ArrowRight,
  Building2,
  CreditCard,
} from "lucide-react";
import {
  CREDIT_PACKS,
  COMPARISON_ROWS,
  FAQ_ITEMS,
} from "@/lib/pricing-data";
import { PricingPlans } from "./pricing-plans";

export const metadata: Metadata = {
  title: "Pricing — BlockID.au",
  description:
    "Simple, transparent pricing for Australian startups. Start free with 2 credits, upgrade to Founding 50 or Growth as you scale. Credit packs available.",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PricingPage() {
  return (
    <div className="min-h-svh bg-surface-50 text-ink-800">
      <PageViewTracker event="pricing_viewed" params={{}} />
      <Navbar />

      <main className="max-w-6xl mx-auto px-6 pt-28 pb-24">
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
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-4 py-2">
            <span className="text-sm text-emerald-700 font-medium">
              Early Bird: <span className="font-bold">5 free credits</span> on signup +
              use code <span className="font-mono font-bold text-emerald-800">LAUNCH50</span> for 50% off Founding 50.
              Expires July 31, 2026.
            </span>
          </div>
        </div>

        {/* Plan cards with Monthly / Annual toggle */}
        <PricingPlans />

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
                className="relative rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 p-5 text-center shadow-sm hover:border-brand-200 hover:shadow-md transition-all"
              >
                {pack.savings && (
                  <span className="absolute -top-2.5 right-3 inline-block rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-[10px] font-semibold text-brand-700">
                    {pack.savings}
                  </span>
                )}
                <p className="text-3xl font-bold text-ink-900 font-mono">{pack.credits}</p>
                <p className="text-xs text-ink-500 mb-2">credits</p>
                <p className="text-lg font-bold text-brand-600 font-mono">${pack.price}</p>
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
            <table className="w-full min-w-[640px] border-collapse">
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
            <div className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-surface-50 dark:bg-surface-100 px-4 py-1.5 mb-4">
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
                className="rounded-xl border border-surface-200 bg-surface-50 dark:bg-surface-100 p-5 shadow-sm"
              >
                <p className="text-sm font-semibold text-ink-800 mb-2">{q}</p>
                <p className="text-sm text-ink-600 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 p-8 md:p-12 text-center shadow-sm">
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
