"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { PricingCoupon } from "./pricing-coupon";

interface Tier {
  name: string;
  planId: string;
  price: string;
  numericPrice?: number;
  cadence?: string;
  subtitle?: string;
  audience: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
  urgency?: string;
}

const CREDIT_PACKS = [
  { qty: 5, price: 5, href: "/workspace/billing#credits" },
  { qty: 10, price: 9, href: "/workspace/billing#credits" },
  { qty: 25, price: 20, href: "/workspace/billing#credits" },
  { qty: 50, price: 35, href: "/workspace/billing#credits" },
];

const tiers: Tier[] = [
  {
    name: "Starter",
    planId: "free",
    price: "$0",
    audience: "Try BlockID — no signup needed",
    features: [
      "1 free SVI analysis report",
      "Investor-Ready Score",
      "Dilution calculator",
      "Shareable report link",
    ],
    cta: { label: "Analyze Your Idea Free", href: "/#svi" },
  },
  {
    name: "Founder",
    planId: "founding50",
    price: "$49",
    numericPrice: 49,
    subtitle: "one-time \u00b7 lifetime access",
    audience: "Everything you need from idea to fundraise",
    features: [
      "50 analysis credits included (worth A$50)",
      "Unlimited SVI dashboard access",
      "Evidence Vault & export packs",
      "Cap table & equity tools",
      "Co-founder matching",
      "30-day growth plan",
      "Priority support",
    ],
    cta: { label: "Get Founder \u2014 $49 AUD", href: "#" },
    highlight: true,
    badge: "Best Value",
    urgency: "Only 50 spots at this price",
  },
  {
    name: "Growth",
    planId: "growth",
    price: "$499",
    numericPrice: 499,
    cadence: "/ month",
    audience: "For active fundraise \u00b7 Seed to Series A",
    features: [
      "100 credits/month included",
      "Everything in Founder",
      "Multi-entity cap table",
      "Investor data room",
      "Term Sheet AI (unlimited)",
      "Dedicated account manager",
      "30-day money back",
    ],
    cta: { label: "Start Growth Plan", href: "#" },
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
    trackEvent("checkout_started", { plan: planId });
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

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col rounded-2xl border p-6 md:p-8 transition-colors duration-200",
                tier.highlight
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200 scale-[1.02] shadow-lg"
                  : "border-surface-200 bg-white shadow-sm hover:border-brand-500",
              )}
            >
              {tier.badge && (
                <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full border border-brand-500 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-brand-500">
                  <Star strokeWidth={1.75} className="h-3 w-3" />
                  {tier.badge}
                </span>
              )}
              <h3 className="text-lg font-semibold text-brand-900">
                {tier.name}
              </h3>
              <p className="mt-1 text-sm text-ink-600">{tier.audience}</p>
              <p className="mt-5 flex items-end gap-1">
                <span className="font-mono tabular-nums text-4xl font-semibold text-brand-900">
                  {tier.price}
                </span>
                {tier.cadence && (
                  <span className="text-sm text-ink-600 mb-1">
                    {tier.cadence}
                  </span>
                )}
                {tier.subtitle && (
                  <span className="text-sm text-ink-600 mb-1">
                    {tier.subtitle}
                  </span>
                )}
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-700 flex-1">
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
              <div className="mt-8">
                {tier.planId !== "free" ? (
                  <Button
                    variant={tier.highlight ? "primary" : "secondary"}
                    size="md"
                    className="w-full"
                    disabled={loading === tier.planId}
                    onClick={() => handlePaidPlan(tier.planId)}
                  >
                    {loading === tier.planId ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full border-2 border-current/30 border-t-current animate-spin" />
                        Redirecting...
                      </span>
                    ) : (
                      tier.cta.label
                    )}
                  </Button>
                ) : (
                  <Link href={tier.cta.href} className="block">
                    <Button
                      variant="secondary"
                      size="md"
                      className="w-full"
                    >
                      {tier.cta.label}
                    </Button>
                  </Link>
                )}
                {tier.urgency && (
                  <p className="mt-2 text-center text-xs text-ink-500">
                    {tier.urgency}
                  </p>
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

        {/* Credit pack upsell strip */}
        <div className="mt-12 rounded-2xl border border-surface-200 bg-white px-6 py-5 text-center shadow-sm">
          <p className="text-sm text-ink-700 mb-3">
            Need more credits? Buy analysis credits from{" "}
            <span className="font-semibold text-brand-600">A$1 each</span>.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {CREDIT_PACKS.map(({ qty, price, href }) => (
              <Link
                key={qty}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-xl border border-surface-300 bg-surface-50 px-4 py-2 text-sm font-medium text-ink-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 transition-colors"
              >
                {qty} for ${price}
              </Link>
            ))}
          </div>
        </div>

        <p className="mt-10 text-center text-sm text-ink-600">
          Enterprise &amp; Accelerator plans from $5,000 &mdash;{" "}
          <a
            href="mailto:hello@blockid.au"
            className="text-brand-500 underline underline-offset-2 hover:text-brand-600"
          >
            contact us
          </a>
          .
        </p>

        {/* Coupon / partner discount section */}
        <PricingCoupon prices={discountablePrices} />
      </div>
    </section>
  );
}
