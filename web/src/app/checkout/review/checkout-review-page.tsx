// /checkout/review + /vi/checkout/review — the review-before-pay step (G25-D).
//
// Founder rule 2026-09-21: nobody is sent to Stripe by clicking a plan, a
// price or "Start 7-day trial". Every buy surface links here; the visitor
// reads plan / included / price inc. GST / interval / trial / renewal /
// entity / data principle, and only the explicit Pay / Add-card button (in
// <CheckoutReviewCard>) posts to a checkout route and follows the Stripe URL.
//
// Lives OUTSIDE the `(app)` gate on purpose: a signed-out visitor sees the
// same review and the button sends them to sign-up / sign-in with `next=`
// back here — never to Stripe. Unknown plan / pack / sku → 404.
//
// Server component. One catalogue read (plans-v2), one DB read for the
// annual availability list (60 s cache), the session cookie.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutReviewCard } from "@/components/billing/checkout-review-card";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageHero } from "@/components/marketing/template";
import { getCurrentUser } from "@/lib/auth";
import {
  CHECKOUT_REVIEW_PATH,
  CHECKOUT_REVIEW_VI_PATH,
  backToPricingHref,
  parseCheckoutReviewParams,
  resolveCheckoutOrder,
  signedOutContinueHref,
  type CheckoutLocale,
  type CheckoutOrder,
} from "@/lib/billing/checkout-review";
import { checkoutReviewStrings, fillCheckoutString, type CheckoutReviewStrings } from "@/lib/billing/checkout-review-strings";
import { getMessages } from "@/lib/i18n/t";
import { annualAvailablePlanIds } from "@/lib/plans/annual-available";
import { pageMetadata } from "@/lib/seo/page-meta";
import { STARTUP_PACKAGE_PLAN_ID } from "@/lib/startup-package/price";

export type SearchParams = Record<string, string | string[] | undefined>;

export async function checkoutReviewMetadata(locale: CheckoutLocale): Promise<Metadata> {
  const s = checkoutReviewStrings(await getMessages(locale), locale);
  return pageMetadata({
    title: s.metaTitle,
    description: s.metaDescription,
    path: locale === "vi" ? CHECKOUT_REVIEW_VI_PATH : CHECKOUT_REVIEW_PATH,
    viPath: CHECKOUT_REVIEW_VI_PATH,
    lang: locale,
    // A per-order page with query params — never in the index.
    index: false,
  });
}

/** Pure: the back-link label for an order (pinned by the page test). */
export function backLabelFor(order: CheckoutOrder, s: CheckoutReviewStrings): string {
  if (order.kind === "pack") return s.backCredits;
  if (order.kind === "sku") return order.id === STARTUP_PACKAGE_PLAN_ID ? s.backPackage : s.backApi;
  return s.back;
}

export async function CheckoutReviewPage({ searchParams, locale }: { searchParams: Promise<SearchParams>; locale: CheckoutLocale }) {
  const sp = await searchParams;
  const req = parseCheckoutReviewParams(sp);
  if (!req) notFound();

  const [annualAvailable, user, m] = await Promise.all([annualAvailablePlanIds(), getCurrentUser(), getMessages(locale)]);
  const order = resolveCheckoutOrder(req, { annualAvailable });
  if (!order) notFound();

  const s = checkoutReviewStrings(m, locale);
  // `seller` already carries the entity tokens resolved by t(); only the
  // placeholder-free line is passed across the boundary.
  const sellerLine = fillCheckoutString(s.seller, {});

  return (
    <MarketingShell>
      <PageHero eyebrow={s.eyebrow} title={s.title} sub={s.lede} align="center" />
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6" aria-label={s.title}>
        <CheckoutReviewCard
          order={order}
          strings={s}
          userId={user?.id ?? null}
          signedOutHref={signedOutContinueHref(order, locale)}
          backHref={backToPricingHref(order, locale)}
          backLabel={backLabelFor(order, s)}
          contactHref={`/contact?plan=${encodeURIComponent(order.id)}`}
          sellerLine={sellerLine}
        />
      </section>
    </MarketingShell>
  );
}
