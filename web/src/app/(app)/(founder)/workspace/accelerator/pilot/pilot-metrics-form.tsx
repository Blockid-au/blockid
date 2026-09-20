"use client";

// PilotMetricsForm — the success-metric capture form of the pilot delivery
// kit (G21 P2-C). One field per `PILOT_METRIC_FIELDS` row, grouped by the
// offer's metric line; saves through PATCH /api/pilots/[orderId]/metrics
// (only the keys the program filled; clearing a field sends null). Visible
// labels, helper text under every input, errors beside the field, one
// primary action, aria-live status.

import { useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { PILOT_METRIC_FIELDS, WTP_BANDS, WTP_BAND_LABELS, reviewTimeSaving, type PilotMetrics, type PilotMetricKey } from "@/lib/pilots/metrics";
import { userErrorMessage } from "@/lib/ui/user-error";

export interface PilotMetricsFormProps {
  orderId: string;
  initial: PilotMetrics;
  /** False for an admin previewing another program's kit — the form renders read-only. */
  editable?: boolean;
}

type Draft = Partial<Record<PilotMetricKey, string | boolean>>;

function toDraft(m: PilotMetrics): Draft {
  const d: Draft = {};
  for (const f of PILOT_METRIC_FIELDS) {
    const v = m[f.key];
    if (v === undefined || v === null) continue;
    if (f.kind === "consent") d[f.key] = Boolean(v);
    else if (f.kind === "yesno") d[f.key] = v ? "yes" : "no";
    else d[f.key] = String(v);
  }
  return d;
}

function toPatch(d: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of PILOT_METRIC_FIELDS) {
    const v = d[f.key];
    if (f.kind === "consent") {
      out[f.key] = Boolean(v);
      continue;
    }
    if (v === undefined || v === "") {
      out[f.key] = null;
      continue;
    }
    if (f.kind === "yesno") out[f.key] = v === "yes";
    else if (f.kind === "band" || f.kind === "text") out[f.key] = String(v);
    else out[f.key] = Number(v);
  }
  return out;
}

const input = "mt-1 block w-full min-h-11 rounded-lg border border-line-subtle bg-surface px-3 text-sm text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-60";

export function PilotMetricsForm({ orderId, initial, editable = true }: PilotMetricsFormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (k: PilotMetricKey, v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !editable) return;
    setBusy(true);
    setStatus(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/pilots/${encodeURIComponent(orderId)}/metrics`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(toPatch(draft)) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; issues?: Array<{ path: string; message: string }> };
      if (!res.ok || !body.ok) {
        const errs: Record<string, string> = {};
        for (const i of body.issues ?? []) if (i.path) errs[i.path] = i.message;
        setFieldErrors(errs);
        setStatus({ kind: "error", text: body.message ?? body.error ?? `Save failed (${res.status}).` });
        return;
      }
      setStatus({ kind: "ok", text: "Saved. These figures feed the pilot's final report." });
    } catch (err) {
      setStatus({ kind: "error", text: userErrorMessage(err, "We could not save the pilot metrics. Please try again.") });
    } finally {
      setBusy(false);
    }
  }

  const saving = reviewTimeSaving({ review_minutes_before: Number(draft.review_minutes_before) || undefined, review_minutes_after: draft.review_minutes_after === "" || draft.review_minutes_after === undefined ? undefined : Number(draft.review_minutes_after) });
  const groups = Array.from(new Set(PILOT_METRIC_FIELDS.map((f) => f.group)));

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid="pilot-metrics-form" aria-describedby="pilot-metrics-status">
      {groups.map((g) => (
        <fieldset key={g} className="rounded-2xl border border-line-subtle bg-surface p-4">
          <legend className="px-1 text-sm font-semibold text-primary">{g}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            {PILOT_METRIC_FIELDS.filter((f) => f.group === g).map((f) => {
              const id = `pm-${f.key}`;
              const err = fieldErrors[f.key];
              const v = draft[f.key];
              return (
                <div key={f.key} className={f.kind === "text" ? "md:col-span-2" : ""}>
                  {f.kind === "consent" ? (
                    <label htmlFor={id} className="flex min-h-11 items-start gap-3 text-sm text-primary">
                      <input id={id} name={f.key} type="checkbox" checked={Boolean(v)} disabled={!editable} onChange={(e) => set(f.key, e.target.checked)} className="mt-1 h-5 w-5 rounded border-line-subtle" data-testid="pilot-case-study-consent" />
                      <span>
                        <span className="font-medium">{f.label}</span>
                        <span className="mt-0.5 block text-xs text-secondary">{f.help}</span>
                      </span>
                    </label>
                  ) : (
                    <>
                      <label htmlFor={id} className="block text-sm font-medium text-primary">
                        {f.label}
                      </label>
                      {f.kind === "yesno" ? (
                        <select id={id} name={f.key} value={typeof v === "string" ? v : ""} disabled={!editable} onChange={(e) => set(f.key, e.target.value)} className={input}>
                          <option value="">Not answered</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : f.kind === "band" ? (
                        <select id={id} name={f.key} value={typeof v === "string" ? v : ""} disabled={!editable} onChange={(e) => set(f.key, e.target.value)} className={input}>
                          <option value="">Not answered</option>
                          {WTP_BANDS.map((b) => (
                            <option key={b} value={b}>
                              {WTP_BAND_LABELS[b]}
                            </option>
                          ))}
                        </select>
                      ) : f.kind === "text" ? (
                        <textarea id={id} name={f.key} value={typeof v === "string" ? v : ""} disabled={!editable} onChange={(e) => set(f.key, e.target.value)} rows={3} maxLength={2000} className={`${input} min-h-24 py-2`} />
                      ) : (
                        <input
                          id={id}
                          name={f.key}
                          type="number"
                          inputMode="numeric"
                          min={f.kind === "rating" ? 1 : 0}
                          max={f.kind === "rating" ? 5 : f.kind === "percent" ? 100 : undefined}
                          step={1}
                          value={typeof v === "string" ? v : ""}
                          disabled={!editable}
                          onChange={(e) => set(f.key, e.target.value)}
                          aria-invalid={err ? true : undefined}
                          aria-describedby={`${id}-help${err ? ` ${id}-err` : ""}`}
                          className={input}
                        />
                      )}
                      <p id={`${id}-help`} className="mt-1 text-xs text-secondary">
                        {f.help}
                      </p>
                      {err ? (
                        <p id={`${id}-err`} className="mt-1 text-xs text-bear" role="alert">
                          {err}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {g === "Review time per startup" && saving ? (
            <p className="mt-3 text-sm text-secondary" data-testid="pilot-review-saving">
              {saving.before} min → {saving.after} min ({saving.pct >= 0 ? "−" : "+"}
              {Math.abs(saving.pct)} %)
            </p>
          ) : null}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !editable} aria-busy={busy} data-testid="pilot-metrics-save" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50">
          <Save className="h-4 w-4" aria-hidden="true" />
          {busy ? "Saving…" : "Save metrics"}
        </button>
        <p id="pilot-metrics-status" aria-live="polite" className={`text-sm ${status?.kind === "error" ? "text-bear" : "text-secondary"}`}>
          {status?.text ?? (editable ? "Only what you fill in is saved; blanks stay blank." : "Read-only preview.")}
        </p>
      </div>
    </form>
  );
}
