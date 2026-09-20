"use client";

// /admin/corrections — G21 P1-C. Table of founder corrections (startup,
// founder e-mail, kind, target, message, proposed value, status, resolution),
// a status filter, and accept / reject per open row → PATCH
// /api/admin/corrections/[id]. Posts JSON from a client component — no
// inline scripts (CSP). A reject requires a resolution the founder can read;
// an accept takes an optional note. Nothing here writes to a startup record:
// the service does, only for a sector / stage correction with a proposal,
// through the audited project update path.

import * as React from "react";
import { CheckCircle2, MessageSquare, XCircle } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import { CORRECTION_KIND_LABEL, CORRECTION_STATUSES, targetLabel, type CorrectionRow, type CorrectionStatus } from "@/lib/corrections/model";
import type { AdminCorrectionRow } from "@/lib/corrections/service";

export interface CorrectionsQueueClientProps {
  user: { email: string; displayName: string | null };
  initial: AdminCorrectionRow[];
}

type Filter = CorrectionStatus | "all";

const STATUS_CLASS: Record<CorrectionStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-surface-200 text-ink-600",
};

function fmt(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

function proposedText(p: CorrectionRow["proposed"]): string {
  const bits: string[] = [];
  if (p?.industry) bits.push(`sector → ${p.industry}`);
  if (typeof p?.stage === "number") bits.push(`stage → ${p.stage}`);
  return bits.join(" · ");
}

export function CorrectionsTable({ rows, onResolve, busyId }: { rows: AdminCorrectionRow[]; onResolve?: (id: string, decision: "accept" | "reject") => void; busyId?: string | null }) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500" data-testid="corrections-queue-empty">No corrections match this filter.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white">
      <table className="w-full text-left text-sm" data-testid="corrections-queue">
        <thead className="bg-surface-100 text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th scope="col" className="px-3 py-2">Filed</th>
            <th scope="col" className="px-3 py-2">Startup</th>
            <th scope="col" className="px-3 py-2">Kind · target</th>
            <th scope="col" className="px-3 py-2">Message</th>
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200">
          {rows.map((r) => {
            const proposed = proposedText(r.proposed);
            return (
              <tr key={r.id} data-testid="correction-row" data-status={r.status} data-correction-id={r.id}>
                <td className="px-3 py-2 text-xs text-ink-500 tabular-nums">{fmt(r.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium text-ink-800">{r.project_name ?? r.project_id}</div>
                  <div className="font-mono text-[11px] text-ink-500" data-testid="correction-founder">{r.founder_email ?? "—"}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="font-medium text-ink-800">{CORRECTION_KIND_LABEL[r.kind]?.label ?? r.kind}</div>
                  <div className="text-ink-500">{targetLabel(r.target_ref)}</div>
                  {proposed ? <div className="mt-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-800" data-testid="correction-proposed">{proposed}</div> : null}
                </td>
                <td className="max-w-md px-3 py-2 text-xs text-ink-700">
                  <p className="whitespace-pre-wrap">{r.message}</p>
                  {r.resolution ? <p className="mt-1 text-[11px] text-ink-500" data-testid="correction-resolution">Resolution: {r.resolution}</p> : null}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[r.status]}`}>{r.status}</span>
                  {r.resolved_at ? <div className="text-[11px] text-ink-400">{fmt(r.resolved_at)}</div> : null}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.status === "open" && onResolve ? (
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => onResolve(r.id, "accept")} disabled={busyId === r.id} data-testid="correction-accept" className="inline-flex h-9 items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2.5 text-xs font-medium text-green-800 hover:bg-green-100 disabled:opacity-50">
                        <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden="true" /> Accept
                      </button>
                      <button type="button" onClick={() => onResolve(r.id, "reject")} disabled={busyId === r.id} data-testid="correction-reject" className="inline-flex h-9 items-center gap-1 rounded-lg border border-surface-300 px-2.5 text-xs font-medium text-ink-700 hover:bg-surface-100 disabled:opacity-50">
                        <XCircle strokeWidth={1.75} className="h-3.5 w-3.5" aria-hidden="true" /> Reject
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

export function CorrectionsQueueClient({ user, initial }: CorrectionsQueueClientProps) {
  const [rows, setRows] = React.useState<AdminCorrectionRow[]>(initial);
  const [filter, setFilter] = React.useState<Filter>("open");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const openCount = rows.filter((r) => r.status === "open").length;

  async function handleResolve(id: string, decision: "accept" | "reject") {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const prompt = decision === "accept" ? "Resolution note for the founder (optional)" : "Why is this rejected? (required — the founder reads it)";
    const resolution = window.prompt(prompt, "") ?? null;
    if (resolution === null) return;
    if (decision === "reject" && !resolution.trim()) {
      setFeedback({ type: "error", message: "A rejection needs a resolution the founder can read." });
      return;
    }
    setBusyId(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/corrections/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, resolution: resolution.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; correction?: CorrectionRow; applied?: boolean; change?: { field: string; value: string | number } | null; warnings?: string[]; error?: string; message?: string };
      if (!res.ok || !data.ok || !data.correction) {
        setFeedback({ type: "error", message: data.message ?? "Could not save the resolution." });
        return;
      }
      const saved = data.correction;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...saved } : r)));
      const changed = data.change ? (data.applied ? ` ${data.change.field} → ${String(data.change.value)} written through the project update path.` : ` ${data.change.field} change could NOT be applied — see warnings.`) : " No record was changed.";
      setFeedback({ type: "success", message: `${decision === "accept" ? "Accepted." : "Rejected."}${changed}${data.warnings?.length ? ` Warnings: ${data.warnings.join("; ")}` : ""}` });
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
              <MessageSquare strokeWidth={1.75} className="h-6 w-6 text-brand-600" aria-hidden="true" /> Corrections
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              Founder flags on their record and reports. Accept records a resolution — only a sector / stage correction with a proposed value writes anything, through the project update path. <span className="tabular-nums" data-testid="corrections-open-count">{openCount}</span> open.
            </p>
          </div>
          <div className="flex items-center gap-2" role="group" aria-label="Filter by status">
            {(["open", "accepted", "rejected", "all"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                data-testid={`corrections-filter-${f}`}
                className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium ${filter === f ? "border-brand-600 bg-brand-600 text-white" : "border-surface-300 bg-white text-ink-700 hover:bg-surface-100"}`}
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

        <CorrectionsTable rows={visible} onResolve={handleResolve} busyId={busyId} />

        <p className="text-xs text-ink-500">
          Statuses: {CORRECTION_STATUSES.join(" · ")}. Every decision is audit-logged (correction.accepted / correction.rejected) and the founder is e-mailed on accept.
        </p>
      </div>
    </AdminLayout>
  );
}
