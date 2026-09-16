"use client";

// Single onboarding wizard — G13-W4-IA4 (spec §B.3): ONE /onboarding,
// three steps, two flows.
//
//   1 Who are you            persona pick → app_users.account_type
//   2 Your startup | mandate  POST /api/projects | PUT /api/investor/mandates
//   3 First value            → /analyze | /workspace/evaluations?add=1
//
// Replaces the 6-step wizard (segment → goal → tier → trial → payment →
// first startup; kept as onboarding-wizard.legacy.tsx behind
// `ONBOARDING_V4=off`) AND the 3-step WelcomeWizard that lived at
// /dashboard/onboarding. Pricing / trial / payment steps are gone — value
// first, paywall after; a pricing-card `?plan=&interval=` still exits to
// Billing with the cadence intact (`ebba4641d`).
//
// State: one reducer (components/onboarding/wizard-v4.ts), persisted to
// localStorage + fire-and-forget POST /api/onboarding/save-progress (which
// also writes account_type from `persona`) so a magic-link resume on
// another device lands on the same step. Navbar / Footer arrive as slots
// from the server page (they must sit inside the `data-theme="lux"` wrapper
// and cannot be imported into a client file — see the legacy shell).

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import type { AppUser } from "@/lib/auth";
import { trackEvent } from "@/lib/analytics";
import { flowForPersona, type WizardPersona, type WizardStep } from "@/lib/onboarding/flow";
import { WizardRail } from "@/components/onboarding/wizard-rail";
import { StepPersona } from "@/components/onboarding/step-persona";
import { StepStartup } from "@/components/onboarding/step-startup";
import { StepMandateBasics } from "@/components/onboarding/step-mandate-basics";
import { StepFirstValue } from "@/components/onboarding/step-first-value";
import {
  WIZARD_V4_STORAGE_KEY,
  initialWizardV4State,
  wizardV4Reducer,
  type WizardV4InitialParams,
  type WizardV4State,
} from "@/components/onboarding/wizard-v4";

export type OnboardingInitialParams = WizardV4InitialParams;

function readSaved(): Partial<WizardV4State> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WIZARD_V4_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<WizardV4State>) : null;
  } catch {
    return null;
  }
}

function readCachedVia(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem("blockid_via") ?? undefined;
  } catch {
    return undefined;
  }
}

async function saveProgress(state: WizardV4State, completed = false): Promise<void> {
  try {
    await fetch("/api/onboarding/save-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: state.step, state, persona: state.persona, completed }),
    });
  } catch {
    // Fire-and-forget — localStorage already has the latest state.
  }
}

export interface OnboardingWizardProps {
  user: AppUser;
  initialParams: OnboardingInitialParams;
  /** Persona already on the account (signup form / Google) — preselects step 1. */
  defaultPersona?: WizardPersona | null;
  /** Step-1 cards the page allows (S-IA5 persona lock: `personaOptionsFor`). Defaults to all five. */
  personaOptions?: readonly WizardPersona[];
  nav: React.ReactNode;
  footer: React.ReactNode;
}

export function OnboardingWizard({ user, initialParams, defaultPersona, personaOptions, nav, footer }: OnboardingWizardProps) {
  const [state, dispatch] = React.useReducer(wizardV4Reducer, initialParams, (p) =>
    initialWizardV4State({ ...p, via: p.via ?? readCachedVia() }, readSaved(), defaultPersona ?? null),
  );
  const [finishing, setFinishing] = React.useState(false);
  const flow = flowForPersona(state.persona);
  const persona = state.persona ?? "founder";
  const lastStep = React.useRef<WizardStep | null>(null);

  // Persist + step telemetry on every state change.
  React.useEffect(() => {
    try {
      window.localStorage.setItem(WIZARD_V4_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable — resume just won't survive a restart on this device.
    }
    void saveProgress(state);
  }, [state]);

  React.useEffect(() => {
    if (lastStep.current === state.step) return;
    const action = lastStep.current === null ? "view" : state.step > lastStep.current ? "advance" : "back";
    lastStep.current = state.step;
    trackEvent("onboarding_step", { persona, step: state.step, action });
  }, [state.step, persona]);

  const go = (type: "NEXT" | "BACK", action: string) => {
    trackEvent("onboarding_step", { persona, step: state.step, action });
    dispatch({ type });
  };

  async function finish(href: string, action: string) {
    if (finishing) return;
    setFinishing(true);
    const at = new Date().toISOString();
    trackEvent("onboarding_step", { persona, step: 3, action });
    trackEvent("onboarding_completed", { persona });
    dispatch({ type: "COMPLETE", at });
    await saveProgress({ ...state, completedAt: at }, true);
    try {
      window.localStorage.removeItem(WIZARD_V4_STORAGE_KEY);
    } catch {
      // ignore
    }
    window.location.href = href;
  }

  return (
    <div data-theme="lux" className="min-h-svh bg-brand-navy bg-lux-radial text-primary" data-onboarding-wizard="v4" data-wizard-flow={flow} data-wizard-step={state.step}>
      {nav}

      <main className="mx-auto max-w-3xl px-6 pb-24 pt-10">
        <WizardRail step={state.step} flow={flow} />

        <div className="lux-card rounded-3xl p-8 sm:p-10">
          {state.step === 1 && (
            <StepPersona
              options={personaOptions}
              value={state.persona}
              onChange={(p) => dispatch({ type: "SET_PERSONA", persona: p })}
              onContinue={() => go("NEXT", "persona_pick")}
            />
          )}
          {state.step === 2 && flow !== "evaluator" && (
            <StepStartup
              existingProjectId={state.firstStartupId}
              onCreated={(projectId) => {
                dispatch({ type: "SET_FIRST_STARTUP", projectId, createdAt: new Date().toISOString() });
                go("NEXT", "startup_created");
              }}
              onSkip={() => {
                dispatch({ type: "SET_FIRST_STARTUP", createdAt: new Date().toISOString(), skipped: true });
                go("NEXT", "skip");
              }}
              onContinue={() => go("NEXT", "continue")}
            />
          )}
          {state.step === 2 && flow === "evaluator" && (
            <StepMandateBasics
              persona={state.persona}
              existing={{ mandateId: state.mandateId, basics: state.mandateBasics, parked: state.mandateParked }}
              onSaved={(r) => {
                dispatch({ type: "SET_MANDATE", mandateId: r.mandateId, basics: r.basics, parked: r.parked });
                if (!r.parked) go("NEXT", "mandate_saved");
              }}
              onSkip={() => go("NEXT", "skip")}
              onContinue={() => go("NEXT", state.mandateParked ? "mandate_parked" : "continue")}
            />
          )}
          {state.step === 3 && <StepFirstValue persona={state.persona} planId={state.planId} interval={state.interval} onFinish={finish} finishing={finishing} />}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {state.step > 1 ? (
            <button
              type="button"
              onClick={() => go("BACK", "back")}
              disabled={finishing}
              data-testid="wizard-back"
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-muted transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy disabled:opacity-60"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Back
            </button>
          ) : (
            <span />
          )}
        </div>

        <p className="mt-10 text-center text-xs text-muted">Signed in as {user.email}</p>
      </main>

      {footer}
    </div>
  );
}
