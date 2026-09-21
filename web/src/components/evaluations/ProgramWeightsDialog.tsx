"use client";

// ProgramWeightsDialog — "Edit program weights" on the BlockID Cohort page
// (G22-A A.3). Owner only (the page renders it for the owner seat; the route
// enforces it again). Reuses RubricWeightsSliders (the batch dialog's 8
// sliders), PATCHes /api/evaluations/batch/[id]/weights, and on success
// refreshes the page so the header reads the new "Program weights v<n>" and
// the table re-ranks. The canonical SVI never changes — only the displayed
// Program score does.
//
// Focus: the first slider takes focus on open, Escape / backdrop / Cancel
// close, and focus RETURNS to the "Edit program weights" button (A.4 rule,
// use-return-focus). Errors go through userErrorMessage — never a raw
// server string. An unchanged set saves as a no-op ("weights unchanged").

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSION_KEYS, normaliseWeights, type RubricWeights } from "@/lib/evaluations/batch-shared";
import { userErrorMessage } from "@/lib/ui/user-error";
import { RubricWeightsSliders } from "./RubricWeightsSliders";
import { useReturnFocus } from "./use-return-focus";

export interface ProgramWeightsDialogProps {
  batchId: string;
  /** The stored rubric (normalised to 100). */
  weights: RubricWeights;
  /** The current `weights_version` (header "Program weights v<n>"). */
  weightsVersion: number;
  /** Optional: called with the new version after a successful save (the page also refreshes). */
  onSaved?: (next: { weights: RubricWeights; weightsVersion: number; changed: boolean }) => void;
  className?: string;
}

export interface WeightsPatchResponse {
  ok?: boolean;
  weights_version?: number;
  previous_version?: number;
  changed?: boolean;
  batch?: { rubricWeights?: RubricWeights; weightsVersion?: number };
  message?: string;
  error?: string;
}

/** Pure: has the slider set moved from the stored rubric (after normalisation)? */
export function weightsDiffer(a: RubricWeights, b: RubricWeights): boolean {
  const na = normaliseWeights(a);
  const nb = normaliseWeights(b);
  return DIMENSION_KEYS.some((k) => Math.abs(na[k] - nb[k]) >= 0.01);
}

/** Pure: the status line after a save. */
export function savedMessage(res: { changed: boolean; weightsVersion: number }): string {
  return res.changed ? `Program weights saved as v${res.weightsVersion}. The table re-ranks now; the next snapshot stamps v${res.weightsVersion}.` : "Weights unchanged — nothing to save.";
}

export function ProgramWeightsDialog({ batchId, weights, weightsVersion, onSaved, className }: ProgramWeightsDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<RubricWeights>(weights);
  const [state, setState] = React.useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const firstSliderId = `pw-${DIMENSION_KEYS[0]}`;

  useReturnFocus(open);

  const close = React.useCallback(() => {
    setOpen(false);
    setState("idle");
    setMessage(null);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    document.getElementById(firstSliderId)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, firstSliderId]);

  function openDialog() {
    setDraft(weights);
    setStatus(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (state === "busy") return;
    if (!weightsDiffer(draft, weights)) {
      setStatus(savedMessage({ changed: false, weightsVersion }));
      close();
      return;
    }
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/weights`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ rubric_weights: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as WeightsPatchResponse;
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? `HTTP ${res.status}`), { status: res.status, body });
      const nextVersion = typeof body.weights_version === "number" ? body.weights_version : weightsVersion + 1;
      const nextWeights = body.batch?.rubricWeights ?? normaliseWeights(draft);
      setStatus(savedMessage({ changed: body.changed !== false, weightsVersion: nextVersion }));
      onSaved?.({ weights: nextWeights, weightsVersion: nextVersion, changed: body.changed !== false });
      close();
      router.refresh();
    } catch (err) {
      console.error("[program-weights] save", err);
      setState("error");
      setMessage(userErrorMessage(err, "Could not save the program weights — try again."));
    }
  }

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)} data-testid="program-weights">
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-secondary hover:bg-surface-hover hover:text-primary cursor-pointer"
        data-testid="program-weights-edit"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        Edit program weights
      </button>
      {status ? (
        <span role="status" aria-live="polite" className="text-xs text-secondary" data-testid="program-weights-status">
          {status}
        </span>
      ) : null}

      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="program-weights-title" aria-describedby="program-weights-desc" className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" data-testid="program-weights-dialog">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden="true" />
          <form onSubmit={save} noValidate className="relative max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line-subtle bg-surface p-5 text-primary shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="program-weights-title" className="text-base font-semibold">
                  Program weights — v{weightsVersion}
                </h2>
                <p id="program-weights-desc" className="mt-1 text-xs text-secondary">
                  The rubric ranks this cohort by your Program score over each startup&apos;s 8 dimension scores. Saving bumps the weight set to v{weightsVersion + 1}; the canonical SVI is unchanged and every later snapshot is stamped with the new version so deltas say when the weights changed.
                </p>
              </div>
              <button type="button" onClick={close} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-secondary hover:bg-surface-hover cursor-pointer" aria-label="Close">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p id="program-weights-sliders-label" className="mt-4 text-xs font-medium text-secondary">
              Weight per dimension
            </p>
            <RubricWeightsSliders weights={draft} onChange={setDraft} labelledBy="program-weights-sliders-label" id="program-weights-sliders" idPrefix="pw" />

            {state === "error" && message ? (
              <p role="alert" className="mt-3 rounded-xl border border-bear/40 bg-surface-sunken px-3 py-2 text-xs text-bear" data-testid="program-weights-error">
                {message}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={close} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-secondary hover:bg-surface-hover cursor-pointer">
                Cancel
              </button>
              <button type="submit" disabled={state === "busy"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 cursor-pointer" data-testid="program-weights-save">
                {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {state === "busy" ? "Saving…" : "Save weights"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
