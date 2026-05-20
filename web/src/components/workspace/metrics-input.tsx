"use client";

import * as React from "react";
import { METRIC_LABELS } from "@/lib/benchmarks";

interface MetricsInputProps {
  onSubmitted?: () => void;
}

export function MetricsInput({ onSubmitted }: MetricsInputProps) {
  const [metricField, setMetricField] = React.useState("mrr_aud");
  const [value, setValue] = React.useState("");
  const [date, setDate] = React.useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      setMessage({ type: "error", text: "Please enter a valid number." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          source: "manual",
          metrics: { [metricField]: numValue },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: "success", text: "Metric saved." });
        setValue("");
        onSubmitted?.();
      } else {
        setMessage({
          type: "error",
          text: data.error ?? "Failed to save metric.",
        });
      }
    } catch {
      setMessage({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-surface-200 bg-white p-6"
    >
      <h3 className="text-base font-semibold text-ink-800 mb-4">
        Log a Metric
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Metric field */}
        <div>
          <label
            htmlFor="metric-field"
            className="block text-xs font-medium text-ink-600 mb-1"
          >
            Metric
          </label>
          <select
            id="metric-field"
            value={metricField}
            onChange={(e) => setMetricField(e.target.value)}
            className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {Object.entries(METRIC_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Value */}
        <div>
          <label
            htmlFor="metric-value"
            className="block text-xs font-medium text-ink-600 mb-1"
          >
            Value
          </label>
          <input
            id="metric-value"
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 5000"
            required
            className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>

        {/* Date */}
        <div>
          <label
            htmlFor="metric-date"
            className="block text-xs font-medium text-ink-600 mb-1"
          >
            Date
          </label>
          <input
            id="metric-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </div>

        {/* Source (read-only for now) */}
        <div>
          <label
            htmlFor="metric-source"
            className="block text-xs font-medium text-ink-600 mb-1"
          >
            Source
          </label>
          <input
            id="metric-source"
            type="text"
            value="Manual entry"
            disabled
            className="w-full rounded-xl border border-surface-200 bg-surface-100 px-3 py-2 text-sm text-ink-500 cursor-not-allowed"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Saving..." : "Save Metric"}
        </button>
        {message && (
          <span
            className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-red-500"}`}
          >
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
