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
import { EVALUATOR_TRIAL_COPY, TRIAL_COPY, TRIAL_DAYS, evaluatorTrialIncludedLine } from "@/lib/plans/trial-copy";
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
}

export interface SignupFormProps {
  /** Which ladder the picker shows; drives copy + account-type options. */
  segment?: SignupSegment;
  trialPlans: SignupPlanChoice[];
  defaultPlanId: string;
  /** Account-type choices; defaults to the founder trio. */
  accountTypeOptions?: readonly AccountTypeOption[];
  stripePublishableKey: string | null;
}

// Stripe instance is memoised at module scope so re-renders don't
// re-instantiate the SDK (see Stripe docs — "call loadStripe outside of a
// component render").
let stripeSingleton: Promise<Stripe | null> | null = null;
function getStripe(pk: string): Promise<Stripe | null> {
  if (!stripeSingleton) stripeSingleton = loadStripe(pk);
  return stripeSingleton;
}

const CARD_STYLE = {
  style: {
    base: {
      color: "#F8FAFC",
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: "15px",
      "::placeholder": { color: "#64748B" },
    },
    invalid: { color: "#F87171" },
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
        className="text-red-400 text-sm p-4 border border-red-900 rounded-xl bg-red-950"
      >
        Stripe is not configured on this environment (missing
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY). Signup is temporarily disabled —
        please contact support@blockid.au.
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
    <span className="block text-xs text-slate-400 mb-1.5 font-medium">
      {children}
    </span>
  );
}

const inputClass =
  "w-full bg-[#0B1220] border border-[#1F2A44] rounded-xl px-3 py-2.5 text-slate-50 text-[15px] outline-none focus:border-blue-500 transition-colors";

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
  const [planId, setPlanId] = React.useState(props.defaultPlanId);
  const [terms, setTerms] = React.useState(false);
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
          payment_method_id: pm.paymentMethod.id,
          terms_accepted: true,
          // Task M2 — pass promo code (validated or raw) so the server
          // stamps app_users.attribution_reseller_id + refreshes cookie.
          promo_code: promoValidation?.code ?? promoCode.trim() ?? undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        const code = json?.error ?? `signup_failed_${res.status}`;
        setError(mapErrorCode(code));
        setSubmitting(false);
        return;
      }
      router.push("/dashboard?welcome=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed.");
      setSubmitting(false);
    }
  }

  const priceLine = selectedPlan
    ? TRIAL_COPY.after_trial({
        planName: selectedPlan.name,
        price: selectedPlan.priceDisplay,
        interval: "month",
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
                {p.name} — {p.priceDisplay}/mo{p.hasStripePrice ? "" : " (unavailable)"}
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
          <p className="mt-1.5 text-xs text-slate-400">Checking…</p>
        ) : promoValidation ? (
          <p className="mt-1.5 text-xs text-green-400">
            {promoValidation.code} — {promoValidation.discountPct}% off
            {promoValidation.resellerDisplayName
              ? ` from ${promoValidation.resellerDisplayName}`
              : ""}
          </p>
        ) : promoError ? (
          <p className="mt-1.5 text-xs text-red-400">{promoError}</p>
        ) : null}
      </label>
      <label className="block mb-3.5">
        {fieldLabel("Card details")}
        <div className="bg-[#0B1220] border border-[#1F2A44] rounded-xl px-3 py-3">
          <CardElement options={CARD_STYLE} />
        </div>
      </label>

      <label className="flex items-start gap-2.5 text-xs text-slate-400 mb-4">
        <input
          type="checkbox"
          checked={terms}
          onChange={(e) => setTerms(e.target.checked)}
          required
          className="mt-0.5 shrink-0"
        />
        <span>
          I accept the{" "}
          <Link href="/legal/terms" className="text-blue-400 hover:underline">terms of service</Link>
          {" "}and{" "}
          <Link href="/legal/privacy" className="text-blue-400 hover:underline">privacy policy</Link>.
        </span>
      </label>

      {error ? (
        <div
          role="alert"
          className="text-red-400 text-[13px] p-3 border border-red-900 rounded-xl mb-3.5 bg-red-950"
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
            ? "bg-[#1F2A44] text-slate-400 cursor-wait"
            : "bg-blue-600 text-[#0B1220] hover:bg-blue-500 cursor-pointer",
        ].join(" ")}
      >
        {submitting
          ? "Starting trial…"
          : isEvaluator
            ? EVALUATOR_TRIAL_COPY.cta
            : TRIAL_COPY.cta}
      </button>

      <p className="mt-3 text-xs text-slate-500 leading-relaxed">
        {isEvaluator ? EVALUATOR_TRIAL_COPY.trial_line + " " : ""}
        {TRIAL_COPY.fine_print}
        {selectedPlan ? " " + priceLine : ""}
      </p>
      {isEvaluator && selectedPlan ? (
        /* Release QA-2 F10 / S7-C — what the trial actually includes. */
        <p className="mt-1.5 text-xs text-slate-400 leading-relaxed" data-testid="evaluator-trial-included">
          {evaluatorTrialIncludedLine(selectedPlan.id, selectedPlan.name)}
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
        No indefinite free tier — every account starts with a {selectedPlan?.trialDays ?? TRIAL_DAYS}-day trial.
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
