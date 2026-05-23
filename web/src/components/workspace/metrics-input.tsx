"use client";

import * as React from "react";
import { BarChart3, Save, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricsInputProps {
  onSubmitted?: () => void;
}

interface FormData {
  mrr_aud: string;
  arr_aud: string;
  users_total: string;
  users_new: string;
  monthly_churn_pct: string;
  revenue: string;
  burn_rate_aud: string;
  runway_months: string;
  nps: string;
  mau: string;
  dau: string;
  cac_aud: string;
  ltv_aud: string;
  nrr_pct: string;
  revenue_growth_pct: string;
  notes: string;
}

const EMPTY_FORM: FormData = {
  mrr_aud: "",
  arr_aud: "",
  users_total: "",
  users_new: "",
  monthly_churn_pct: "",
  revenue: "",
  burn_rate_aud: "",
  runway_months: "",
  nps: "",
  mau: "",
  dau: "",
  cac_aud: "",
  ltv_aud: "",
  nrr_pct: "",
  revenue_growth_pct: "",
  notes: "",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseNum(val: string): number | null {
  if (!val.trim()) return null;
  const n = Number(val);
  return isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MetricsInput({ onSubmitted }: MetricsInputProps) {
  const [month, setMonth] = React.useState(getCurrentMonth);
  const [form, setForm] = React.useState<FormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  function setField(key: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Build metrics object, omitting nulls
    const metrics: Record<string, number | string | null> = {};
    const numericKeys: (keyof FormData)[] = [
      "mrr_aud", "arr_aud", "users_total", "users_new",
      "monthly_churn_pct", "revenue", "burn_rate_aud", "runway_months",
      "nps", "mau", "dau", "cac_aud", "ltv_aud", "nrr_pct",
      "revenue_growth_pct",
    ];

    let hasValue = false;
    for (const key of numericKeys) {
      const val = parseNum(form[key]);
      if (val !== null) {
        metrics[key] = val;
        hasValue = true;
      }
    }

    if (form.notes.trim()) {
      metrics.notes = form.notes.trim();
      hasValue = true;
    }

    if (!hasValue) {
      setError("Please enter at least one metric value.");
      return;
    }

    // Convert month "2026-05" to date "2026-05-01"
    const date = `${month}-01`;

    setSubmitting(true);
    try {
      const res = await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, source: "manual", metrics }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Failed to save metrics");
        return;
      }
      setSuccess(true);
      setForm(EMPTY_FORM);
      onSubmitted?.();
      // Clear success message after 3s
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-surface-200 bg-white p-5 space-y-5 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center">
          <BarChart3 className="h-4 w-4 text-brand-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink-800">
            Record Monthly Metrics
          </h2>
          <p className="text-xs text-ink-500">
            Enter your key metrics for the selected month. These feed into your SVI score.
          </p>
        </div>
      </div>

      {/* Month selector */}
      <div>
        <label className="block text-xs font-medium text-ink-600 mb-1">
          Month
        </label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-full sm:w-48 px-3 py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
        />
      </div>

      {/* Core metric fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NumericField
          label="MRR (AUD)"
          value={form.mrr_aud}
          onChange={(v) => setField("mrr_aud", v)}
          placeholder="0.00"
          prefix="$"
          hint="Monthly Recurring Revenue"
        />
        <NumericField
          label="ARR (AUD)"
          value={form.arr_aud}
          onChange={(v) => setField("arr_aud", v)}
          placeholder="0.00"
          prefix="$"
          hint="Annual Recurring Revenue"
        />
        <NumericField
          label="Revenue (AUD)"
          value={form.revenue}
          onChange={(v) => setField("revenue", v)}
          placeholder="0.00"
          prefix="$"
          hint="Total monthly revenue"
        />
        <NumericField
          label="Total Users"
          value={form.users_total}
          onChange={(v) => setField("users_total", v)}
          placeholder="0"
          hint="Total registered users"
        />
        <NumericField
          label="New Users"
          value={form.users_new}
          onChange={(v) => setField("users_new", v)}
          placeholder="0"
          hint="New users this month"
        />
        <NumericField
          label="Churn Rate (%)"
          value={form.monthly_churn_pct}
          onChange={(v) => setField("monthly_churn_pct", v)}
          placeholder="0.00"
          suffix="%"
          hint="Monthly customer churn"
        />
        <NumericField
          label="Burn Rate (AUD)"
          value={form.burn_rate_aud}
          onChange={(v) => setField("burn_rate_aud", v)}
          placeholder="0.00"
          prefix="$"
          hint="Monthly cash burn"
        />
        <NumericField
          label="Runway (months)"
          value={form.runway_months}
          onChange={(v) => setField("runway_months", v)}
          placeholder="0"
          hint="Months of cash remaining"
        />
        <NumericField
          label="NPS"
          value={form.nps}
          onChange={(v) => setField("nps", v)}
          placeholder="-100 to 100"
          hint="Net Promoter Score"
        />
      </div>

      {/* Advanced fields toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors cursor-pointer"
      >
        {showAdvanced ? "Hide advanced fields" : "Show advanced fields (MAU, DAU, CAC, LTV, NRR, growth %)"}
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <NumericField
            label="MAU"
            value={form.mau}
            onChange={(v) => setField("mau", v)}
            placeholder="0"
            hint="Monthly Active Users"
          />
          <NumericField
            label="DAU"
            value={form.dau}
            onChange={(v) => setField("dau", v)}
            placeholder="0"
            hint="Daily Active Users"
          />
          <NumericField
            label="CAC (AUD)"
            value={form.cac_aud}
            onChange={(v) => setField("cac_aud", v)}
            placeholder="0.00"
            prefix="$"
            hint="Customer Acquisition Cost"
          />
          <NumericField
            label="LTV (AUD)"
            value={form.ltv_aud}
            onChange={(v) => setField("ltv_aud", v)}
            placeholder="0.00"
            prefix="$"
            hint="Customer Lifetime Value"
          />
          <NumericField
            label="NRR (%)"
            value={form.nrr_pct}
            onChange={(v) => setField("nrr_pct", v)}
            placeholder="0.00"
            suffix="%"
            hint="Net Revenue Retention"
          />
          <NumericField
            label="Revenue Growth (%)"
            value={form.revenue_growth_pct}
            onChange={(v) => setField("revenue_growth_pct", v)}
            placeholder="0.00"
            suffix="%"
            hint="Month-over-month growth"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-ink-600 mb-1">
          Notes
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Any context for this month's metrics (product launches, pivots, etc.)..."
          rows={2}
          className="w-full px-3 py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-y"
        />
      </div>

      {/* Error / Success */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">
          Metrics saved successfully.
        </p>
      )}

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {submitting ? "Saving..." : "Save Metrics"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// NumericField sub-component
// ---------------------------------------------------------------------------

function NumericField({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-600 mb-1">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full py-2 rounded-xl border border-surface-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400",
            prefix ? "pl-7 pr-3" : suffix ? "pl-3 pr-7" : "px-3",
          )}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400 pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && (
        <p className="text-[10px] text-ink-400 mt-0.5">{hint}</p>
      )}
    </div>
  );
}
