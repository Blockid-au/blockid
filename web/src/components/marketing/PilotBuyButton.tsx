"use client";

/**
 * PilotBuyButton — the buy control for the paid BlockID Cohort Validation
 * Pilot (G21 P0-C). Mounted on /solutions/accelerator#pilot, /pilot, their
 * /vi mirrors and the /pricing Programs tab.
 *
 * Transparent-pricing rule (founder): the visitor sees the amount, "inc.
 * GST" and what is included BEFORE anything is charged. The first click
 * opens an inline confirm panel (price + inclusions); only "Continue to
 * secure checkout" posts `{ plan: <sku> }` to POST /api/stripe/checkout and
 * follows the returned Stripe URL. Stripe shows the same amount again;
 * nothing is charged in between.
 *
 * Fallbacks, in order:
 *   - `configured === false` (server-rendered from `isPilotSkuConfigured`)
 *     → a plain link to /contact?topic=pilot; no POST, no login detour;
 *   - 401 → /auth/login?next=<returnPath>;
 *   - 409 `sku_unconfigured` → the response's `fallback` (contact page);
 *   - anything else → inline error, button re-enabled.
 *
 * G22-C: every visible string comes from `strings` (`PilotUiStrings`, built
 * on the server by `pilotUiStrings(messages, locale)` from the `pilot.*`
 * catalogue keys) — this file carries no English literal, so the /vi pages
 * render the same control in Vietnamese by construction.
 *
 * `resolvePilotCheckoutResponse` is the pure decision so the colocated
 * test can pin every branch without a DOM.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Lock, X } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { userErrorMessage } from "@/lib/ui/user-error";
import {
  PILOT_CONTACT_FALLBACK,
  formatPilotPrice,
  formatPilotPriceLong,
  type PilotSkuId,
} from "@/lib/pricing/pilot-skus";
import { fillPilotString, type PilotUiStrings } from "@/lib/pricing/pilot-strings";
import { CTA_CLASS, FOCUS_RING, MOTION } from "@/components/marketing/template/primitives";
import { cn } from "@/lib/utils";

export interface PilotBuyButtonProps {
  sku: PilotSkuId;
  /** Server-computed `isPilotSkuConfigured(sku)`; false renders the contact link. */
  configured: boolean;
  /** Where to come back to after sign-in (the page the button sits on). */
  returnPath: string;
  /** The localised strings (`pilotUiStrings(m, locale)` on the server). */
  strings: PilotUiStrings;
  label?: string;
  variant?: "primary" | "secondary";
  ctaId?: string;
  className?: string;
}

export type PilotCheckoutNext =
  | { kind: "navigate"; href: string }
  | { kind: "login"; href: string }
  | { kind: "fallback"; href: string }
  | { kind: "error"; message: string };

/** The English fallback for a checkout failure with no message (the strings object overrides it). */
export const PILOT_CHECKOUT_ERROR_FALLBACK = "Could not start checkout — please try again.";

/** Pure: what the button does with a checkout response. */
export function resolvePilotCheckoutResponse(
  status: number,
  body: { ok?: boolean; url?: string; error?: string; fallback?: string; reason?: string; message?: string } | null,
  returnPath: string,
  genericMessage: string = PILOT_CHECKOUT_ERROR_FALLBACK,
): PilotCheckoutNext {
  if (status === 401) return { kind: "login", href: `/auth/login?next=${encodeURIComponent(returnPath)}` };
  if (status === 409 || body?.error === "sku_unconfigured") {
    return { kind: "fallback", href: body?.fallback || PILOT_CONTACT_FALLBACK };
  }
  if (body?.url) return { kind: "navigate", href: body.url };
  return { kind: "error", message: body?.message ?? body?.reason ?? body?.error ?? genericMessage };
}

export function PilotBuyButton({ sku, configured, returnPath, strings, label, variant = "primary", ctaId, className }: PilotBuyButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const panelId = React.useId();
  const price = formatPilotPrice(sku);
  const priceLong = formatPilotPriceLong(sku);
  const vars = { price, priceLong };
  const text = label ?? fillPilotString(strings.buyLabel, vars);

  if (!configured) {
    return (
      <div className={cn("flex flex-col items-start gap-2", className)}>
        <Link
          href={PILOT_CONTACT_FALLBACK}
          data-testid={`pilot-buy-${sku}`}
          data-pilot-sku={sku}
          data-pilot-mode="contact"
          data-cta-id={ctaId}
          className={cn(CTA_CLASS[variant], MOTION)}
        >
          {text}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <p className="text-xs text-muted" data-testid={`pilot-quote-${sku}`}>
          {fillPilotString(strings.quoteContact, vars)}
        </p>
      </div>
    );
  }

  async function continueToCheckout() {
    setBusy(true);
    setError(null);
    try {
      trackEvent("checkout_started", { plan: sku });
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: sku }),
      });
      let body: Parameters<typeof resolvePilotCheckoutResponse>[1] = null;
      try {
        body = (await res.json()) as typeof body;
      } catch {
        body = null;
      }
      const next = resolvePilotCheckoutResponse(res.status, body, returnPath, strings.errorGeneric);
      if (next.kind === "error") {
        setError(next.message);
        setBusy(false);
        return;
      }
      window.location.href = next.href;
      return; // keep `busy` until the navigation completes (no double POST)
    } catch (err) {
      setError(userErrorMessage(err, strings.errorNetwork));
    }
    setBusy(false);
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        data-testid={`pilot-buy-${sku}`}
        data-pilot-sku={sku}
        data-pilot-mode="checkout"
        data-cta-id={ctaId}
        className={cn(CTA_CLASS[variant], MOTION)}
      >
        <Lock aria-hidden="true" className="h-4 w-4" />
        {text}
      </button>
      <p className="text-xs text-muted" data-testid={`pilot-quote-${sku}`}>
        {fillPilotString(strings.quoteCheckout, vars)}
      </p>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={fillPilotString(strings.confirmAria, vars)}
          data-testid={`pilot-confirm-${sku}`}
          className="mt-2 w-full max-w-xl rounded-xl border border-line bg-surface p-5 shadow-2"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">{strings.confirmEyebrow}</p>
              <p className="mt-1 font-display text-lg font-semibold text-primary [overflow-wrap:anywhere]">{fillPilotString(strings.confirmTitle, vars)}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={strings.close}
              className={cn("inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-secondary hover:bg-surface-hover", MOTION, FOCUS_RING)}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-4 grid gap-2 text-sm leading-relaxed text-secondary sm:grid-cols-2">
            {strings.includes.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">{strings.confirmNote}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={continueToCheckout}
              disabled={busy}
              data-testid={`pilot-checkout-${sku}`}
              className={cn(CTA_CLASS.primary, MOTION, "disabled:cursor-not-allowed disabled:opacity-60")}
            >
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Lock aria-hidden="true" className="h-4 w-4" />}
              {fillPilotString(strings.confirmContinue, vars)}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={cn(CTA_CLASS.secondary, MOTION)}>
              {strings.confirmNotNow}
            </button>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-bear">
              {error}{" "}
              <Link href={PILOT_CONTACT_FALLBACK} className={cn("rounded-sm font-medium underline underline-offset-2", FOCUS_RING)}>
                {strings.errorContact}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
