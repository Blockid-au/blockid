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
 *   1. "Confirm & Pay A$5.50" → POST /api/reports/checkout → Stripe URL.
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
  /** Called with the created order id after Path B confirms. */
  onRedeemed?(orderId: string): void;
}

const PATH_A_LABEL = "A$5.50";
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
        setError(data.reason ?? `Checkout failed (${res.status})`);
        setPending(null);
        return;
      }
      // Full-page redirect to Stripe. No SPA transition — we leave the site.
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
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
        setError(data.reason ?? `Redeem failed (${res.status})`);
        setPending(null);
        return;
      }
      onRedeemed?.(data.orderId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
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
      className="report-paywall-gate max-w-lg rounded-2xl border border-white/10 bg-[var(--fintech-bg-primary,#0b1220)] p-0 text-[var(--fintech-ink,#e2e8f0)] shadow-2xl backdrop:bg-black/60"
      data-testid="report-paywall-gate"
    >
      <div className="flex flex-col gap-4 px-6 py-6">
        <h2
          id="paywall-heading"
          className="font-display text-xl font-semibold tracking-tight"
        >
          Generate this Trust Business Report
        </h2>
        <p className="text-sm leading-relaxed text-[var(--fintech-ink-muted,#94a3b8)]">
          This report analyses <strong>13 criteria across 4 pillars</strong>{" "}
          using <strong>6 C-Level agents</strong>. Estimated{" "}
          <strong className="tabular-nums">
            {quote.estimatedWords.toLocaleString("en-AU")}
          </strong>{" "}
          words · model <strong>{HUMAN_MODEL_LABEL[quote.model]}</strong> ·
          generation time ~4 min.
        </p>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--fintech-ink-muted,#94a3b8)]">
              One-off
            </dt>
            <dd className="font-mono text-base font-semibold">
              {PATH_A_LABEL}
              <span className="ml-1 text-xs text-[var(--fintech-ink-muted,#94a3b8)]">
                inc-GST
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-[var(--fintech-ink-muted,#94a3b8)]">
              Or credits
            </dt>
            <dd className="font-mono text-base font-semibold tabular-nums">
              {quote.credits} credits
            </dd>
          </div>
        </dl>

        {error ? (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleCheckout}
            disabled={pending !== null}
            aria-label={`Confirm and pay ${PATH_A_LABEL} inc-GST via Stripe`}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-[var(--fintech-accent,#22d3ee)] px-4 text-sm font-semibold text-[var(--fintech-bg-primary,#0b1220)] transition-colors hover:bg-[var(--fintech-accent-hover,#67e8f9)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring,rgba(34,211,238,0.4))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary,#0b1220)] disabled:cursor-not-allowed disabled:opacity-60"
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
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-white/15 bg-white/[0.03] px-4 text-sm font-medium text-[var(--fintech-ink,#e2e8f0)] transition-colors hover:border-[var(--fintech-accent,#22d3ee)]/50 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring,rgba(34,211,238,0.4))] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary,#0b1220)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "redeem"
              ? "Debiting credits…"
              : `Confirm & Use ${quote.credits} credits`}
          </button>
        </div>

        {!hasSubscription ? (
          <p className="text-xs text-[var(--fintech-ink-muted,#94a3b8)]">
            The credit path is available on active subscriptions. See{" "}
            <a
              href="/pricing"
              className="underline underline-offset-2 hover:text-[var(--fintech-accent,#22d3ee)]"
            >
              plans
            </a>
            .
          </p>
        ) : !canRedeem ? (
          <p className="text-xs text-[var(--fintech-ink-muted,#94a3b8)]">
            Your balance ({creditBalance.toLocaleString("en-AU")} credits)
            is below the required {quote.credits}. Top up or use one-off.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className="text-xs text-[var(--fintech-ink-muted,#94a3b8)] hover:text-[var(--fintech-ink,#e2e8f0)] focus:outline-none focus-visible:underline"
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}

export default ReportPaywallGate;
