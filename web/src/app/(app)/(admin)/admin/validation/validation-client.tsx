"use client";

// /admin/validation — G22-D. The advisor plan's validation ladder (L1–L5)
// with target / actual, the founder-edited entries table (organisation,
// contact role, date, level, outcome, objection, next step, note) posted to
// /api/admin/validation, the "next objection to answer" list, the read-only
// auto rows (source-labelled), the North Star + window line, and the
// 14-question script as a checklist card. Every number is a target or an
// actual count of recorded events. The h1 sits outside any gate. No inline
// scripts (CSP); every fetch error passes through userErrorMessage.

import * as React from "react";
import { CheckCircle2, ClipboardList, FileDown, ListChecks, Pencil, Plus, Trash2, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { ApiError, readErrorBody, userErrorMessage } from "@/lib/ui/user-error";
import {
  ENTRY_LIMITS,
  VALIDATION_LEVELS,
  VALIDATION_OUTCOMES,
  VALIDATION_SCRIPT,
  computeLadder,
  levelMeta,
  openObjections,
  type AutoRow,
  type LadderRung,
  type ObjectionGroup,
  type ValidationDashboard,
  type ValidationEntry,
  type ValidationEntryInput,
  type ValidationLevel,
  type ValidationOutcome,
  type WindowMetric,
} from "@/lib/validation/model";

export interface ValidationClientProps {
  user: { email: string; displayName: string | null };
  initial: ValidationDashboard;
}

const OUTCOME_CLASS: Record<ValidationOutcome, string> = {
  booked: "bg-amber-100 text-amber-800",
  done: "bg-green-100 text-green-700",
  declined: "bg-surface-200 text-ink-600",
};
const OUTCOME_LABEL: Record<ValidationOutcome, string> = { booked: "Booked", done: "Done", declined: "Declined" };

const SOURCE_LABEL: Record<AutoRow["source"], string> = {
  pilot_orders: "pilot_orders",
  "pilot_orders.metrics": "pilot_orders.metrics",
  "pilot-applications.jsonl": "pilot-applications.jsonl",
  founder_feedback_letters: "founder_feedback_letters",
  evaluation_batches: "evaluation_batches",
};

const INPUT = "block h-11 w-full rounded-lg border border-surface-300 bg-white px-3 text-sm text-ink-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";
const LABEL = "block text-xs font-medium text-ink-700";
const BTN_PRIMARY = "inline-flex h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600/40 disabled:opacity-50";
const BTN_SECONDARY = "inline-flex h-11 items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 text-sm font-medium text-ink-700 hover:bg-surface-100 focus:outline-none focus:ring-2 focus:ring-brand-600/40 disabled:opacity-50";

function n(v: number | null): string {
  return v === null ? "n/a" : v.toLocaleString("en-AU");
}

function metricValue(m: WindowMetric): string {
  if (m.value === null) return "n/a";
  if (m.unit === "aud_cents") return `A$${(m.value / 100).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
  if (m.unit === "ratio") return `${Math.round(m.value * 100)}%`;
  return n(m.value);
}

// ── Ladder ──────────────────────────────────────────────────────────────────

export function ValidationLadder({ ladder }: { ladder: LadderRung[] }) {
  return (
    <ol className="grid gap-3 md:grid-cols-5" data-testid="validation-ladder" aria-label="Validation levels">
      {ladder.map((r) => {
        const met = r.actual >= r.target;
        return (
          <li key={r.level} className={`rounded-xl border p-4 ${met ? "border-green-300 bg-green-50" : "border-surface-200 bg-white"}`} data-testid="validation-rung" data-level={r.level} data-met={met ? "1" : "0"}>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">L{r.level}</p>
            <p className="mt-0.5 text-sm font-medium text-ink-800">{r.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-ink-900">
              <span data-testid="validation-actual">{r.actual}</span>
              <span className="text-base font-normal text-ink-500"> / {r.target}</span>
            </p>
            <p className="text-[11px] text-ink-500">actual / target</p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-200" role="progressbar" aria-label={`${r.label}: ${r.actual} of ${r.target}`} aria-valuemin={0} aria-valuemax={r.target} aria-valuenow={Math.min(r.actual, r.target)}>
              <div className={`h-full ${met ? "bg-green-600" : "bg-brand-600"}`} style={{ width: `${Math.round(r.progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              {r.manual_done} recorded{r.auto_counted > 0 ? ` · ${r.auto_counted} from data` : ""}
              {r.booked > 0 ? ` · ${r.booked} booked` : ""}
              {r.declined > 0 ? ` · ${r.declined} declined` : ""}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-ink-500">Counts when: {r.counts_when}.</p>
          </li>
        );
      })}
    </ol>
  );
}

// ── Objections ──────────────────────────────────────────────────────────────

export function ObjectionsList({ objections }: { objections: ObjectionGroup[] }) {
  return (
    <section className="rounded-xl border border-surface-200 bg-white p-4" data-testid="validation-objections" aria-labelledby="validation-objections-h">
      <h2 id="validation-objections-h" className="text-base font-semibold text-ink-800">Next objection to answer</h2>
      <p className="mt-1 text-xs text-ink-500">Open objections from the entries, grouped by wording, most frequent first. Tick “answered” on an entry once the answer is on the site or in the proposal.</p>
      {objections.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-surface-300 p-4 text-sm text-ink-500" data-testid="validation-objections-empty">No open objections recorded yet.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {objections.map((o, i) => (
            <li key={o.key} className="flex gap-3 rounded-lg border border-surface-200 p-3" data-testid="validation-objection">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-100 text-xs font-semibold tabular-nums text-ink-700">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-800">{o.text}</p>
                <p className="mt-1 text-[11px] text-ink-500">
                  <span className="tabular-nums">{o.count}</span>× · {o.organisations.join(", ")} · L{o.levels.join(" / L")} · last {o.last_date}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Entry form ──────────────────────────────────────────────────────────────

type FormState = ValidationEntryInput;

const EMPTY_FORM: FormState = { organisation: "", contact_role: "", date: "", level: 1, outcome: "booked", objection: "", objection_answered: false, next_step: "", note: "" };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EntryForm({ initial, onSubmit, onCancel, busy, error }: { initial: FormState | null; onSubmit: (v: FormState) => void; onCancel?: () => void; busy: boolean; error: string | null }) {
  const [v, setV] = React.useState<FormState>(initial ?? { ...EMPTY_FORM, date: todayIso() });
  const [fieldError, setFieldError] = React.useState<{ field: keyof FormState; message: string } | null>(null);
  const firstRef = React.useRef<HTMLInputElement>(null);
  // The parent keys this form on the entry id, so switching between "add" and
  // "edit" remounts it with fresh state — no effect-driven state sync.

  const set = <K extends keyof FormState>(k: K, val: FormState[K]) => setV((p) => ({ ...p, [k]: val }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.organisation.trim()) {
      setFieldError({ field: "organisation", message: "Organisation is required." });
      firstRef.current?.focus();
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
      setFieldError({ field: "date", message: "Date must be YYYY-MM-DD." });
      return;
    }
    setFieldError(null);
    onSubmit({ ...v, organisation: v.organisation.trim() });
  }

  const editing = !!initial;
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="validation-entry-form" aria-label={editing ? "Edit entry" : "Add entry"} noValidate>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label htmlFor="v-org" className={LABEL}>Organisation <span aria-hidden="true">*</span></label>
          <input ref={firstRef} id="v-org" className={INPUT} value={v.organisation} maxLength={ENTRY_LIMITS.organisation} onChange={(e) => set("organisation", e.target.value)} required aria-invalid={fieldError?.field === "organisation" || undefined} aria-describedby={fieldError?.field === "organisation" ? "v-org-err" : undefined} autoComplete="organization" />
          {fieldError?.field === "organisation" ? <p id="v-org-err" className="mt-1 text-xs text-rose-700" role="alert">{fieldError.message}</p> : null}
        </div>
        <div>
          <label htmlFor="v-role" className={LABEL}>Contact role</label>
          <input id="v-role" className={INPUT} value={v.contact_role} maxLength={ENTRY_LIMITS.contact_role} onChange={(e) => set("contact_role", e.target.value)} placeholder="Program manager" />
        </div>
        <div>
          <label htmlFor="v-date" className={LABEL}>Date <span aria-hidden="true">*</span></label>
          <input id="v-date" type="date" className={INPUT} value={v.date} onChange={(e) => set("date", e.target.value)} required aria-invalid={fieldError?.field === "date" || undefined} aria-describedby={fieldError?.field === "date" ? "v-date-err" : undefined} />
          {fieldError?.field === "date" ? <p id="v-date-err" className="mt-1 text-xs text-rose-700" role="alert">{fieldError.message}</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="v-level" className={LABEL}>Level</label>
            <select id="v-level" className={INPUT} value={v.level} onChange={(e) => set("level", Number(e.target.value) as ValidationLevel)}>
              {VALIDATION_LEVELS.map((l) => (
                <option key={l.level} value={l.level}>L{l.level} · {l.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="v-outcome" className={LABEL}>Outcome</label>
            <select id="v-outcome" className={INPUT} value={v.outcome} onChange={(e) => set("outcome", e.target.value as ValidationOutcome)}>
              {VALIDATION_OUTCOMES.map((o) => (
                <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label htmlFor="v-objection" className={LABEL}>Objection captured</label>
          <textarea id="v-objection" className={`${INPUT} h-auto min-h-[5.5rem] py-2`} value={v.objection} maxLength={ENTRY_LIMITS.objection} onChange={(e) => set("objection", e.target.value)} placeholder="In their words — verbatim if you can." />
          <label className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" className="h-5 w-5 rounded border-surface-300 text-brand-600 focus:ring-brand-600/40" checked={v.objection_answered} onChange={(e) => set("objection_answered", e.target.checked)} />
            Objection answered (drops it from the list)
          </label>
        </div>
        <div className="space-y-3">
          <div>
            <label htmlFor="v-next" className={LABEL}>Next step</label>
            <input id="v-next" className={INPUT} value={v.next_step} maxLength={ENTRY_LIMITS.next_step} onChange={(e) => set("next_step", e.target.value)} placeholder="Send written proposal by Friday" />
          </div>
          <div>
            <label htmlFor="v-note" className={LABEL}>Note</label>
            <textarea id="v-note" className={`${INPUT} h-auto min-h-[3.5rem] py-2`} value={v.note} maxLength={ENTRY_LIMITS.note} onChange={(e) => set("note", e.target.value)} placeholder="Answers to the script questions, who else was in the room." />
          </div>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" data-testid="validation-form-error">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={BTN_PRIMARY} data-testid="validation-entry-submit">
          {editing ? <Pencil className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />} {busy ? "Saving…" : editing ? "Save changes" : "Add entry"}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>
            <X className="h-4 w-4" aria-hidden="true" /> Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** The filename the proposal route sets (`attachment; filename="…"`), or a stable fallback. Pure. */
export function proposalFilenameFrom(disposition: string | null, entryId: string): string {
  const marker = "filename=";
  const at = disposition?.indexOf(marker) ?? -1;
  if (disposition && at >= 0) {
    const raw = disposition.slice(at + marker.length).trim();
    const unquoted = raw.startsWith(String.fromCharCode(34)) ? raw.slice(1, raw.indexOf(String.fromCharCode(34), 1)) : raw.split(";")[0]!.trim();
    if (unquoted && unquoted.toLowerCase().endsWith(".pdf")) return unquoted;
  }
  return `blockid-pilot-proposal-${entryId.slice(0, 8)}.pdf`;
}

// ── Entries table ───────────────────────────────────────────────────────────

export function EntriesTable({ entries, onEdit, onDelete, onProposal, busyId }: { entries: ValidationEntry[]; onEdit?: (e: ValidationEntry) => void; onDelete?: (e: ValidationEntry) => void; onProposal?: (e: ValidationEntry) => void; busyId?: string | null }) {
  if (entries.length === 0) {
    return <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500" data-testid="validation-entries-empty">No entries yet — add the first interview above.</p>;
  }
  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-surface-200 bg-white">
      <table className="w-full min-w-[40rem] text-left text-sm" data-testid="validation-entries">
        <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken">
          <tr>
            <th scope="col" className="px-3 py-2">Date</th>
            <th scope="col" className="px-3 py-2">Organisation · role</th>
            <th scope="col" className="px-3 py-2">Level</th>
            <th scope="col" className="px-3 py-2">Outcome</th>
            <th scope="col" className="px-3 py-2">Objection · next step</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200 [&>tr:nth-child(even)]:bg-surface-sunken">
          {entries.map((e) => (
            <tr key={e.id} data-entry-id={e.id} data-entry-level={e.level} data-entry-outcome={e.outcome}>
              <td className="px-3 py-2 tabular-nums text-ink-600">{e.date}</td>
              <td className="px-3 py-2">
                <div className="font-medium text-ink-800">{e.organisation}</div>
                {e.contact_role ? <div className="text-xs text-ink-500">{e.contact_role}</div> : null}
                {e.proposal_generated_at ? (
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-brand-700" data-testid="validation-entry-proposal-at">
                    <FileDown className="h-3 w-3" aria-hidden="true" /> Proposal generated {e.proposal_generated_at.slice(0, 10)}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-2 text-ink-700">
                L{e.level} <span className="text-xs text-ink-500">{levelMeta(e.level).label}</span>
              </td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${OUTCOME_CLASS[e.outcome]}`}>{OUTCOME_LABEL[e.outcome]}</span>
              </td>
              <td className="max-w-md px-3 py-2">
                {e.objection ? (
                  <div className="text-ink-800">
                    “{e.objection}”{e.objection_answered ? <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-green-700"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> answered</span> : null}
                  </div>
                ) : null}
                {e.next_step ? <div className="text-xs text-ink-600">Next: {e.next_step}</div> : null}
                {e.note ? <div className="mt-1 whitespace-pre-wrap text-xs text-ink-500">{e.note}</div> : null}
              </td>
              <td className="px-3 py-2">
                {onEdit && onDelete ? (
                  <div className="flex gap-1">
                    {onProposal ? (
                      <button type="button" disabled={busyId === e.id} onClick={() => onProposal(e)} className="inline-flex h-11 items-center gap-1 rounded-lg border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50" aria-label={`Generate proposal for ${e.organisation}`} title="Generate the written pilot proposal (PDF)" data-testid="validation-entry-proposal">
                        <FileDown className="h-4 w-4" aria-hidden="true" /> {busyId === e.id ? "Generating…" : "Proposal"}
                      </button>
                    ) : null}
                    <button type="button" disabled={busyId === e.id} onClick={() => onEdit(e)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-surface-300 bg-white text-ink-700 hover:bg-surface-100 disabled:opacity-50" aria-label={`Edit ${e.organisation}`} data-testid="validation-entry-edit">
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" disabled={busyId === e.id} onClick={() => onDelete(e)} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Delete ${e.organisation}`} data-testid="validation-entry-delete">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Auto rows ───────────────────────────────────────────────────────────────

export function AutoRowsTable({ rows }: { rows: AutoRow[] }) {
  return (
    <section aria-labelledby="validation-auto-h" data-testid="validation-auto">
      <h2 id="validation-auto-h" className="text-base font-semibold text-ink-800">From platform data (read-only)</h2>
      <p className="mt-1 text-xs text-ink-500">Paid pilots count toward L4 / L5; every other row is a signal shown for context and never counted. QA accounts are excluded. Source in the last column.</p>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500" data-testid="validation-auto-empty">No paid pilots, pilot metrics, applications, feedback letters or scored cohorts on record yet.</p>
      ) : (
        <div className="mt-3 overflow-auto max-h-[75vh] rounded-xl border border-surface-200 bg-white">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken">
              <tr>
                <th scope="col" className="px-3 py-2">Date</th>
                <th scope="col" className="px-3 py-2">Organisation</th>
                <th scope="col" className="px-3 py-2">Level</th>
                <th scope="col" className="px-3 py-2">Detail</th>
                <th scope="col" className="px-3 py-2">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200 [&>tr:nth-child(even)]:bg-surface-sunken">
              {rows.map((r) => (
                <tr key={r.id} data-auto-source={r.source} data-auto-counts={r.counts ? "1" : "0"}>
                  <td className="px-3 py-2 tabular-nums text-ink-600">{r.date || "—"}</td>
                  <td className="px-3 py-2 font-medium text-ink-800">{r.organisation}</td>
                  <td className="px-3 py-2 text-ink-700">
                    L{r.level} {r.counts ? <span className="ml-1 inline-flex rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">counted</span> : <span className="ml-1 inline-flex rounded-full bg-surface-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">signal</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-700">{r.detail}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink-500">{SOURCE_LABEL[r.source]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── North Star ──────────────────────────────────────────────────────────────

export function NorthStarCard({ northStar, window: win }: { northStar: ValidationDashboard["north_star"]; window: ValidationDashboard["window"] }) {
  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-4" data-testid="validation-north-star" aria-labelledby="validation-ns-h">
      <h2 id="validation-ns-h" className="text-xs font-semibold uppercase tracking-wide text-indigo-700">North Star · {northStar ? northStar.month : "this month"}</h2>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-indigo-900" data-testid="validation-north-star-value">{northStar ? n(northStar.assessed) : "n/a"}</p>
      <p className="text-sm text-indigo-900">startups assessed through paying institutional workflows this month</p>
      <p className="mt-1 text-xs text-indigo-800">
        {northStar ? `${n(northStar.assessed_all)} batch items scored in total · ${n(northStar.paying_batches)} paying batches · ${n(northStar.paying_orgs)} paying organisations` : "evaluation_batch_items unavailable"}
        {northStar?.partial ? ` · partial: ${northStar.partial}` : ""}
      </p>
      {win ? (
        <div className="mt-3 border-t border-indigo-200 pt-3">
          <p className="text-xs font-medium text-indigo-800">
            Last {win.days} d · {win.from} → {win.to} (live metrics from /admin/funnel)
          </p>
          {win.metrics.length === 0 ? (
            <p className="mt-1 text-xs text-indigo-800">No live metrics in the window.</p>
          ) : (
            <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="validation-window">
              {win.metrics.map((m) => (
                <div key={m.key} className="flex items-baseline justify-between gap-2 text-xs">
                  <dt className="truncate text-indigo-900">{m.label}</dt>
                  <dd className="shrink-0 tabular-nums font-medium text-indigo-900">{metricValue(m)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : null}
    </section>
  );
}

// ── Script card ─────────────────────────────────────────────────────────────

export function ScriptCard() {
  const [ticked, setTicked] = React.useState<Set<number>>(() => new Set());
  const toggle = (q: number) =>
    setTicked((p) => {
      const nx = new Set(p);
      if (nx.has(q)) nx.delete(q);
      else nx.add(q);
      return nx;
    });
  return (
    <section className="rounded-xl border border-surface-200 bg-white p-4" data-testid="validation-script" aria-labelledby="validation-script-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="validation-script-h" className="flex items-center gap-2 text-base font-semibold text-ink-800">
          <ListChecks className="h-5 w-5 text-brand-600" aria-hidden="true" /> The 14-question validation script
        </h2>
        <p className="text-xs tabular-nums text-ink-500"><span data-testid="validation-script-ticked">{ticked.size}</span> / {VALIDATION_SCRIPT.length} covered on this call</p>
      </div>
      <p className="mt-1 text-xs text-ink-500">Ask in order. Tick a question when its “listen for” element is in your notes — the ticks are for the call in front of you and are not saved; the answers go in the entry note.</p>
      <ol className="mt-3 space-y-1">
        {VALIDATION_SCRIPT.map((q) => (
          <li key={q.n}>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-surface-100">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 rounded border-surface-300 text-brand-600 focus:ring-brand-600/40" checked={ticked.has(q.n)} onChange={() => toggle(q.n)} data-testid="validation-script-q" />
              <span className="min-w-0">
                <span className="text-sm text-ink-800"><span className="tabular-nums text-ink-500">{q.n}.</span> {q.text}</span>
                <span className="block text-xs text-ink-500">Listen for: {q.listen_for}</span>
              </span>
            </label>
          </li>
        ))}
      </ol>
      {ticked.size > 0 ? (
        <button type="button" onClick={() => setTicked(new Set())} className={`mt-2 ${BTN_SECONDARY}`}>
          <X className="h-4 w-4" aria-hidden="true" /> Clear ticks
        </button>
      ) : null}
    </section>
  );
}

// ── Page client ─────────────────────────────────────────────────────────────

export function ValidationClient({ user, initial }: ValidationClientProps) {
  const [entries, setEntries] = React.useState<ValidationEntry[]>(initial.ledger.entries);
  const [editing, setEditing] = React.useState<ValidationEntry | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);
  const formRef = React.useRef<HTMLDivElement>(null);

  const ladder = React.useMemo(() => computeLadder(entries, initial.auto), [entries, initial.auto]);
  const objections = React.useMemo(() => openObjections(entries), [entries]);

  // G23-C: a PATCH carries `If-Match: <updated_at of the row being edited>`; a 409
  // `stale` answer means someone saved that row meanwhile — re-read it, swap the
  // form onto the fresh row and let the founder re-apply the edit (never overwrite).
  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, ifMatch?: string): Promise<ValidationEntry> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (method === "PATCH" && ifMatch) headers["If-Match"] = ifMatch;
    const res = await fetch("/api/admin/validation", { method, headers, body: JSON.stringify(body) });
    if (!res.ok) throw await readErrorBody(res);
    const data = (await res.json().catch(() => null)) as { ok?: boolean; entry?: ValidationEntry } | null;
    if (!data?.ok || !data.entry) throw ApiError.fromBody(res.status, data ?? {});
    return data.entry;
  }

  async function handleSubmit(v: FormState) {
    setBusy(true);
    setFormError(null);
    setFeedback(null);
    try {
      if (editing) {
        const saved = await send("PATCH", { id: editing.id, ...v }, editing.updated_at);
        setEntries((p) => p.map((e) => (e.id === saved.id ? saved : e)));
        setEditing(null);
        setFeedback({ type: "success", message: "Entry updated." });
      } else {
        const saved = await send("POST", v);
        setEntries((p) => [saved, ...p]);
        setFeedback({ type: "success", message: `Added ${saved.organisation} at L${saved.level}.` });
      }
    } catch (err) {
      const stale = editing && err instanceof ApiError && err.status === 409 ? (entryFromConflict(err, editing.id) ?? (await reloadEntry(editing.id))) : null;
      if (stale) {
        setEntries((p) => p.map((e) => (e.id === stale.id ? stale : e)));
        setEditing(stale);
      }
      setFormError(userErrorMessage(err, "Could not save the entry. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  /** G23-C: the 409 body carries the current row (`entry`); null when it does not. */
  function entryFromConflict(err: ApiError, id: string): ValidationEntry | null {
    const entry = (err.body as { entry?: ValidationEntry }).entry;
    return entry && typeof entry === "object" && entry.id === id && typeof entry.updated_at === "string" ? entry : null;
  }

  /** G23-C: re-read one row after a 409 whose body had no row (the GET fallback). Null when it is gone. */
  async function reloadEntry(id: string): Promise<ValidationEntry | null> {
    try {
      const res = await fetch("/api/admin/validation", { method: "GET", headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = (await res.json().catch(() => null)) as { ok?: boolean; ledger?: { entries?: ValidationEntry[] } } | null;
      return data?.ledger?.entries?.find((e) => e.id === id) ?? null;
    } catch {
      return null;
    }
  }

  async function handleDelete(e: ValidationEntry) {
    if (!window.confirm(`Delete the ${e.organisation} entry (${e.date}, L${e.level})? This cannot be undone.`)) return;
    setBusyId(e.id);
    setFeedback(null);
    try {
      await send("DELETE", { id: e.id });
      setEntries((p) => p.filter((x) => x.id !== e.id));
      if (editing?.id === e.id) setEditing(null);
      setFeedback({ type: "success", message: "Entry deleted." });
    } catch (err) {
      setFeedback({ type: "error", message: userErrorMessage(err, "Could not delete the entry. Please try again.") });
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(e: ValidationEntry) {
    setEditing(e);
    setFormError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // G23-B — the written pilot proposal: fetched (so a 4xx/5xx passes through
  // userErrorMessage instead of a broken download), then saved through an
  // object URL. The route stamps proposal_generated_at; mirror it locally.
  async function handleProposal(e: ValidationEntry) {
    setBusyId(e.id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/validation/${encodeURIComponent(e.id)}/proposal`, { method: "GET" });
      if (!res.ok) throw await readErrorBody(res);
      const blob = await res.blob();
      const filename = proposalFilenameFrom(res.headers.get("content-disposition"), e.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      // Mirror the server's timestamps (both — the next PATCH's If-Match is `updated_at`).
      const stampedAt = res.headers.get("x-proposal-generated-at") ?? new Date().toISOString();
      const updatedAt = res.headers.get("x-entry-updated-at");
      setEntries((p) => p.map((x) => (x.id === e.id ? { ...x, proposal_generated_at: stampedAt, ...(updatedAt ? { updated_at: updatedAt } : {}) } : x)));
      setEditing((cur) => (cur && cur.id === e.id ? { ...cur, proposal_generated_at: stampedAt, ...(updatedAt ? { updated_at: updatedAt } : {}) } : cur));
      setFeedback({ type: "success", message: `Proposal for ${e.organisation} downloaded (${filename}). Send it, then set the L3 entry to done.` });
    } catch (err) {
      setFeedback({ type: "error", message: userErrorMessage(err, "Could not generate the proposal. Please try again.") });
    } finally {
      setBusyId(null);
    }
  }

  const editingForm: FormState | null = editing
    ? { organisation: editing.organisation, contact_role: editing.contact_role, date: editing.date, level: editing.level, outcome: editing.outcome, objection: editing.objection, objection_answered: editing.objection_answered, next_step: editing.next_step, note: editing.note }
    : null;

  return (
    <AdminLayout user={user}>
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Admin</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink-800">
            <ClipboardList strokeWidth={1.75} className="h-6 w-6 text-brand-600" aria-hidden="true" /> Validation tracker
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-500">
            The advisor plan&apos;s five validation levels — target versus actual. Actuals are entries you record as <em>done</em> plus paid pilots read from <code>pilot_orders</code>; nothing here is a claim about the business. Ledger: <code>content/reports/validation-tracker.json</code>, committed with the reports.
            {initial.ledger.updated_at ? <span className="ml-1 text-ink-400">Last edit {initial.ledger.updated_at.slice(0, 10)}.</span> : null}
          </p>
        </header>

        <ValidationLadder ladder={ladder} />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <NorthStarCard northStar={initial.north_star} window={initial.window} />
          </div>
          <ObjectionsList objections={objections} />
        </div>

        <section ref={formRef} className="rounded-xl border border-surface-200 bg-white p-4 scroll-mt-4" aria-labelledby="validation-form-h">
          <h2 id="validation-form-h" className="text-base font-semibold text-ink-800">{editing ? `Edit — ${editing.organisation}` : "Add an entry"}</h2>
          <p className="mt-1 mb-3 text-xs text-ink-500">One row per conversation, demo, proposal or payment. Set the outcome to <em>done</em> only when the level&apos;s bar was cleared.</p>
          <EntryForm key={editing?.id ?? "new"} initial={editingForm} onSubmit={handleSubmit} onCancel={editing ? () => setEditing(null) : undefined} busy={busy} error={formError} />
        </section>

        {feedback ? (
          <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-green-200 bg-green-50 text-green-800"}`} data-testid="validation-feedback">
            {feedback.message}
          </p>
        ) : null}

        <section aria-labelledby="validation-entries-h">
          <h2 id="validation-entries-h" className="mb-2 text-base font-semibold text-ink-800">
            Entries <span className="text-sm font-normal tabular-nums text-ink-500">({entries.length})</span>
          </h2>
          <EntriesTable entries={entries} onEdit={startEdit} onDelete={handleDelete} onProposal={handleProposal} busyId={busyId} />
        </section>

        <AutoRowsTable rows={initial.auto} />

        <ScriptCard />

        {initial.warnings.length > 0 ? (
          <p className="text-xs text-amber-700" data-testid="validation-warnings">
            Data sources not fully available: {initial.warnings.join(" · ")}
          </p>
        ) : null}
      </div>
    </AdminLayout>
  );
}
