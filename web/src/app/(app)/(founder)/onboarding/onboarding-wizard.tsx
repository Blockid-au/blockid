"use client";

// Main shell for the BlockID.au v2 onboarding wizard: segment -> goal ->
// tier -> trial consent -> payment -> first startup (6 steps). See
// knowledge-base/upgrade-plan-2026-07-16/cpo-spec.md §5-6. Step 6 was added
// by real-world audit #8
// (docs/plans/real-world-workflow-parity-audit-2026-07-23.md §6): activation
// lifts when the flow ends with the user's first meaningful action —
// naming what they're building — rather than a payment screen.
//
// State lives in a single useReducer (wizardReducer). On every change it is
// (a) persisted to localStorage so a refresh/bounce resumes in place, and
// (b) fire-and-forget POSTed to /api/onboarding/save-progress so a magic-link
// resume on a *different* device also works.
//
// Navbar/Footer are rendered by the server-component page (page.tsx) and
// passed in as `nav`/`footer` slots — they must live *inside* this
// component's `data-theme="lux"` wrapper (see globals.css: the dark lux
// token remap + `.lux-card` etc. selectors are all scoped to
// `[data-theme="lux"] …` descendants), but Navbar/Footer themselves are
// server components and can't be imported directly into a "use client"
// file, so they come in as children instead (see pricing/page.tsx for the
// same Navbar+Footer-inside-lux-wrapper pattern this mirrors).

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import type { AppUser } from "@/lib/auth";
import { WizardProgress } from "@/components/onboarding/wizard-progress";
import { StepSegment } from "@/components/onboarding/step-segment";
import { StepGoal } from "@/components/onboarding/step-goal";
import { StepTier } from "@/components/onboarding/step-tier";
import { StepTrial } from "@/components/onboarding/step-trial";
import { StepPayment } from "@/components/onboarding/step-payment";
import { StepFirstStartup } from "@/components/onboarding/step-first-startup";
import {
  wizardReducer,
  WIZARD_TOTAL_STEPS,
  type Segment,
  type WizardState,
} from "@/components/onboarding/wizard-types";

const STORAGE_KEY = "blockid_onboarding_v2";

const VALID_SEGMENTS: readonly Segment[] = [
  "founder",
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
];

function isValidSegment(v: string): v is Segment {
  return (VALID_SEGMENTS as readonly string[]).includes(v);
}

export interface OnboardingInitialParams {
  trial?: string;
  plan?: string;
  step?: string;
  segment?: string;
  /**
   * Reseller attribution code — mirrors the referral pattern. When present,
   * persisted into wizard state and used by StepPayment to stamp the
   * checkout session. See docs/plans/reseller-module-plan.md § C.2, § U.6.
   */
  via?: string;
}

/**
 * Lazy useReducer initializer: hydrate from localStorage (if present), then
 * let URL params override individual fields on top — covers both "resume
 * where I left off" (localStorage) and "I clicked a specific plan/segment
 * CTA" (URL) in one pass, including a magic-link resume that carries
 * `?step=n&segment=s`.
 */
function loadInitialState(initialParams: OnboardingInitialParams): WizardState {
  let state: WizardState = { step: 1 };

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<WizardState>;
        state = { ...state, ...saved, error: undefined, loading: false };
      }
    } catch {
      // Corrupt or blocked storage (private browsing quota, etc.) — start fresh.
    }
  }

  if (initialParams.plan) state.planId = initialParams.plan;
  if (initialParams.segment && isValidSegment(initialParams.segment)) {
    state.segment = initialParams.segment;
  }
  if (initialParams.step) {
    const n = Number(initialParams.step);
    if (Number.isFinite(n) && n >= 1 && n <= WIZARD_TOTAL_STEPS) {
      state.step = n as WizardState["step"];
    }
  }

  // Reseller code — accept from URL param OR from the ?via= cookie/
  // localStorage the SVI entrance already persisted. Normalise inline
  // (uppercase, strip non-alphanumeric) to keep this file client-safe.
  let viaCode: string | undefined;
  if (initialParams.via) {
    viaCode = initialParams.via.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  } else if (typeof window !== "undefined") {
    try {
      const cached = window.localStorage.getItem("blockid_via");
      if (cached) viaCode = cached.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    } catch {
      // localStorage blocked — not fatal.
    }
  }
  if (viaCode) {
    (state as WizardState & { resellerCode?: string }).resellerCode = viaCode;
  }

  return state;
}

interface OnboardingWizardProps {
  user: AppUser;
  initialParams: OnboardingInitialParams;
  nav: React.ReactNode;
  footer: React.ReactNode;
}

export function OnboardingWizard({
  user,
  initialParams,
  nav,
  footer,
}: OnboardingWizardProps) {
  const [state, dispatch] = React.useReducer(
    wizardReducer,
    initialParams,
    loadInitialState,
  );

  // Persist to localStorage + fire-and-forget server round-trip whenever
  // state changes (covers every step transition + every field the user sets).
  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be unavailable — non-fatal, resume just won't survive a
      // full browser restart on this device.
    }

    fetch("/api/onboarding/save-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: state.step, state }),
    }).catch(() => {
      // Fire-and-forget — localStorage already has the latest state.
    });
  }, [state]);

  function handleBack() {
    dispatch({ type: "BACK" });
  }

  function handleSkipTrial() {
    // "Continue without card — 14-day evaluation, read-only exports."
    // Skips straight past payment: no plan is charged, no payment method is
    // collected, and the account starts in a read-only evaluation mode.
    window.location.href = "/dashboard?onboarding=complete&mode=read_only_trial";
  }

  return (
    <div
      data-theme="lux"
      className="min-h-svh bg-brand-navy bg-lux-radial text-brand-ink"
    >
      {nav}

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-24">
        <WizardProgress step={state.step} />

        <div className="lux-card rounded-3xl p-8 sm:p-10">
          {state.step === 1 && <StepSegment dispatch={dispatch} />}
          {state.step === 2 && <StepGoal state={state} dispatch={dispatch} />}
          {state.step === 3 && <StepTier state={state} dispatch={dispatch} />}
          {state.step === 4 && <StepTrial state={state} dispatch={dispatch} />}
          {state.step === 5 && (
            <StepPayment state={state} dispatch={dispatch} />
          )}
          {state.step === 6 && (
            <StepFirstStartup state={state} dispatch={dispatch} />
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {state.step > 1 ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-brand-ink-muted transition-colors hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}

          {state.step === 4 && (
            <button
              type="button"
              onClick={handleSkipTrial}
              className="rounded-lg px-2 py-1 text-sm font-medium text-brand-ink-muted underline decoration-brand-ink-muted/40 underline-offset-4 transition-colors hover:text-brand-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Continue without card — 14-day evaluation, read-only exports
            </button>
          )}
        </div>

        <p className="mt-10 text-center text-xs text-brand-ink-muted">
          Signed in as {user.email}
        </p>
      </main>

      {footer}
    </div>
  );
}
