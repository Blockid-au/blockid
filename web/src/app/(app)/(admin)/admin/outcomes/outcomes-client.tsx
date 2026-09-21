"use client";

// /admin/outcomes — G21 P3-A. The outcome queue: every proposal (founder,
// evaluator, connector, public register) with the startup, kind, summary,
// source + confidence, observed date, status; a status filter (defaults to
// proposed); confirm / reject per proposed row → PATCH /api/outcomes/[id]
// (admin resolves any source). Posts JSON from a client component — no
// inline scripts (CSP). A reject takes a note the founder can read; a
// confirm takes an optional note. Nothing here changes a score.

import * as React from "react";
import { CheckCircle2, TrendingUp, XCircle } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { OUTCOME_KIND_META, OUTCOME_SOURCE_LABEL, OUTCOME_STATUSES, outcomeSummary, type OutcomeRow, type OutcomeStatus } from "@/lib/outcomes/types";
import type { QueueOutcomeRow } from "@/lib/outcomes/service";

export interface OutcomesQueueClientProps {
  user: { email: string; displayName: string | null };
  initial: QueueOutcomeRow[];
}

type Filter = OutcomeStatus | "all";

const STATUS_CLASS: Record<OutcomeStatus, string> = {
  proposed: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-700",
  rejected: "bg-surface-200 text-ink-600",
};

function fmt(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export function OutcomesTable({ rows, onResolve, busyId }: { rows: QueueOutcomeRow[]; onResolve?: (id: string, decision: "confirm" | "reject") => void; busyId?: string | null }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500" data-testid="outcomes-queue-empty">No outcomes match this filter.</p>;
  }
  return (
    <div className="overflow-auto max-h-[75vh] rounded-xl border border-surface-200 bg-white">
      <table className="w-full text-left text-sm" data-testid="outcomes-queue">
        <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken">
          <tr>
            <th scope="col" className="px-3 py-2">Observed</th>
            <th scope="col" className="px-3 py-2">Startup</th>
            <th scope="col" className="px-3 py-2">Outcome</th>
            <th scope="col" className="px-3 py-2">Source · confidence</th>
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200 [&>tr:nth-child(even)]:bg-surface-sunken">
          {rows.map((r) => {
            const url = typeof r.value?.source_url === "string" ? r.value.source_url : null;
            return (
              <tr key={r.id} data-outcome-id={r.id} data-outcome-status={r.status} data-outcome-source={r.source}>
                <td className="px-3 py-2 tabular-nums text-ink-600">{fmt(r.observed_at)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-ink-800">{r.project_name ?? "(unnamed)"}</div>
                  <div className="font-mono text-[11px] text-ink-500">{r.project_id.slice(0, 8)}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-ink-800">{OUTCOME_KIND_META[r.kind]?.label ?? r.kind}</div>
                  <div className="text-ink-600">{outcomeSummary(r)}</div>
                  {url ? (
                    <a href={url} className="text-xs text-brand-700 underline decoration-dotted underline-offset-4" target="_blank" rel="noopener noreferrer nofollow">
                      source
                    </a>
                  ) : null}
                  {r.note ? <div className="mt-1 max-w-md whitespace-pre-wrap text-xs text-ink-500">{r.note}</div> : null}
                </td>
                <td className="px-3 py-2 text-ink-600">
                  {OUTCOME_SOURCE_LABEL[r.source] ?? r.source} · <span className="tabular-nums">{Math.round(r.confidence)}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[r.status]}`}>{r.status}</span>
                  {r.confirmed_at ? <div className="mt-1 text-[11px] text-ink-500">{fmt(r.confirmed_at)}</div> : null}
                </td>
                <td className="px-3 py-2">
                  {r.status === "proposed" && onResolve ? (
                    <div className="flex gap-1">
                      <button type="button" disabled={busyId === r.id} onClick={() => onResolve(r.id, "confirm")} className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-navy px-2.5 text-xs font-medium text-white hover:bg-brand-navy-elev-1 disabled:opacity-50" data-testid="outcome-queue-confirm">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Confirm
                      </button>
                      <button type="button" disabled={busyId === r.id} onClick={() => onResolve(r.id, "reject")} className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-300 bg-white px-2.5 text-xs font-medium text-ink-700 hover:bg-surface-100 disabled:opacity-50" data-testid="outcome-queue-reject">
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Reject
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function OutcomesQueueClient({ user, initial }: OutcomesQueueClientProps) {
  const [rows, setRows] = React.useState<QueueOutcomeRow[]>(initial);
  const [filter, setFilter] = React.useState<Filter>("proposed");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const proposedCount = rows.filter((r) => r.status === "proposed").length;

  async function handleResolve(id: string, decision: "confirm" | "reject") {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const prompt = decision === "confirm" ? "Note (optional) — what was it checked against?" : "Why is this rejected? (the founder reads it)";
    const note = window.prompt(prompt, "") ?? null;
    if (note === null) return;
    if (decision === "reject" && !note.trim()) {
      setFeedback({ type: "error", message: "A rejection needs a note the founder can read." });
      return;
    }
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/outcomes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; outcome?: Omit<OutcomeRow, "recorded_by" | "confirmed_by">; error?: string; message?: string };
      if (!res.ok || !data.ok || !data.outcome) {
        setFeedback({ type: "error", message: data.message ?? "Could not save the decision." });
        return;
      }
      const saved = data.outcome;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...saved } : r)));
      setFeedback({ type: "success", message: decision === "confirm" ? "Confirmed — it now counts on the trajectory and in calibration." : "Rejected — kept on the ledger as rejected; never re-proposed." });
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminLayout user={user}>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Admin</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink-800">
              <TrendingUp strokeWidth={1.75} className="h-6 w-6 text-brand-600" aria-hidden="true" /> Outcomes
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Proposed outcomes from founders, evaluators, connectors and public registers. Confirm only against the source; connector and register proposals are BlockID&apos;s to confirm. <span className="tabular-nums" data-testid="outcomes-proposed-count">{proposedCount}</span> proposed.
            </p>
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Filter by status">
            {(["proposed", "confirmed", "rejected", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                data-testid={`outcomes-filter-${f}`}
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium ${filter === f ? "border-brand-600 bg-brand-navy text-white" : "border-surface-300 bg-white text-ink-700 hover:bg-surface-100"}`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                {f !== "all" ? <span className="ml-1 tabular-nums opacity-80">{rows.filter((r) => r.status === f).length}</span> : null}
              </button>
            ))}
          </div>
        </header>

        {feedback ? (
          <p role={feedback.type === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${feedback.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-green-200 bg-green-50 text-green-800"}`}>
            {feedback.message}
          </p>
        ) : null}

        <OutcomesTable rows={visible} onResolve={handleResolve} busyId={busyId} />

        <p className="text-xs text-ink-500">
          Statuses: {OUTCOME_STATUSES.join(" · ")}. Every decision is audit-logged (outcome.confirmed / outcome.rejected). Only confirmed rows feed the calibration script, which publishes rates per band with n — never a forecast for one company.
        </p>
      </div>
    </AdminLayout>
  );
}
