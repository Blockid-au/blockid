// checkout-review-strings — the UI strings of the review-before-pay step
// (`/checkout/review`, `/vi/checkout/review`, the sign-up review block),
// resolved from the i18n catalogue (`checkout.review.*` in en.json / vi.json —
// `messages-parity.test.ts` pins EN ⇄ VI parity) on the SERVER and handed to
// the client component as one plain object (the `pilot-strings.ts` pattern:
// `lib/i18n/t` imports both catalogues, so a "use client" module must never
// import it).
//
// `{price}` / `{n}` / `{cadence}` / `{gst}` / `{plan}` / `{hours}` stay as
// tokens; the component substitutes them with `fillCheckoutString()` so no
// amount is ever a literal. Entity tokens (`{entityOperator}` …) are already
// resolved by `t()`.

import type { Messages } from "@/lib/i18n/t";
import { t } from "@/lib/i18n/t";
import type { CheckoutLocale } from "./checkout-review";

export interface CheckoutReviewStrings {
  locale: CheckoutLocale;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  lede: string;
  included: string;
  price: string;
  /** "{price} inc. GST" */
  priceIncGst: string;
  /** "includes {gst} GST · ATO tax invoice …" */
  gstLine: string;
  interval: string;
  intervalMonthly: string;
  intervalAnnual: string;
  intervalOnce: string;
  /** "Annual billing is not available for {plan} yet — … {price}." */
  annualFallback: string;
  trial: string;
  /** "{n}-day free trial · card required · … then {price} per {cadence}" */
  trialLine: string;
  cadenceMonth: string;
  cadenceYear: string;
  noTrial: string;
  renewal: string;
  /** "Renews automatically each {cadence} … {hours} hours …" */
  renewalLine: string;
  onceRenewalLine: string;
  seller: string;
  dataPrinciple: string;
  /** "Add card & start {n}-day free trial" */
  payTrial: string;
  /** "Pay {price} now" */
  payNow: string;
  payBusy: string;
  payHint: string;
  signedOutTrial: string;
  signedOutPay: string;
  signedOutHint: string;
  contact: string;
  contactHint: string;
  back: string;
  backCredits: string;
  backPackage: string;
  backApi: string;
  errorGeneric: string;
  errorInterval: string;
  errorUnconfigured: string;
  errorContact: string;
  errorLimited: string;
  signupBlockTitle: string;
  signupBlockHint: string;
  /** "Add card & start {n}-day trial" */
  signupBlockCta: string;
  notFinancialAdvice: string;
}

/** `{token}` substitution; unknown tokens stay visible (never vanish silently). */
export function fillCheckoutString(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/** Build the review-step strings for one catalogue (server only — see the header). */
export function checkoutReviewStrings(m: Messages, locale: CheckoutLocale = "en"): CheckoutReviewStrings {
  return {
    locale,
    metaTitle: t(m, "checkout.review.metaTitle"),
    metaDescription: t(m, "checkout.review.metaDescription"),
    eyebrow: t(m, "checkout.review.eyebrow"),
    title: t(m, "checkout.review.title"),
    lede: t(m, "checkout.review.lede"),
    included: t(m, "checkout.review.included"),
    price: t(m, "checkout.review.price"),
    priceIncGst: t(m, "checkout.review.priceIncGst"),
    gstLine: t(m, "checkout.review.gstLine"),
    interval: t(m, "checkout.review.interval"),
    intervalMonthly: t(m, "checkout.review.interval.monthly"),
    intervalAnnual: t(m, "checkout.review.interval.annual"),
    intervalOnce: t(m, "checkout.review.interval.once"),
    annualFallback: t(m, "checkout.review.annualFallback"),
    trial: t(m, "checkout.review.trial"),
    trialLine: t(m, "checkout.review.trialLine"),
    cadenceMonth: t(m, "checkout.review.cadence.month"),
    cadenceYear: t(m, "checkout.review.cadence.year"),
    noTrial: t(m, "checkout.review.noTrial"),
    renewal: t(m, "checkout.review.renewal"),
    renewalLine: t(m, "checkout.review.renewalLine"),
    onceRenewalLine: t(m, "checkout.review.onceRenewalLine"),
    seller: t(m, "checkout.review.seller"),
    // The approved data-principle sentence (founder 2026-09-10) — one key,
    // shared with /solutions/* and the TrustBand.
    dataPrinciple: t(m, "solutions.principle.data"),
    payTrial: t(m, "checkout.review.pay.trial"),
    payNow: t(m, "checkout.review.pay.now"),
    payBusy: t(m, "checkout.review.pay.busy"),
    payHint: t(m, "checkout.review.pay.hint"),
    signedOutTrial: t(m, "checkout.review.signedOut.trial"),
    signedOutPay: t(m, "checkout.review.signedOut.pay"),
    signedOutHint: t(m, "checkout.review.signedOut.hint"),
    contact: t(m, "checkout.review.contact"),
    contactHint: t(m, "checkout.review.contactHint"),
    back: t(m, "checkout.review.back"),
    backCredits: t(m, "checkout.review.back.credits"),
    backPackage: t(m, "checkout.review.back.package"),
    backApi: t(m, "checkout.review.back.api"),
    errorGeneric: t(m, "checkout.review.error.generic"),
    errorInterval: t(m, "checkout.review.error.interval"),
    errorUnconfigured: t(m, "checkout.review.error.unconfigured"),
    errorContact: t(m, "checkout.review.error.contact"),
    errorLimited: t(m, "checkout.review.error.limited"),
    signupBlockTitle: t(m, "checkout.review.signupBlock.title"),
    signupBlockHint: t(m, "checkout.review.signupBlock.hint"),
    signupBlockCta: t(m, "checkout.review.signupBlock.cta"),
    notFinancialAdvice: t(m, "checkout.review.notFinancialAdvice"),
  };
}
