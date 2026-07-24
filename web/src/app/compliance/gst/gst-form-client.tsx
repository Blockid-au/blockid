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
import type { GSTInput, GSTResult } from "@/lib/compliance/gst-threshold";
import {
  fromGstInput,
  makeEmptyGstFormState,
  pickGstBand,
  toGstInput,
  type GstFormState,
} from "./gst-form.helpers";

interface Props {
  initialInput: GSTInput | null;
  initialResult: GSTResult | null;
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

const HEADLINES: Record<GSTResult["action_required"], string> = {
  urgent_register: "GST registration overdue — file within 21 days",
  register_within_21_days: "GST registration required soon",
  already_registered: "Registered for GST",
  none: "Below the GST threshold",
};

function Toggle(props: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-surface-200 bg-white p-4 cursor-pointer">
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink-800">{props.label}</div>
        {props.hint ? (
          <div className="text-xs text-ink-500 mt-0.5">{props.hint}</div>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        onClick={() => props.onChange(!props.checked)}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 mt-0.5",
          props.checked ? "bg-brand-600" : "bg-surface-300",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
            props.checked ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </label>
  );
}

function TextField(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number" | "date";
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-ink-800">{props.label}</div>
      {props.hint ? (
        <div className="text-xs text-ink-500 mt-0.5">{props.hint}</div>
      ) : null}
      <input
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  );
}

function formatAud(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `A$${value.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

export function GstFormClient(props: Props) {
  const [state, setState] = React.useState<GstFormState>(() =>
    props.initialInput
      ? fromGstInput(props.initialInput)
      : makeEmptyGstFormState(),
  );
  const [result, setResult] = React.useState<GSTResult | null>(
    props.initialResult ?? null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const patch = React.useCallback(
    <K extends keyof GstFormState>(key: K, value: GstFormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = toGstInput(state);
      const res = await fetch("/api/compliance/gst-threshold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        result?: GSTResult;
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

  const band = result ? pickGstBand(result) : null;
  const BandStyle = band ? BAND_STYLES[band] : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-brand-600 font-medium">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          A New Tax System (GST) Act 1999 · A$75,000 threshold worksheet
        </div>
        <h1 className="mt-2 text-3xl font-semibold text-ink-800">
          GST registration threshold
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-ink-600 leading-relaxed">
          Enter your monthly turnover history (oldest → newest) and — if you
          have one — your next-12-month projection. We compare both against the
          ATO's A$75,000 GST turnover threshold. The current + prior 11 months
          count as your <em>current GST turnover</em>; current + next 11 months
          count as your <em>projected GST turnover</em>. Either crossing
          triggers a 21-day registration window.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Monthly turnover history
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            AUD, GST-exclusive, comma or space separated (oldest → newest, up
            to 12 months). Non-numeric entries and negatives are silently
            dropped so a raw Stripe export is safe to paste.
          </p>
          <div className="mt-4 grid gap-4">
            <TextField
              label="Actual monthly turnover — trailing 12 months"
              value={state.monthly_turnover_last_12_months}
              onChange={(v) => patch("monthly_turnover_last_12_months", v)}
              placeholder="4200, 4800, 5100, 5400, 5700, 6100, 6400, 6600, 6900, 7100, 7300, 7500"
            />
            <TextField
              label="Projected monthly turnover — next 12 months"
              hint="Optional. If you omit this we still assess the trailing-12mo test on its own."
              value={state.projected_next_12_months}
              onChange={(v) => patch("projected_next_12_months", v)}
              placeholder="7700, 7900, 8100, 8300, 8500, 8700, 8900, 9100, 9300, 9500, 9700, 10000"
            />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-ink-800">
            Registration status
          </h2>
          <p className="text-xs text-ink-500 mt-1">
            If you've already registered we skip the threshold test and simply
            remind you to keep lodging BAS on your ATO cycle.
          </p>
          <div className="mt-4 space-y-3">
            <Toggle
              label="Already registered for GST"
              hint="Toggle on once your GST registration is live via the ATO Business Portal."
              checked={state.registered_for_gst}
              onChange={(v) => patch("registered_for_gst", v)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="GST registration date"
                hint="Optional. ISO date (YYYY-MM-DD)."
                value={state.registration_date}
                onChange={(v) => patch("registration_date", v)}
                type="date"
              />
              <TextField
                label="ABN (informational)"
                hint="Optional. We do not validate the ABN here — use the ABN lookup on Chapter 1."
                value={state.abn}
                onChange={(v) => patch("abn", v)}
                placeholder="79 659 615 111"
              />
            </div>
          </div>
        </section>

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
                <Loader2 className="h-4 w-4 animate-spin" /> Saving check…
              </>
            ) : (
              "Save & check"
            )}
          </button>
        </div>
      </form>

      {result && BandStyle ? (
        <section
          data-testid="gst-result-banner"
          className={cn(
            "rounded-2xl border-2 p-6 space-y-4",
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
                {HEADLINES[result.action_required]}
              </h3>
              <p className="text-xs text-ink-600 mt-1">
                Trailing 12mo:{" "}
                <strong>{formatAud(result.actual_12mo_turnover_aud)}</strong> ·
                projected next 12mo:{" "}
                <strong>{formatAud(result.projected_12mo_turnover_aud)}</strong>{" "}
                · threshold: <strong>{formatAud(result.threshold_aud)}</strong>
                {typeof result.will_cross_threshold_within_days === "number" ? (
                  <>
                    {" "}
                    · crosses within{" "}
                    <strong>
                      {result.will_cross_threshold_within_days} days
                    </strong>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <p className="text-sm text-ink-700 leading-relaxed">
            {result.reasoning}
          </p>
        </section>
      ) : null}

      <p className="text-xs text-ink-400 leading-relaxed">{props.disclaimer}</p>
    </div>
  );
}
