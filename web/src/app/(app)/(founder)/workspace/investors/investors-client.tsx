"use client";

// InvestorsClient — the investor CRM (S28-B).
//
// Reads /api/investors/crm/contacts (every live contact, paged) and
// /api/investors/crm/pipeline (the summary strip). Draws the kanban by
// stage with "move" buttons on each card, a contact drawer with the
// touchpoint timeline + add-note form, next step with due date and an
// overdue badge, CSV import (multipart to /import) and export (owner-only
// link to /export.csv). Viewers get a read-only board; nothing here keys
// on the caller — the API resolves the project.

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BookUser,
  Download,
  FolderOpen,
  Loader2,
  Mail,
  Phone,
  Plus,
  StickyNote,
  Upload,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONTACT_STAGES,
  CONTACT_TYPES,
  formatAud,
  MANUAL_TOUCHPOINT_KINDS,
  STAGE_LABEL,
  TOUCHPOINT_LABEL,
  TYPE_LABEL,
  type ContactRow,
  type ContactStage,
  type ContactType,
  type PipelineSummary,
  type TouchpointKind,
  type TouchpointRow,
} from "@/lib/investors/crm";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

// ---------------------------------------------------------------------------
// Pure helpers (exported for the colocated spec)
// ---------------------------------------------------------------------------

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  truncated: boolean;
}

/** The one line the founder reads after an import. */
export function importSummaryCopy(r: ImportResult): string {
  const parts = [`${r.created} added`, `${r.updated} updated`];
  if (r.skipped > 0) parts.push(`${r.skipped} skipped`);
  let s = parts.join(", ");
  if (r.truncated) s += " — only the first 500 rows were read; split the file and import the rest";
  return s + ".";
}

/** Group live contacts into kanban columns, newest first inside each. */
export function groupByStage(contacts: readonly ContactRow[]): Record<ContactStage, ContactRow[]> {
  const out = Object.fromEntries(CONTACT_STAGES.map((s) => [s, [] as ContactRow[]])) as Record<ContactStage, ContactRow[]>;
  for (const c of contacts) {
    if (c.archived_at) continue;
    (out[c.stage] ?? out.researching).push(c);
  }
  return out;
}

/** Previous / next column for the card's move buttons (`passed` sits off the ladder: prev of `invested` is `committed`). */
export function neighbourStages(stage: ContactStage): { prev: ContactStage | null; next: ContactStage | null } {
  const ladder: ContactStage[] = ["researching", "contacted", "meeting", "diligence", "committed", "invested"];
  if (stage === "passed") return { prev: "researching", next: null };
  const i = ladder.indexOf(stage);
  return { prev: i > 0 ? ladder[i - 1] : null, next: i < ladder.length - 1 ? ladder[i + 1] : null };
}

/** "Due 20 Sep" / "Overdue · 3 days" / "Due today". */
export function nextStepDueLabel(due: string | null, now: Date = new Date()): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const today = now.toISOString().slice(0, 10);
  if (due === today) return { text: "Due today", overdue: false };
  const days = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${due}T00:00:00Z`).getTime()) / 86_400_000);
  if (days > 0) return { text: `Overdue · ${days} day${days === 1 ? "" : "s"}`, overdue: true };
  return { text: `Due ${fmtDate(due)}`, overdue: false };
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const STAGE_TONE: Record<ContactStage, string> = {
  researching: "bg-surface-100 text-ink-600",
  contacted: "bg-sky-50 text-sky-700",
  meeting: "bg-brand-50 text-brand-700",
  diligence: "bg-amber-50 text-amber-700",
  committed: "bg-emerald-50 text-emerald-700",
  passed: "bg-surface-100 text-ink-500",
  invested: "bg-emerald-100 text-emerald-800",
};

const KIND_ICON: Record<TouchpointKind, React.ComponentType<{ className?: string }>> = {
  note: StickyNote,
  email: Mail,
  call: Phone,
  meeting: Users,
  data_room_view: FolderOpen,
  commitment: BookUser,
  status_change: ArrowRight,
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface ListResponse {
  ok: boolean;
  error?: string;
  message?: string;
  contacts?: ContactRow[];
  nextCursor?: string | null;
  role?: string;
  canEdit?: boolean;
  canExport?: boolean;
}

async function fetchAllContacts(): Promise<{ contacts: ContactRow[]; canEdit: boolean; canExport: boolean; error: string | null; noProject: boolean }> {
  const contacts: ContactRow[] = [];
  let cursor: string | null = null;
  let canEdit = false;
  let canExport = false;
  for (let page = 0; page < 10; page++) {
    const qs = new URLSearchParams({ limit: "200" });
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`/api/investors/crm/contacts?${qs.toString()}`, { credentials: "same-origin" });
    const body = (await res.json().catch(() => ({ ok: false }))) as ListResponse;
    if (res.status === 409 && body.error === "no_project") return { contacts: [], canEdit: false, canExport: false, error: userErrorMessage(ApiError.fromBody(res.status, { ...body, error: body?.message }), "Create your startup profile first."), noProject: true };
    if (!res.ok || !body.ok) return { contacts, canEdit, canExport, error: userErrorMessage(ApiError.fromBody(res.status, body), "Something went wrong. Please try again."), noProject: false };
    contacts.push(...(body.contacts ?? []));
    canEdit = body.canEdit === true;
    canExport = body.canExport === true;
    cursor = body.nextCursor ?? null;
    if (!cursor) break;
  }
  return { contacts, canEdit, canExport, error: null, noProject: false };
}

async function fetchPipeline(): Promise<PipelineSummary | null> {
  const res = await fetch("/api/investors/crm/pipeline", { credentials: "same-origin" });
  const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; pipeline?: PipelineSummary };
  return res.ok && body.ok && body.pipeline ? body.pipeline : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Toast = { kind: "ok" | "err"; text: string } | null;

export function InvestorsClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [noProject, setNoProject] = React.useState(false);
  const [contacts, setContacts] = React.useState<ContactRow[]>([]);
  const [pipeline, setPipeline] = React.useState<PipelineSummary | null>(null);
  const [canEdit, setCanEdit] = React.useState(false);
  const [canExport, setCanExport] = React.useState(false);
  const [toast, setToast] = React.useState<Toast>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<ContactType | "">("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);

  const reload = React.useCallback(async () => {
    const [list, summary] = await Promise.all([fetchAllContacts(), fetchPipeline()]);
    setContacts(list.contacts);
    setCanEdit(list.canEdit);
    setCanExport(list.canExport);
    setError(list.error);
    setNoProject(list.noProject);
    setPipeline(summary);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void (async () => {
      await reload();
    })();
  }, [reload]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (!q) return true;
      return [c.name, c.email ?? "", c.org ?? "", ...(c.tags ?? [])].some((s) => s.toLowerCase().includes(q));
    });
  }, [contacts, query, typeFilter]);

  const columns = React.useMemo(() => groupByStage(visible), [visible]);
  const selected = selectedId ? (contacts.find((c) => c.id === selectedId) ?? null) : null;

  async function patchContact(id: string, patch: Record<string, unknown>, okText?: string): Promise<ContactRow | null> {
    setBusy(id);
    try {
      const res = await fetch(`/api/investors/crm/contacts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string; message?: string; contact?: ContactRow };
      if (!res.ok || !body.ok || !body.contact) {
        setToast({ kind: "err", text: userErrorMessage(ApiError.fromBody(res.status, body), "Could not update the contact.") });
        return null;
      }
      const updated = body.contact;
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      if (okText) setToast({ kind: "ok", text: okText });
      void fetchPipeline().then(setPipeline);
      return updated;
    } finally {
      setBusy(null);
    }
  }

  async function moveStage(c: ContactRow, to: ContactStage) {
    await patchContact(c.id, { stage: to }, `${c.name} → ${STAGE_LABEL[to]}`);
  }

  async function archive(c: ContactRow) {
    if (!window.confirm(`Archive ${c.name}? The timeline is kept; the contact leaves the board.`)) return;
    const r = await patchContact(c.id, { archived: true }, `${c.name} archived`);
    if (r) {
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
      setSelectedId(null);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-600" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your investor pipeline…
      </p>
    );
  }

  return (
    <div className="space-y-6" data-testid="investor-crm">
      {toast && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            toast.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {toast.text}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/workspace/fundraise" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Raise capital
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Investor CRM</h1>
          <p className="mt-1 text-sm text-ink-500">
            Every investor conversation in one pipeline — who you are talking to, what stage they are at, and the next step with a date.
            Data-room opens and recorded cheques land on the timeline automatically.
          </p>
        </div>
        {canEdit && !noProject && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              data-testid="crm-add"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Add contact
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-surface-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-50"
              data-testid="crm-import"
            >
              <Upload className="h-4 w-4" aria-hidden="true" /> Import CSV
            </button>
            {canExport && (
              <a
                href="/api/investors/crm/export.csv"
                className="inline-flex items-center gap-2 rounded-xl border border-surface-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-50"
                data-testid="crm-export"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
              </a>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
          {error}
          {noProject && (
            <>
              {" "}
              <Link href="/workspace/projects" className="font-semibold underline">
                Create a project
              </Link>
            </>
          )}
        </p>
      )}

      {!canEdit && !error && (
        <p className="text-xs text-ink-500" data-testid="crm-readonly">
          You have view-only access to this project — ask the owner for the editor role to add contacts or notes.
        </p>
      )}

      {/* ── Summary strip ─────────────────────────────────────────── */}
      {pipeline && contacts.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="crm-summary">
          <Tile label="In pipeline" value={String(pipeline.total)} sub={`${pipeline.byStage.meeting + pipeline.byStage.diligence} in conversation`} />
          <Tile label="Committed" value={formatAud(pipeline.committedAud)} sub={`${pipeline.byStage.committed} committed · ${pipeline.byStage.invested} invested`} />
          <Tile label="Funded" value={formatAud(pipeline.fundedAud)} sub={`${pipeline.contactsWithCommitments} with a recorded cheque`} />
          <Tile
            label="Next steps"
            value={String(pipeline.overdue)}
            sub={pipeline.overdue > 0 ? `overdue · ${pipeline.dueThisWeek} due this week` : `${pipeline.dueThisWeek} due this week`}
            tone={pipeline.overdue > 0 ? "warn" : undefined}
          />
        </dl>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {!error && contacts.length === 0 && (
        <section className="rounded-2xl border border-dashed border-surface-300 bg-white p-8 text-center" data-testid="crm-empty">
          <BookUser className="mx-auto h-8 w-8 text-ink-400" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-ink-900">No investors on the board yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
            Start with the warm intros you already have, then add every fund you plan to approach. A raise is a numbers game — most founders run 40–80 conversations for a seed round.
          </p>
          {canEdit && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => setShowAdd(true)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Add your first contact
              </button>
              <button type="button" onClick={() => setShowImport(true)} className="rounded-xl border border-surface-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-50">
                Import a CSV
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Filters ───────────────────────────────────────────────── */}
      {contacts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, firm, email or tag"
            aria-label="Search contacts"
            className="w-full rounded-xl border border-surface-300 px-3 py-2 text-sm sm:w-72"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as ContactType | "")}
            aria-label="Filter by investor type"
            className="rounded-xl border border-surface-300 px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-500">
            {visible.length} of {contacts.length}
          </span>
        </div>
      )}

      {/* ── Kanban ────────────────────────────────────────────────── */}
      {contacts.length > 0 && (
        <div className="-mx-6 overflow-x-auto px-6 pb-2" data-testid="crm-board">
          <div className="flex min-w-max gap-3">
            {CONTACT_STAGES.map((stage) => (
              <section key={stage} className="w-64 shrink-0 rounded-2xl border border-surface-200 bg-surface-50 p-2" aria-labelledby={`col-${stage}`}>
                <h2 id={`col-${stage}`} className="flex items-center justify-between px-1 py-1 text-xs font-semibold uppercase tracking-wide text-ink-600">
                  {STAGE_LABEL[stage]}
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-500">{columns[stage].length}</span>
                </h2>
                <ul className="mt-1 space-y-2">
                  {columns[stage].map((c) => {
                    const due = nextStepDueLabel(c.next_step_due);
                    const money = pipeline?.byContact[c.id];
                    const nb = neighbourStages(c.stage);
                    return (
                      <li key={c.id} className="rounded-xl border border-surface-200 bg-white p-3 text-sm shadow-sm" data-testid="crm-card">
                        <button type="button" onClick={() => setSelectedId(c.id)} className="w-full text-left">
                          <p className="font-semibold text-ink-900">{c.name}</p>
                          <p className="truncate text-xs text-ink-500">
                            {c.org ?? c.email ?? "—"} · {TYPE_LABEL[c.type] ?? c.type}
                          </p>
                          {c.next_step && (
                            <p className="mt-2 line-clamp-2 text-xs text-ink-700">
                              <span className="font-medium">Next:</span> {c.next_step}
                            </p>
                          )}
                          {due && (
                            <span
                              className={cn(
                                "mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                                due.overdue ? "bg-red-50 text-red-700" : "bg-surface-100 text-ink-600",
                              )}
                              data-testid={due.overdue ? "crm-overdue" : undefined}
                            >
                              {due.text}
                            </span>
                          )}
                          {money && (money.committedAud > 0 || money.fundedAud > 0) && (
                            <p className="mt-1 text-[11px] font-medium text-emerald-700">
                              {money.fundedAud > 0 ? `${formatAud(money.fundedAud)} funded` : `${formatAud(money.committedAud)} committed`}
                            </p>
                          )}
                          {c.tags.length > 0 && (
                            <p className="mt-1 flex flex-wrap gap-1">
                              {c.tags.slice(0, 4).map((t) => (
                                <span key={t} className="rounded bg-surface-100 px-1.5 py-0.5 text-[10px] text-ink-600">
                                  {t}
                                </span>
                              ))}
                            </p>
                          )}
                        </button>
                        {canEdit && (
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <button
                              type="button"
                              disabled={!nb.prev || busy === c.id}
                              onClick={() => nb.prev && void moveStage(c, nb.prev)}
                              className="rounded-lg border border-surface-200 px-2 py-1 text-[11px] text-ink-600 hover:bg-surface-50 disabled:opacity-40"
                              aria-label={nb.prev ? `Move ${c.name} back to ${STAGE_LABEL[nb.prev]}` : "No earlier stage"}
                            >
                              ←
                            </button>
                            {c.stage !== "passed" && c.stage !== "invested" && (
                              <button
                                type="button"
                                disabled={busy === c.id}
                                onClick={() => void moveStage(c, "passed")}
                                className="rounded-lg px-2 py-1 text-[11px] text-ink-500 hover:bg-surface-50 disabled:opacity-40"
                              >
                                Passed
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!nb.next || busy === c.id}
                              onClick={() => nb.next && void moveStage(c, nb.next)}
                              className="rounded-lg border border-surface-200 px-2 py-1 text-[11px] text-ink-600 hover:bg-surface-50 disabled:opacity-40"
                              aria-label={nb.next ? `Move ${c.name} on to ${STAGE_LABEL[nb.next]}` : "No later stage"}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}

      {selected && (
        // Keyed on the id so opening another contact remounts the form with its values.
        <ContactDrawer
          key={selected.id}
          contact={selected}
          canEdit={canEdit}
          busy={busy === selected.id}
          onClose={() => setSelectedId(null)}
          onPatch={(patch) => patchContact(selected.id, patch, "Saved")}
          onArchive={() => void archive(selected)}
          onToast={setToast}
        />
      )}

      {showAdd && (
        <AddContactDialog
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setContacts((prev) => [c, ...prev]);
            setShowAdd(false);
            setSelectedId(c.id);
            setToast({ kind: "ok", text: `${c.name} added to ${STAGE_LABEL[c.stage]}` });
            void fetchPipeline().then(setPipeline);
          }}
          onToast={setToast}
        />
      )}

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onDone={(r) => {
            setShowImport(false);
            setToast({ kind: "ok", text: importSummaryCopy(r) });
            setLoading(true);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warn" }) {
  return (
    <div className={cn("rounded-2xl border bg-white p-4", tone === "warn" ? "border-red-200" : "border-surface-200")}>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className={cn("mt-1 text-xl font-bold tabular-nums", tone === "warn" ? "text-red-700" : "text-ink-900")}>{value}</dd>
      <dd className="text-xs text-ink-500">{sub}</dd>
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-surface-300 px-3 py-2 text-sm disabled:bg-surface-50";

function ContactDrawer(props: {
  contact: ContactRow;
  canEdit: boolean;
  busy: boolean;
  onClose: () => void;
  onPatch: (patch: Record<string, unknown>) => Promise<ContactRow | null>;
  onArchive: () => void;
  onToast: (t: Toast) => void;
}) {
  const { contact: c, canEdit } = props;
  const [form, setForm] = React.useState({
    name: c.name,
    email: c.email ?? "",
    org: c.org ?? "",
    role: c.role ?? "",
    type: c.type,
    stage: c.stage,
    source: c.source ?? "",
    tags: c.tags.join("; "),
    nextStep: c.next_step ?? "",
    nextStepDue: c.next_step_due ?? "",
  });
  const [timeline, setTimeline] = React.useState<TouchpointRow[] | null>(null);
  const [note, setNote] = React.useState({ kind: "note" as TouchpointKind, body: "", occurredAt: "" });
  const [saving, setSaving] = React.useState(false);

  const loadTimeline = React.useCallback(async () => {
    const res = await fetch(`/api/investors/crm/contacts/${encodeURIComponent(c.id)}/touchpoints`, { credentials: "same-origin" });
    const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; touchpoints?: TouchpointRow[] };
    setTimeline(res.ok && body.ok ? (body.touchpoints ?? []) : []);
  }, [c.id]);

  React.useEffect(() => {
    void (async () => {
      await loadTimeline();
    })();
  }, [loadTimeline]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await props.onPatch({
        name: form.name,
        email: form.email,
        org: form.org,
        role: form.role,
        type: form.type,
        stage: form.stage,
        source: form.source,
        tags: form.tags,
        nextStep: form.nextStep,
        nextStepDue: form.nextStepDue || null,
      });
      if (r) void loadTimeline();
    } finally {
      setSaving(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/investors/crm/contacts/${encodeURIComponent(c.id)}/touchpoints`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: note.kind, body: note.body, occurredAt: note.occurredAt ? new Date(note.occurredAt).toISOString() : undefined }),
      });
      const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        props.onToast({ kind: "err", text: userErrorMessage(ApiError.fromBody(res.status, body), "Could not add the note.") });
        return;
      }
      setNote({ kind: "note", body: "", occurredAt: "" });
      void loadTimeline();
    } finally {
      setSaving(false);
    }
  }

  const due = nextStepDueLabel(c.next_step_due);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink-900/30" role="dialog" aria-modal="true" aria-labelledby="crm-drawer-title" data-testid="crm-drawer">
      <button type="button" className="flex-1" aria-label="Close" onClick={props.onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-surface-200 p-5">
          <div>
            <h2 id="crm-drawer-title" className="text-lg font-bold text-ink-900">
              {c.name}
            </h2>
            <p className="text-xs text-ink-500">
              {[c.org, c.role, c.email].filter(Boolean).join(" · ") || "No details yet"}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STAGE_TONE[c.stage])}>{STAGE_LABEL[c.stage]}</span>
              {due && (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", due.overdue ? "bg-red-50 text-red-700" : "bg-surface-100 text-ink-600")}>
                  {due.text}
                </span>
              )}
              {c.last_touch_at && <span className="text-[11px] text-ink-500">Last touch {fmtDate(c.last_touch_at)}</span>}
            </p>
          </div>
          <button type="button" onClick={props.onClose} className="rounded-lg p-1 text-ink-500 hover:bg-surface-100" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <form onSubmit={(e) => void save(e)} className="grid grid-cols-1 gap-3 border-b border-surface-200 p-5 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-600">
            Name
            <input className={inputCls} value={form.name} disabled={!canEdit} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Email
            <input className={inputCls} type="email" value={form.email} disabled={!canEdit} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Firm / organisation
            <input className={inputCls} value={form.org} disabled={!canEdit} onChange={(e) => setForm({ ...form, org: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Role
            <input className={inputCls} value={form.role} disabled={!canEdit} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Partner, Principal…" />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Type
            <select className={inputCls} value={form.type} disabled={!canEdit} onChange={(e) => setForm({ ...form, type: e.target.value as ContactType })}>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-600">
            Stage
            <select className={inputCls} value={form.stage} disabled={!canEdit} onChange={(e) => setForm({ ...form, stage: e.target.value as ContactStage })}>
              {CONTACT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-600 sm:col-span-2">
            Next step
            <input className={inputCls} value={form.nextStep} disabled={!canEdit} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} placeholder="Send the deck, book the partner meeting…" />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Due
            <input className={inputCls} type="date" value={form.nextStepDue} disabled={!canEdit} onChange={(e) => setForm({ ...form, nextStepDue: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Source
            <input className={inputCls} value={form.source} disabled={!canEdit} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Warm intro from…" />
          </label>
          <label className="text-xs font-medium text-ink-600 sm:col-span-2">
            Tags <span className="font-normal text-ink-400">(separate with ;)</span>
            <input className={inputCls} value={form.tags} disabled={!canEdit} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </label>
          {canEdit && (
            <div className="flex items-center justify-between sm:col-span-2">
              <button type="button" onClick={props.onArchive} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-red-700" data-testid="crm-archive">
                <Archive className="h-3.5 w-3.5" aria-hidden="true" /> Archive contact
              </button>
              <button type="submit" disabled={saving || props.busy} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </form>

        <section className="p-5" aria-labelledby="crm-timeline-heading">
          <h3 id="crm-timeline-heading" className="text-sm font-semibold text-ink-800">
            Timeline
          </h3>
          {canEdit && (
            <form onSubmit={(e) => void addNote(e)} className="mt-3 space-y-2 rounded-xl border border-surface-200 bg-surface-50 p-3">
              <div className="flex flex-wrap gap-2">
                <select className="rounded-lg border border-surface-300 px-2 py-1 text-xs" value={note.kind} onChange={(e) => setNote({ ...note, kind: e.target.value as TouchpointKind })} aria-label="Touchpoint kind">
                  {MANUAL_TOUCHPOINT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {TOUCHPOINT_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input type="datetime-local" className="rounded-lg border border-surface-300 px-2 py-1 text-xs" value={note.occurredAt} onChange={(e) => setNote({ ...note, occurredAt: e.target.value })} aria-label="When" />
              </div>
              <textarea
                className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm"
                rows={2}
                value={note.body}
                onChange={(e) => setNote({ ...note, body: e.target.value })}
                placeholder="What happened? Keep it short — the next founder reading this is you in three months."
                aria-label="Note"
              />
              <div className="flex justify-end">
                <button type="submit" disabled={saving || !note.body.trim()} className="rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" data-testid="crm-add-note">
                  Add to timeline
                </button>
              </div>
            </form>
          )}
          <ol className="mt-3 space-y-3" data-testid="crm-timeline">
            {timeline === null && <li className="text-xs text-ink-500">Loading…</li>}
            {timeline !== null && timeline.length === 0 && <li className="text-xs text-ink-500">Nothing on the timeline yet.</li>}
            {(timeline ?? []).map((t) => {
              const Icon = KIND_ICON[t.kind] ?? StickyNote;
              return (
                <li key={t.id || `${t.kind}-${t.occurred_at}`} className="flex gap-3 text-sm">
                  <span className="mt-0.5 shrink-0 rounded-full bg-surface-100 p-1.5 text-ink-500">
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-ink-500">
                      {TOUCHPOINT_LABEL[t.kind] ?? t.kind} · {fmtDateTime(t.occurred_at)}
                      {!t.created_by && (t.kind === "data_room_view" || t.kind === "commitment") ? " · automatic" : ""}
                    </p>
                    <p className="whitespace-pre-wrap text-ink-800">{t.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function AddContactDialog(props: { onClose: () => void; onCreated: (c: ContactRow) => void; onToast: (t: Toast) => void }) {
  const [form, setForm] = React.useState({ name: "", email: "", org: "", type: "vc" as ContactType, stage: "researching" as ContactStage, nextStep: "", nextStepDue: "", source: "" });
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/investors/crm/contacts", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, nextStepDue: form.nextStepDue || null }),
      });
      const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string; message?: string; contact?: ContactRow };
      if (!res.ok || !body.ok || !body.contact) {
        props.onToast({ kind: "err", text: userErrorMessage(ApiError.fromBody(res.status, body), "Could not add the contact.") });
        return;
      }
      props.onCreated(body.contact);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/30 p-4" role="dialog" aria-modal="true" aria-labelledby="crm-add-title">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="crm-add-title" className="text-base font-semibold text-ink-900">
            Add an investor
          </h2>
          <button type="button" onClick={props.onClose} className="rounded-lg p-1 text-ink-500 hover:bg-surface-100" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-ink-600 sm:col-span-2">
            Name
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Email
            <input className={inputCls} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Firm
            <input className={inputCls} value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Type
            <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ContactType })}>
              {CONTACT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-600">
            Stage
            <select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as ContactStage })}>
              {CONTACT_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-ink-600 sm:col-span-2">
            Next step
            <input className={inputCls} value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} placeholder="Ask for the intro, send the one-pager…" />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Due
            <input className={inputCls} type="date" value={form.nextStepDue} onChange={(e) => setForm({ ...form, nextStepDue: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-ink-600">
            Source
            <input className={inputCls} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Warm intro, event, cold…" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="rounded-xl border border-surface-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-50">
            Cancel
          </button>
          <button type="submit" disabled={saving || !form.name.trim()} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {saving ? "Adding…" : "Add contact"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ImportDialog(props: { onClose: () => void; onDone: (r: ImportResult) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/investors/crm/import", { method: "POST", credentials: "same-origin", body: fd });
      const body = (await res.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string } & Partial<ImportResult>;
      if (!res.ok || !body.ok) {
        setErr(userErrorMessage(ApiError.fromBody(res.status, body), "Something went wrong. Please try again."));
        return;
      }
      props.onDone({ created: body.created ?? 0, updated: body.updated ?? 0, skipped: body.skipped ?? 0, truncated: body.truncated === true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/30 p-4" role="dialog" aria-modal="true" aria-labelledby="crm-import-title">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="crm-import-title" className="text-base font-semibold text-ink-900">
            Import investors from a CSV
          </h2>
          <button type="button" onClick={props.onClose} className="rounded-lg p-1 text-ink-500 hover:bg-surface-100" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-ink-600">
          Columns <code className="rounded bg-surface-100 px-1">name,email,org,type,stage,tags</code> — a header row is required, only <code className="rounded bg-surface-100 px-1">name</code> is mandatory.
          The usual export headings from HubSpot, Affinity or a Notion table are recognised. Up to 500 rows per file; a contact whose email is already on the board is updated, not duplicated.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" aria-label="CSV file" />
        {err && (
          <p className="text-sm text-red-700" role="alert">
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={props.onClose} className="rounded-xl border border-surface-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-50">
            Cancel
          </button>
          <button type="submit" disabled={!file || busy} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Import
          </button>
        </div>
      </form>
    </div>
  );
}
