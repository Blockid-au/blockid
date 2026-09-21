"use client";

// Three-step progress rail for the single onboarding wizard (G13-W4-IA4).
// Labels come from lib/onboarding/flow.ts per flow, so the rail and the
// step components can never disagree on what step 2 is. Same a11y
// contract as the legacy `WizardProgress`: a list, `aria-current="step"`
// on the active dot, "(completed)" in the label of a done step.

import * as React from "react";
import { useLocale } from "@/lib/use-locale";
import { stepsForFlow, type WizardStep } from "@/lib/onboarding/flow";
import type { OnboardingFlow } from "@/lib/nav/persona";

export function WizardRail({ step, flow }: { step: WizardStep; flow: OnboardingFlow }) {
  const [locale] = useLocale();
  const steps = stepsForFlow(flow);
  return (
    <div className="mx-auto mb-10 w-full max-w-md" data-wizard-rail={flow} data-wizard-rail-step={step}>
      <div className="flex items-center" role="list" aria-label="Onboarding progress">
        {steps.map((s, i) => {
          const isActive = s.step === step;
          const isDone = s.step < step;
          return (
            <React.Fragment key={s.step}>
              {i > 0 && <div className={`h-px flex-1 transition-colors ${isDone || isActive ? "bg-action/60" : "bg-line"}`} aria-hidden="true" />}
              <div role="listitem">
                <div
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Step ${s.step}: ${s.label[locale]}${isDone ? " (completed)" : ""}`}
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 transition-colors ${isActive ? "bg-action ring-action/20" : isDone ? "bg-action/60 ring-transparent" : "bg-line-strong ring-transparent"}`}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-medium">
        {steps.map((s) => (
          <span key={s.step} className={s.step === step ? "text-action" : s.step < step ? "text-muted" : "text-tertiary"}>
            {s.label[locale]}
          </span>
        ))}
      </div>
    </div>
  );
}
