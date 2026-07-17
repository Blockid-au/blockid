"use client";

import * as React from "react";
import type { Dispatch } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { DISCLAIMER_VERSIONS } from "@/lib/legal/versions";
import type { WizardAction, WizardState } from "./wizard-types";

const TIMELINE = [
  {
    day: "Day 0",
    title: "Start free",
    desc: "No charge today. Full access unlocks immediately.",
  },
  {
    day: "Day 4",
    title: "Mid-trial email",
    desc: "We show you what you've unlocked so far.",
  },
  {
    day: "Day 6",
    title: "Reminder email",
    desc: "Cancel anytime before Day 7 to avoid any charge.",
  },
  {
    day: "Day 8",
    title: "Trial ends",
    desc: "We charge your card unless you've already cancelled.",
  },
];

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function StepTrial({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const [checked, setChecked] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [completingFree, setCompletingFree] = React.useState(false);

  const plan = PLANS_V2.find((p) => p.id === state.planId);
  const isFree = !plan || plan.monthly_aud === 0 || plan.trial_days === 0;
  const trialDays = plan?.trial_days || 7;
  // "Day 8" in the copy = trial_days + 1 (Day 0 is the start day).
  const chargeDate = formatDate(addDays(trialDays + 1));
  const priceLabel = plan ? formatAud(plan.monthly_aud) : "A$0";

  async function completeFreePlan() {
    setCompletingFree(true);
    try {
      await fetch("/api/onboarding/save-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 5,
          state: { ...state, consentGranted: true },
        }),
      });
    } catch {
      // non-blocking — resume works off localStorage regardless
    }
    window.location.href = "/dashboard?onboarding=complete";
  }

  async function handleAccept() {
    if (!checked || submitting) return;
    setSubmitting(true);
    dispatch({ type: "SET_ERROR", error: undefined });

    try {
      // NOTE: "trial_terms" is not a registered DisclaimerKind (the
      // consent_events.consent_kind CHECK constraint in migration 0076 only
      // allows tos/privacy/marketing/general_advice_warning/
      // wholesale_certification/equity_offer_disclaimer/not_financial_advice).
      // Rather than add a new disclaimer kind + migration (out of scope for
      // this UI task), we record the trial-billing acknowledgement under the
      // "tos" kind — which this exact screen's copy also serves as — and
      // capture the trial-specific context in `detail` so the consent row
      // still proves exactly what the user agreed to and when they'll be
      // charged.
      const res = await fetch("/api/legal/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "tos",
          disclaimer_version: DISCLAIMER_VERSIONS.tos,
          granted: true,
          detail: {
            context: "trial_terms",
            plan_id: state.planId ?? null,
            trial_days: trialDays,
            charge_amount_aud: plan?.monthly_aud ?? null,
            charge_date: chargeDate,
          },
        }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!res.ok || !data.ok) {
        dispatch({
          type: "SET_ERROR",
          error: data.reason || "Could not record consent. Please try again.",
        });
        setSubmitting(false);
        return;
      }
      dispatch({ type: "SET_CONSENT", granted: true });
      dispatch({ type: "NEXT" });
    } catch {
      dispatch({
        type: "SET_ERROR",
        error: "Network error — please try again.",
      });
      setSubmitting(false);
    }
  }

  if (isFree) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">
          You&apos;re all set — no card needed
        </h1>
        <p className="mt-2 text-brand-ink-muted">
          The Free plan never charges. Upgrade any time from Billing when
          you&apos;re ready for more.
        </p>

        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-cyan/10 text-brand-cyan">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-brand-ink">Free plan · A$0/mo</p>
            <p className="text-sm text-brand-ink-muted">
              No card on file, no auto-charge.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={completeFreePlan}
          disabled={completingFree}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
        >
          {completingFree && (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          )}
          Go to my dashboard
        </button>

        <p className="mt-6 text-xs text-brand-ink-muted">
          Not financial or legal advice. Auschain PTY LTD · Sydney NSW.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">
        How your 7-day trial works
      </h1>
      <p className="mt-2 text-brand-ink-muted">
        Full access to {plan?.name ?? "your plan"} starts today. We&apos;ll
        remind you before anything is charged.
      </p>

      <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-4">
        {TIMELINE.map((item, i) => (
          <li key={item.day} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full bg-brand-cyan shadow-[0_0_10px_rgba(34,211,238,0.7)] motion-safe:animate-pulse"
                style={{ animationDelay: `${i * 0.3}s` }}
                aria-hidden="true"
              />
              {i < TIMELINE.length - 1 && (
                <span
                  className="hidden h-px flex-1 bg-brand-cyan/25 sm:block"
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-cyan">
              {item.day}
            </p>
            <p className="text-sm font-semibold text-brand-ink">
              {item.title}
            </p>
            <p className="text-xs text-brand-ink-muted">{item.desc}</p>
          </li>
        ))}
      </ol>

      <label className="mt-10 flex cursor-pointer items-start gap-3 rounded-2xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-brand-ink-muted/40 text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
        />
        <span className="text-sm text-brand-ink">
          I understand my card will be charged {priceLabel} on {chargeDate}{" "}
          unless I cancel before Day 7.
        </span>
      </label>

      {state.error && (
        <p role="alert" className="mt-3 text-sm text-red-400">
          {state.error}
        </p>
      )}

      <button
        type="button"
        onClick={handleAccept}
        disabled={!checked || submitting}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
      >
        {submitting ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Check aria-hidden="true" className="h-4 w-4" />
        )}
        Agree and continue
      </button>

      <p className="mt-6 text-xs text-brand-ink-muted">
        Not financial or legal advice. Auschain PTY LTD · Sydney NSW.
      </p>
    </div>
  );
}
