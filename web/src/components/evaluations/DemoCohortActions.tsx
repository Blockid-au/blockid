"use client";

// DemoCohortActions — the two client actions of the fictional demo cohort
// (G24-C): LoadDemoCohortButton (POST /api/evaluations/batch/demo → open the
// cohort; the idempotent repeat opens the existing one) and
// RemoveDemoCohortButton (owner only; an inline two-step confirm — no browser
// dialog — then DELETE and back to the Cohorts list). Copy comes from the
// catalogue through `labels` (EN default), so the same component renders VI.

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, Trash2 } from "lucide-react";
import { DEMO_COHORT_LABELS_EN, type DemoCohortLabels } from "@/lib/evaluations/demo-cohort-shared";

type DemoResponse = { ok?: boolean; batch_id?: string; created?: boolean; error?: string; message?: string; upgrade_url?: string };

export const DEMO_COHORT_ENDPOINT = "/api/evaluations/batch/demo";
export const COHORT_PATH_TEMPLATE = "/workspace/evaluations/cohort/{batchId}";
export const COHORT_PATH = (batchId: string) => demoCohortHref(COHORT_PATH_TEMPLATE, batchId);

const SECONDARY = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-subtle bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:cursor-not-allowed disabled:opacity-50";
const DANGER = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-bear/40 bg-surface px-4 text-sm font-semibold text-bear hover:bg-bear/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bear disabled:cursor-not-allowed disabled:opacity-50";

export interface LoadDemoCohortButtonProps {
  labels?: Pick<DemoCohortLabels, "load" | "loading" | "error">;
  /**
   * Where to go once the batch exists — a template with `{batchId}`, default
   * the cohort page. A string, not a function: the callers are Server
   * Components and a function prop cannot cross the RSC boundary (live-qa 33
   * on v3.24.0: /workspace/accelerator hit the error boundary, React #441).
   */
  hrefTemplate?: string;
  className?: string;
}

/** Fill the `{batchId}` slot (encoded); a template without the slot navigates to the template as-is. */
export function demoCohortHref(template: string, batchId: string): string {
  return template.includes("{batchId}") ? template.replace("{batchId}", encodeURIComponent(batchId)) : `${template}/${encodeURIComponent(batchId)}`;
}

export function LoadDemoCohortButton({ labels = DEMO_COHORT_LABELS_EN, hrefTemplate = COHORT_PATH_TEMPLATE, className = "" }: LoadDemoCohortButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function load() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(DEMO_COHORT_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" } });
      const body = (await res.json().catch(() => ({}))) as DemoResponse;
      if (!res.ok || !body.ok || !body.batch_id) {
        setError(body.message ?? labels.error);
        return;
      }
      router.push(demoCohortHref(hrefTemplate, body.batch_id));
      router.refresh();
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <button type="button" onClick={load} disabled={busy} aria-busy={busy} className={SECONDARY} data-testid="load-demo-cohort">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FlaskConical className="h-4 w-4" aria-hidden="true" />}
        {busy ? labels.loading : labels.load}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-medium text-bear">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export interface RemoveDemoCohortButtonProps {
  labels?: Pick<DemoCohortLabels, "remove" | "removeConfirm" | "removed" | "cancel" | "error">;
  /** Where to go after removal; default = the Cohorts index. */
  afterHref?: string;
  className?: string;
}

export function RemoveDemoCohortButton({ labels = DEMO_COHORT_LABELS_EN, afterHref = "/workspace/evaluations/cohort", className = "" }: RemoveDemoCohortButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(DEMO_COHORT_ENDPOINT, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as DemoResponse;
      if (!res.ok || !body.ok) {
        setError(body.message ?? labels.error);
        return;
      }
      router.push(`${afterHref}${afterHref.includes("?") ? "&" : "?"}demo=removed`);
      router.refresh();
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    // Quiet until asked: the first press is a neutral secondary button (the demo banner
    // must not open on a red action); the confirm step carries the danger tone.
    return (
      <span className={`inline-flex flex-col gap-1 ${className}`}>
        <button type="button" onClick={() => setConfirming(true)} className={SECONDARY} data-testid="remove-demo-cohort">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {labels.remove}
        </button>
      </span>
    );
  }
  return (
    <span className={`inline-flex flex-col gap-2 ${className}`} data-testid="remove-demo-cohort-confirm">
      <span className="text-sm text-secondary">{labels.removeConfirm}</span>
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={remove} disabled={busy} aria-busy={busy} className={DANGER} data-testid="remove-demo-cohort-yes">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
          {labels.remove}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={SECONDARY}>
          {labels.cancel}
        </button>
      </span>
      {error ? (
        <span role="alert" className="text-xs font-medium text-bear">
          {error}
        </span>
      ) : null}
    </span>
  );
}
