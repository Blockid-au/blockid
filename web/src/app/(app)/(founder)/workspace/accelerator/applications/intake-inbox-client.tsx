"use client";

// Intake inbox — client half (G14 S35). Three parts:
//   1. "My intake links": one card per link with the public URL (copy),
//      submission count, auto-report flag, close / reopen;
//   2. "Create intake link" dialog → POST /api/intake/links → the URL;
//   3. the scored table: startup · SVI · coverage heat (8 cells) · status ·
//      submitted · dossier link · "Score now" (ReportDialog, 1 report) ·
//      triage (reviewed / rejected) · CSV export.
// Pure helpers (sortInboxRows, coverageCells, publicUrl) are exported for
// the colocated test; everything network-shaped goes through fetch.

import * as React from "react";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, Link2, Loader2, Plus, X } from "lucide-react";
import { useModalDialog } from "@/hooks/useModalDialog";
import { DIM_KEYS, coverageSummary, type DimKey } from "@/lib/pitchdeck/classify";
import type { InboxRow, IntakeWithCounts, SubmissionStatus } from "@/lib/intake/program-intakes";
import { ReportDialog, type ReportRunResult } from "../../evaluations/report-dialog";

export const DIM_SHORT: Record<DimKey, string> = {
  ftv: "Team",
  mpc: "Market",
  ptd: "Product",
  tre: "Traction",
  cgh: "Cap table",
  iri: "Readiness",
  lco: "Legal",
  svm: "Moat",
};

const LEVEL_CLASS: Record<string, string> = {
  strong: "bg-emerald-400",
  partial: "bg-amber-300",
  missing: "bg-red-200",
  none: "bg-surface-200",
};

export const STATUS_CHIP: Record<SubmissionStatus, { label: string; className: string }> = {
  received: { label: "Received", className: "border-surface-300 bg-surface-100 text-ink-600" },
  scored: { label: "Scored", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  reviewed: { label: "Reviewed", className: "border-brand-300 bg-brand-50 text-brand-700" },
  rejected: { label: "Rejected", className: "border-red-300 bg-red-50 text-red-700" },
};

export type SortKey = "submitted" | "svi" | "startup";

/** Pure: newest first by default; SVI desc (unscored last); startup A→Z. */
export function sortInboxRows(rows: InboxRow[], key: SortKey, dir: "asc" | "desc"): InboxRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "svi") {
      if (a.latestSvi == null && b.latestSvi == null) return 0;
      if (a.latestSvi == null) return 1;
      if (b.latestSvi == null) return -1;
      return (a.latestSvi - b.latestSvi) * sign;
    }
    if (key === "startup") return a.startupName.localeCompare(b.startupName) * sign;
    return a.submittedAt.localeCompare(b.submittedAt) * sign;
  });
}

/** Pure: the 8 heat cells for a row (level "none" when unclassified). */
export function coverageCells(coverage: InboxRow["coverage"]): Array<{ dim: DimKey; level: "strong" | "partial" | "missing" | "none" }> {
  return DIM_KEYS.map((dim) => {
    const level = coverage?.[dim]?.level;
    return { dim, level: level === "strong" || level === "partial" || level === "missing" ? level : "none" };
  });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function CoverageHeat({ coverage }: { coverage: InboxRow["coverage"] }) {
  const cells = coverageCells(coverage);
  const s = coverageSummary(coverage);
  const label = coverage ? `Coverage: ${s.strong} strong, ${s.partial} partial, ${s.missing} missing` : "Deck not classified yet";
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={label} title={label} data-testid="coverage-heat">
      {cells.map((c) => (
        <span key={c.dim} className={`inline-block h-3 w-3 rounded-sm ${LEVEL_CLASS[c.level]}`} title={`${DIM_SHORT[c.dim]}: ${c.level}`} />
      ))}
    </div>
  );
}

function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked — the URL is visible next to the button */
        }
      }}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-surface-50"
      aria-label={label}
      data-testid="copy-intake-url"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

// ── Create dialog ───────────────────────────────────────────────────────────

function CreateIntakeDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (i: IntakeWithCounts) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useModalDialog(ref, { onClose });
  const [name, setName] = React.useState("");
  const [blurb, setBlurb] = React.useState("");
  const [max, setMax] = React.useState("200");
  const [closesAt, setClosesAt] = React.useState("");
  const [autoReport, setAutoReport] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<IntakeWithCounts | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          blurb: blurb || undefined,
          max_submissions: max ? Number(max) : undefined,
          closes_at: closesAt ? new Date(closesAt).toISOString() : undefined,
          auto_report: autoReport,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; intake?: IntakeWithCounts; message?: string; error?: string };
      if (!res.ok || !data.ok || !data.intake) {
        setError(data.message ?? (data.error === "not_migrated" ? "Intake links are not enabled on this server yet." : "Could not create the link."));
        return;
      }
      setCreated(data.intake);
      onCreated(data.intake);
    } catch {
      setError("Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="intake-create-title" data-testid="intake-create-dialog">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-200 px-6 py-4">
          <h2 id="intake-create-title" className="text-lg font-bold text-ink-900">
            {created ? "Your intake link is live" : "Create intake link"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-surface-100 hover:text-ink-700">
            <X strokeWidth={1.75} className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {created ? (
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm text-ink-600">Share this with founders. Each one applies once with their deck; you see them here scored.</p>
            <div className="flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 text-ink-500" aria-hidden="true" />
              <code className="min-w-0 flex-1 truncate text-sm text-ink-800" data-testid="intake-public-url">
                {created.publicUrl}
              </code>
              <CopyButton text={created.publicUrl} />
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 px-6 py-5">
            <div>
              <label htmlFor="intake-name" className="mb-1 block text-sm font-medium text-ink-800">
                Program / round name
              </label>
              <input id="intake-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="e.g. Cohort 5 — Spring 2027" className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="intake-blurb" className="mb-1 block text-sm font-medium text-ink-800">
                One line founders see on the page (optional)
              </label>
              <input id="intake-blurb" value={blurb} onChange={(e) => setBlurb(e.target.value)} maxLength={1000} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="intake-max" className="mb-1 block text-sm font-medium text-ink-800">
                  Max applications
                </label>
                <input id="intake-max" type="number" min={1} max={5000} value={max} onChange={(e) => setMax(e.target.value)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label htmlFor="intake-closes" className="mb-1 block text-sm font-medium text-ink-800">
                  Closes (optional)
                </label>
                <input id="intake-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} className="w-full rounded-lg border border-surface-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm text-ink-700">
              <input type="checkbox" checked={autoReport} onChange={(e) => setAutoReport(e.target.checked)} className="mt-0.5 h-4 w-4" data-testid="intake-auto-report" />
              <span>
                <strong className="text-ink-900">Auto-score every application</strong> — uses one included report per application while your monthly quota lasts (never credits). Off by default: you click &ldquo;Score now&rdquo; on the ones you want.
              </span>
            </label>
            {error ? (
              <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-surface-50">
                Cancel
              </button>
              <button type="submit" disabled={busy || !name.trim()} aria-busy={busy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" data-testid="intake-create-submit">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                Create link
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export interface IntakeInboxClientProps {
  initialIntakes: IntakeWithCounts[];
  initialRows: InboxRow[];
}

export function IntakeInboxClient({ initialIntakes, initialRows }: IntakeInboxClientProps) {
  const [intakes, setIntakes] = React.useState(initialIntakes);
  const [rows, setRows] = React.useState(initialRows);
  const [showCreate, setShowCreate] = React.useState(false);
  const [filterIntake, setFilterIntake] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "submitted", dir: "desc" });
  const [reportFor, setReportFor] = React.useState<InboxRow | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const visible = React.useMemo(() => sortInboxRows(filterIntake ? rows.filter((r) => r.intakeId === filterIntake) : rows, sort.key, sort.dir), [rows, filterIntake, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "startup" ? "asc" : "desc" }));
  }

  async function setIntakeStatus(intake: IntakeWithCounts, status: "open" | "closed") {
    setBusyId(intake.id);
    try {
      const res = await fetch(`/api/intake/links/${intake.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (res.ok) setIntakes((list) => list.map((i) => (i.id === intake.id ? { ...i, status } : i)));
    } finally {
      setBusyId(null);
    }
  }

  async function triage(row: InboxRow, status: SubmissionStatus) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/intake/submissions/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
      if (res.ok) setRows((list) => list.map((r) => (r.id === row.id ? { ...r, status } : r)));
    } finally {
      setBusyId(null);
    }
  }

  function onScored(row: InboxRow, result: ReportRunResult) {
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, status: r.status === "received" ? "scored" : r.status, latestSvi: result.svi } : r)));
    setReportFor(null);
  }

  const exportHref = `/api/intake/links/${filterIntake ?? "all"}/export.csv`;

  return (
    <div className="space-y-6" data-testid="intake-inbox">
      {/* ── My intake links ── */}
      <section className="space-y-3" aria-labelledby="intake-links-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="intake-links-title" className="text-base font-semibold text-ink-900">
            My intake links <span className="ml-1 text-sm font-normal text-ink-500">({intakes.length})</span>
          </h2>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700" data-testid="intake-create-open">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create intake link
          </button>
        </div>
        {intakes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-8 text-center text-sm text-ink-500" data-testid="intake-links-empty">
            No intake links yet. Create one, share <code className="text-ink-700">/apply/&lt;slug&gt;</code> with founders, and their scored applications appear below.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {intakes.map((i) => (
              <li key={i.id} className="rounded-2xl border border-surface-200 bg-white p-4" data-testid="intake-link-card" data-status={i.status}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">{i.name}</p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {i.submissionCount} / {i.maxSubmissions} applications · {i.autoReport ? "auto-scored" : "score on demand"}
                      {i.closesAt ? ` · closes ${fmtDate(i.closesAt)}` : ""}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${i.status === "open" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-surface-300 bg-surface-100 text-ink-600"}`}>
                    {i.status === "open" ? "Open" : "Closed"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-ink-800">{i.publicUrl}</code>
                  <CopyButton text={i.publicUrl} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <button type="button" onClick={() => setFilterIntake(filterIntake === i.id ? null : i.id)} className={`rounded-lg border px-2.5 py-1.5 font-semibold ${filterIntake === i.id ? "border-brand-300 bg-brand-50 text-brand-700" : "border-surface-300 bg-white text-ink-700 hover:bg-surface-50"}`} aria-pressed={filterIntake === i.id}>
                    {filterIntake === i.id ? "Showing this round" : "Show applications"}
                  </button>
                  <button type="button" disabled={busyId === i.id} onClick={() => setIntakeStatus(i, i.status === "open" ? "closed" : "open")} className="rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 font-semibold text-ink-700 hover:bg-surface-50 disabled:opacity-60" data-testid="intake-toggle-status">
                    {i.status === "open" ? "Close round" : "Reopen"}
                  </button>
                  <a href={`/apply/${i.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 font-semibold text-ink-700 hover:bg-surface-50">
                    Preview <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Scored table ── */}
      <section className="space-y-3" aria-labelledby="intake-table-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="intake-table-title" className="text-base font-semibold text-ink-900">
            Applications <span className="ml-1 text-sm font-normal text-ink-500">({visible.length})</span>
          </h2>
          <a href={exportHref} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50" data-testid="intake-export-csv">
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </a>
        </div>
        {visible.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center text-sm text-ink-500" data-testid="intake-rows-empty">
            No applications yet. They appear here the moment a founder submits a deck on your link.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white">
            <table className="min-w-full text-sm" data-testid="intake-table">
              <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold" aria-sort={sort.key === "startup" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggleSort("startup")} className="hover:text-ink-800" data-testid="sort-startup">
                      Startup
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold" aria-sort={sort.key === "svi" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggleSort("svi")} className="hover:text-ink-800" data-testid="sort-svi">
                      SVI
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Coverage
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold" aria-sort={sort.key === "submitted" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => toggleSort("submitted")} className="hover:text-ink-800" data-testid="sort-submitted">
                      Submitted
                    </button>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {visible.map((r) => {
                  const chip = STATUS_CHIP[r.status];
                  return (
                    <tr key={r.id} className="align-top" data-testid="intake-row" data-status={r.status}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink-900">{r.startupName}</p>
                        <p className="text-xs text-ink-500">
                          {r.founderName ? `${r.founderName} · ` : ""}
                          {r.founderEmail}
                          {r.website ? (
                            <>
                              {" · "}
                              <a href={r.website} target="_blank" rel="noreferrer" className="hover:underline">
                                {r.website.replace(/^https?:\/\//, "")}
                              </a>
                            </>
                          ) : null}
                        </p>
                        {!filterIntake && intakes.length > 1 ? <p className="mt-0.5 text-[11px] text-ink-400">{r.intakeName}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink-800" data-testid="intake-row-svi">
                        {r.latestSvi == null ? "—" : Math.round(r.latestSvi)}
                      </td>
                      <td className="px-4 py-3">
                        <CoverageHeat coverage={r.coverage} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{chip.label}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-600">{fmtDate(r.submittedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5 text-xs">
                          {r.evaluationId && r.latestSvi == null ? (
                            <button type="button" onClick={() => setReportFor(r)} className="rounded-lg bg-brand-600 px-2.5 py-1.5 font-semibold text-white hover:bg-brand-700" data-testid="intake-score-now">
                              Score now (1 report)
                            </button>
                          ) : null}
                          {r.dossierUrl ? (
                            <Link href={r.dossierUrl} className="rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 font-semibold text-ink-700 hover:bg-surface-50" data-testid="intake-dossier-link">
                              Dossier
                            </Link>
                          ) : (
                            <span className="rounded-lg border border-dashed border-surface-300 px-2.5 py-1.5 text-ink-400" title={r.warnings.join("; ") || "No evaluation was created"}>
                              No dossier
                            </span>
                          )}
                          {r.status !== "reviewed" ? (
                            <button type="button" disabled={busyId === r.id} onClick={() => triage(r, "reviewed")} className="rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 font-semibold text-ink-700 hover:bg-surface-50 disabled:opacity-60">
                              Mark reviewed
                            </button>
                          ) : null}
                          {r.status !== "rejected" ? (
                            <button type="button" disabled={busyId === r.id} onClick={() => triage(r, "rejected")} className="rounded-lg border border-surface-300 bg-white px-2.5 py-1.5 font-semibold text-ink-700 hover:bg-surface-50 disabled:opacity-60">
                              Reject
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreate ? (
        <CreateIntakeDialog
          onClose={() => setShowCreate(false)}
          onCreated={(i) => setIntakes((list) => [i, ...list])}
        />
      ) : null}

      {reportFor && reportFor.evaluationId ? (
        <ReportDialog
          key={reportFor.id}
          evaluationId={reportFor.evaluationId}
          startupName={reportFor.startupName}
          kind="full"
          onClose={() => setReportFor(null)}
          onSuccess={(result) => onScored(reportFor, result)}
        />
      ) : null}
    </div>
  );
}
