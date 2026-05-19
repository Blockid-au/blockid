"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PricingCoupon } from "./pricing-coupon";

interface Tier {
  name: string;
  planId?: string;
  price: string;
  numericPrice?: number;
  cadence?: string;
  audience: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
}

const tiers: Tier[] = [
  {
    name: "Free",
    planId: "free",
    price: "$0",
    audience: "Every founder. Forever.",
    features: [
      "Investor-Ready Score",
      "Shareable web link",
      "1 Stripe + Xero connection",
      "Basic dilution calculator",
    ],
    cta: { label: "Get started free", href: "/score" },
  },
  {
    name: "Founder",
    planId: "founder",
    price: "$99",
    numericPrice: 99,
    cadence: "/ month",
    audience: "Pre-seed solo founder",
    features: [
      "Everything in Free",
      "Cap table OS + diff",
      "Investor View Link with read receipts",
      "Term Sheet AI (3 / month)",
    ],
    cta: { label: "Start 14-day trial", href: "/auth/login?plan=founder" },
  },
  {
    name: "Growth",
    planId: "growth",
    price: "$499",
    numericPrice: 499,
    cadence: "/ month",
    audience: "Active fundraise · Seed → A",
    features: [
      "Everything in Founder",
      "Unlimited Term Sheet AI",
      "One-Click Data Room",
      "Comparable Companies Wall",
      "30-day money back",
    ],
    cta: { label: "Start 14-day trial", href: "/auth/login?plan=growth" },
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Pilot Concierge",
    planId: "pilot",
    price: "$5,000",
    numericPrice: 5000,
    cadence: "once-off",
    audience: "First 30 design partners",
    features: [
      "Everything in Growth",
      "Founder-led onboarding",
      "Recorded testimonial credit",
      "Direct Slack channel",
      "30-day deal close commitment",
    ],
    cta: { label: "Apply for pilot", href: "/auth/login?plan=pilot" },
  },
  {
    name: "Accelerator",
    planId: "accelerator",
    price: "$20–60k",
    numericPrice: 20000,
    cadence: "/ year",
    audience: "Cohort programs & venture studios",
    features: [
      "Co-branded white-label portal",
      "Cohort aggregate dashboard",
      "Bulk founder onboarding",
      "Investor Welcome Pack for LPs",
    ],
    cta: {
      label: "Partner with us",
      href: "/auth/login?plan=accelerator",
    },
  },
];

/** Prices that can be discounted (keyed by plan name). */
const discountablePrices: Record<string, number> = Object.fromEntries(
  tiers
    .filter((t) => t.numericPrice !== undefined)
    .map((t) => [t.name, t.numericPrice!]),
);

export function Pricing() {
  const [loading, setLoading] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handlePaidPlan = async (planId: string) => {
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });

      if (res.status === 401) {
        window.location.assign(`/auth/login?plan=${planId}`);
        return;
      }

      const data = (await res.json()) as { ok: boolean; url?: string; reason?: string };
      if (data.ok && data.url) {
        window.location.assign(data.url);
      } else {
        setError(data.reason ?? "Could not start checkout. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="py-24 md:py-32 border-t border-surface-200"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
            Pricing
          </p>
          <h2
            id="pricing-title"
            className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-brand-900"
          >
            Free to start. Pay when you raise.
          </h2>
          <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-700">
            Every founder gets the Investor-Ready Score free. Upgrade when you
            need tracking, reports and AI analysis.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 transition-colors duration-200",
                tier.highlight
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                  : "border-surface-200 bg-white shadow-sm hover:border-brand-500",
              )}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border border-brand-500 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-500">
                  <Star strokeWidth={1.75} className="h-3 w-3" />
                  {tier.badge}
                </span>
              )}
              <h3 className="text-base font-semibold text-brand-900">
                {tier.name}
              </h3>
              <p className="mt-1 text-xs text-ink-600">{tier.audience}</p>
              <p className="mt-5 flex items-end gap-1">
                <span className="font-mono tabular-nums text-3xl font-semibold text-brand-900">
                  {tier.price}
                </span>
                {tier.cadence && (
                  <span className="text-xs text-ink-600 mb-1">
                    {tier.cadence}
                  </span>
                )}
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-ink-700 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      strokeWidth={1.75}
                      className="h-4 w-4 mt-0.5 shrink-0 text-brand-500"
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                {tier.planId && tier.planId !== "free" ? (
                  <Button
                    variant={tier.highlight ? "primary" : "secondary"}
                    size="md"
                    className="w-full"
                    disabled={loading === tier.planId}
                    onClick={() => handlePaidPlan(tier.planId!)}
                  >
                    {loading === tier.planId ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                        Redirecting…
                      </span>
                    ) : (
                      tier.cta.label
                    )}
                  </Button>
                ) : (
                  <Link href={tier.cta.href} className="block">
                    <Button
                      variant={tier.highlight ? "primary" : "secondary"}
                      size="md"
                      className="w-full"
                    >
                      {tier.cta.label}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <p className="mt-8 text-xs text-ink-600">
          Enterprise / Sovereign chain (AUD $50k–$500k / yr) available for
          holding companies and family offices — contact us.
        </p>

        {/* Coupon / partner discount section */}
        <PricingCoupon prices={discountablePrices} />
      </div>
    </section>
  );
}
