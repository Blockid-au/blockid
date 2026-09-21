"use client";

// OverrideDialog — record a human override of one model score with a reason
// code (G21 P2-B, FI § 54). Dimension select · from (read-only, the model
// score on screen) → to (0–100) · reason code · note (required for "Other").
// Explains that the canonical score is unchanged and that the cohort view
// shows both. POST /api/evaluations/batch/[id]/overrides; the parent
// refreshes the row on success.
//
// Validation is the same Zod schema the route uses (`overrideInputSchema`)
// so the dialog never sends what the server would reject; errors sit under
// the field they belong to and the first invalid field takes focus.

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSION_KEYS, DIMENSION_LABELS, type DimensionKey } from "@/lib/evaluations/batch-shared";
import type { CohortRow } from "@/lib/evaluations/cohort-rows";
import { OVERRIDE_NOTE_MAX, OVERRIDE_REASON_CODES, OVERRIDE_REASON_LABELS, overrideInputSchema, type OverrideDimension, type OverrideReasonCode } from "@/lib/evaluations/overrides-shared";
import { userErrorMessage } from "@/lib/ui/user-error";
import { useReturnFocus } from "./use-return-focus";

export interface OverrideDialogProps {
  open: boolean;
  batchId: string;
  row: CohortRow | null;
  onClose: () => void;
  /** Called with the created override after a 201. */
  onSaved?: (override: unknown) => void;
  /** Initial dimension (defaults to the row's weakest). */
  initialDimension?: OverrideDimension;
}

export interface OverrideFormValues {
  dimension: OverrideDimension;
  to: string;
  reasonCode: OverrideReasonCode | "";
  note: string;
}

export type OverrideFieldErrors = Partial<Record<"dimension" | "to" | "reasonCode" | "note", string>>;

/** Pure: the field-level validation the dialog runs before POSTing (mirrors the route's Zod). */
export function validateOverrideForm(values: OverrideFormValues, itemId: number): { ok: true; body: Record<string, unknown> } | { ok: false; errors: OverrideFieldErrors } {
  const errors: OverrideFieldErrors = {};
  if (!values.reasonCode) errors.reasonCode = "Choose why you are overriding the model score";
  const to = values.to.trim() === "" ? NaN : Number(values.to);
  if (!Number.isFinite(to)) errors.to = "Enter the score you want to record (0–100)";
  else if (to < 0 || to > 100) errors.to = "Scores run from 0 to 100";
  if (values.note.length > OVERRIDE_NOTE_MAX) errors.note = `Keep the note under ${OVERRIDE_NOTE_MAX} characters`;
  if (values.reasonCode === "other" && !values.note.trim()) errors.note = "Add a note when the reason is “Other”";
  if (Object.keys(errors).length) return { ok: false, errors };
  const parsed = overrideInputSchema.safeParse({ item_id: itemId, dimension: values.dimension, to_value: to, reason_code: values.reasonCode, note: values.note.trim() || null });
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "");
      const field = k === "to_value" ? "to" : k === "reason_code" ? "reasonCode" : k === "dimension" ? "dimension" : "note";
      errors[field] = i.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, body: parsed.data };
}

export function modelScoreFor(row: CohortRow | null, dimension: OverrideDimension): number | null {
  if (!row) return null;
  if (dimension === "total") return row.svi;
  const v = row.dimensionScores?.[dimension as DimensionKey];
  return typeof v === "number" ? v : null;
}

const field = "mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-action";

export function OverrideDialog({ open, batchId, row, onClose, onSaved, initialDimension }: OverrideDialogProps) {
  // G22-A A.4: focus returns to the "Override" button that opened the dialog
  // when it closes (hook declared here, above the early return, so it runs
  // on every render; it follows focus while closed and pins the opener
  // before the form's own first-field focus() runs).
  useReturnFocus(open && !!row);
  if (!open || !row) return null;
  // Keyed by the row so every open starts from a fresh form (state initialisers, no reset effect).
  return <OverrideForm key={row.itemId} batchId={batchId} row={row} onClose={onClose} onSaved={onSaved} initialDimension={initialDimension} />;
}

function OverrideForm({ batchId, row, onClose, onSaved, initialDimension }: Omit<OverrideDialogProps, "open" | "row"> & { row: CohortRow }) {
  const [values, setValues] = React.useState<OverrideFormValues>({ dimension: initialDimension ?? row.weakestDim ?? "total", to: "", reasonCode: "", note: "" });
  const [errors, setErrors] = React.useState<OverrideFieldErrors>({});
  const [state, setState] = React.useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const firstRef = React.useRef<HTMLSelectElement>(null);
  const toRef = React.useRef<HTMLInputElement>(null);
  const reasonRef = React.useRef<HTMLSelectElement>(null);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const from = modelScoreFor(row, values.dimension);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateOverrideForm(values, row.itemId);
    if (!v.ok) {
      setErrors(v.errors);
      if (v.errors.to) toRef.current?.focus();
      else if (v.errors.reasonCode) reasonRef.current?.focus();
      else if (v.errors.note) noteRef.current?.focus();
      return;
    }
    setErrors({});
    setState("busy");
    try {
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/overrides`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v.body) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; override?: unknown; message?: string; error?: string };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? `HTTP ${res.status}`), { status: res.status, body });
      setState("idle");
      onSaved?.(body.override);
      onClose();
    } catch (err) {
      setState("error");
      setMessage(userErrorMessage(err, "Could not record the override — try again."));
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="override-dialog-title" aria-describedby="override-dialog-desc" className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" data-testid="override-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <form onSubmit={submit} noValidate className="relative w-full max-w-lg rounded-t-2xl border border-line-subtle bg-surface p-5 text-primary shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="override-dialog-title" className="text-base font-semibold">
              Override a score — {row.company}
            </h2>
            <p id="override-dialog-desc" className="mt-1 text-xs text-secondary">
              The canonical score is unchanged; the cohort view shows the model score and your override side by side, with your reason code in the decision log.
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-secondary hover:bg-surface-hover" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-secondary">
            Dimension
            <select ref={firstRef} value={values.dimension} onChange={(e) => setValues({ ...values, dimension: e.target.value as OverrideDimension })} className={field} data-testid="override-dimension">
              {DIMENSION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {DIMENSION_LABELS[k]}
                </option>
              ))}
              <option value="total">SVI total</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-secondary">
              Model score
              <input value={from == null ? "—" : String(Math.round(from))} readOnly aria-readonly="true" className={cn(field, "bg-surface-sunken text-secondary")} data-testid="override-from" />
            </label>
            <label className="block text-xs font-medium text-secondary">
              Your score <span aria-hidden="true">*</span>
              <input
                ref={toRef}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                required
                value={values.to}
                onChange={(e) => setValues({ ...values, to: e.target.value })}
                aria-invalid={!!errors.to}
                aria-describedby={errors.to ? "override-to-error" : undefined}
                className={cn(field, errors.to ? "border-bear" : "")}
                data-testid="override-to"
              />
              {errors.to ? (
                <span id="override-to-error" role="alert" className="mt-1 block text-xs font-normal text-bear" data-testid="override-to-error">
                  {errors.to}
                </span>
              ) : null}
            </label>
          </div>
        </div>

        <label className="mt-3 block text-xs font-medium text-secondary">
          Reason <span aria-hidden="true">*</span>
          <select
            ref={reasonRef}
            required
            value={values.reasonCode}
            onChange={(e) => setValues({ ...values, reasonCode: e.target.value as OverrideReasonCode | "" })}
            aria-invalid={!!errors.reasonCode}
            aria-describedby={errors.reasonCode ? "override-reason-error" : undefined}
            className={cn(field, errors.reasonCode ? "border-bear" : "")}
            data-testid="override-reason"
          >
            <option value="">Choose a reason…</option>
            {OVERRIDE_REASON_CODES.map((c) => (
              <option key={c} value={c}>
                {OVERRIDE_REASON_LABELS[c]}
              </option>
            ))}
          </select>
          {errors.reasonCode ? (
            <span id="override-reason-error" role="alert" className="mt-1 block text-xs font-normal text-bear" data-testid="override-reason-error">
              {errors.reasonCode}
            </span>
          ) : null}
        </label>

        <label className="mt-3 block text-xs font-medium text-secondary">
          Note {values.reasonCode === "other" ? <span aria-hidden="true">*</span> : <span className="font-normal text-muted">(optional)</span>}
          <textarea
            ref={noteRef}
            rows={3}
            maxLength={OVERRIDE_NOTE_MAX}
            value={values.note}
            onChange={(e) => setValues({ ...values, note: e.target.value })}
            aria-invalid={!!errors.note}
            aria-describedby={errors.note ? "override-note-error" : "override-note-help"}
            className={cn(field, "h-auto py-2", errors.note ? "border-bear" : "")}
            data-testid="override-note"
          />
          <span id="override-note-help" className="mt-1 block text-xs font-normal text-muted">
            What you saw that the model did not. Shown to every seat on this cohort; never to the founder.
          </span>
          {errors.note ? (
            <span id="override-note-error" role="alert" className="mt-1 block text-xs font-normal text-bear" data-testid="override-note-error">
              {errors.note}
            </span>
          ) : null}
        </label>

        {state === "error" && message ? (
          <p role="alert" className="mt-3 rounded-xl border border-bear/40 bg-surface-sunken px-3 py-2 text-xs text-bear">
            {message}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-secondary hover:bg-surface-hover">
            Cancel
          </button>
          <button type="submit" disabled={state === "busy"} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50" data-testid="override-submit">
            {state === "busy" ? "Recording…" : "Record override"}
          </button>
        </div>
      </form>
    </div>
  );
}
