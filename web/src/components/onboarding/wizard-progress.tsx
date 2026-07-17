"use client";

import * as React from "react";
import type { WizardState } from "./wizard-types";

const STEP_LABELS = ["Segment", "Goal", "Plan", "Trial", "Payment"];

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
                      ? "bg-brand-cyan/60"
                      : "bg-brand-ink-muted/20"
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
                      ? "bg-brand-cyan ring-brand-cyan/20"
                      : isDone
                        ? "bg-brand-cyan/60 ring-transparent"
                        : "bg-brand-ink-muted/30 ring-transparent"
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
                  ? "text-brand-cyan"
                  : isDone
                    ? "text-brand-ink-muted"
                    : "text-brand-ink-muted/50"
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
