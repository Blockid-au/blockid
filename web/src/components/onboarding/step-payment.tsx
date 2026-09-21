"use client";

// Review-and-pay step of the LEGACY onboarding wizard (`ONBOARDING_V4=off`
// rollback path; the v4 wizard exits to /checkout/review directly).
//
// G25-D (founder 2026-09-21): this step used to POST /api/stripe/checkout on
// mount and redirect to Stripe before the founder had read anything — the
// exact auto-redirect the founder forbade. It is now a review block (plan,
// price inc. GST with the GST share, trial terms, renewal) and ONE explicit
// button, "Add card & start N-day trial", that links to the review step
// (`/checkout/review?plan=…&origin=onboarding`) where the Pay click posts to
// the checkout route. Nothing here fetches a checkout route; the
// `origin=onboarding` flag keeps the Stripe success_url steering back to
// Step 6 ("Create your first startup").

import * as React from "react";
import type { Dispatch } from "react";
import Link from "next/link";
import { Lock, ShieldCheck } from "lucide-react";
import { checkoutReviewHref } from "@/lib/billing/checkout-review";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { formatGstInclusiveAud } from "@/lib/gst";
import { TRIAL_COPY, TRIAL_WARNING_HOURS_BEFORE } from "@/lib/plans/trial-copy";
import type { WizardAction, WizardState } from "./wizard-types";

export function StepPayment({
  state,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const plan = PLANS_V2.find((p) => p.id === state.planId);
  const isAnnual =
    state.interval === "annual" && typeof plan?.annual_aud === "number" && plan.annual_aud > 0;
  const chargeAud = plan ? (isAnnual ? plan.annual_aud : plan.monthly_aud) : null;
  const trialDays = plan?.trial_days ?? 0;
  const reviewHref = state.planId
    ? checkoutReviewHref({ plan: state.planId, interval: isAnnual ? "annual" : "monthly", trial: true, entry: "onboarding", origin: "onboarding" })
    : null;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">
        Review your order
      </h1>
      <p className="mt-2 text-brand-ink-muted">
        {plan ? `${plan.name} · ${formatAud(chargeAud)}/${isAnnual ? "yr" : "mo"}` : "Your plan"}
        {trialDays > 0 ? ` — ${trialDays}-day free trial, card required.` : ""}
      </p>

      {plan && typeof chargeAud === "number" && chargeAud > 0 ? (
        <section
          aria-label="Order summary"
          data-testid="onboarding-review"
          data-plan-id={plan.id}
          className="mt-8 space-y-2 rounded-2xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-5 text-sm text-brand-ink-muted"
        >
          {/* QA-3 P2: the amount Stripe will charge when the trial ends, GST
              shown, before any hand-off — matches the invoice tax line. */}
          <p data-testid="gst-line">
            {trialDays > 0 ? "After the trial: " : "Charged now: "}
            {formatGstInclusiveAud(Math.round(chargeAud * 100))} per {isAnnual ? "year" : "month"}, charged in AUD.
          </p>
          {trialDays > 0 ? (
            <p>
              {trialDays}-day free trial · card required · cancel before day {trialDays} and nothing is charged · then {formatAud(chargeAud)} per {isAnnual ? "year" : "month"}.
            </p>
          ) : null}
          <p>
            Renews automatically each {isAnnual ? "year" : "month"} until you cancel — self-serve from Billing or the Stripe Billing Portal. E-mail reminder {TRIAL_WARNING_HOURS_BEFORE}h before a trial converts.
          </p>
        </section>
      ) : (
        <div role="alert" className="mt-10 rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-300">
          No plan selected.
        </div>
      )}

      {reviewHref && plan ? (
        <Link
          href={reviewHref}
          data-testid="onboarding-review-continue"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy sm:w-auto"
        >
          <Lock aria-hidden="true" className="h-4 w-4" />
          {trialDays > 0 ? TRIAL_COPY.cta_card(trialDays) : `Review and pay ${formatAud(chargeAud)}`}
        </Link>
      ) : null}

      <p className="mt-8 flex items-center gap-2 text-xs text-brand-ink-muted">
        <ShieldCheck aria-hidden="true" className="h-4 w-4 text-brand-cyan" />
        Nothing is charged on this step. You read the order once more and press Pay yourself before Stripe opens.
      </p>
    </div>
  );
}
