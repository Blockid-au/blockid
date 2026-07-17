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
        <legend className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Before you go — what's the main reason?
        </legend>
        <div className="grid gap-2">
          {CANCEL_REASONS.map((r) => (
            <label
              key={r.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors ${
                reason === r.id
                  ? "border-brand-500 bg-brand-50 text-brand-900 dark:border-brand-400 dark:bg-brand-950/40 dark:text-brand-100"
                  : "border-neutral-200 text-neutral-700 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-700"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={r.id}
                checked={reason === r.id}
                onChange={() => setReason(r.id)}
                className="accent-brand-600"
              />
              {r.label}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Anything you'd like us to know? (optional)
        </span>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm text-neutral-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
      </label>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          Never mind — keep my plan
        </button>
        <button
          type="submit"
          disabled={!reason || submitting}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {submitting ? "Cancelling…" : "Cancel my plan"}
        </button>
      </div>
    </form>
  );
}
