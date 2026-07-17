"use client";

// Card-capture step for the onboarding wizard.
//
// The only Stripe package actually installed in this project is
// `@stripe/stripe-js` (see package.json) — `@stripe/react-stripe-js` is NOT
// present and adding it would violate the "no new npm deps" constraint on
// this task. So instead of `<Elements>` + `<CardElement>` from the React
// wrapper, this mounts a vanilla Stripe.js Elements `card` element directly
// via a ref, using the existing `getStripeClient()` helper
// (`@/lib/stripe-client`). Functionally equivalent for this flow.
//
// POST /api/stripe/checkout (unchanged, not owned by this task) always
// creates a Stripe Checkout Session today and returns `{ ok, url }` — it
// never returns a SetupIntent client_secret. The `client_secret` branch
// below is kept so this component degrades gracefully if/when that route
// grows a setup-intent mode, but in production the `url` branch is what
// actually fires: we redirect to Stripe-hosted Checkout, which already
// collects the card + starts the trial (trial_period_days is set server
// side). See web/src/app/api/stripe/checkout/route.ts.

import * as React from "react";
import type { Dispatch } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import type {
  Stripe,
  StripeCardElement,
  StripeElements,
} from "@stripe/stripe-js";
import { getStripeClient } from "@/lib/stripe-client";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import type { WizardAction, WizardState } from "./wizard-types";

type Mode = "loading" | "redirecting" | "card" | "error";

export function StepPayment({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const stripeRef = React.useRef<Stripe | null>(null);
  const elementsRef = React.useRef<StripeElements | null>(null);
  const cardElementRef = React.useRef<StripeCardElement | null>(null);

  const [mode, setMode] = React.useState<Mode>("loading");
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [cardReady, setCardReady] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const plan = PLANS_V2.find((p) => p.id === state.planId);

  // Kick off checkout / setup-intent creation once on mount.
  React.useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!state.planId) {
        setLocalError("No plan selected.");
        setMode("error");
        return;
      }
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: state.planId, mode: "setup_intent" }),
        });
        const data = await res.json().catch(() => ({ ok: false }));
        if (cancelled) return;

        if (data.url) {
          setMode("redirecting");
          window.location.href = data.url;
          return;
        }
        if (data.client_secret) {
          setClientSecret(data.client_secret);
          setMode("card");
          return;
        }
        setLocalError(data.reason || "Could not start checkout. Please try again.");
        setMode("error");
      } catch {
        if (!cancelled) {
          setLocalError("Network error — please try again.");
          setMode("error");
        }
      }
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [state.planId]);

  // Mount the vanilla Stripe.js card element once a client_secret is ready.
  React.useEffect(() => {
    if (mode !== "card" || !cardRef.current) return;
    let mounted = true;

    getStripeClient().then((stripe) => {
      if (!mounted || !stripe || !cardRef.current) return;
      stripeRef.current = stripe;
      const elements = stripe.elements();
      elementsRef.current = elements;
      const card = elements.create("card", {
        style: {
          base: {
            color: "#F8FAFC",
            fontSize: "15px",
            "::placeholder": { color: "#CBD5E1" },
          },
          invalid: { color: "#F87171" },
        },
      });
      card.mount(cardRef.current);
      card.on("ready", () => setCardReady(true));
      card.on("change", (event) => {
        setLocalError(event.error ? event.error.message : null);
      });
      cardElementRef.current = card;
    });

    return () => {
      mounted = false;
      cardElementRef.current?.unmount();
      cardElementRef.current = null;
    };
  }, [mode]);

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const stripe = stripeRef.current;
    const card = cardElementRef.current;
    if (!stripe || !card || !clientSecret || submitting) return;

    setSubmitting(true);
    setLocalError(null);
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card },
      });
      if (result.error) {
        setLocalError(result.error.message || "Card could not be verified.");
        setSubmitting(false);
        dispatch({ type: "SET_LOADING", loading: false });
        return;
      }

      const pm = result.setupIntent?.payment_method;
      const pmId = typeof pm === "string" ? pm : pm?.id;
      if (pmId) dispatch({ type: "SET_PAYMENT_METHOD", pmId });

      await fetch("/api/onboarding/save-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 5,
          state: { ...state, paymentMethodId: pmId, planId: state.planId },
        }),
      });

      window.location.href = "/dashboard?onboarding=complete";
    } catch {
      setLocalError("Something went wrong confirming your card. Please try again.");
      setSubmitting(false);
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">
        Add your card to start
      </h1>
      <p className="mt-2 text-brand-ink-muted">
        {plan ? `${plan.name} · ${formatAud(plan.monthly_aud)}/mo` : "Your plan"}{" "}
        — 7-day free trial starts now.
      </p>

      {(mode === "loading" || mode === "redirecting") && (
        <div className="mt-10 flex items-center gap-3 text-brand-ink-muted">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-brand-cyan" />
          {mode === "redirecting"
            ? "Redirecting to secure checkout..."
            : "Preparing secure payment..."}
        </div>
      )}

      {mode === "error" && (
        <div role="alert" className="mt-10 rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-300">
          {localError || "Something went wrong."}
        </div>
      )}

      {mode === "card" && (
        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <div className="rounded-2xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-5">
            <div ref={cardRef} className="min-h-[24px]" />
          </div>
          {localError && (
            <p role="alert" className="text-sm text-red-400">
              {localError}
            </p>
          )}
          <button
            type="submit"
            disabled={!cardReady || submitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy sm:w-auto"
          >
            {submitting ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Lock aria-hidden="true" className="h-4 w-4" />
            )}
            Start my 7-day trial
          </button>
        </form>
      )}

      <p className="mt-8 flex items-center gap-2 text-xs text-brand-ink-muted">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-brand-cyan" />
        Cancel anytime — no charge until Day 8.
      </p>
    </div>
  );
}
