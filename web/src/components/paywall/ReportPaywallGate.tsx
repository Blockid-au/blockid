/**
 * ReportPaywallGate — confirm-before-charge modal for the Trust
 * Business Report paywall.
 *
 * Master Upgrade Plan §8.7. The modal shows the exact word count,
 * model, credit cost, and A$ price BEFORE execution and never charges
 * without an explicit user confirm. The server re-validates every
 * quoted number at submit (both /api/reports/checkout and
 * /api/reports/redeem re-compute), so the client only DISPLAYS what
 * the server returned — no client-side arithmetic games the debit.
 *
 * Two buttons:
 *   1. "Confirm & Pay A$3" → POST /api/reports/checkout → Stripe URL.
 *   2. "Confirm & Use N credits" → POST /api/reports/redeem → immediate
 *      PAID + orderId; parent navigates to the report.
 *
 * The credits button is disabled when the user's balance is below N.
 *
 * Focus + accessibility:
 *   - Modal is a semantic <dialog> opened via the ref; Escape closes
 *     it and returns focus to the invoking button.
 *   - Both action buttons have descriptive aria-labels including the
 *     A$ price / credit count so a screen-reader user hears what they
 *     will be charged before pressing.
 *   - `prefers-reduced-motion: reduce` suppresses the reveal animation.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { trustReportPriceLabel } from "@/lib/pricing/trust-report-price";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

export interface ReportPaywallQuote {
  credits: number;
  estimatedWords: number;
  model: "haiku" | "sonnet" | "opus";
  depth: "scan" | "standard" | "deep" | "expert" | "max";
  sections: number;
}

export interface ReportPaywallGateProps {
  businessId: string;
  /** Server-computed quote (from a getServerSideProps or RSC parent). */
  quote: ReportPaywallQuote;
  /** User's current credit balance. Path B button disables if too low. */
  creditBalance: number;
  /** Whether the user has an active subscription. Governs modal copy. */
  hasSubscription: boolean;
  /** Optional GA4 first-touch attribution string sent to the API. */
  firstTouch?: string;
  /** External open control. Parent renders a trigger and flips this on. */
  open: boolean;
  onClose(): void;
  /**
   * Called with the created order id after Path B confirms. When omitted
   * the gate navigates to `reportOrderPath(orderId)` itself, so the
   * credit path always ends somewhere the report is actually delivered.
   */
  onRedeemed?(orderId: string): void;
}

// Trusted Business Report re-priced A$5.50 → A$3 in place on 2026-09-10 (founder
// decision D3). Read off the SKU (via lib/pricing/trust-report-price, G16-B
// copy truth) so the modal can never drift from what /api/reports/checkout
// actually books.
const PATH_A_LABEL = trustReportPriceLabel();
const HUMAN_MODEL_LABEL: Record<ReportPaywallQuote["model"], string> = {
  haiku: "Claude Haiku 4.5",
  sonnet: "Claude Sonnet 5",
  opus: "Claude Opus 4.7",
};

export function ReportPaywallGate({
  businessId,
  quote,
  creditBalance,
  hasSubscription,
  firstTouch,
  open,
  onClose,
  onRedeemed,
}: ReportPaywallGateProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState<"checkout" | "redeem" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canRedeem = hasSubscription && creditBalance >= quote.credits;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  const handleCheckout = useCallback(async () => {
    setPending("checkout");
    setError(null);
    try {
      const res = await fetch("/api/reports/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ businessId, firstTouch }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        reason?: string;
      };
      if (!res.ok || !data.ok || !data.url) {
        setError(userErrorMessage(ApiError.fromBody(res.status, { ...data, error: data.reason }), "Checkout could not start. Please try again."));
        setPending(null);
        return;
      }
      // Full-page redirect to Stripe. No SPA transition — we leave the site.
      window.location.href = data.url;
    } catch (err) {
      console.error("[paywall] checkout", err);
      setError(userErrorMessage(err, "Checkout could not start. Please try again."));
      setPending(null);
    }
  }, [businessId, firstTouch]);

  const handleRedeem = useCallback(async () => {
    setPending("redeem");
    setError(null);
    try {
      const res = await fetch("/api/reports/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessId,
          model: quote.model,
          depth: quote.depth,
          sections: quote.sections,
          firstTouch,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        orderId?: string;
        reason?: string;
      };
      if (!res.ok || !data.ok || !data.orderId) {
        setError(userErrorMessage(ApiError.fromBody(res.status, { ...data, error: data.reason }), "Could not redeem the report. Please try again."));
        setPending(null);
        return;
      }
      // Delivery is the point of the purchase, so a redeem that nobody
      // is listening to must still take the buyer to their report rather
      // than silently closing the modal on an unchanged page. Parents
      // that want their own routing keep full control by passing
      // onRedeemed; the default only fires when they do not.
      if (onRedeemed) {
        onRedeemed(data.orderId);
      } else {
        window.location.href = reportOrderPath(data.orderId);
      }
      onClose();
    } catch (err) {
      console.error("[paywall] redeem", err);
      setError(userErrorMessage(err, "Could not redeem the report. Please try again."));
      setPending(null);
    }
  }, [
    businessId,
    firstTouch,
    onClose,
    onRedeemed,
    quote.depth,
    quote.model,
    quote.sections,
  ]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="paywall-heading"
      className="report-paywall-gate w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line-subtle bg-surface p-0 text-primary shadow-2xl backdrop:bg-black/50"
      data-testid="report-paywall-gate"
    >
      <div className="flex flex-col gap-4 px-6 py-6">
        <h2
          id="paywall-heading"
          className="font-display text-xl font-semibold tracking-tight"
        >
          Generate this Trusted Business Report
        </h2>
        <p className="text-sm leading-relaxed text-secondary">
          Review the business across eight assessment areas, with supporting
          evidence and recorded gaps. Choose how to pay below.
        </p>

        <details className="rounded-lg border border-line-subtle bg-surface-sunken px-3" data-paywall-report-details>
          <summary className="flex min-h-11 cursor-pointer items-center rounded text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">Report details</summary>
          <p className="pb-3 text-sm leading-relaxed text-secondary">Estimated <strong className="tabular-nums">{quote.estimatedWords.toLocaleString("en-AU")}</strong> words · model <strong>{HUMAN_MODEL_LABEL[quote.model]}</strong>. Completion time varies.</p>
        </details>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line-subtle bg-surface-sunken px-4 py-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-secondary">
              One-off
            </dt>
            <dd className="font-mono text-base font-semibold">
              {PATH_A_LABEL}
              <span className="ml-1 text-xs text-secondary">
                inc. GST
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-secondary">
              Or credits
            </dt>
            <dd className="font-mono text-base font-semibold tabular-nums">
              {quote.credits} credits
            </dd>
          </div>
        </dl>

        {error ? (
          <p role="alert" className="text-sm text-bear">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={pending !== null}
            aria-label={`Confirm and pay ${PATH_A_LABEL} inc. GST via Stripe`}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-action px-4 py-2 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "checkout"
              ? "Redirecting to Stripe…"
              : `Confirm & Pay ${PATH_A_LABEL}`}
          </button>
          <button
            type="button"
            onClick={handleRedeem}
            disabled={pending !== null || !canRedeem}
            aria-label={`Confirm and use ${quote.credits} credits from your subscription balance`}
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line-subtle bg-surface px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "redeem"
              ? "Debiting credits…"
              : `Confirm & Use ${quote.credits} credits`}
          </button>
        </div>

        {!hasSubscription ? (
          <p className="text-xs text-secondary">
            The credit path is available on active subscriptions. See{" "}
            <a
              href="/pricing"
              className="rounded text-action underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              plans
            </a>
            .
          </p>
        ) : !canRedeem ? (
          <p className="text-xs text-secondary">
            Your balance ({creditBalance.toLocaleString("en-AU")} credits)
            is below the required {quote.credits}. Top up or use one-off.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg text-sm font-medium text-secondary hover:bg-surface-sunken hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Cancel and return to report
        </button>
      </div>
    </dialog>
  );
}

export default ReportPaywallGate;
