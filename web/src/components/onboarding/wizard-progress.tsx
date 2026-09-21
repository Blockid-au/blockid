"use client";

import * as React from "react";
import type { WizardState } from "./wizard-types";

// Kept in step-order alignment with `WizardState["step"]` (1..6). The 6th
// slot — "Startup" — is the activation-moment step added by real-world
// audit #8 (see wizard-types.ts header). If you re-order or rename these,
// keep the reducer's MAX_STEP + `WIZARD_TOTAL_STEPS` in sync.
const STEP_LABELS = ["Segment", "Goal", "Plan", "Trial", "Payment", "Startup"];

export function WizardProgress({ step }: { step: WizardState["step"] }) {
  return (
    <div className="mx-auto mb-10 w-full max-w-md">
      <div
        className="flex items-center"
        role="list"
        aria-label="Onboarding progress"
      >
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const isActive = n === step;
          const isDone = n < step;
          return (
            <React.Fragment key={label}>
              {i > 0 && (
                <div
                  className={`h-px flex-1 transition-colors ${
                    isDone || isActive
                      ? "bg-action/60"
                      : "bg-line"
                  }`}
                  aria-hidden="true"
                />
              )}
              <div role="listitem">
                <div
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Step ${n}: ${label}${isDone ? " (completed)" : ""}`}
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 transition-colors ${
                    isActive
                      ? "bg-action ring-action/20"
                      : isDone
                        ? "bg-action/60 ring-transparent"
                        : "bg-line-strong ring-transparent"
                  }`}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-[11px] font-medium">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const isActive = n === step;
          const isDone = n < step;
          return (
            <span
              key={label}
              className={
                isActive
                  ? "text-action"
                  : isDone
                    ? "text-muted"
                    : "text-tertiary"
              }
            >
              {label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
