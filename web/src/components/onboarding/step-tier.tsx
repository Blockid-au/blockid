"use client";

import type { Dispatch } from "react";
import { Check, Sparkles } from "lucide-react";
import {
  plansForSegment,
  formatAud,
  type Plan,
  type Segment as PlanSegment,
} from "@/lib/plans-v2";
import type { Segment, WizardAction, WizardState } from "./wizard-types";

/**
 * Map the wizard's 5-way segment onto the 4-way plans-v2 catalogue segment
 * ("founder" | "investor" | "advisor" | "accelerator"). Both investor
 * sub-segments read the same "investor" SKU family; which plan gets the
 * "Most popular" badge is re-derived below per sub-segment.
 */
function toPlanSegment(segment: Segment): PlanSegment {
  switch (segment) {
    case "investor_angel":
    case "investor_vc":
      return "investor";
    case "advisor":
      return "advisor";
    case "accelerator":
      return "accelerator";
    case "founder":
    default:
      return "founder";
  }
}

function plansForWizardSegment(segment: Segment): Plan[] {
  const plans = plansForSegment(toPlanSegment(segment));

  if (segment === "investor_vc") {
    // Default investor catalogue highlights Angel — VC users should see a
    // VC-sized plan highlighted instead.
    return plans.map((p) => ({
      ...p,
      most_popular: p.id === "investor_vc_small",
    }));
  }
  if (segment === "founder") {
    // Free is offered as a bottom link (see below), not a plan card.
    return plans.filter((p) => p.id !== "founder_free");
  }
  return plans;
}

export function StepTier({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const segment = state.segment ?? "founder";
  const plans = plansForWizardSegment(segment);

  function choose(planId: string) {
    dispatch({ type: "SET_PLAN", planId });
    dispatch({ type: "NEXT" });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">
        Pick your plan
      </h1>
      <p className="mt-2 text-muted">
        Every monthly plan includes a 7-day free trial. Cancel anytime before
        Day 8 — no charge. Picking a plan only moves you to the review step —
        you read the order and add your card yourself.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => choose(plan.id)}
            aria-pressed={state.planId === plan.id}
            className={`relative flex flex-col rounded-2xl border p-6 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
              plan.most_popular
                ? "border-action bg-action/5 shadow-1 ring-1 ring-action/20"
                : "border-line-subtle bg-surface hover:border-line-strong"
            }`}
          >
            {plan.most_popular && (
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-action px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-on-action">
                <Sparkles aria-hidden="true" className="h-3 w-3" />
                Most popular
              </span>
            )}
            <p className="text-sm font-semibold text-muted">
              {plan.name}
            </p>
            <p className="mt-2 text-3xl font-bold text-primary">
              {formatAud(plan.monthly_aud)}
              {plan.monthly_aud !== null && (
                <span className="text-sm font-medium text-muted">
                  /mo
                </span>
              )}
            </p>
            {plan.trial_days > 0 && (
              <span className="mt-2 inline-block w-fit rounded-full border border-line-subtle bg-action/10 px-2.5 py-0.5 text-[11px] font-semibold text-action">
                {plan.trial_days}-day free trial
              </span>
            )}
            <ul className="mt-5 space-y-2 text-sm text-muted">
              {plan.features.slice(0, 5).map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-action"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {/*
        Round 5.11 (2026-07-24): the founder "Continue with Free (no trial)"
        escape hatch is retired — every new founder signup must pick a paid
        plan and start the 7-day trial. `founder_free` remains in
        `plans-v2.ts` for grandfathered legacy accounts only. The advisor
        preview link below is kept because Advisor SKUs live in a separate
        segment and the free preview funnels them to a low-commit
        evaluation flow.
      */}

      {segment === "advisor" && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => choose("founder_free")}
            className="text-sm font-medium text-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Continue with a free preview (no trial)
          </button>
        </div>
      )}
    </div>
  );
}
