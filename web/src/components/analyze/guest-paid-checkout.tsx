"use client";

/**
 * <GuestPaidCheckout /> — the A$3 guest purchase step for `/analyze?tier=paid`.
 *
 * Background (2026-09-08 revenue repair): `/one-click-report` is the only page
 * that ever POSTed to `/api/guest-analysis/create-order`. When `/analyze` was
 * introduced as the unified entry point, `?tier=paid` rendered nothing but the
 * string "Paid tier pre-selected" — an unauthenticated visitor arriving with a
 * paid intent had no way to buy. This dialog closes that gap by driving the
 * exact same two-step contract `one-click-form.tsx` uses:
 *
 *   1. `pitch_file` → POST FormData to `/api/guest-analysis/upload-pitch`,
 *      which returns `{ inputValue, filename }` (a server-side storage path).
 *   2. POST JSON `{ email, inputType, inputValue, inputFilename? }` to
 *      `/api/guest-analysis/create-order`, then hard-navigate to
 *      `checkoutUrl` (Stripe hosted checkout, automatic_tax + ATO invoice).
 *
 * The guest API only accepts `pitch_file` and `website_url`, so a typed idea
 * cannot be sold this way — the caller is responsible for only rendering this
 * dialog for deck/site inputs.
 *
 * G35 D26 (Pricing v5, GET /api/pricing/payg): with `payg_enabled` on the
 * guest chooses Snapshot or Full (name, what is included, price "one-off,
 * inc. GST", delivery) before the explicit Pay button; Verified needs an
 * account, so it shows a sign-in link instead. While the price loads the Pay
 * button is disabled. Flag off → the A$3 dialog, unchanged.
 */

import * as React from "react";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { usePaygPricing } from "@/lib/pricing/use-payg-pricing";
import { LEGACY_REPORT_CENTS, audFromCents } from "@/lib/pricing/payg-copy";

/** Flag-OFF price copy — the legacy one-off report price, derived (never typed). */
const LEGACY_PRICE_LABEL = audFromCents(LEGACY_REPORT_CENTS);
import { emitClientEvent } from "@/lib/analytics/client-emit";
import type { PaygTierOffer } from "@/lib/pricing/payg-offer";

export type GuestPaygTier = "snapshot" | "full";

/** Pure: the tiers a guest can buy (Snapshot / Full) and the Verified card (sign-in only). */
export function guestPaygTiers(tiers: readonly PaygTierOffer[] | undefined): { buyable: PaygTierOffer[]; verified: PaygTierOffer | null } {
  const list = tiers ?? [];
  return {
    buyable: list.filter((t) => t.tier === "snapshot" || t.tier === "full"),
    verified: list.find((t) => t.tier === "verified") ?? null,
  };
}

export type GuestInputType = "pitch_file" | "website_url";

export interface GuestPaidCheckoutProps {
  open: boolean;
  onClose: () => void;
  /** Which guest SKU input we are selling. */
  inputType: GuestInputType;
  /** Required when inputType === "pitch_file". */
  file?: File | null;
  /** Required when inputType === "website_url". */
  url?: string;
  /** Price copy, inc. GST. */
  priceLabel?: string;
  /** Pre-filled address (the one given for the free report). */
  initialEmail?: string;
  /** G35 P5: the tier the visitor came for (`/analyze?payg=snapshot|full`) — preselected in the picker. */
  initialTier?: GuestPaygTier;
}

interface UploadResponse {
  inputValue?: string;
  filename?: string;
  error?: string;
}

interface CreateOrderResponse {
  checkoutUrl?: string;
  guestAnalysisId?: string;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Exported for tests — same request shape as one-click-form.tsx. */
export async function startGuestCheckout(opts: {
  email: string;
  inputType: GuestInputType;
  file?: File | null;
  url?: string;
  /** G35 D26: Pricing v5 tier (only sent when payg_enabled). */
  tier?: GuestPaygTier;
}): Promise<string> {
  let inputValue: string;
  let inputFilename: string | undefined;

  if (opts.inputType === "pitch_file") {
    if (!opts.file) throw new Error("No pitch file to upload.");
    const fd = new FormData();
    fd.append("file", opts.file);
    const uploadRes = await fetch("/api/guest-analysis/upload-pitch", {
      method: "POST",
      body: fd,
    });
    const uploadData = (await uploadRes.json()) as UploadResponse;
    if (!uploadRes.ok || !uploadData.inputValue) {
      throw new Error(
        uploadData.error || "Couldn't upload your pitch. Please try again.",
      );
    }
    inputValue = uploadData.inputValue;
    inputFilename = uploadData.filename;
  } else {
    inputValue = (opts.url ?? "").trim();
    if (!inputValue) throw new Error("No website URL to analyse.");
  }

  const orderRes = await fetch("/api/guest-analysis/create-order", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: opts.email.trim().toLowerCase(),
      inputType: opts.inputType,
      inputValue,
      inputFilename,
      ...(opts.tier ? { tier: opts.tier } : {}),
    }),
  });
  const orderData = (await orderRes.json()) as CreateOrderResponse;
  if (!orderRes.ok || !orderData.checkoutUrl) {
    throw new Error(
      orderData.error ||
        "Couldn't create your order. Please try again in a moment.",
    );
  }
  return orderData.checkoutUrl;
}

export function GuestPaidCheckout({
  open,
  onClose,
  inputType,
  file,
  url,
  priceLabel = LEGACY_PRICE_LABEL,
  initialEmail,
  initialTier = "full",
}: GuestPaidCheckoutProps) {
  // G25-C: the address the visitor already gave for the free report is
  // pre-filled — they are never asked for the same thing twice.
  const [email, setEmail] = React.useState(initialEmail ?? "");
  const [consent, setConsent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  // G35 D26: Pricing v5 tiers (null = PAYG off / unreadable → the A$3 dialog).
  const pricing = usePaygPricing();
  const payg = pricing.status === "ready" && pricing.pricing.enabled ? pricing.pricing : null;
  const { buyable, verified } = guestPaygTiers(payg?.tiers);
  const [tier, setTier] = React.useState<GuestPaygTier>(initialTier);
  const chosen = buyable.find((t) => t.tier === tier) ?? buyable[0] ?? null;
  const priceLoading = pricing.status === "loading";
  const shownPrice = payg && chosen ? chosen.priceLabel : priceLabel;
  const viewedRef = React.useRef(false);
  React.useEffect(() => {
    if (!open || !payg || viewedRef.current) return;
    viewedRef.current = true;
    for (const t of buyable) {
      void emitClientEvent("payg_tier_viewed", { tier: t.tier, sku: t.sku, surface: "analyze_guest", amount_cents: t.amountCents });
    }
  }, [open, payg, buyable]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!email.trim() || !EMAIL_RE.test(email.trim())) {
      setErrorMsg("Enter a valid email so we can send your report.");
      return;
    }
    if (!consent) {
      setErrorMsg("Please confirm you agree to receive your report by email.");
      return;
    }
    if (priceLoading) return;
    setErrorMsg(null);
    setSubmitting(true);
    if (payg && chosen) {
      void emitClientEvent("payg_checkout_started", {
        tier: chosen.tier,
        sku: chosen.sku,
        surface: "analyze_guest",
        amount_cents: chosen.amountCents,
        is_upgrade: false,
      });
    }
    try {
      const checkoutUrl = await startGuestCheckout({
        email,
        inputType,
        file,
        url,
        ...(payg && chosen ? { tier: chosen.tier as GuestPaygTier } : {}),
      });
      window.location.assign(checkoutUrl);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-paid-checkout-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      data-testid="guest-paid-checkout"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-t-2xl border border-line-subtle bg-surface-raised p-5 text-left shadow-xl sm:rounded-2xl">
        <button
          type="button"
          onClick={() => !submitting && onClose()}
          disabled={submitting}
          aria-label="Close dialog"
          className="absolute right-3 top-3 rounded-md p-1 text-tertiary transition-colors hover:bg-surface-hover"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <h2
          id="guest-paid-checkout-title"
          className="text-lg font-semibold text-primary"
        >
          {payg ? "Choose your report" : `Get your full report — ${priceLabel}`}
        </h2>
        <p className="mt-1 text-xs text-muted">
          {payg
            ? // G35 D26: Full = the 16-section report from the ReportV2 job (longer than the Snapshot PDF).
              "One-off payment, inc. GST. No account needed. A Snapshot PDF arrives a couple of minutes after payment clears; a Full report (all 16 sections, with its PDF) is usually ready in about 10 minutes."
            : "One-off payment, inc. GST. No account needed. We email the PDF a couple of minutes after payment clears."}
        </p>

        {payg ? (
          <fieldset className="mt-4 flex flex-col gap-2" data-testid="guest-payg-tiers">
            <legend className="sr-only">Report tier</legend>
            {buyable.map((t) => (
              <label
                key={t.tier}
                htmlFor={`guest-tier-${t.tier}`}
                className={`flex cursor-pointer flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-sm ${chosen?.tier === t.tier ? "border-action bg-surface-sunken" : "border-line-subtle bg-surface"}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <input
                      id={`guest-tier-${t.tier}`}
                      type="radio"
                      name="guest-tier"
                      checked={chosen?.tier === t.tier}
                      onChange={() => setTier(t.tier as GuestPaygTier)}
                      disabled={submitting}
                      className="h-4 w-4"
                    />
                    <span className="font-semibold text-primary">{t.name} report</span>
                  </span>
                  <span className="text-right">
                    <span className="font-mono font-semibold tabular-nums text-primary">{t.priceLabel}</span>
                    <span className="block text-[11px] text-muted">{payg.billingNote}</span>
                  </span>
                </span>
                <span className="text-xs text-secondary">Delivery: {t.delivery}</span>
                <ul className="grid gap-0.5 text-xs text-secondary">
                  {t.included.map((line) => (
                    <li key={line} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-action" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </label>
            ))}
            {verified ? (
              <p className="rounded-xl border border-dashed border-line-subtle px-3 py-2 text-xs text-secondary" data-testid="guest-payg-verified">
                <strong className="text-primary">Verified report — {verified.priceLabel}</strong> ({verified.delivery.toLowerCase()}) needs a BlockID
                account.{" "}
                <a href="/auth/login?next=/analyze" className="font-semibold text-action underline">
                  Sign in to choose Verified
                </a>
              </p>
            ) : null}
          </fieldset>
        ) : null}

        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="guest-paid-email"
              className="text-sm font-medium text-primary"
            >
              Your email (report is sent here)
            </label>
            <input
              id="guest-paid-email"
              type="email"
              autoComplete="email"
              placeholder="founder@yourstartup.com.au"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-line-subtle bg-surface px-3 text-sm text-primary outline-none focus-visible:ring-2 focus-visible:ring-action/50"
            />
          </div>

          <label
            htmlFor="guest-paid-consent"
            className="flex cursor-pointer items-start gap-3 text-sm text-secondary"
          >
            <input
              id="guest-paid-consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
            />
            <span>I agree to receive my report by email.</span>
          </label>

          <button
            type="submit"
            disabled={submitting || priceLoading}
            data-testid="guest-paid-submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Starting checkout…
              </>
            ) : (
              <>
                Pay {shownPrice} &amp; get my {payg && chosen ? `${chosen.name} ` : ""}report
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </button>

          <p className="text-center text-xs text-muted">
            Not financial advice. GST tax invoice included.
          </p>

          <div role="alert" aria-live="polite" className="min-h-[1.25rem]">
            {errorMsg ? (
              <p className="text-sm text-bear">{errorMsg}</p>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

export default GuestPaidCheckout;
