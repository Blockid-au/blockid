"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { S708CounterResult } from "@/lib/compliance/s708-small-scale-counter";
import {
  makeEmptyS708CounterFormState,
  pickS708Band,
  toS708CounterInput,
  type S708CounterFormState,
} from "./s708-counter-form.helpers";

interface Props {
  disclaimer: string;
}

const BAND_STYLES = {
  green: {
    border: "border-emerald-300",
    bg: "bg-emerald-50/60",
    text: "text-emerald-800",
    Icon: CheckCircle2,
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50/60",
    text: "text-amber-800",
    Icon: AlertTriangle,
  },
  red: {
    border: "border-red-200",
    bg: "bg-red-50/40",
    text: "text-red-800",
    Icon: XCircle,
  },
} as const;

const HEADLINES: Record<S708CounterResult["status"], string> = {
  ok: "s708(1) exemption still available",
  warn: "s708(1) exemption running low — check the next tranche",
  block: "s708(1) exemption blocked — pick a different exemption",
};

function formatAud(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `A$${Math.round(value).toLocaleString("en-AU")}`;
}

export function S708CounterFormClient(props: Props) {
  const [state, setState] = React.useState<S708CounterFormState>(
    makeEmptyS708CounterFormState,
  );
  const [result, setResult] = React.useState<S708CounterResult | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const patch = React.useCallback(
    <K extends keyof S708CounterFormState>(
      key: K,
      value: S708CounterFormState[K],
    ) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = toS708CounterInput(state);
      const res = await fetch("/api/compliance/s708-small-scale-counter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: S708CounterResult;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.result) {
        setError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setResult(json.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  const band = result ? pickS708Band(result) : null;
  const BandStyle = band ? BAND_STYLES[band] : null;

  return (
    <section
      aria-label="s708(1) small-scale personal-offer counter"
      className="rounded-2xl border border-border bg-background p-6 space-y-6"
    >
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          Corporations Act 2001 (Cth) · s708(1) small-scale offering counter
        </div>
        <h2 className="mt-2 text-xl font-semibold text-ink-800">
          Model the next tranche
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-600 leading-relaxed">
          Paste your personal-offer register (one row per accepted offer). We
          roll the trailing 365-day window and tell you how much investor +
          dollar headroom is left under the s708(1) "20 investors / A$2M in 12
          months" caps. Tick the preview box to model what would happen if you
          accept the next tranche.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="block">
          <div className="text-sm font-semibold text-ink-800">
            Personal-offer events
          </div>
          <div className="text-xs text-ink-500 mt-1">
            One row per accepted offer:{" "}
            <code>offer_date, investor_id, amount_aud [, offer_type]</code>.
            Dates ISO (YYYY-MM-DD); offer_type is <code>primary</code> or{" "}
            <code>secondary_on_sale</code> (s707). Blank + malformed lines are
            silently dropped.
          </div>
          <textarea
            value={state.events_text}
            onChange={(e) => patch("events_text", e.target.value)}
            rows={8}
            placeholder={
              "2026-01-05, alice@example.com, 50000, primary\n2026-02-10, bob@example.com, 75000, primary\n2026-03-15, carol@example.com, 25000, secondary_on_sale"
            }
            className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 font-mono text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </label>

        <fieldset className="rounded-xl border border-surface-200 bg-surface-50 p-4 space-y-3">
          <legend className="text-sm font-semibold text-ink-800 px-1">
            Preview the next tranche (optional)
          </legend>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={state.preview_enabled}
              onChange={(e) => patch("preview_enabled", e.target.checked)}
              className="h-4 w-4"
            />
            Show what happens if we accept this next tranche
          </label>
          {state.preview_enabled ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="text-xs font-medium text-ink-700">
                  New investors added
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={state.preview_new_investors}
                  onChange={(e) =>
                    patch("preview_new_investors", e.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="3"
                />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-ink-700">
                  Amount raised (AUD)
                </div>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={state.preview_amount_aud}
                  onChange={(e) => patch("preview_amount_aud", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="150000"
                />
              </label>
            </div>
          ) : null}
        </fieldset>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="h-11 px-6 rounded-2xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Running counter…
              </>
            ) : (
              "Run s708(1) counter"
            )}
          </button>
        </div>
      </form>

      {result && BandStyle ? (
        <section
          data-testid="s708-counter-result-banner"
          className={cn(
            "rounded-2xl border-2 p-6 space-y-3",
            BandStyle.border,
            BandStyle.bg,
          )}
        >
          <div className="flex items-start gap-3">
            <BandStyle.Icon
              strokeWidth={1.75}
              className={cn("h-7 w-7 mt-0.5 shrink-0", BandStyle.text)}
            />
            <div>
              <h3 className={cn("text-lg font-bold", BandStyle.text)}>
                {HEADLINES[result.status]}
              </h3>
              <p className="text-xs text-ink-600 mt-1">
                Window: <strong>{result.window_start_iso}</strong> →{" "}
                <strong>{result.window_end_iso}</strong> · investors used:{" "}
                <strong>
                  {result.investor_count_12mo} / {result.investor_cap}
                </strong>{" "}
                · raised:{" "}
                <strong>{formatAud(result.dollars_raised_12mo_aud)}</strong> of{" "}
                <strong>{formatAud(result.dollar_cap_aud)}</strong>
              </p>
            </div>
          </div>
          <p className="text-sm text-ink-700 leading-relaxed">
            {result.reason}
          </p>
          <p className="text-sm text-ink-700 leading-relaxed">
            <strong>Next action:</strong> {result.next_action}
          </p>
        </section>
      ) : null}

      <p className="text-xs text-ink-400 leading-relaxed">{props.disclaimer}</p>
    </section>
  );
}
