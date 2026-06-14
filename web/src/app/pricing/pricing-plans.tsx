"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Star, ArrowRight } from "lucide-react";
import { PRICING_TIERS, type PricingTier } from "@/lib/pricing-data";
import { trackEvent } from "@/lib/analytics";

// ---------------------------------------------------------------------------
// Separate Growth tiers by billing cadence.
// ---------------------------------------------------------------------------

function getVisibleTiers(annual: boolean, allTiers: PricingTier[]): PricingTier[] {
  return allTiers.filter((t) => {
    if (annual && t.id === "growth") return false;
    if (!annual && t.id === "growth_annual") return false;
    return true;
  });
}

interface Props {
  tiers?: PricingTier[]; // optional config-based override from server
}

export function PricingPlans({ tiers: tiersProp }: Props = {}) {
  const [annual, setAnnual] = React.useState(false);

  const tiers = getVisibleTiers(annual, tiersProp ?? PRICING_TIERS);

  return (
    <>
      {/* Monthly / Annual toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <span
          className={`text-sm font-medium transition-colors ${
            !annual ? "text-ink-900" : "text-ink-400"
          }`}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label="Toggle annual billing"
          onClick={() => {
            setAnnual((prev) => !prev);
            trackEvent("pricing_toggle_billing", { annual: !annual });
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
            annual ? "bg-brand-600" : "bg-surface-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              annual ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium transition-colors ${
            annual ? "text-ink-900" : "text-ink-400"
          }`}
        >
          Annual{" "}
          <span className="text-emerald-600 font-semibold">(Save 20%)</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-6 mb-20">
        {tiers.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl border bg-surface-50 dark:bg-surface-100 p-6 shadow-sm flex flex-col ${
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
              <h3 className="text-lg font-bold text-ink-900 mb-1">
                {plan.name}
              </h3>
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold text-ink-900 font-mono">
                  {plan.price}
                </span>
                <span className="text-sm text-ink-500">{plan.cadence}</span>
              </div>
              {plan.subtitle && (
                <p className="text-sm text-brand-600 font-medium mt-1">
                  {plan.subtitle}
                </p>
              )}
              <p className="text-sm text-brand-600 font-medium mt-1">
                {plan.credits}
              </p>
            </div>

            {/* Features */}
            <ul className="space-y-2.5 mb-8 flex-1">
              {plan.features.map((feat) => (
                <li
                  key={feat}
                  className="flex items-start gap-2.5 text-sm text-ink-700"
                >
                  <Check
                    strokeWidth={2}
                    className="h-4 w-4 text-brand-500 shrink-0 mt-0.5"
                  />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              href={plan.cta.href}
              onClick={() => {
                trackEvent("plan_cta_clicked", { plan: plan.id, label: plan.cta.label });
                if (plan.id !== "free") {
                  trackEvent("checkout_started", { plan: plan.id });
                }
              }}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition-all duration-200 ${
                plan.ctaStyle === "primary"
                  ? "bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
                  : "bg-surface-50 dark:bg-surface-200 hover:bg-surface-100 text-ink-700 border border-surface-300 shadow-sm"
              }`}
            >
              {plan.cta.label}
              <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
