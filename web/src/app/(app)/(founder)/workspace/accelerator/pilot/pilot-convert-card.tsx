"use client";

// PilotConvertCard — "Convert to Cohort 25 / Cohort 100 (annual)" on the
// pilot delivery kit (G23-B, 2026-09-21). The program's pilot fee is credited
// against the first year when it converts within the window
// (lib/pilots/conversion.ts PILOT_CONVERSION_WINDOW_DAYS).
//
// Transparent-pricing rule: the card quotes the annual price inc. GST, the
// credit and the first-year figure BEFORE anything is posted; the checkout
// page shows the same lines again. Then one of:
//   • configured + eligible → POST /api/stripe/checkout
//       { plan, interval: "annual", convert_from_pilot: <order id> } and
//       follow the Stripe URL;
//   • eligible but the coupon env NAME is unset → a plain link to
//       /contact?topic=pilot (our team applies the credit by hand);
//   • already converted / window closed → the state, no control.
// Every figure arrives from the server (`conversionOffer()`); this file
// carries no amount. `resolveConvertResponse` is pure for the test.

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Lock } from "lucide-react";
import { userErrorMessage } from "@/lib/ui/user-error";
import type { ConversionOfferView } from "@/lib/pilots/conversion";

export type ConvertNext = { kind: "navigate"; href: string } | { kind: "login"; href: string } | { kind: "fallback"; href: string } | { kind: "error"; message: string };

export const CONVERT_ERROR_FALLBACK = "Could not start the checkout — please try again.";

/** Pure: what the card does with a checkout response. */
export function resolveConvertResponse(status: number, body: { ok?: boolean; url?: string; error?: string; fallback?: string; reason?: string; message?: string } | null, returnPath: string): ConvertNext {
  if (status === 401) return { kind: "login", href: `/auth/login?next=${encodeURIComponent(returnPath)}` };
  if (status === 409 && body?.fallback) return { kind: "fallback", href: body.fallback };
  if (body?.url) return { kind: "navigate", href: body.url };
  return { kind: "error", message: body?.message ?? body?.reason ?? body?.error ?? CONVERT_ERROR_FALLBACK };
}

const RETURN_PATH = "/workspace/accelerator/pilot";

export function PilotConvertCard({ offer }: { offer: ConversionOfferView }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mode = offer.reason === "already_converted" ? "converted" : !offer.eligible ? "closed" : offer.configured ? "checkout" : "contact";

  async function continueToCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: offer.plan, interval: "annual", convert_from_pilot: offer.orderId }),
      });
      let body: Parameters<typeof resolveConvertResponse>[1] = null;
      try {
        body = (await res.json()) as typeof body;
      } catch {
        body = null;
      }
      const next = resolveConvertResponse(res.status, body, RETURN_PATH);
      if (next.kind === "error") {
        setError(next.message);
        setBusy(false);
        return;
      }
      window.location.href = next.href;
      return;
    } catch (err) {
      setError(userErrorMessage(err, "Network error — please try again."));
    }
    setBusy(false);
  }

  return (
    <section className="rounded-2xl border border-line-subtle bg-surface p-6" data-testid="pilot-convert-card" data-convert-mode={mode} data-convert-plan={offer.plan} aria-labelledby="pilot-convert-h">
      <h2 id="pilot-convert-h" className="text-lg font-semibold text-primary">
        {mode === "converted" ? `Converted to ${offer.convertedPlanName ?? offer.planName} (annual)` : `Convert to ${offer.planName} (annual)`}
      </h2>
      {mode === "converted" ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-secondary" data-testid="pilot-convert-done">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-bull" aria-hidden="true" />
          <span>Your program moved to the annual plan{offer.convertedAtLabel ? ` on ${offer.convertedAtLabel}` : ""}. The pilot credit is on the first invoice; manage the subscription from Billing.</span>
        </p>
      ) : (
        <>
          <p className="mt-2 max-w-2xl text-sm text-secondary">
            <span className="font-semibold text-primary" data-testid="pilot-convert-price">{offer.annualPriceLongLabel}</span> a year · {offer.trialDays}-day free trial, card required, cancel any time.
          </p>
          <p className="mt-2 max-w-2xl text-sm text-secondary" data-testid="pilot-convert-credit">
            {offer.creditRule} Your <span className="font-semibold text-primary">{offer.pilotFeeLabel}</span> pilot fee brings the first year to <span className="font-semibold text-primary">{offer.firstYearLabel}</span> inc. GST, then {offer.annualPriceLabel} a year.
            {mode === "closed" ? ` The credit window closed on ${offer.windowEndsLabel}.` : ` The credit applies until ${offer.windowEndsLabel}.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {mode === "checkout" ? (
              <button type="button" onClick={continueToCheckout} disabled={busy} data-testid="pilot-convert-checkout" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                {busy ? "Opening secure checkout…" : "Continue to secure checkout"}
              </button>
            ) : (
              <Link href={offer.contactHref} data-testid="pilot-convert-contact" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover">
                Talk to our team
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <p className="text-xs text-secondary" data-testid="pilot-convert-note">
              {mode === "checkout"
                ? "The Stripe page lists the plan, the credit and the exact charge before you pay."
                : mode === "contact"
                  ? "The pilot credit is applied by our team for now — we reply within two business days and send a checkout link with the credit on it."
                  : "A Cohort plan is still available; our team can talk through the options."}
            </p>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-bear" data-testid="pilot-convert-error">
              {error}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
