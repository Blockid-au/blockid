"use client";

// Outcome ledger — record form + list + proposals (G21 P3-A). Posts JSON to
// /api/projects/[id]/outcomes and PATCH /api/outcomes/[id] from a client
// component (no inline scripts — CSP). The list re-renders from the server
// response so a recorded outcome appears immediately as "proposed";
// confirmations by the owner apply in place. Shared by the founder page
// (owner records as founder, resolves founder / evaluator proposals) and the
// dossier block (evaluator records as evaluator, never resolves).

import * as React from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import {
  OUTCOME_KINDS,
  OUTCOME_KIND_META,
  OUTCOME_NOTE_MAX,
  OUTCOME_SOURCE_LABEL,
  OUTCOME_STATUS_LABEL,
  outcomeSummary,
  type OutcomeKind,
  type OutcomeRow,
  type OutcomeSource,
  type OutcomeStatus,
} from "@/lib/outcomes/types";

/** The wire row (actor ids stripped by the API). */
export type OutcomeItem = Omit<OutcomeRow, "recorded_by" | "confirmed_by"> & { withheld?: true };

export interface OutcomesClientProps {
  projectId: string;
  initial: OutcomeItem[];
  /** Owner (founder page) or evaluator (dossier) may record; members / viewers see the list. */
  canRecord: boolean;
  /** Only the project owner resolves founder / evaluator proposals; admins use /admin/outcomes. */
  canResolve: boolean;
  /** Which source the caller records as — copy only; the API decides. */
  recordAs?: "founder" | "evaluator";
  /** Heading level for the two section headings. */
  headingLevel?: 2 | 3;
}

const INPUT = "w-full min-h-11 rounded-lg border border-line bg-surface px-3 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-action focus:ring-2 focus:ring-action/30";
const LABEL = "block text-xs font-medium text-secondary mb-1";

const ERRORS: Record<string, string> = {
  rate_limited: "Too many outcomes in the last hour — try again later.",
  too_many_proposed: "This startup already has many outcomes awaiting confirmation — confirm or reject some first.",
  forbidden: "You cannot do that on this startup.",
  not_found: "We could not find that startup.",
  invalid_input: "Check the highlighted field and try again.",
  unavailable: "The outcome ledger is briefly unavailable — try again in a minute.",
  service_unavailable: "The outcome ledger is briefly unavailable — try again in a minute.",
  not_proposed: "This outcome was already resolved.",
  already_resolved: "Someone else resolved this outcome first — reload to see it.",
  network: "Could not reach BlockID — check your connection and try again.",
};

const STATUS_META: Record<OutcomeStatus, { className: string; Icon: typeof Clock }> = {
  proposed: { className: "border-warn text-warn", Icon: Clock },
  confirmed: { className: "border-bull text-bull", Icon: CheckCircle2 },
  rejected: { className: "border-line text-muted", Icon: XCircle },
};

/** Sources the owner may resolve (mirrors lib/outcomes/service OWNER_RESOLVABLE_SOURCES). */
const OWNER_RESOLVABLE: readonly OutcomeSource[] = ["founder", "evaluator"];

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-AU", { year: "numeric", month: "short", day: "numeric" }) : iso;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OutcomesList({ rows, canResolve, onResolve, busyId }: { rows: OutcomeItem[]; canResolve: boolean; onResolve?: (id: string, decision: "confirm" | "reject") => void; busyId?: string | null }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line-subtle bg-surface-sunken p-5 text-sm text-secondary" data-testid="outcomes-empty">
        Nothing on the ledger yet. Record a round, a grant, a program selection, revenue growth, a release or a headcount change as it happens — confirmed outcomes are plotted on the trajectory and, in aggregate, published on the calibration page with n.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="outcomes-list">
      {rows.map((r) => {
        const meta = STATUS_META[r.status];
        const resolvable = canResolve && r.status === "proposed" && OWNER_RESOLVABLE.includes(r.source);
        const url = typeof r.value?.source_url === "string" ? r.value.source_url : null;
        return (
          <li key={r.id} className="rounded-xl border border-line-subtle bg-surface p-4" data-outcome-status={r.status} data-outcome-kind={r.kind} data-outcome-source={r.source}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border bg-surface px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
                <meta.Icon className="h-3 w-3" aria-hidden="true" />
                {OUTCOME_STATUS_LABEL[r.status]}
              </span>
              <span className="text-xs font-semibold text-primary">{OUTCOME_KIND_META[r.kind]?.label ?? r.kind}</span>
              <span className="text-xs text-secondary">· {OUTCOME_SOURCE_LABEL[r.source] ?? r.source}</span>
              <span className="text-xs text-muted tabular-nums">· confidence {Math.round(r.confidence)}</span>
              <span className="ml-auto text-xs text-muted tabular-nums">{fmt(r.observed_at)}</span>
            </div>
            <p className="mt-2 text-sm text-primary">
              {r.withheld ? <span className="text-secondary">Details withheld at this consent tier.</span> : outcomeSummary(r)}
              {url ? (
                <>
                  {" "}
                  <a href={url} className="text-action underline decoration-dotted underline-offset-4" rel="noopener noreferrer nofollow" target="_blank">
                    source
                  </a>
                </>
              ) : null}
            </p>
            {r.note ? <p className="mt-1 whitespace-pre-wrap text-xs text-secondary">{r.note}</p> : null}
            {r.status === "proposed" && !resolvable && canResolve ? (
              <p className="mt-2 text-xs text-muted" data-testid="outcome-awaits-blockid">
                Proposed from a {OUTCOME_SOURCE_LABEL[r.source]?.toLowerCase() ?? r.source} — BlockID confirms it against the source.
              </p>
            ) : null}
            {resolvable && onResolve ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busyId === r.id} onClick={() => onResolve(r.id, "confirm")} className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-action px-3 text-xs font-semibold text-on-action hover:bg-action-hover disabled:opacity-50" data-testid="outcome-confirm">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Confirm
                </button>
                <button type="button" disabled={busyId === r.id} onClick={() => onResolve(r.id, "reject")} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line px-3 text-xs font-semibold text-secondary hover:bg-surface-hover disabled:opacity-50" data-testid="outcome-reject">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function OutcomesClient({ projectId, initial, canRecord, canResolve, recordAs = "founder", headingLevel = 2 }: OutcomesClientProps) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const [rows, setRows] = React.useState<OutcomeItem[]>(initial);
  const [kind, setKind] = React.useState<OutcomeKind>("funding_raised");
  const [observedAt, setObservedAt] = React.useState<string>(today());
  const [value, setValue] = React.useState<Record<string, string>>({});
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorField, setErrorField] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const meta = OUTCOME_KIND_META[kind];
  const proposals = rows.filter((r) => r.status === "proposed");
  const settled = rows.filter((r) => r.status !== "proposed");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setErrorField(null);
    setDone(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/outcomes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, observedAt, value, note: note || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; field?: string; message?: string; outcome?: OutcomeItem; duplicate?: boolean };
      if (!res.ok || !body.ok || !body.outcome) {
        setError(body.error === "invalid_input" && body.message ? body.message : (ERRORS[body.error ?? ""] ?? ERRORS.unavailable));
        setErrorField(body.field ?? null);
        return;
      }
      const saved = body.outcome;
      setRows((prev) => (prev.some((r) => r.id === saved.id) ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev]));
      setValue({});
      setNote("");
      setDone(body.duplicate ? "That outcome was already on the ledger — nothing was duplicated." : recordAs === "founder" ? "Recorded as proposed. Confirm it below once you have checked the details — only confirmed outcomes count." : "Recorded as proposed. The founder or BlockID confirms it; it then appears on the trajectory.");
    } catch {
      setError(ERRORS.network);
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string, decision: "confirm" | "reject") {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    setDone(null);
    try {
      const res = await fetch(`/api/outcomes/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; outcome?: OutcomeItem };
      if (!res.ok || !body.ok || !body.outcome) {
        setError(ERRORS[body.error ?? ""] ?? ERRORS.unavailable);
        return;
      }
      const saved = body.outcome;
      setRows((prev) => prev.map((r) => (r.id === saved.id ? saved : r)));
      setDone(decision === "confirm" ? "Confirmed. It now counts on the trajectory and in calibration." : "Rejected. It stays on the ledger as rejected and is never re-proposed.");
    } catch {
      setError(ERRORS.network);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8" data-testid="outcomes-client">
      {canRecord ? (
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line-subtle bg-surface p-5" aria-labelledby="record-outcome-heading" data-testid="outcomes-form">
          <div>
            <H id="record-outcome-heading" className="text-base font-semibold text-primary">
              Record an outcome
            </H>
            <p className="mt-1 text-xs text-secondary">
              {recordAs === "founder" ? "What happened, when, and a link that shows it. It lands as proposed; you confirm it once checked." : "Recorded as the evaluator's observation; the founder or BlockID confirms it."}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="outcome-kind" className={LABEL}>
                What happened? <span aria-hidden="true">*</span>
              </label>
              <select
                id="outcome-kind"
                name="kind"
                className={INPUT}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as OutcomeKind);
                  setValue({});
                }}
                required
              >
                {OUTCOME_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {OUTCOME_KIND_META[k].label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">{meta.hint}</p>
            </div>
            <div>
              <label htmlFor="outcome-date" className={LABEL}>
                When? <span aria-hidden="true">*</span>
              </label>
              <input id="outcome-date" name="observedAt" type="date" className={INPUT} value={observedAt} max={today()} onChange={(e) => setObservedAt(e.target.value)} required aria-invalid={errorField === "observedAt" || undefined} />
            </div>
            {meta.fields.map((f) => (
              <div key={f.key} className={f.type === "url" ? "sm:col-span-2" : undefined}>
                <label htmlFor={`outcome-${f.key}`} className={LABEL}>
                  {f.label} {f.required ? <span aria-hidden="true">*</span> : null}
                </label>
                <input
                  id={`outcome-${f.key}`}
                  name={f.key}
                  type={f.type === "url" ? "url" : f.type === "text" ? "text" : "number"}
                  inputMode={f.type === "text" || f.type === "url" ? undefined : "decimal"}
                  min={f.type === "text" || f.type === "url" ? undefined : 0}
                  step={f.type === "number_aud" ? 1 : f.type === "number" ? 1 : undefined}
                  className={INPUT}
                  value={value[f.key] ?? ""}
                  onChange={(e) => setValue((v) => ({ ...v, [f.key]: e.target.value }))}
                  required={f.required}
                  aria-invalid={errorField === `value.${f.key}` || undefined}
                  placeholder={f.type === "url" ? "https://" : undefined}
                />
                {f.hint ? <p className="mt-1 text-xs text-muted">{f.hint}</p> : null}
              </div>
            ))}
            <div className="sm:col-span-2">
              <label htmlFor="outcome-note" className={LABEL}>
                Note
              </label>
              <textarea id="outcome-note" name="note" className={`${INPUT} min-h-20 py-2`} value={note} maxLength={OUTCOME_NOTE_MAX} onChange={(e) => setNote(e.target.value)} aria-invalid={errorField === "note" || undefined} />
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-bear bg-surface px-3 py-2 text-sm text-bear" data-testid="outcomes-error">
              {error}
            </p>
          ) : null}
          {done ? (
            <p role="status" className="rounded-lg border border-bull bg-surface px-3 py-2 text-sm text-bull" data-testid="outcomes-done">
              {done}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-on-action hover:bg-action-hover disabled:opacity-50" data-testid="outcomes-submit">
            {busy ? "Saving…" : "Record outcome"}
          </button>
        </form>
      ) : null}

      {!canRecord && error ? (
        <p role="alert" className="rounded-lg border border-bear bg-surface px-3 py-2 text-sm text-bear">
          {error}
        </p>
      ) : null}
      {!canRecord && done ? (
        <p role="status" className="rounded-lg border border-bull bg-surface px-3 py-2 text-sm text-bull">
          {done}
        </p>
      ) : null}

      <section aria-labelledby="outcome-proposals-heading" data-testid="outcomes-proposals">
        <H id="outcome-proposals-heading" className="text-base font-semibold text-primary">
          Awaiting confirmation <span className="tabular-nums text-muted">({proposals.length})</span>
        </H>
        <p className="mb-3 mt-1 text-xs text-secondary">
          Proposals come from your own records, evaluators, connected sources and public registers. Nothing is confirmed automatically.
        </p>
        {proposals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-subtle bg-surface-sunken p-4 text-sm text-secondary" data-testid="outcomes-proposals-empty">
            No proposals waiting.
          </p>
        ) : (
          <OutcomesList rows={proposals} canResolve={canResolve} onResolve={resolve} busyId={busyId} />
        )}
      </section>

      <section aria-labelledby="outcome-ledger-heading" data-testid="outcomes-ledger">
        <H id="outcome-ledger-heading" className="text-base font-semibold text-primary">
          Ledger <span className="tabular-nums text-muted">({settled.length})</span>
        </H>
        <p className="mb-3 mt-1 text-xs text-secondary">Confirmed and rejected outcomes, newest first. Confirmed ones are plotted on the trajectory.</p>
        <OutcomesList rows={settled} canResolve={false} />
      </section>
    </div>
  );
}
