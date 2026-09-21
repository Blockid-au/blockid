// <ExitSurvey> — captures why a user is cancelling (T-0417).
//
// Rendered inside the /account/billing cancel flow before we call
// /api/stripe/cancel. Submits to the same endpoint with an
// `exit_survey` payload so churn_events + save-offer routing can
// read it.

"use client";

import * as React from "react";

export const CANCEL_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "missing_features", label: "Missing a feature I need" },
  { id: "not_using", label: "Not using it enough" },
  { id: "found_alternative", label: "Found an alternative" },
  { id: "temporary_pause", label: "Just pausing — will be back" },
  { id: "other", label: "Something else" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["id"];

export interface ExitSurveyResult {
  reason: CancelReason;
  feedback?: string;
  wouldReturnAt?: string;
}

export interface ExitSurveyProps {
  onSubmit: (result: ExitSurveyResult) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export function ExitSurvey({ onSubmit, onCancel, submitting }: ExitSurveyProps) {
  const [reason, setReason] = React.useState<CancelReason | null>(null);
  const [feedback, setFeedback] = React.useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason) return;
        onSubmit({ reason, feedback: feedback.trim() || undefined });
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-primary">
          Before you go — what&apos;s the main reason?
        </legend>
        <div className="grid gap-2">
          {CANCEL_REASONS.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                reason === r.id
                  ? "border-action bg-action/10 text-action"
                  : "border-line-subtle text-secondary hover:border-line"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
                className="accent-action"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-secondary">
          Anything you&apos;d like us to know? (optional)
        </span>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-line bg-surface p-2 text-sm text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
      </label>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-primary hover:bg-surface-hover"
        >
          Never mind — keep my plan
        </button>
        <button
          type="submit"
          disabled={!reason || submitting}
          className="min-h-11 rounded-lg bg-bear px-4 py-2 text-sm font-semibold text-on-action hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? "Cancelling…" : "Cancel my plan"}
        </button>
      </div>
    </form>
  );
}
