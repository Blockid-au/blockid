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
 */

import * as React from "react";
import { ArrowRight, Loader2, X } from "lucide-react";

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
  /** Price copy, inc GST. */
  priceLabel?: string;
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
  priceLabel = "A$3",
}: GuestPaidCheckoutProps) {
  const [email, setEmail] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

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
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const checkoutUrl = await startGuestCheckout({
        email,
        inputType,
        file,
        url,
      });
      window.location.href = checkoutUrl;
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
          Get your full report — {priceLabel}
        </h2>
        <p className="mt-1 text-xs text-muted">
          One-off payment, inc GST. No account needed. We email the PDF a
          couple of minutes after payment clears.
        </p>

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
            disabled={submitting}
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
                Pay {priceLabel} &amp; get my report
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
