"use client";

// Share-with-founder dialog (G13-W4-D2, S-D2; BA spec §A.3 block 4 "Share
// with founder", story S4 / E4.3, §C.1).
//
// The allow-list is the WHOLE dialog: four checkboxes (dimension ratings ·
// risks · questions for the founder · shared notes), a literal preview
// headed "The founder will see exactly these items" that lists the ticked
// sections' CURRENT content line by line, and the explicit list of what can
// never be shared (decision · conviction · thesis fit · valuation view ·
// private notes · criterion ratings). Confirm → POST …/share; the server
// echoes the founder projection it stored and the dialog shows it once
// more. Revoke → DELETE …/share clears every version.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { userErrorMessage } from "@/lib/ui/user-error";
import type { EvaluationAssessment, FounderShareField, FounderVisibleAssessment } from "@/lib/evaluations/assessments";
import { NEVER_SHARED_LABELS, SHARE_PREVIEW_HEADING, SHARE_SECTIONS, sectionPreviewLines, type AssessmentFormValues } from "./assessment-shared";

export interface ShareDialogProps {
  evaluationId: string;
  values: AssessmentFormValues;
  initialFields: FounderShareField[];
  shared: boolean;
  onClose: () => void;
  onShared: (assessment: EvaluationAssessment, fieldsCount: number) => void;
  onRevoked: () => void;
}

type Phase = { kind: "pick" } | { kind: "busy" } | { kind: "done"; preview: FounderVisibleAssessment; at: string } | { kind: "error"; message: string };

export function ShareDialog({ evaluationId, values, initialFields, shared, onClose, onShared, onRevoked }: ShareDialogProps) {
  const [ticked, setTicked] = useState<FounderShareField[]>(initialFields.length ? initialFields : []);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const titleId = useId();
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preview = useMemo(
    () => SHARE_SECTIONS.filter((s) => ticked.includes(s.field)).map((s) => ({ ...s, lines: sectionPreviewLines(values, s.field) })),
    [ticked, values],
  );

  const toggle = (f: FounderShareField) => setTicked((t) => (t.includes(f) ? t.filter((x) => x !== f) : [...t, f]));

  const confirm = async () => {
    setPhase({ kind: "busy" });
    try {
      const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/assessment/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: ticked }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; founder_preview?: FounderVisibleAssessment; shared_with_founder_at?: string; shared_fields?: FounderShareField[]; message?: string; error?: string };
      if (!res.ok || !json.ok || !json.founder_preview) {
        setPhase({ kind: "error", message: json.message ?? json.error ?? `Share failed (${res.status})` });
        return;
      }
      // Reflect the server's stored share on the parent's current row.
      const r = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/assessment`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { assessment?: EvaluationAssessment };
      if (j.assessment) onShared(j.assessment, ticked.length);
      setPhase({ kind: "done", preview: json.founder_preview, at: json.shared_with_founder_at ?? new Date().toISOString() });
    } catch (err) {
      setPhase({ kind: "error", message: userErrorMessage(err, "Could not update sharing. Please try again.") });
    }
  };

  const revoke = async () => {
    setPhase({ kind: "busy" });
    try {
      const res = await fetch(`/api/evaluations/${encodeURIComponent(evaluationId)}/assessment/share`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) {
        setPhase({ kind: "error", message: json.message ?? json.error ?? `Revoke failed (${res.status})` });
        return;
      }
      onRevoked();
      onClose();
    } catch (err) {
      setPhase({ kind: "error", message: userErrorMessage(err, "Could not update sharing. Please try again.") });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-4 sm:items-center" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} data-testid="share-dialog">
        <h3 id={titleId} className="text-base font-semibold text-ink-900">Share with the founder</h3>
        <p className="mt-1 text-xs text-ink-600">Sharing is explicit and per section. You can revoke it at any time; the founder then sees nothing from your assessment again.</p>

        {phase.kind === "done" ? (
          <div className="mt-4" data-testid="share-done">
            <p className="text-sm text-emerald-800">Shared. The founder now sees exactly:</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-ink-800">
              {phase.preview.sharedFields.map((f) => (
                <li key={f}>{SHARE_SECTIONS.find((s) => s.field === f)?.label ?? f}</li>
              ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <button type="button" className="rounded-lg border border-surface-300 px-3 py-1.5 text-sm" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink-800">Sections to share</legend>
              <ul className="mt-2 space-y-2">
                {SHARE_SECTIONS.map((s, i) => {
                  const id = `share-${s.field}`;
                  return (
                    <li key={s.field} className="flex items-start gap-2">
                      <input ref={i === 0 ? firstRef : undefined} id={id} type="checkbox" className="mt-1" checked={ticked.includes(s.field)} onChange={() => toggle(s.field)} data-testid={`share-tick-${s.field}`} />
                      <label htmlFor={id} className="text-sm text-ink-800">
                        {s.label}
                        <span className="block text-xs text-ink-500">{s.hint}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <section aria-labelledby="share-preview-heading" className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-3" data-testid="share-preview">
              <h4 id="share-preview-heading" className="text-sm font-semibold text-ink-900">{SHARE_PREVIEW_HEADING}</h4>
              {preview.length === 0 ? (
                <p className="mt-1 text-xs text-ink-500">Nothing ticked — the founder will see nothing.</p>
              ) : (
                preview.map((s) => (
                  <div key={s.field} className="mt-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-600">{s.label}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-800" data-testid={`share-preview-${s.field}`}>
                      {s.lines.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              <p className="mt-3 text-xs text-ink-500" data-testid="share-never">
                Never shared, whatever you tick: {NEVER_SHARED_LABELS.join(" · ")}.
              </p>
            </section>

            {phase.kind === "error" ? <p className="mt-3 text-sm text-red-700" role="alert">{phase.message}</p> : null}

            <div className="mt-4 flex flex-wrap justify-between gap-2">
              {shared ? (
                <button type="button" className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-800 disabled:opacity-50" onClick={() => void revoke()} disabled={phase.kind === "busy"} data-testid="share-revoke">
                  Revoke sharing
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border border-surface-300 px-3 py-1.5 text-sm" onClick={onClose} disabled={phase.kind === "busy"}>Cancel</button>
                <button type="button" className="rounded-lg border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" onClick={() => void confirm()} disabled={phase.kind === "busy" || ticked.length === 0} data-testid="share-confirm">
                  {shared ? "Update what is shared" : "Share these sections"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
