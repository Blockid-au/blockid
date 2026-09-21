"use client";

// <CheckoutReviewCard> — the review-before-pay step (G25-D).
//
// The ONE component allowed to post to a checkout route from a click
// (`lib/billing/checkout-entry.guard.test.ts`). Everything it shows comes from
// the server-resolved `order` (catalogue facts) and `strings` (locale
// catalogue); it never computes a price. Signed-in: the primary button posts
// `order.postBody` to `order.postPath` ONCE, emits `checkout_started`, and
// only then follows the Stripe URL. Signed-out: the primary button is a plain
// link to sign-up / sign-in with `next=` back here — never to Stripe.
//
// `checkout_review_viewed` fires once on mount (anonymous allowed, with a
// per-tab session id) so /admin/funnel can report review → pay.

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock, ShieldCheck } from "lucide-react";
import { anonSessionId, emitClientEvent } from "@/lib/analytics/client-emit";
import type { CheckoutOrder } from "@/lib/billing/checkout-review";
import { fillCheckoutString, type CheckoutReviewStrings } from "@/lib/billing/checkout-review-strings";
import { TRIAL_WARNING_HOURS_BEFORE } from "@/lib/plans/trial-copy";

export interface CheckoutReviewCardProps {
  order: CheckoutOrder;
  strings: CheckoutReviewStrings;
  /** `null` = signed out; the button then links to `signedOutHref`. */
  userId: string | null;
  signedOutHref: string;
  backHref: string;
  backLabel: string;
  /** Contact-sales fallback for custom-priced rungs. */
  contactHref: string;
  /** The "Sold by …" seller line — resolved on the server from LEGAL_ENTITY (never a literal here). */
  sellerLine: string;
}

interface CheckoutResponse {
  ok?: boolean;
  url?: string;
  error?: string;
  reason?: string;
  fallback?: string;
  contactUrl?: string;
  method?: string;
}

/** "A$29" / "A$1,490" / "A$0.50" from cents. */
export function audLabel(cents: number): string {
  const whole = cents % 100 === 0;
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** Pure: the primary button label for an order (pinned by the page test). */
export function primaryLabel(order: CheckoutOrder, strings: CheckoutReviewStrings, signedIn: boolean): string {
  if (order.contactOnly) return strings.contact;
  if (!signedIn) return order.trialDays > 0 ? strings.signedOutTrial : strings.signedOutPay;
  if (order.trialDays > 0) return fillCheckoutString(strings.payTrial, { n: order.trialDays });
  return fillCheckoutString(strings.payNow, { price: audLabel(order.amountCents) });
}

/** Pure: the human error for a checkout-route answer (never the raw server text). */
export function errorFor(status: number, body: CheckoutResponse | null, strings: CheckoutReviewStrings): string {
  const code = body?.error ?? "";
  if (status === 429) return strings.errorLimited;
  if (code === "interval_unavailable") return strings.errorInterval;
  if (code === "contact_sales") return strings.errorContact;
  if (code === "sku_unconfigured" || code === "plan_not_provisioned" || code === "coupon_unconfigured") return strings.errorUnconfigured;
  return strings.errorGeneric;
}

const CARD = "rounded-2xl border border-line-subtle bg-surface-raised shadow-sm";
const ROW_LABEL = "text-xs font-semibold uppercase tracking-wide text-tertiary";

export function CheckoutReviewCard({ order, strings, userId, signedOutHref, backHref, backLabel, contactHref, sellerLine }: CheckoutReviewCardProps) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fallbackHref, setFallbackHref] = React.useState<string | null>(null);
  const postedRef = React.useRef(false);
  const signedIn = userId !== null;

  const eventParams = React.useMemo(
    () => ({ plan: order.id, kind: order.kind, interval: order.interval, trial: order.trialDays > 0, entry: order.entry, amount_cents: order.amountCents }),
    [order.id, order.kind, order.interval, order.trialDays, order.entry, order.amountCents],
  );

  // Once per mount: the review rendered. emitClientEvent pushes the GA4
  // dataLayer twin itself, so no separate trackEvent (one event, not two).
  React.useEffect(() => {
    void emitClientEvent("checkout_review_viewed", eventParams, { sessionId: signedIn ? null : anonSessionId() });
  }, [eventParams, signedIn]);

  const priceLabel = audLabel(order.amountCents);
  const cadence = order.interval === "annual" ? strings.cadenceYear : strings.cadenceMonth;
  const intervalLine =
    order.interval === "once"
      ? strings.intervalOnce
      : fillCheckoutString(order.interval === "annual" ? strings.intervalAnnual : strings.intervalMonthly, { price: priceLabel });
  const label = primaryLabel(order, strings, signedIn);

  async function onPay() {
    if (busy || postedRef.current || !signedIn) return;
    postedRef.current = true;
    setBusy(true);
    setError(null);
    setFallbackHref(null);
    // The Pay click is the ONLY Stripe hand-off — record it before the POST
    // (keepalive survives the navigation away).
    void emitClientEvent("checkout_started", eventParams);
    let handedOff = false;
    try {
      const res = await fetch(order.postPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order.postBody),
      });
      if (res.status === 401) {
        handedOff = true;
        window.location.assign(signedOutHref);
        return;
      }
      const body = (await res.json().catch(() => null)) as CheckoutResponse | null;
      if (res.ok && body?.ok && typeof body.url === "string" && body.url.startsWith("https://")) {
        handedOff = true;
        window.location.assign(body.url);
        return;
      }
      if (res.ok && body?.ok && body.method === "direct") {
        // Dev fallback on /api/credits (no Stripe): credits granted in place.
        handedOff = true;
        window.location.assign(backHref);
        return;
      }
      setError(errorFor(res.status, body, strings));
      const fb = body?.contactUrl ?? body?.fallback;
      if (typeof fb === "string" && fb.startsWith("/")) setFallbackHref(fb);
    } catch {
      setError(strings.errorGeneric);
    } finally {
      // Stay busy while the browser leaves for Stripe — a second click must
      // never mint a second session. Only an error re-enables the button.
      if (!handedOff) {
        postedRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl" data-testid="checkout-review" data-order-id={order.id} data-order-kind={order.kind} data-interval={order.interval} data-trial-days={order.trialDays} data-entry={order.entry} data-signed-in={signedIn ? "1" : "0"}>
      <section className={`${CARD} p-6 sm:p-8`} aria-labelledby="checkout-review-order">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-5">
          <div>
            <p className={ROW_LABEL}>{strings.eyebrow}</p>
            <h2 id="checkout-review-order" className="mt-1 text-2xl font-semibold text-primary" data-testid="checkout-review-name">
              {order.name}
            </h2>
            {order.tagline ? <p className="mt-1 text-sm text-secondary">{order.tagline}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold tabular-nums text-primary" data-testid="checkout-review-price">
              {order.contactOnly ? strings.contact : fillCheckoutString(strings.priceIncGst, { price: priceLabel })}
            </p>
            {!order.contactOnly ? (
              <p className="mt-1 text-xs text-tertiary" data-testid="gst-line">
                {fillCheckoutString(strings.gstLine, { gst: audLabel(order.gstCents) })}
              </p>
            ) : null}
          </div>
        </header>

        <dl className="mt-5 space-y-5">
          {order.included.length > 0 ? (
            <div>
              <dt className={ROW_LABEL}>{strings.included}</dt>
              <dd className="mt-2">
                <ul className="space-y-2 text-sm text-secondary" data-testid="checkout-review-included">
                  {order.included.map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-action" strokeWidth={1.75} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}

          {!order.contactOnly ? (
            <div>
              <dt className={ROW_LABEL}>{strings.interval}</dt>
              <dd className="mt-1 text-sm text-primary" data-testid="checkout-review-interval">
                {intervalLine}
                {order.annualFallback ? (
                  <span className="mt-1 block text-xs text-secondary" data-testid="annual-fallback-note">
                    {fillCheckoutString(strings.annualFallback, { plan: order.name, price: `${priceLabel}/${strings.cadenceMonth}` })}
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}

          {!order.contactOnly ? (
            <div>
              <dt className={ROW_LABEL}>{strings.trial}</dt>
              <dd className="mt-1 text-sm text-primary" data-testid="checkout-review-trial">
                {order.trialDays > 0
                  ? fillCheckoutString(strings.trialLine, { n: order.trialDays, price: priceLabel, cadence })
                  : strings.noTrial}
              </dd>
            </div>
          ) : null}

          {!order.contactOnly ? (
            <div>
              <dt className={ROW_LABEL}>{strings.renewal}</dt>
              <dd className="mt-1 text-sm text-secondary" data-testid="checkout-review-renewal">
                {order.interval === "once"
                  ? strings.onceRenewalLine
                  : fillCheckoutString(strings.renewalLine, { cadence, hours: TRIAL_WARNING_HOURS_BEFORE })}
              </dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-6 border-t border-line-subtle pt-4 text-xs text-tertiary" data-testid="checkout-review-seller">
          {sellerLine}
        </p>
        <p className="mt-2 text-xs text-tertiary" data-testid="checkout-review-data-principle">
          {strings.dataPrinciple}
        </p>
        <p className="mt-2 text-xs text-tertiary">{strings.notFinancialAdvice}</p>
      </section>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={backHref} className="text-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline" data-testid="checkout-review-back">
          ← {backLabel}
        </Link>

        {order.contactOnly ? (
          <Link
            href={contactHref}
            data-testid="checkout-review-contact"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-action px-5 py-2.5 text-sm font-semibold text-action hover:bg-action hover:text-on-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            {label}
          </Link>
        ) : signedIn ? (
          <button
            type="button"
            onClick={() => void onPay()}
            disabled={busy}
            data-testid="checkout-review-pay"
            data-post-path={order.postPath}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-6 py-2.5 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover disabled:cursor-wait disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Lock aria-hidden="true" className="h-4 w-4" />}
            {busy ? strings.payBusy : label}
          </button>
        ) : (
          <Link
            href={signedOutHref}
            data-testid="checkout-review-continue"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-6 py-2.5 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2"
          >
            <Lock aria-hidden="true" className="h-4 w-4" />
            {label}
          </Link>
        )}
      </div>

      <p className="mt-3 flex items-start gap-2 text-xs text-tertiary sm:justify-end" data-testid="checkout-review-hint">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-action" />
        <span>{order.contactOnly ? strings.contactHint : signedIn ? strings.payHint : strings.signedOutHint}</span>
      </p>

      {error ? (
        <div role="alert" className="mt-4 rounded-xl border border-bear/30 bg-bear/5 px-4 py-3 text-sm text-bear" data-testid="checkout-review-error">
          {error}
          {fallbackHref ? (
            <>
              {" "}
              <Link href={fallbackHref} className="font-semibold underline underline-offset-2">
                {strings.contact}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
