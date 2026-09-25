"use client";

// Card-required signup form — Stripe Elements + POST /api/auth/register-with-card.
//
// Rendered inside a Server Component (`./page.tsx`) that pre-resolves the
// trial plans for the segment (founder or evaluator) so the picker never
// blocks on a fetch. The account-type selector is segment-specific: the
// evaluator variant offers Investor / Accelerator or incubator / Advisor or
// consulting firm / Service provider (T0269).

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import type { BillingInterval } from "@/lib/plans/billing-interval";
import { fillCheckoutString } from "@/lib/billing/checkout-review-strings";
import { calculateGst } from "@/lib/gst";
import { MARKETING_CONSENT_LABEL } from "@/lib/email/marketing-consent-copy";
import { EVALUATOR_TRIAL_COPY, TRIAL_COPY, TRIAL_DAYS, TRIAL_WARNING_HOURS_BEFORE, evaluatorTrialIncludedLine, evaluatorTrialLine } from "@/lib/plans/trial-copy";
import {
  FOUNDER_ACCOUNT_TYPE_OPTIONS,
  type AccountTypeOption,
  type SignupSegment,
} from "@/lib/plans/signup-plans";

export interface SignupPlanChoice {
  id: string;
  name: string;
  priceCents: number;
  priceDisplay: string;
  trialDays: number;
  hasStripePrice: boolean;
  /** Yearly figures — only offered when `hasAnnualPrice` (plan row has a Stripe annual Price). */
  annualPriceCents?: number;
  annualPriceDisplay?: string;
  hasAnnualPrice?: boolean;
}

/**
 * G25-D: the Review block the card form sits under — the same catalogue
 * strings `/checkout/review` renders, resolved on the server (page.tsx).
 * `{price}` / `{n}` / `{cadence}` / `{gst}` / `{hours}` are filled here per
 * selected plan.
 */
export interface SignupReviewStrings {
  title: string;
  hint: string;
  gstLine: string;
  trialLine: string;
  renewalLine: string;
  cadenceMonth: string;
  cadenceYear: string;
  dataPrinciple: string;
  sellerLine: string;
}

export interface SignupFormProps {
  /** Which ladder the picker shows; drives copy + account-type options. */
  segment?: SignupSegment;
  trialPlans: SignupPlanChoice[];
  defaultPlanId: string;
  /** Requested cadence from `?interval=`; per-plan fallback to monthly when no annual SKU. */
  interval?: BillingInterval;
  /** Account-type choices; defaults to the founder trio. */
  accountTypeOptions?: readonly AccountTypeOption[];
  stripePublishableKey: string | null;
  /** G25-D review block strings; omitted → the block is not rendered (tests). */
  review?: SignupReviewStrings;
}

// Stripe instance is memoised at module scope so re-renders don't
// re-instantiate the SDK (see Stripe docs — "call loadStripe outside of a
// component render").
let stripeSingleton: Promise<Stripe | null> | null = null;
function getStripe(pk: string): Promise<Stripe | null> {
  if (!stripeSingleton) stripeSingleton = loadStripe(pk);
  return stripeSingleton;
}

/** Accessible name for Stripe frames that arrive without one (Link button). */
export const STRIPE_FRAME_TITLE = "Secure card payment input (Stripe)";

// Stripe Elements renders inside an iframe, so it cannot read our CSS tokens —
// these literals mirror --ds-ink / --ds-ink-tertiary / --ds-danger (G26 light).
const CARD_STYLE = {
  style: {
    base: {
      color: "#0b0f1a",
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: "15px",
      "::placeholder": { color: "#6b7280" },
    },
    invalid: { color: "#b91c1c" },
  },
};

export function SignupForm(props: SignupFormProps) {
  // Hook first, early return second. useMemo used to sit below the guard, so
  // the hook was skipped on the "no key" branch — a rules-of-hooks violation
  // that is stable only for as long as the prop never changes between renders.
  const stripePromise = React.useMemo(
    () => (props.stripePublishableKey ? getStripe(props.stripePublishableKey) : null),
    [props.stripePublishableKey],
  );
  if (!props.stripePublishableKey || !stripePromise) {
    return (
      <div
        role="alert"
        className="text-bear text-sm p-4 border border-red-200 rounded-xl bg-red-50"
      >
        Stripe is not configured on this environment (missing
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). Signup is temporarily disabled —
        please contact admin@blockid.au.
      </div>
    );
  }
  return (
    <Elements stripe={stripePromise}>
      <InnerForm {...props} />
    </Elements>
  );
}

function fieldLabel(children: React.ReactNode): React.ReactElement {
  return (
    <span className="block text-xs text-muted mb-1.5 font-medium">
      {children}
    </span>
  );
}

const inputClass =
  "w-full min-h-11 bg-surface border border-line rounded-xl px-3 py-2.5 text-primary text-[15px] outline-none focus:border-action focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1 transition-colors";

interface PromoValidation {
  code: string;
  discountPct: number;
  resellerSlug: string | null;
  resellerDisplayName: string | null;
}

function readViaCookie(): string {
  if (typeof document === "undefined") return "";
  for (const raw of document.cookie.split(";")) {
    const [k, v] = raw.trim().split("=");
    if (k === "blockid_via" && v) {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return "";
}

function InnerForm(props: SignupFormProps) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();

  const segment: SignupSegment = props.segment ?? "founder";
  const isEvaluator = segment === "evaluator";
  const accountTypeOptions =
    props.accountTypeOptions && props.accountTypeOptions.length > 0
      ? props.accountTypeOptions
      : FOUNDER_ACCOUNT_TYPE_OPTIONS;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  // First option of the segment's list — "founder" or "investor".
  const [accountType, setAccountType] = React.useState<string>(
    accountTypeOptions[0]?.value ?? "founder",
  );
  // Never start on (or submit) a plan without a Stripe price: the option is
  // disabled but a disabled *selected* option still submits its value →
  // register-with-card 500 `plan_not_provisioned` (W4 review P1).
  const firstAvailable = props.trialPlans.find((p) => p.hasStripePrice)?.id ?? props.defaultPlanId;
  const defaultAvailable = props.trialPlans.find((p) => p.id === props.defaultPlanId)?.hasStripePrice ? props.defaultPlanId : firstAvailable;
  const [planId, setPlanId] = React.useState(defaultAvailable);
  const [terms, setTerms] = React.useState(false);
  const [marketingConsent, setMarketingConsent] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Task M2 — promo code capture. Auto-fills from the blockid_via cookie
  // (set by ResellerRefCapture on inbound ?ref=CODE links); founder can
  // still overwrite manually. We validate on blur so they see inline
  // confirmation before submitting the form.
  const [promoCode, setPromoCode] = React.useState("");
  const [promoValidation, setPromoValidation] =
    React.useState<PromoValidation | null>(null);
  const [promoError, setPromoError] = React.useState<string | null>(null);
  const [promoValidating, setPromoValidating] = React.useState(false);

  // Release QA-1 #6: Stripe's Link button frame
  // (`elements-inner-link-button-for-card…`, name="cardButton…") is injected
  // without a `title`, which WCAG 2.4.1 / pa11y H64.1 flags on the
  // card-required trial form. The main card input frame is titled by
  // Stripe; only the untitled ones get a name here. Attributes on the
  // <iframe> element are ours to set even though the document is
  // cross-origin.
  const cardWrapRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const root = cardWrapRef.current;
    if (!root || typeof MutationObserver === "undefined") return;
    const titleFrames = () => {
      for (const frame of Array.from(root.querySelectorAll("iframe"))) {
        if (!frame.getAttribute("title")) frame.setAttribute("title", STRIPE_FRAME_TITLE);
      }
    };
    titleFrames();
    const obs = new MutationObserver(titleFrames);
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  // Hydrate promo code from cookie on mount + revalidate once. Must run
  // post-mount (not as a lazy initialiser) so the SSR markup and the first
  // client render agree on an empty input.
  React.useEffect(() => {
    const cached = readViaCookie();
    if (cached && !promoCode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser cookie after mount (SSR-safe)
      setPromoCode(cached);
      void runPromoValidate(cached);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPromoValidate(raw: string) {
    const code = raw.trim();
    if (!code) {
      setPromoValidation(null);
      setPromoError(null);
      return;
    }
    setPromoValidating(true);
    setPromoError(null);
    try {
      const res = await fetch("/api/reseller/validate-promo-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = (await res.json().catch(() => null)) as
        | (PromoValidation & { ok: true })
        | { ok: false; reason?: string }
        | null;
      if (json && "ok" in json && json.ok) {
        setPromoValidation({
          code: json.code,
          discountPct: json.discountPct,
          resellerSlug: json.resellerSlug,
          resellerDisplayName: json.resellerDisplayName,
        });
        setPromoError(null);
      } else {
        setPromoValidation(null);
        setPromoError("Unknown code");
      }
    } catch {
      setPromoValidation(null);
      setPromoError("Could not verify code — you can still continue.");
    } finally {
      setPromoValidating(false);
    }
  }

  const selectedPlan =
    props.trialPlans.find((p) => p.id === planId) ?? props.trialPlans[0];
  // The cadence this plan will actually be billed at. Annual only when the
  // rung has an annual Stripe Price — otherwise monthly, and the copy says so.
  const effectiveInterval: BillingInterval =
    props.interval === "annual" && selectedPlan?.hasAnnualPrice ? "annual" : "monthly";
  const annualFallback = props.interval === "annual" && effectiveInterval === "monthly";

  async function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    if (!stripe || !elements) {
      setError("Payment library still loading — please retry in a moment.");
      return;
    }
    if (!terms) {
      setError("Please accept the terms of service to continue.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setError("Card details are required.");
      return;
    }

    setSubmitting(true);
    try {
      const pm = await stripe.createPaymentMethod({
        type: "card",
        card: cardElement,
        billing_details: {
          email: email.trim().toLowerCase(),
          name: displayName.trim() || undefined,
        },
      });
      if (pm.error || !pm.paymentMethod) {
        setError(pm.error?.message ?? "Card was declined.");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/auth/register-with-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          display_name: displayName.trim() || undefined,
          account_type: accountType,
          plan_id: planId,
          interval: effectiveInterval,
          payment_method_id: pm.paymentMethod.id,
          terms_accepted: true,
          marketing_consent: marketingConsent,
          // Task M2 — pass promo code (validated or raw) so the server
          // stamps app_users.attribution_reseller_id + refreshes cookie.
          promo_code: promoValidation?.code ?? promoCode.trim() ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; redirect?: string }
        | null;
      if (!res.ok || !json?.ok) {
        const code = json?.error ?? `signup_failed_${res.status}`;
        setError(mapErrorCode(code));
        setSubmitting(false);
        return;
      }
      // S-IA4: the server resolves the landing through PERSONAS (the single
      // /onboarding wizard for a fresh account); /dashboard stays the fallback.
      const target = json.redirect && json.redirect.startsWith("/") && !json.redirect.startsWith("//") ? json.redirect : "/dashboard";
      router.push(`${target}${target.includes("?") ? "&" : "?"}welcome=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
      setSubmitting(false);
    }
  }

  // G25-D: the Review block above the card field.
  const reviewCents = selectedPlan
    ? effectiveInterval === "annual"
      ? (selectedPlan.annualPriceCents ?? selectedPlan.priceCents)
      : selectedPlan.priceCents
    : 0;
  const reviewPrice =
    selectedPlan && effectiveInterval === "annual"
      ? (selectedPlan.annualPriceDisplay ?? selectedPlan.priceDisplay)
      : (selectedPlan?.priceDisplay ?? "");
  const reviewCadence = effectiveInterval === "annual" ? (props.review?.cadenceYear ?? "year") : (props.review?.cadenceMonth ?? "month");
  const reviewGst = calculateGst(reviewCents, true, "AU").gst_cents;
  const reviewGstLabel = `A$${(reviewGst / 100).toFixed(reviewGst % 100 === 0 ? 0 : 2)}`;

  const priceLine = selectedPlan
    ? TRIAL_COPY.after_trial({
        planName: selectedPlan.name,
        price:
          effectiveInterval === "annual"
            ? (selectedPlan.annualPriceDisplay ?? selectedPlan.priceDisplay)
            : selectedPlan.priceDisplay,
        interval: effectiveInterval === "annual" ? "year" : "month",
        trialDays: selectedPlan.trialDays,
      })
    : "";

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label className="block mb-3.5">
        {fieldLabel("Email")}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className={inputClass}
        />
      </label>
      <label className="block mb-3.5">
        {fieldLabel("Password (min 8 characters)")}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </label>
      <label className="block mb-3.5">
        {fieldLabel("Display name (optional)")}
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          maxLength={100}
          className={inputClass}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 mb-3.5">
        <label>
          {fieldLabel(isEvaluator ? EVALUATOR_TRIAL_COPY.account_type_label : "Account type")}
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            className={inputClass}
            data-testid="signup-account-type"
          >
            {accountTypeOptions.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label>
          {fieldLabel("Plan")}
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className={inputClass}
          >
            {props.trialPlans.map((p) => (
              <option key={p.id} value={p.id} disabled={!p.hasStripePrice}>
                {p.name} —{" "}
                {props.interval === "annual" && p.hasAnnualPrice
                  ? `${p.annualPriceDisplay}/yr`
                  : `${p.priceDisplay}/mo`}
                {p.hasStripePrice ? "" : " (unavailable)"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block mb-3.5">
        {fieldLabel("Promotion code (optional)")}
        <input
          type="text"
          value={promoCode}
          onChange={(e) => {
            setPromoCode(e.target.value);
            // Clear stale validation state on edit.
            if (promoValidation || promoError) {
              setPromoValidation(null);
              setPromoError(null);
            }
          }}
          onBlur={(e) => void runPromoValidate(e.target.value)}
          autoComplete="off"
          maxLength={32}
          placeholder="e.g. IFV20"
          className={inputClass}
        />
        {promoValidating ? (
          <p className="mt-1.5 text-xs text-muted">Checking…</p>
        ) : promoValidation ? (
          <p className="mt-1.5 text-xs text-bull">
            {promoValidation.code} — {promoValidation.discountPct}% off
            {promoValidation.resellerDisplayName
              ? ` from ${promoValidation.resellerDisplayName}`
              : ""}
          </p>
        ) : promoError ? (
          <p className="mt-1.5 text-xs text-bear">{promoError}</p>
        ) : null}
      </label>
      {props.review && selectedPlan ? (
        /* G25-D (founder 2026-09-21): the card form sits under an explicit
           Review block — what is bought, the price inc. GST with the GST
           share, the trial terms, renewal / cancellation, the seller of
           record and the data principle — and the submit button names the
           card step. No auto-submit, nothing posted before the click. */
        <section
          aria-labelledby="signup-review-title"
          data-testid="signup-review"
          data-plan-id={selectedPlan.id}
          data-interval={effectiveInterval}
          data-trial-days={selectedPlan.trialDays}
          className="mb-3.5 rounded-xl border border-line bg-surface-sunken px-4 py-3.5"
        >
          <p id="signup-review-title" className="text-xs font-semibold uppercase tracking-wide text-muted">
            {props.review.title}
          </p>
          <p className="mt-1.5 flex items-baseline justify-between gap-3 text-primary">
            <span className="text-[15px] font-semibold" data-testid="signup-review-name">{selectedPlan.name}</span>
            <span className="text-[15px] font-semibold tabular-nums" data-testid="signup-review-price">
              {reviewPrice}/{effectiveInterval === "annual" ? "yr" : "mo"} inc. GST
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted" data-testid="gst-line">
            {fillCheckoutString(props.review.gstLine, { gst: reviewGstLabel })}
          </p>
          <p className="mt-2 text-xs text-secondary" data-testid="signup-review-trial">
            {fillCheckoutString(props.review.trialLine, { n: selectedPlan.trialDays, price: reviewPrice, cadence: reviewCadence })}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted" data-testid="signup-review-renewal">
            {fillCheckoutString(props.review.renewalLine, { cadence: reviewCadence, hours: TRIAL_WARNING_HOURS_BEFORE })}
          </p>
          <p className="mt-1.5 text-[11px] text-muted" data-testid="signup-review-seller">{props.review.sellerLine}</p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted" data-testid="signup-review-data-principle">{props.review.dataPrinciple}</p>
          <p className="mt-2 text-[11px] text-muted">{props.review.hint}</p>
        </section>
      ) : null}

      <label className="block mb-3.5">
        {fieldLabel("Card details")}
        <div ref={cardWrapRef} className="bg-surface border border-line rounded-xl px-3 py-3" data-testid="signup-card-field">
          <CardElement options={CARD_STYLE} />
        </div>
      </label>

      <label className="flex items-start gap-2.5 text-xs text-muted mb-4">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          required
          className="mt-0.5 shrink-0"
        />
        <span>
          I accept the{" "}
          <Link href="/legal/terms" className="text-action hover:underline">terms of service</Link>
          {" "}and{" "}
          <Link href="/legal/privacy" className="text-action hover:underline">privacy policy</Link>.
        </span>
      </label>

      {/* G34-BT2 EM05 (D24-e): marketing consent — separate from the terms,
          never pre-ticked, never required. */}
      <label className="flex items-start gap-2.5 text-xs text-muted mb-4">
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(e) => setMarketingConsent(e.target.checked)}
          className="mt-0.5 shrink-0"
          data-testid="signup-marketing-consent"
        />
        <span>{MARKETING_CONSENT_LABEL}</span>
      </label>

      {error ? (
        <div
          role="alert"
          className="text-bear text-[13px] p-3 border border-red-200 rounded-xl mb-3.5 bg-red-50"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !stripe}
        className={[
          "w-full font-semibold px-4 py-3 rounded-xl border-0 text-[15px] transition-colors",
          submitting
            ? "bg-surface-hover text-muted cursor-wait"
            : "bg-action text-on-action hover:bg-action-hover cursor-pointer",
        ].join(" ")}
      >
        {/* G25-D: the button names the card step — "Add card & start N-day trial". */}
        {submitting ? "Starting trial…" : TRIAL_COPY.cta_card(selectedPlan?.trialDays)}
      </button>

      <p className="mt-3 text-xs text-muted leading-relaxed" data-testid="signup-trial-terms">
        {isEvaluator ? evaluatorTrialLine(selectedPlan?.trialDays) + " " : ""}
        {TRIAL_COPY.fine_print}
        {selectedPlan ? " " + priceLine : ""}
      </p>
      {annualFallback ? (
        <p className="mt-1.5 text-xs text-warn leading-relaxed" data-testid="annual-fallback-note">
          Annual billing is not available for {selectedPlan?.name ?? "this plan"} yet — you will be billed monthly at {selectedPlan?.priceDisplay}/mo.
        </p>
      ) : null}
      {isEvaluator && selectedPlan ? (
        /* Release QA-2 F10 / S7-C — what the trial actually includes. */
        <p className="mt-1.5 text-xs text-muted leading-relaxed" data-testid="evaluator-trial-included">
          {evaluatorTrialIncludedLine(selectedPlan.id, selectedPlan.name)}
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-muted leading-relaxed">
        Paid plans start with a {selectedPlan?.trialDays ?? TRIAL_DAYS}-day trial. Prefer no card? A free account (no expiry) is available from the sign-in page.
      </p>
    </form>
  );
}

function mapErrorCode(code: string): string {
  switch (code) {
    case "payment_method_required":
      return "Card details are required to start your trial.";
    case "terms_required":
      return "Please accept the terms of service to continue.";
    case "email_taken":
      return "An account with this email already exists — try signing in instead.";
    case "invalid_email":
      return "That email address doesn't look valid.";
    case "rate_limited":
      return "Too many signup attempts — please try again in a few minutes.";
    case "plan_not_provisioned":
      return "This plan is not yet available for signup — please pick another or contact support.";
    case "stripe_customer_failed":
    case "stripe_subscription_failed":
      return "We couldn't reach Stripe — please retry, or contact support if this persists.";
    case "unsupported_plan":
      return "That plan can't be selected from signup — please pick a founder or evaluator plan.";
    default:
      return "Signup failed. Please check your details and retry.";
  }
}
