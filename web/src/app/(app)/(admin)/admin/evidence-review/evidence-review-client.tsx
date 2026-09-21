"use client";

// Review queue client for /admin/evidence-review (G14-S36). Pending rows
// oldest first; approve / reject PATCH /api/admin/evidence/[id]/review and
// the decided row moves from `pending` to `recent` locally (a hard refresh
// re-reads the queue through the server component).

import { useMemo, useState } from "react";
import type { ReviewQueue, ReviewQueueRow } from "@/lib/evidence/review-queue";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";

interface Props {
  initial: ReviewQueue;
}

function dimTitle(dim: string): string {
  return DIMENSION_OWNERS[dim as DimKey]?.title ?? dim.toUpperCase();
}

function isUrl(v: string | null): boolean {
  return !!v && /^https?:\/\//i.test(v);
}

function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function EvidenceReviewClient({ initial }: Props) {
  const [queue, setQueue] = useState<ReviewQueue>(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pending = useMemo(() => [...queue.pending].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))), [queue.pending]);

  const decide = async (row: ReviewQueueRow, decision: "approve" | "reject") => {
    const note = (notes[row.id] ?? "").trim();
    if (decision === "reject" && !note) {
      setMessage("A rejection needs a note — the founder sees it on the row.");
      return;
    }
    setBusy(row.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/evidence/${row.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; row?: { confidence_level: string; review_status: string } };
      if (!res.ok || !body.ok) {
        setMessage(`Could not ${decision}: ${body.reason ?? res.status}`);
        return;
      }
      const decided: ReviewQueueRow = {
        ...row,
        confidence_level: body.row?.confidence_level ?? row.confidence_level,
        review_status: body.row?.review_status ?? (decision === "approve" ? "approved" : "rejected"),
        is_verified: decision === "approve",
        review_note: note || null,
        updated_at: new Date().toISOString(),
      };
      setQueue((q) => ({
        pending: q.pending.filter((r) => r.id !== row.id),
        recent: [decided, ...q.recent],
        counts: {
          pending: Math.max(0, q.counts.pending - 1),
          approved: q.counts.approved + (decision === "approve" ? 1 : 0),
          rejected: q.counts.rejected + (decision === "reject" ? 1 : 0),
        },
        error: null,
      }));
      setMessage(`${decision === "approve" ? "Approved" : "Rejected"} ${row.evidence_label} (${row.project_name ?? row.project_id.slice(0, 8)}).`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Pending", value: queue.counts.pending },
          { label: "Approved (recent)", value: queue.counts.approved },
          { label: "Rejected (recent)", value: queue.counts.rejected },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-surface-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-ink-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{c.value}</p>
          </div>
        ))}
      </div>

      {message && (
        <p role="status" className="rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-700">
          {message}
        </p>
      )}

      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-base font-semibold text-ink-900">
          Pending — founder requested verification
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500">Nothing waiting. Founders queue a row with &ldquo;Request verification&rdquo; on their evidence page.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((row) => (
              <li key={row.id} className="rounded-xl border border-surface-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">
                      {row.evidence_label} <span className="font-normal text-ink-500">· {dimTitle(row.dimension)}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-600">
                      {row.project_name ?? row.project_id} · filed as <code className="rounded bg-surface-100 px-1">{row.confidence_level}</code> · {when(row.created_at)}
                    </p>
                    {row.evidence_value_or_url &&
                      (isUrl(row.evidence_value_or_url) ? (
                        <a href={row.evidence_value_or_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block break-all text-xs text-brand-700 underline decoration-dotted">
                          {row.evidence_value_or_url}
                        </a>
                      ) : (
                        <p className="mt-1 break-all text-xs text-ink-700">{row.evidence_value_or_url}</p>
                      ))}
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-80">
                    <label className="text-xs text-ink-600">
                      Reviewer note <span className="text-ink-400">(required to reject)</span>
                      <textarea
                        value={notes[row.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                        rows={2}
                        maxLength={1000}
                        className="mt-1 w-full rounded-lg border border-surface-300 px-2 py-1 text-sm text-ink-900"
                        placeholder="What you checked (ASIC extract, ABR lookup, signed contract…)"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void decide(row, "approve")}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Approve → third_party_verified
                      </button>
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => void decide(row, "reject")}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 text-base font-semibold text-ink-900">
          Recent decisions
        </h2>
        {queue.recent.length === 0 ? (
          <p className="text-sm text-ink-500">No decisions yet.</p>
        ) : (
          <div className="overflow-auto max-h-[75vh] rounded-xl border border-surface-200 bg-white">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] font-semibold uppercase tracking-wider text-secondary [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-line-subtle [&_th]:bg-surface-sunken">
                <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2">Evidence</th>
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Decision</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody className="[&>tr:nth-child(even)]:bg-surface-sunken">
                {queue.recent.map((r) => (
                  <tr key={r.id} className="border-b border-surface-100">
                    <td className="px-3 py-2 text-ink-900">
                      {r.evidence_label} <span className="text-ink-500">· {dimTitle(r.dimension)}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-700">{r.project_name ?? r.project_id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      <code className="rounded bg-surface-100 px-1 text-xs">{r.confidence_level}</code>
                    </td>
                    <td className="px-3 py-2">
                      <span className={r.review_status === "approved" ? "text-emerald-700" : "text-red-700"}>{r.review_status}</span>
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-ink-600">{r.review_note ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-600">{when(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
