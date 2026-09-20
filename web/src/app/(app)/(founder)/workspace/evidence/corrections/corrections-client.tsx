"use client";

// Corrections form + list (G21 P1-C). Posts JSON to /api/corrections from a
// client component (no inline scripts — CSP). The list re-renders from the
// server response so a filed correction appears immediately with status
// "open"; resolutions come from the admin queue and show on the next load.

import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, XCircle } from "lucide-react";
import {
  CORRECTION_KINDS,
  CORRECTION_KIND_LABEL,
  CORRECTION_MESSAGE_MAX,
  DIMENSION_TARGETS,
  PROFILE_TARGETS,
  targetLabel,
  type CorrectionKind,
  type CorrectionRow,
} from "@/lib/corrections/model";

export interface CorrectionsClientProps {
  projectId: string;
  initial: CorrectionRow[];
  /** Only the startup's owner files; members and viewers see the list. */
  canFile: boolean;
}

const INPUT = "w-full min-h-11 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const LABEL = "block text-xs font-medium text-ink-700 mb-1";

const ERRORS: Record<string, string> = {
  rate_limited: "Too many corrections in the last hour — try again later.",
  too_many_open: "You already have several open corrections — wait for a resolution before filing more.",
  forbidden: "Only the startup's owner can file a correction.",
  not_found: "We could not find that startup.",
  invalid_input: "Check the highlighted field and try again.",
  service_unavailable: "The service is briefly unavailable — try again in a minute.",
  network: "Could not reach BlockID — check your connection and try again.",
};

const STATUS_META: Record<CorrectionRow["status"], { label: string; className: string; Icon: typeof Clock }> = {
  open: { label: "Open — awaiting review", className: "bg-amber-100 text-amber-800", Icon: Clock },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-ink-100 text-ink-700", Icon: XCircle },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" }) : iso;
}

const CUSTOM_TARGET = "__custom__";
const NO_TARGET = "";

export function CorrectionsList({ rows }: { rows: CorrectionRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-ink-300 bg-white p-5 text-sm text-ink-600" data-testid="corrections-empty">
        No corrections filed yet. When something on your record or in a report is wrong, file it here — every one is reviewed by a person and the resolution is recorded.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="corrections-list">
      {rows.map((r) => {
        const meta = STATUS_META[r.status];
        return (
          <li key={r.id} className="rounded-xl border border-ink-200 bg-white p-4" data-correction-status={r.status}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
                <meta.Icon className="h-3 w-3" aria-hidden="true" />
                {meta.label}
              </span>
              <span className="text-xs font-semibold text-ink-800">{CORRECTION_KIND_LABEL[r.kind]?.label ?? r.kind}</span>
              <span className="text-xs text-ink-500">· {targetLabel(r.target_ref)}</span>
              <span className="ml-auto text-xs text-ink-500 tabular-nums">{fmt(r.created_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink-800">{r.message}</p>
            {r.resolution ? (
              <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700" data-testid="correction-resolution">
                <span className="font-semibold">Resolution{r.resolved_at ? ` (${fmt(r.resolved_at)})` : ""}:</span> {r.resolution}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function CorrectionsClient({ projectId, initial, canFile }: CorrectionsClientProps) {
  const [rows, setRows] = React.useState<CorrectionRow[]>(initial);
  const [kind, setKind] = React.useState<CorrectionKind>("incorrect_data");
  const [targetPick, setTargetPick] = React.useState<string>(NO_TARGET);
  const [customTarget, setCustomTarget] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [industry, setIndustry] = React.useState("");
  const [stage, setStage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const targetRef = targetPick === CUSTOM_TARGET ? customTarget.trim() : targetPick;
  const showProposal = kind === "wrong_sector_stage";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setErrorField(null);
    setDone(null);
    try {
      const proposed: Record<string, unknown> = {};
      if (showProposal && industry.trim()) proposed.industry = industry.trim();
      if (showProposal && stage.trim()) proposed.stage = Number(stage);
      const res = await fetch("/api/corrections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, kind, targetRef: targetRef || undefined, message, proposed }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string; message?: string; correction?: CorrectionRow };
      if (!res.ok || !body.ok || !body.correction) {
        setError(body.error === "invalid_input" && body.message ? body.message : (ERRORS[body.error ?? ""] ?? ERRORS.service_unavailable));
        setErrorField(body.field ?? null);
        return;
      }
      setRows((prev) => [body.correction as CorrectionRow, ...prev]);
      setMessage("");
      setIndustry("");
      setStage("");
      setTargetPick(NO_TARGET);
      setCustomTarget("");
      setDone("Filed. A person reviews every correction; you will be e-mailed when it is accepted and the resolution appears here.");
    } catch {
      setError(ERRORS.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {canFile ? (
        <form onSubmit={submit} className="rounded-2xl border border-ink-200 bg-white p-5 space-y-4" aria-labelledby="file-correction-heading" data-testid="corrections-form">
          <h2 id="file-correction-heading" className="text-base font-semibold text-ink-900">
            Flag a problem
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="correction-kind" className={LABEL}>
                What is wrong? <span aria-hidden="true">*</span>
              </label>
              <select id="correction-kind" name="kind" className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as CorrectionKind)} required>
                {CORRECTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CORRECTION_KIND_LABEL[k].label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-500">{CORRECTION_KIND_LABEL[kind].hint}</p>
            </div>

            <div>
              <label htmlFor="correction-target" className={LABEL}>
                Where is it?
              </label>
              <select id="correction-target" name="targetRef" className={INPUT} value={targetPick} onChange={(e) => setTargetPick(e.target.value)} aria-invalid={errorField === "targetRef" || undefined}>
                <option value={NO_TARGET}>General / not sure</option>
                <optgroup label="SVI dimensions">
                  {DIMENSION_TARGETS.map((t) => (
                    <option key={t.ref} value={t.ref}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Startup record">
                  {PROFILE_TARGETS.map((t) => (
                    <option key={t.ref} value={t.ref}>
                      {t.label}
                    </option>
                  ))}
                </optgroup>
                <option value={CUSTOM_TARGET}>Something else (type a reference)</option>
              </select>
              {targetPick === CUSTOM_TARGET ? (
                <div className="mt-2">
                  <label htmlFor="correction-target-custom" className={LABEL}>
                    Reference
                  </label>
                  <input id="correction-target-custom" className={INPUT} value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} placeholder="claim:<id> · report:<id>#section · evidence:<id>" aria-describedby="correction-target-help" />
                  <p id="correction-target-help" className="mt-1 text-xs text-ink-500">
                    Copy the reference shown beside the claim, report section or evidence row.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {showProposal ? (
            <fieldset className="grid gap-4 sm:grid-cols-2 rounded-lg border border-ink-200 p-3">
              <legend className="px-1 text-xs font-medium text-ink-700">What should it be? (optional — applied only if a reviewer accepts)</legend>
              <div>
                <label htmlFor="correction-industry" className={LABEL}>
                  Sector
                </label>
                <input id="correction-industry" className={INPUT} value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={80} placeholder="e.g. fintech" />
              </div>
              <div>
                <label htmlFor="correction-stage" className={LABEL}>
                  Stage (0 idea → 7 late)
                </label>
                <input id="correction-stage" className={INPUT} type="number" inputMode="numeric" min={0} max={7} step={1} value={stage} onChange={(e) => setStage(e.target.value)} />
              </div>
            </fieldset>
          ) : null}

          <div>
            <label htmlFor="correction-message" className={LABEL}>
              What happened, and what is right? <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="correction-message"
              name="message"
              className={`${INPUT} min-h-28 py-2`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={CORRECTION_MESSAGE_MAX}
              required
              aria-invalid={errorField === "message" || undefined}
              aria-describedby="correction-message-help"
              placeholder="Say what we hold or said, what is actually the case, and where a reviewer can check it."
            />
            <p id="correction-message-help" className="mt-1 text-xs text-ink-500 tabular-nums">
              {message.length} / {CORRECTION_MESSAGE_MAX}
            </p>
          </div>

          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {done ? (
            <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {done}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-ink-500">Nothing changes until a reviewer accepts it; the resolution records exactly what changed.</p>
            <button type="submit" disabled={busy || !message.trim()} className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? "Filing…" : "File correction"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-ink-600" data-testid="corrections-owner-only">
          Only the startup&apos;s owner can file a correction. Ask them to file it from this page.
        </p>
      )}

      <section aria-labelledby="corrections-list-heading" className="space-y-3">
        <h2 id="corrections-list-heading" className="text-base font-semibold text-ink-900">
          Your corrections
        </h2>
        <CorrectionsList rows={rows} />
      </section>
    </div>
  );
}
