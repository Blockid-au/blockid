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
//   * a signed-in founder with enough credits → run THIS input now for the
//     quoted credits (2026-09-25; the uploaded file stays in hand). The
//     workspace unlock rail remains the fallback when the balance is short.
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

/** The credit price of running this input — from POST /api/intake, never computed client-side. */
export interface FreeReportCreditQuote {
  feature: string;
  cost: number;
  balance: number;
  canAfford: boolean;
}

function formatCreditAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
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
  /** Signed-in only: the credit quote for this input. */
  credits?: FreeReportCreditQuote | null;
  /** Pay for this run with credits (present only when the balance covers it). */
  onPayWithCredits?: () => void;
  /** The server refused the charge — the balance moved since the quote. */
  creditsError?: boolean;
  busy?: boolean;
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
  credits,
  onPayWithCredits,
  creditsError = false,
  busy = false,
  className,
}: FreeReportPayPanelProps) {
  const payByCredits = authenticated && Boolean(credits?.canAfford) && Boolean(onPayWithCredits);
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
          {authenticated && credits && (
            <p
              className="mt-2 text-sm text-primary"
              data-testid="analyze-free-report-credits"
              data-can-afford={credits.canAfford ? "1" : "0"}
            >
              {(credits.canAfford ? copy.creditsQuote : copy.creditsShort)
                .replace("{cost}", formatCreditAmount(credits.cost))
                .replace("{balance}", formatCreditAmount(credits.balance))}
            </p>
          )}
          {creditsError && (
            <p role="alert" className="mt-2 text-sm text-danger" data-testid="analyze-free-report-credits-error">
              {copy.creditsError}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {payByCredits ? (
          <button
              type="button"
              onClick={onPayWithCredits}
              disabled={busy}
              aria-busy={busy || undefined}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 disabled:opacity-60"
              data-testid="analyze-free-report-credits-cta"
            >
            {copy.creditsCta.replace("{cost}", formatCreditAmount(credits?.cost ?? 0))}
          </button>
        ) : authenticated ? (
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
