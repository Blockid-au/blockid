"use client";

// BatchDialog — "Batch score" confirm dialog for /workspace/evaluations
// (T0272, Program). Name + optional rubric weight sliders for the 8
// dimensions (kept summing to 100 by normalisation on submit — the preview
// shows the normalised split) + the cost line BEFORE anything is queued:
// "{n} of your included Trust BizReports this month ({left} left)". POSTs
// /api/evaluations/batch; nothing runs until the off-peak cron picks it up.

import * as React from "react";
import { Loader2, X } from "lucide-react";
import type { EvaluationListRow } from "@/lib/evaluations";
import {
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  equalWeights,
  isEqualWeights,
  normaliseWeights,
  type EvaluationBatch,
  type RubricWeights,
} from "@/lib/evaluations/batch-shared";

export interface BatchQueuedResult {
  batch_id: string;
  queued: number;
  quota_left: number;
  batch: EvaluationBatch;
}

export interface BatchDialogProps {
  selected: EvaluationListRow[];
  /** Included reports left this month (null = unknown / unlimited). */
  quotaRemaining: number | null;
  quotaLimit: number | null;
  onClose: () => void;
  onQueued: (result: BatchQueuedResult) => void;
}

export function BatchDialog({ selected, quotaRemaining, quotaLimit, onClose, onQueued }: BatchDialogProps) {
  const n = selected.length;
  const [name, setName] = React.useState(`Batch ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`);
  const [weights, setWeights] = React.useState<RubricWeights>(equalWeights());
  const [showWeights, setShowWeights] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const normalised = React.useMemo(() => normaliseWeights(weights), [weights]);
  const rawSum = DIMENSION_KEYS.reduce((s, k) => s + (Number(weights[k]) || 0), 0);
  const insufficient = quotaRemaining != null && quotaRemaining < n;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (n === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/evaluations/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evaluation_ids: selected.map((r) => r.id),
          name: name.trim() || undefined,
          rubric_weights: isEqualWeights(normalised) ? undefined : normalised,
        }),
      });
      const json = (await res.json()) as Partial<BatchQueuedResult> & { ok: boolean; message?: string; error?: string; upgrade_url?: string };
      if (json.ok && json.batch_id && json.batch) {
        onQueued({ batch_id: json.batch_id, queued: json.queued ?? n, quota_left: json.quota_left ?? 0, batch: json.batch });
      } else {
        setError(json.message ?? json.error ?? "Could not queue the batch");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="batch-title">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-surface-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
          <h2 id="batch-title" className="text-lg font-bold text-ink-900">Batch score {n} startup{n === 1 ? "" : "s"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer">
            <X strokeWidth={1.75} className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-ink-600">
            Every selected startup gets a full Trust BizReport on the same rubric, scored off-peak tonight. You&apos;ll get a notification when the cohort table is ready.
          </p>
          <div>
            <label htmlFor="batch-name" className="block text-sm font-medium text-ink-700 mb-1">Batch name</label>
            <input
              id="batch-name"
              type="text"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cohort 4 intake"
              className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-700">Rubric weights</span>
              <button type="button" onClick={() => setShowWeights((v) => !v)} className="text-xs font-medium text-brand-700 hover:underline cursor-pointer">
                {showWeights ? "Hide" : isEqualWeights(normalised) ? "Customise (equal by default)" : "Edit"}
              </button>
            </div>
            {showWeights ? (
              <div className="mt-2 space-y-2" data-testid="weight-sliders">
                {DIMENSION_KEYS.map((k) => (
                  <div key={k} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs">
                    <label htmlFor={`w-${k}`} className="text-ink-700">{DIMENSION_LABELS[k]}</label>
                    <input
                      id={`w-${k}`}
                      type="range"
                      min={0}
                      max={40}
                      step={0.5}
                      value={weights[k]}
                      onChange={(e) => setWeights((w) => ({ ...w, [k]: Number(e.target.value) }))}
                      className="w-40 accent-brand-600"
                    />
                    <span className="w-14 text-right tabular-nums text-ink-800">{normalised[k]}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs text-ink-500">
                  <span>Sliders sum to {Math.round(rawSum * 10) / 10}; the split is normalised to 100% and only changes the displayed weighted score — the SVI stays unweighted.</span>
                  <button type="button" onClick={() => setWeights(equalWeights())} className="font-medium text-brand-700 hover:underline cursor-pointer">Equal weights</button>
                </div>
              </div>
            ) : null}
          </div>

          <div data-testid="batch-cost" className={`rounded-xl px-4 py-3 text-sm ${insufficient ? "border border-amber-300 bg-amber-50 text-amber-800" : "border border-surface-200 bg-surface-50 text-ink-700"}`}>
            <strong>{n}</strong> of your included Trust BizReports this month
            {quotaRemaining != null ? <> ({quotaRemaining}{quotaLimit != null ? ` of ${quotaLimit}` : ""} left)</> : null}.
            {insufficient ? " Not enough included reports left — select fewer startups or wait for the monthly reset." : " No credits are charged."}
          </div>

          {error ? <p className="text-sm text-red-600 font-medium" role="alert">{error}</p> : null}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || n === 0 || insufficient}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              {submitting && <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />}
              Queue {n} report{n === 1 ? "" : "s"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
