"use client";

// Review queue client for /admin/comparables (S-R5). Pending rows oldest
// first with inline edits (sector, stage, post-money, ARR, multiple) and
// approve / reject; every decision POSTs to /api/admin/comparables/[id]
// and re-reads the queue from /api/admin/comparables.

import { useCallback, useMemo, useState } from "react";
import type { ComparablesQueue } from "@/lib/valuation/comparables-admin";
import { AU_STAGE_VALUES, SECTOR_VALUES } from "@/lib/valuation/comparables-enums";
import type { ComparableRaiseRow } from "@/lib/valuation/comparables-repo";

interface Props {
  initial: ComparablesQueue;
  viewer: { id: string; email: string };
}

interface Draft {
  sector: string;
  stage: string;
  post_money_aud: string;
  arr_aud: string;
  arr_multiple: string;
  note: string;
}

function draftFor(r: ComparableRaiseRow): Draft {
  return {
    sector: r.sector ?? "Unclassified",
    stage: r.stage ?? "seed",
    post_money_aud: r.post_money_aud == null ? "" : String(r.post_money_aud),
    arr_aud: r.arr_aud == null ? "" : String(r.arr_aud),
    arr_multiple: r.arr_multiple == null ? "" : String(r.arr_multiple),
    note: "",
  };
}

function aud(v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function ComparablesReviewClient({ initial, viewer }: Props) {
  const [queue, setQueue] = useState<ComparablesQueue>(initial);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const pending = useMemo(() => [...queue.pending].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))), [queue.pending]);

  const draft = useCallback((r: ComparableRaiseRow): Draft => drafts[r.id] ?? draftFor(r), [drafts]);
  const setField = (r: ComparableRaiseRow, key: keyof Draft, value: string) => setDrafts((d) => ({ ...d, [r.id]: { ...draft(r), [key]: value } }));

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/comparables", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as ComparablesQueue & { ok: boolean };
    if (body.ok) setQueue({ pending: body.pending, verified: body.verified, rejected: body.rejected, counts: body.counts, error: null });
  }, []);

  const decide = async (r: ComparableRaiseRow, decision: "approve" | "reject") => {
    const d = draft(r);
    setBusy(r.id);
    setMessage(null);
    try {
      const edits =
        decision === "approve"
          ? { sector: d.sector, stage: d.stage, post_money_aud: numOrNull(d.post_money_aud), arr_aud: numOrNull(d.arr_aud), ...(d.arr_multiple.trim() ? { arr_multiple: numOrNull(d.arr_multiple) } : {}) }
          : undefined;
      const res = await fetch(`/api/admin/comparables/${r.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: d.note.trim() || undefined, edits }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; errors?: string[]; error?: string };
      if (!res.ok || !body.ok) {
        setMessage(`${decision} failed: ${body.errors?.join("; ") ?? body.error ?? body.reason ?? res.status}`);
        return;
      }
      setMessage(`${r.name}: ${decision === "approve" ? "verified" : "rejected"} by ${viewer.email}`);
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const c = queue.counts;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Pending review" value={String(c.pending)} />
        <Tile label="Verified (cited N)" value={String(c.verified)} sub="what reports + copy count" />
        <Tile label="With disclosed multiples" value={String(c.withMultiples)} sub="ARR multiple or post-money ÷ ARR" />
        <Tile label="Rejected" value={String(c.rejected)} />
      </div>

      {message ? <p className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">{message}</p> : null}

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Pending ({pending.length})</h2>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Oldest first. Fill post-money + ARR from the source before approving so the row counts as a disclosed multiple.</p>
        {pending.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Queue is empty — the next weekly ingest runs Sunday 17:40 UTC.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
            {pending.map((r) => {
              const d = draft(r);
              return (
                <li key={r.id} className="py-4" data-testid={`pending-${r.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-base font-semibold text-neutral-900 dark:text-neutral-50">{r.name}</span>
                      <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                        {r.round_label ?? r.stage} · {r.round_date} · {aud(r.amount_aud)} · {r.source_name}
                      </span>
                    </div>
                    {r.source_url ? (
                      <a href={r.source_url} target="_blank" rel="noreferrer noopener" className="text-xs text-blue-700 underline dark:text-blue-300">
                        source
                      </a>
                    ) : null}
                  </div>
                  {r.note ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{r.note}</p> : null}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <label className="text-xs text-neutral-600 dark:text-neutral-300">
                      Sector
                      <select value={d.sector} onChange={(e) => setField(r, "sector", e.target.value)} className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950">
                        {SECTOR_VALUES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-neutral-600 dark:text-neutral-300">
                      Stage
                      <select value={d.stage} onChange={(e) => setField(r, "stage", e.target.value)} className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950">
                        {AU_STAGE_VALUES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-neutral-600 dark:text-neutral-300">
                      Post-money A$
                      <input inputMode="numeric" value={d.post_money_aud} onChange={(e) => setField(r, "post_money_aud", e.target.value)} placeholder="if disclosed" className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                    </label>
                    <label className="text-xs text-neutral-600 dark:text-neutral-300">
                      ARR A$
                      <input inputMode="numeric" value={d.arr_aud} onChange={(e) => setField(r, "arr_aud", e.target.value)} placeholder="if disclosed" className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                    </label>
                    <label className="text-xs text-neutral-600 dark:text-neutral-300">
                      ARR multiple ×
                      <input inputMode="decimal" value={d.arr_multiple} onChange={(e) => setField(r, "arr_multiple", e.target.value)} placeholder="auto" className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                    </label>
                    <label className="text-xs text-neutral-600 dark:text-neutral-300">
                      Note
                      <input value={d.note} onChange={(e) => setField(r, "note", e.target.value)} placeholder="optional" className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950" />
                    </label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy === r.id} onClick={() => decide(r, "approve")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                      Approve
                    </button>
                    <button type="button" disabled={busy === r.id} onClick={() => decide(r, "reject")} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-200">
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Verified — latest {queue.verified.length} of {c.verified}</h2>
        {queue.verified.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">No verified rows yet — reports cite the static code table.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                <tr>
                  <th className="py-1 pr-3">Company</th>
                  <th className="py-1 pr-3">Sector</th>
                  <th className="py-1 pr-3">Stage</th>
                  <th className="py-1 pr-3">Round</th>
                  <th className="py-1 pr-3">Raise</th>
                  <th className="py-1 pr-3">Multiple</th>
                  <th className="py-1 pr-3">Source</th>
                  <th className="py-1 pr-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {queue.verified.map((r) => (
                  <tr key={r.id}>
                    <td className="py-1 pr-3 font-medium text-neutral-900 dark:text-neutral-50">{r.name}</td>
                    <td className="py-1 pr-3">{r.sector}</td>
                    <td className="py-1 pr-3">{r.stage}</td>
                    <td className="py-1 pr-3">{r.round_date}</td>
                    <td className="py-1 pr-3 tabular-nums">{aud(r.amount_aud)}</td>
                    <td className="py-1 pr-3 tabular-nums">{r.arr_multiple != null ? `${r.arr_multiple}×` : "—"}</td>
                    <td className="py-1 pr-3 text-xs text-neutral-500 dark:text-neutral-400">{r.source_name ?? "—"}</td>
                    <td className="py-1 pr-3">
                      <button type="button" disabled={busy === r.id} onClick={() => decide(r, "reject")} className="text-xs text-neutral-500 underline disabled:opacity-50 dark:text-neutral-400">
                        reject
                      </button>
                    </td>
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

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">{value}</p>
      {sub ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p> : null}
    </div>
  );
}
