"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";

interface EsopGrantFormProps {
  poolId: string;
  availableShares: number;
  onSuccess: () => void;
  onClose: () => void;
}

interface FormData {
  grantee_name: string;
  grantee_email: string;
  grantee_role: string;
  total_shares: string;
  strike_price_cents: string;
  grant_date: string;
  cliff_months: string;
  total_months: string;
}

const ROLES = ["engineer", "designer", "product", "sales", "advisor", "other"];

const STEPS = ["Grantee", "Grant Details", "Vesting"];

export function EsopGrantForm({ availableShares, onSuccess, onClose }: EsopGrantFormProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    grantee_name: "",
    grantee_email: "",
    grantee_role: "engineer",
    total_shares: "",
    strike_price_cents: "10",
    grant_date: new Date().toISOString().split("T")[0],
    cliff_months: "12",
    total_months: "48",
  });

  function update(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function validateStep(): string | null {
    if (step === 0) {
      if (!form.grantee_name.trim()) return "Grantee name is required";
    }
    if (step === 1) {
      const shares = parseInt(form.total_shares);
      if (!shares || shares <= 0) return "Enter valid share count";
      if (shares > availableShares) return `Only ${availableShares.toLocaleString()} shares available`;
    }
    if (step === 2) {
      const cliff = parseInt(form.cliff_months);
      const total = parseInt(form.total_months);
      if (!cliff || cliff <= 0) return "Cliff months must be > 0";
      if (!total || total <= cliff) return "Total months must exceed cliff";
    }
    return null;
  }

  function nextStep() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setStep((s) => s + 1);
  }

  async function submit() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/esop/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantee_name: form.grantee_name.trim(),
          grantee_email: form.grantee_email.trim() || undefined,
          grantee_role: form.grantee_role,
          total_shares: parseInt(form.total_shares),
          strike_price_cents: parseInt(form.strike_price_cents),
          grant_date: form.grant_date,
          cliff_months: parseInt(form.cliff_months),
          total_months: parseInt(form.total_months),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Failed to create grant");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1 text-ink-400 hover:text-ink-700 hover:bg-surface-100"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold text-ink-900 mb-1">New Option Grant</h2>
        <p className="text-sm text-ink-500 mb-5">{availableShares.toLocaleString()} shares available</p>

        {/* Step indicator */}
        <div className="flex gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div
                className={`h-1 rounded-full mb-1.5 ${i <= step ? "bg-brand-500" : "bg-surface-200"}`}
              />
              <p className={`text-xs ${i === step ? "text-brand-600 font-medium" : "text-ink-400"}`}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* Step 0: Grantee */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                value={form.grantee_name}
                onChange={(e) => update("grantee_name", e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Email (optional)</label>
              <input
                type="email"
                value={form.grantee_email}
                onChange={(e) => update("grantee_email", e.target.value)}
                placeholder="jane@example.com"
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Role</label>
              <select
                value={form.grantee_role}
                onChange={(e) => update("grantee_role", e.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 1: Grant Details */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">
                Shares to Grant *{" "}
                <span className="font-normal text-ink-400">(max {availableShares.toLocaleString()})</span>
              </label>
              <input
                type="number"
                min="1"
                max={availableShares}
                value={form.total_shares}
                onChange={(e) => update("total_shares", e.target.value)}
                placeholder="500"
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Strike Price</label>
              <div className="flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2">
                <span className="text-sm text-ink-400">A$</span>
                <input
                  type="number"
                  step="0.01"
                  value={(parseInt(form.strike_price_cents) / 100).toFixed(2)}
                  onChange={(e) => update("strike_price_cents", String(Math.round(parseFloat(e.target.value) * 100)))}
                  className="flex-1 text-sm text-ink-900 focus:outline-none"
                />
                <span className="text-xs text-ink-400">per share</span>
              </div>
              <p className="text-xs text-ink-400 mt-1">Fair Market Value (ESS Part 7A compliant)</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Grant Date</label>
              <input
                type="date"
                value={form.grant_date}
                onChange={(e) => update("grant_date", e.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
          </div>
        )}

        {/* Step 2: Vesting */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-brand-50 border border-brand-100 p-3 text-sm text-brand-700">
              Standard: 4-year vesting, 1-year cliff (industry best practice)
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Cliff Period (months)</label>
              <input
                type="number"
                min="1"
                value={form.cliff_months}
                onChange={(e) => update("cliff_months", e.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">Total Vesting Period (months)</label>
              <input
                type="number"
                min="12"
                value={form.total_months}
                onChange={(e) => update("total_months", e.target.value)}
                className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            {form.total_shares && form.cliff_months && form.total_months && (
              <div className="rounded-lg bg-surface-50 p-3 text-xs text-ink-600 space-y-1">
                <p>
                  On cliff ({form.cliff_months} months):{" "}
                  <strong>{Math.round(parseInt(form.total_shares) * parseInt(form.cliff_months) / parseInt(form.total_months)).toLocaleString()} shares</strong>{" "}
                  ({Math.round(parseInt(form.cliff_months) / parseInt(form.total_months) * 100)}%) vest
                </p>
                <p>
                  Then: <strong>~{Math.round(parseInt(form.total_shares) / parseInt(form.total_months))} shares/month</strong> for{" "}
                  {parseInt(form.total_months) - parseInt(form.cliff_months)} months
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-between mt-6">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-600 hover:bg-surface-50"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-600 hover:bg-surface-50"
            >
              Cancel
            </button>
          )}

          {step < 2 ? (
            <button
              onClick={nextStep}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Grant
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
