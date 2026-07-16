"use client";

// Workspace › Equity Offer › Request-a-Call intake form.
//
// Client component. 5-field form + 2 mandatory consent checkboxes. On
// submit POSTs to /api/equity/request which always returns 202 (accepted
// for review — never issues equity synchronously). Success replaces the
// form with a plain thank-you screen; no analytics-facing PII.
//
// This page must render even when the underlying API is slow — Enter to
// submit is guarded by the disabled-state so a double click cannot double
// -POST.

import * as React from "react";
import Link from "next/link";

type Stage = "idea" | "pre-seed" | "seed" | "series-a+";

const STAGE_OPTIONS: Array<{ value: Stage; label: string }> = [
  { value: "idea", label: "Idea" },
  { value: "pre-seed", label: "Pre-seed" },
  { value: "seed", label: "Seed" },
  { value: "series-a+", label: "Series A+" },
];

const SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "svi_valuation", label: "SVI + valuation" },
  { value: "cap_table_esop", label: "Cap table + ESOP" },
  { value: "blockchain_sync", label: "Blockchain sync" },
  { value: "investor_reporting", label: "Investor reporting" },
  { value: "full_stack", label: "Full stack" },
];

const MIN_MESSAGE_CHARS = 100;

interface FormState {
  companyName: string;
  stage: Stage | "";
  equityPct: number;
  scope: string[];
  message: string;
  ackDisclaimer: boolean;
  ackIndependentCounsel: boolean;
}

const INITIAL_STATE: FormState = {
  companyName: "",
  stage: "",
  equityPct: 7.5,
  scope: [],
  message: "",
  ackDisclaimer: false,
  ackIndependentCounsel: false,
};

export default function EquityOfferRequestPage() {
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [nextEligibleAt, setNextEligibleAt] = React.useState<string | null>(null);

  // Prefill company name from /api/entitlement/me (or profile) if available.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/entitlement/me", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          user?: { startupName?: string | null };
        };
        if (cancelled) return;
        const name = data?.user?.startupName;
        if (typeof name === "string" && name.length > 0) {
          setForm((prev) =>
            prev.companyName === "" ? { ...prev, companyName: name } : prev,
          );
        }
      } catch {
        // silent — user can type manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const messageCount = form.message.length;

  const canSubmit =
    !submitting &&
    form.companyName.trim().length > 0 &&
    form.stage !== "" &&
    form.equityPct >= 5 &&
    form.equityPct <= 15 &&
    form.scope.length > 0 &&
    messageCount >= MIN_MESSAGE_CHARS &&
    form.ackDisclaimer &&
    form.ackIndependentCounsel;

  const onToggleScope = React.useCallback((value: string) => {
    setForm((prev) => {
      const has = prev.scope.includes(value);
      return {
        ...prev,
        scope: has
          ? prev.scope.filter((v) => v !== value)
          : [...prev.scope, value],
      };
    });
  }, []);

  const onSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      setNextEligibleAt(null);
      try {
        const res = await fetch("/api/equity/request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            company_name: form.companyName.trim(),
            stage: form.stage,
            equity_pct_requested: form.equityPct,
            scope: form.scope,
            message: form.message.trim(),
            ack_disclaimer: form.ackDisclaimer,
            ack_independent_counsel: form.ackIndependentCounsel,
          }),
        });
        if (res.status === 202) {
          setSuccess(true);
          return;
        }
        // 429 rate-limit
        if (res.status === 429) {
          let payload: { next_eligible_at?: string; reason?: string } = {};
          try {
            payload = (await res.json()) as typeof payload;
          } catch {
            /* ignore */
          }
          setNextEligibleAt(payload.next_eligible_at ?? null);
          setError(
            payload.reason ??
              "You have reached the limit of 3 requests in the last 30 days.",
          );
          return;
        }
        let reason = `Request failed (HTTP ${res.status}).`;
        try {
          const j = (await res.json()) as { reason?: string };
          if (j?.reason) reason = j.reason;
        } catch {
          /* ignore */
        }
        setError(reason);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, form],
  );

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl p-6 pt-16">
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
            <div className="text-4xl">✓</div>
            <h1 className="mt-4 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              Thank you.
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              We will contact you within 3 business days. Nothing has been
              issued and no securities transaction has occurred — this
              intake is a request-a-call only.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                href="/workspace/equity-offer"
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Back to overview
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-2xl p-6 pt-10 pb-16">
        <div className="mb-4">
          <Link
            href="/workspace/equity-offer"
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ← Back to Equity Offer overview
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Request a Call
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          This is a request-a-call intake only. No securities are being
          offered or issued through this form.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-6 space-y-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
        >
          {/* 1. Company name */}
          <div>
            <label
              htmlFor="company_name"
              className="block text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Company name
            </label>
            <input
              id="company_name"
              type="text"
              required
              maxLength={200}
              value={form.companyName}
              onChange={(e) =>
                setForm((p) => ({ ...p, companyName: e.target.value }))
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* 2. Stage */}
          <div>
            <label
              htmlFor="stage"
              className="block text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Stage
            </label>
            <select
              id="stage"
              required
              value={form.stage}
              onChange={(e) =>
                setForm((p) => ({ ...p, stage: e.target.value as Stage }))
              }
              className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a stage…</option>
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Equity band slider */}
          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="equity_pct"
                className="block text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                Proposed equity band
              </label>
              <span className="text-sm font-semibold text-brand-700 dark:text-brand-300">
                {form.equityPct.toFixed(1)}%
              </span>
            </div>
            <input
              id="equity_pct"
              type="range"
              min={5}
              max={15}
              step={0.5}
              value={form.equityPct}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  equityPct: Number(e.target.value),
                }))
              }
              className="mt-2 block w-full accent-brand-600"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>5%</span>
              <span>15%</span>
            </div>
          </div>

          {/* 4. Scope multi-select */}
          <div>
            <fieldset>
              <legend className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                Scope (select all that apply)
              </legend>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SCOPE_OPTIONS.map((opt) => {
                  const checked = form.scope.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${
                        checked
                          ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-900 dark:text-brand-100"
                          : "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleScope(opt.value)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {/* 5. Message */}
          <div>
            <label
              htmlFor="message"
              className="block text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Message
            </label>
            <textarea
              id="message"
              required
              minLength={MIN_MESSAGE_CHARS}
              maxLength={5000}
              rows={6}
              value={form.message}
              onChange={(e) =>
                setForm((p) => ({ ...p, message: e.target.value }))
              }
              placeholder="Tell us about your company, why an equity-for-solution model works for you, and what you would like to achieve in the first 90 days."
              className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <div className="mt-1 flex justify-between text-xs">
              <span
                className={
                  messageCount < MIN_MESSAGE_CHARS
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500 dark:text-slate-400"
                }
              >
                {messageCount < MIN_MESSAGE_CHARS
                  ? `${MIN_MESSAGE_CHARS - messageCount} more characters required`
                  : "Looks good"}
              </span>
              <span className="text-slate-400 dark:text-slate-500">
                {messageCount} / 5000
              </span>
            </div>
          </div>

          {/* Consent block */}
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
              Required acknowledgements
            </p>
            <label className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
              <input
                type="checkbox"
                checked={form.ackDisclaimer}
                onChange={(e) =>
                  setForm((p) => ({ ...p, ackDisclaimer: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-amber-400 text-brand-600 focus:ring-brand-500"
              />
              <span>
                I have read and acknowledge the disclaimers on the previous
                page.
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-100">
              <input
                type="checkbox"
                checked={form.ackIndependentCounsel}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    ackIndependentCounsel: e.target.checked,
                  }))
                }
                className="mt-0.5 h-4 w-4 rounded border-amber-400 text-brand-600 focus:ring-brand-500"
              />
              <span>
                I am not seeking financial or legal advice from BlockID; I
                will seek independent counsel.
              </span>
            </label>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm text-rose-800 dark:text-rose-200"
            >
              {error}
              {nextEligibleAt && (
                <div className="mt-1 text-xs opacity-80">
                  Next eligible at: {nextEligibleAt}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                canSubmit
                  ? "bg-brand-600 hover:bg-brand-700 text-white"
                  : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-500 cursor-not-allowed"
              }`}
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              No securities issued at submission.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
