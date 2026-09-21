"use client";

// FreeReportPayPanel — the quote after the two free reports (G25-C).
//
// POST /api/intake answered `free_allowance_used`: nothing ran, nothing was
// charged, and this is the quote — the price of the next report (lane A's
// SKU constant, filled server-side into the copy) and the way to pay:
//
//   * a guest with a deck or a site URL → the existing A$3 guest checkout
//     (GuestPaidCheckout, /api/guest-analysis/*), address pre-filled;
//   * a guest with a typed idea (no guest SKU) → create a free account, then
//     buy in the workspace (the unlock rail → ReportPaywallGate);
//   * a signed-in founder → the workspace unlock rail.
//
// Quote first, pay second — the price is on screen before any checkout is
// created (G16 quote-then-pay; feedback_transparent_pricing).

import * as React from "react";
import Link from "next/link";
import { Receipt } from "lucide-react";

import type { FreeReportCopy } from "@/lib/reports/free-report-copy";

export interface FreeReportPayQuote {
  sku: string;
  amount_cents: number;
  label: string;
}

export interface FreeReportPayPanelProps {
  copy: FreeReportCopy["pay"];
  quote: FreeReportPayQuote | null;
  /** Where a signed-in founder buys (the API's `payHref`). */
  payHref: string;
  authenticated: boolean;
  /** A guest whose input has a guest SKU — the CTA opens the guest checkout instead of a link. */
  guestSellable: boolean;
  onGuestCheckout?: () => void;
  onEdit?: () => void;
  className?: string;
}

export function FreeReportPayPanel({
  copy,
  quote,
  payHref,
  authenticated,
  guestSellable,
  onGuestCheckout,
  onEdit,
  className,
}: FreeReportPayPanelProps) {
  const signupHref = `/auth/login?mode=register&next=${encodeURIComponent(payHref)}`;
  return (
    <section
      className={[
        "w-full rounded-2xl border border-line-subtle bg-surface-raised p-5 text-left sm:p-6",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      aria-labelledby="free-report-pay-heading"
      data-testid="analyze-free-report-pay"
      data-sku={quote?.sku ?? undefined}
    >
      <div className="flex items-start gap-3">
        <Receipt aria-hidden strokeWidth={1.75} className="mt-0.5 h-5 w-5 shrink-0 text-action" />
        <div className="min-w-0">
          <h2 id="free-report-pay-heading" className="text-base font-semibold text-primary">
            {copy.heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-secondary">{copy.body}</p>
          {quote && (
            <p className="mt-2 text-sm font-semibold text-primary" data-testid="analyze-free-report-quote">
              {quote.label}
            </p>
          )}
          {authenticated && <p className="mt-1 text-xs text-tertiary">{copy.accountHint}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {authenticated ? (
          <Link
            href={payHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
            data-testid="analyze-free-report-pay-cta"
          >
            {copy.cta}
          </Link>
        ) : guestSellable && onGuestCheckout ? (
          <button
            type="button"
            onClick={onGuestCheckout}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
            data-testid="analyze-free-report-pay-cta"
          >
            {copy.cta}
          </button>
        ) : (
          <Link
            href={signupHref}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
            data-testid="analyze-free-report-pay-cta"
          >
            {copy.signupCta}
          </Link>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-medium text-action underline-offset-2 hover:underline sm:ml-1"
            data-testid="analyze-free-report-pay-edit"
          >
            {copy.edit}
          </button>
        )}
      </div>
    </section>
  );
}

export default FreeReportPayPanel;
