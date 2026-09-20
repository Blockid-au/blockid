"use client";

// FeedbackLettersPanel — "Send feedback letters to non-selected applicants"
// on the Selection tab (G21 P2-C). Two steps, nothing sent without the
// second click:
//   1. Preview  → POST /api/reports/cohort/feedback-letters { batch } —
//      per non-selected applicant: eligible under the k ≥ 3 / ≥ 2 orgs
//      floor, the subject and an excerpt; below-floor startups are listed
//      as such and never sent.
//   2. Confirm  → the same route with { confirm: true } for the eligible
//      projects — letters stored + e-mailed through the existing founder
//      feedback-letter flow.

import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";

export interface FeedbackCandidateLite {
  projectId: string;
  name: string;
}

interface Preview {
  projectId: string;
  name: string;
  reason: "eligible" | "below_floor" | "no_founder" | "already_sent" | "unavailable";
  k: number;
  orgCount: number;
  subject: string | null;
  excerpt: string | null;
}

interface SendRow {
  projectId: string;
  name: string;
  outcome: string;
}

const REASON_LABEL: Record<Preview["reason"], string> = {
  eligible: "Ready to send",
  below_floor: "Below the anonymity floor (needs 3 reviewers from 2 organisations)",
  no_founder: "No founder has claimed this startup yet",
  already_sent: "Already sent — nothing new since",
  unavailable: "Assessments unavailable",
};

const OUTCOME_LABEL: Record<string, string> = {
  sent: "Sent",
  sent_no_email: "Stored — founder has no e-mail on file",
  email_failed: "Stored — e-mail failed, retried by the Sunday run",
  skipped_below_floor: "Skipped — below the anonymity floor",
  skipped_no_founder: "Skipped — no claimed founder",
  skipped_already_sent: "Skipped — already sent",
  skipped_dupe: "Skipped — a letter for today already exists",
  failed: "Failed",
};

export function FeedbackLettersPanel({ batchId, candidates, canSend }: { batchId: string; candidates: FeedbackCandidateLite[]; canSend: boolean }) {
  const [step, setStep] = useState<"idle" | "preview" | "sent">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [results, setResults] = useState<SendRow[]>([]);

  const eligible = previews.filter((p) => p.reason === "eligible");

  async function call(confirm: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/cohort/feedback-letters", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(confirm ? { batch: batchId, confirm: true, project_ids: eligible.map((p) => p.projectId) } : { batch: batchId }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; previews?: Preview[]; results?: SendRow[] };
      if (!res.ok || !body.ok) {
        setError(body.message ?? body.error ?? `Request failed (${res.status}).`);
        return;
      }
      if (confirm) {
        setResults(body.results ?? []);
        setStep("sent");
      } else {
        setPreviews(body.previews ?? []);
        setStep("preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line-subtle bg-surface p-4" data-testid="feedback-letters-panel" aria-labelledby="feedback-letters-h">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="feedback-letters-h" className="text-base font-semibold text-primary">
            Feedback letters to non-selected applicants
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-secondary">
            {candidates.length === 0
              ? "No non-selected applicant yet — a submitted “pass” decision puts a startup on this list."
              : `${candidates.length} applicant${candidates.length === 1 ? "" : "s"} with a submitted “pass”. Each letter aggregates what at least 3 reviewers from 2 organisations said — no single reviewer is ever identifiable. Preview first; nothing is sent until you confirm.`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-line-subtle px-2 py-0.5 text-xs text-secondary">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          k ≥ 3 anonymity floor
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 rounded-lg border border-bear/30 bg-bear/5 px-3 py-2 text-sm text-bear">
          {error}
        </p>
      ) : null}

      {step === "idle" ? (
        <div className="mt-3">
          <button type="button" onClick={() => call(false)} disabled={busy || candidates.length === 0} aria-busy={busy} data-testid="feedback-preview" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-subtle bg-surface px-4 text-sm font-semibold text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50">
            <Mail className="h-4 w-4" aria-hidden="true" />
            {busy ? "Preparing preview…" : "Preview feedback letters"}
          </button>
        </div>
      ) : null}

      {step === "preview" ? (
        <div className="mt-3 space-y-3" data-testid="feedback-preview-list">
          <ul className="space-y-2">
            {previews.map((p) => (
              <li key={p.projectId} className="rounded-lg border border-line-subtle p-3" data-reason={p.reason}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-primary">{p.name}</p>
                  <p className="text-xs text-secondary">
                    {REASON_LABEL[p.reason]}
                    {p.k > 0 ? ` · ${p.k} reviewers / ${p.orgCount} orgs` : ""}
                  </p>
                </div>
                {p.subject ? <p className="mt-1 text-sm text-secondary">Subject: {p.subject}</p> : null}
                {p.excerpt ? <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-surface-sunken p-2 text-xs text-secondary">{p.excerpt}</pre> : null}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => call(true)} disabled={busy || !canSend || eligible.length === 0} aria-busy={busy} data-testid="feedback-confirm" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50">
              <Mail className="h-4 w-4" aria-hidden="true" />
              {busy ? "Sending…" : `Confirm and send ${eligible.length} letter${eligible.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={() => setStep("idle")} disabled={busy} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-secondary hover:bg-surface-hover">
              Cancel
            </button>
            {!canSend ? <span className="text-xs text-secondary">Viewers can preview; the owner or a reviewer sends.</span> : null}
          </div>
        </div>
      ) : null}

      {step === "sent" ? (
        <ul className="mt-3 space-y-1 text-sm" data-testid="feedback-results" aria-live="polite">
          {results.map((r) => (
            <li key={r.projectId} className="flex flex-wrap justify-between gap-2 border-b border-line-subtle py-1 last:border-0">
              <span className="text-primary">{r.name}</span>
              <span className="text-secondary">{OUTCOME_LABEL[r.outcome] ?? r.outcome}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
