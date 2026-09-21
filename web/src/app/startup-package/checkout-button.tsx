"use client";

// Small client sub-component for the /startup-package landing page.
// Isolated so the RSC page stays server-rendered.
//
// G25-D (founder 2026-09-21): the CTA is a LINK to the review step
// (`/checkout/review?sku=founder_package`) — the founder reads the one-off
// price inc. GST and what is included there and presses "Pay A$149 now";
// only that click posts to /api/stripe/checkout. This component never
// fetches a checkout route.

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { checkoutReviewHref, type CheckoutSku } from "@/lib/billing/checkout-review";

interface CheckoutButtonProps {
  planId: CheckoutSku;
  label: string;
  /**
   * G20-F3: the quote rendered under the button BEFORE the review step
   * ("A$149 inc. GST · one-off · 25 credits included") — the founder sees the
   * amount here, again on the review, and again on the Stripe page.
   */
  quote?: string;
}

export function CheckoutButton({ planId, label, quote }: CheckoutButtonProps) {
  return (
    <div className="inline-flex flex-col items-center">
      <Link
        href={checkoutReviewHref({ sku: planId, entry: "startup_package" })}
        onClick={() => trackEvent("plan_cta_clicked", { plan: planId, label })}
        data-testid="startup-package-checkout"
        data-plan-id={planId}
        aria-describedby={quote ? "startup-package-quote" : undefined}
        className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-5 py-3 text-sm font-semibold text-primary hover:border-action hover:bg-surface-hover"
      >
        <Lock aria-hidden="true" className="h-4 w-4" />
        {label}
      </Link>
      {quote && (
        <p id="startup-package-quote" className="mt-2 text-xs text-tertiary" data-testid="startup-package-quote">
          {quote}
        </p>
      )}
    </div>
  );
}
