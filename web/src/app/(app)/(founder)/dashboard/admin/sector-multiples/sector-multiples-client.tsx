"use client";

// Review UI for sector_multiples_overrides (S27-C). Three panels:
//   1. Proposed queue — excerpt, link, static vs in-force vs proposed band
//      side by side, Approve / Reject (with an optional note).
//   2. Manual "Propose override" form — values + source URL / title /
//      verbatim excerpt → status=proposed; must still be approved.
//   3. In force today / recent decisions — every sector's current band, the
//      approved rows (Reject = roll back) and the rejected tail.
// All mutations go through /api/admin/sector-multiples/**; the page re-reads
// GET after each one so the side-by-side table is never stale.

import * as React from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectorMultipleOverride } from "@/lib/valuation/sector-multiples";
import type { CurrentMultiples } from "@/lib/valuation/multiples-admin";
import { SECTOR_KEYS } from "@/lib/valuation/sector-multiples-static";

export interface SourceSummary {
  id: string;
  url: string;
  title: string;
  publisher: string;
  cadence: string;
  expects: string;
  sectors: string[];
}

export interface QueueSnapshot {
  today: string;
  proposed: SectorMultipleOverride[];
  approved: SectorMultipleOverride[];
  rejected: SectorMultipleOverride[];
  current: CurrentMultiples[];
  sources: SourceSummary[];
}

interface Props {
  initial: QueueSnapshot;
  viewer: { id: string; email: string };
  loadError: string | null;
}

function band(low: number, mid: number, high: number): string {
  return `${Number(low)}× / ${Number(mid)}× / ${Number(high)}×`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : iso;
}

export function SectorMultiplesClient({ initial, viewer, loadError }: Props) {
  const [snap, setSnap] = React.useState<QueueSnapshot>(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [flash, setFlash] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/sector-multiples", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; reason?: string } & Partial<QueueSnapshot>;
      if (data.ok && data.proposed && data.approved && data.rejected && data.current && data.sources && data.today) {
        setSnap({ today: data.today, proposed: data.proposed, approved: data.approved, rejected: data.rejected, current: data.current, sources: data.sources });
      } else {
        setFlash({ kind: "err", text: `Could not reload the queue (${data.reason ?? res.status}).` });
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const decide = React.useCallback(
    async (row: SectorMultipleOverride, decision: "approve" | "reject") => {
      const rollback = decision === "reject" && row.status === "approved";
      const question = rollback
        ? `Roll back the ${row.sector} override (${band(row.arr_low, row.arr_mid, row.arr_high)})? Valuations fall back to the previous approved row or the static table.`
        : decision === "approve"
          ? `Approve ${row.sector} → ${band(row.arr_low, row.arr_mid, row.arr_high)} from ${fmtDate(row.effective_from)}? Every valuation for this sector will use it.`
          : `Reject this ${row.sector} proposal?`;
      if (!window.confirm(question)) return;
      setBusy(`${row.id}:${decision}`);
      setFlash(null);
      try {
        const note = (notes[row.id] ?? "").trim();
        const res = await fetch(`/api/admin/sector-multiples/${row.id}/${decision}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(note ? { note } : {}),
        });
        const data = (await res.json()) as { ok: boolean; reason?: string; error?: string; sameAdmin?: boolean };
        if (!data.ok) {
          setFlash({ kind: "err", text: `${decision} failed: ${data.reason ?? res.status}${data.error ? ` — ${data.error}` : ""}` });
          return;
        }
        setFlash({
          kind: "ok",
          text:
            decision === "approve"
              ? `Approved ${row.sector}${data.sameAdmin ? " (you proposed this row — recorded in the audit log)" : ""}. In force from ${fmtDate(row.effective_from)}.`
              : rollback
                ? `Rolled back the ${row.sector} override.`
                : `Rejected the ${row.sector} proposal.`,
        });
        await refresh();
      } finally {
        setBusy(null);
      }
    },
    [notes, refresh],
  );

  return (
    <div className="space-y-8">
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <p className="text-sm text-red-800">{loadError}</p>
        </div>
      )}
      {flash && (
        <div
          role="status"
          className={cn(
            "rounded-xl border p-3 text-sm flex items-start gap-2",
            flash.kind === "ok" ? "border-emerald-200 bg-emerald-50/60 text-emerald-900" : "border-red-200 bg-red-50/60 text-red-900",
          )}
        >
          {flash.kind === "ok" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{flash.text}</span>
        </div>
      )}

      {/* 1 · Proposed queue */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Proposed <span className="text-muted-foreground font-normal text-sm">({snap.proposed.length} awaiting review)</span>
          </h2>
          <button onClick={() => void refresh()} disabled={refreshing} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Reload
          </button>
        </div>
        {snap.proposed.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-6 text-center">
            Nothing to review. The cron proposes on the 1st of Jan / Apr / Jul / Oct, or add a manual proposal below.
          </p>
        ) : (
          <div className="space-y-4">
            {snap.proposed.map((row) => {
              const cur = snap.current.find((c) => c.sector === row.sector);
              const mine = row.proposed_by === "admin" && row.proposed_by_user_id === viewer.id;
              return (
                <article key={row.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-base font-bold capitalize">{row.sector}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        proposed by <strong>{row.proposed_by}</strong>
                        {mine ? " (you)" : ""} · {fmtDate(row.created_at)} · effective from {fmtDate(row.effective_from)}
                      </span>
                    </div>
                    <a href={row.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                      {row.source_title}
                      {row.source_published_at ? ` (${fmtDate(row.source_published_at)})` : ""}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </header>

                  <div className="grid gap-3 sm:grid-cols-3 text-sm">
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Static table (2026-06)</p>
                      <p className="font-mono font-semibold mt-1">{cur ? band(cur.static.low, cur.static.mid, cur.static.high) : "—"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{cur?.static.citation}</p>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">In force today</p>
                      <p className="font-mono font-semibold mt-1">{cur ? band(cur.current.low, cur.current.mid, cur.current.high) : "—"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">{cur?.current.sourceLabel}</p>
                    </div>
                    <div className="rounded-lg border-2 border-blue-200 bg-blue-50/40 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-blue-700">Proposed</p>
                      <p className="font-mono font-bold mt-1 text-blue-900">{band(row.arr_low, row.arr_mid, row.arr_high)}</p>
                      <p className="text-[11px] text-blue-700 mt-1">low / mid / high × ARR</p>
                    </div>
                  </div>

                  <blockquote className="border-l-4 border-border pl-3 text-sm italic text-foreground/90 whitespace-pre-wrap">“{row.source_excerpt}”</blockquote>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={notes[row.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                      placeholder="Review note (optional)"
                      maxLength={1000}
                      className="flex-1 min-w-[200px] rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => void decide(row, "approve")}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded font-medium"
                    >
                      {busy === `${row.id}:approve` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Approve
                    </button>
                    <button
                      onClick={() => void decide(row, "reject")}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 text-xs border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded font-medium"
                    >
                      {busy === `${row.id}:reject` ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                      Reject
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 2 · Manual proposal */}
      <ProposeForm onProposed={refresh} sources={snap.sources} />

      {/* 3 · In force + decisions */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">In force today ({snap.today})</h2>
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Sector</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Static (2026-06)</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">In force</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Source</th>
                <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {snap.current.map((c) => {
                const live = c.current.overrideId ? snap.approved.find((r) => r.id === c.current.overrideId) : null;
                return (
                  <tr key={c.sector} className={cn(c.current.sourceKind === "override" && "bg-blue-50/30")}>
                    <td className="px-4 py-2 font-semibold capitalize">{c.sector}</td>
                    <td className="px-4 py-2 font-mono text-xs">{band(c.static.low, c.static.mid, c.static.high)}</td>
                    <td className="px-4 py-2 font-mono text-xs font-bold">{band(c.current.low, c.current.mid, c.current.high)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {live ? (
                        <a href={live.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
                          {c.current.sourceLabel} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        c.current.sourceLabel
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {live ? (
                        <button
                          onClick={() => void decide(live, "reject")}
                          disabled={busy !== null}
                          className="inline-flex items-center gap-1 text-xs border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50 px-2 py-1 rounded"
                          title="Reject the approved row — valuations fall back to the previous approved row or the static table"
                        >
                          <RotateCcw className="h-3 w-3" /> Roll back
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">static</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(snap.approved.length > 0 || snap.rejected.length > 0) && (
          <details className="rounded-xl border border-border bg-card p-4">
            <summary className="text-sm font-semibold cursor-pointer">
              Decision history — {snap.approved.length} approved · {snap.rejected.length} rejected (latest 50)
            </summary>
            <ul className="mt-3 space-y-2 text-xs">
              {[...snap.approved, ...snap.rejected]
                .sort((a, b) => (b.approved_at ?? b.rejected_at ?? b.created_at).localeCompare(a.approved_at ?? a.rejected_at ?? a.created_at))
                .map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={cn("font-bold uppercase text-[10px] px-1.5 py-0.5 rounded", r.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>{r.status}</span>
                    <span className="font-semibold capitalize">{r.sector}</span>
                    <span className="font-mono">{band(r.arr_low, r.arr_mid, r.arr_high)}</span>
                    <span className="text-muted-foreground">effective {fmtDate(r.effective_from)} · {r.status === "approved" ? `approved ${fmtDate(r.approved_at)}` : `rejected ${fmtDate(r.rejected_at)}`} · by {r.proposed_by}</span>
                    <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{r.source_title}</a>
                    {r.review_note && <span className="italic text-muted-foreground">“{r.review_note}”</span>}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>

      {/* Sources the cron reads */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sources the quarterly cron reads</h2>
        <ul className="text-xs space-y-1.5">
          {snap.sources.map((s) => (
            <li key={s.id} className="flex flex-wrap gap-x-2">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium inline-flex items-center gap-1">
                {s.title} <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-muted-foreground">
                {s.publisher} · {s.cadence} · sectors: {s.sectors.join(", ")}
              </span>
              <span className="w-full text-muted-foreground/80">{s.expects}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ProposeForm({ onProposed, sources }: { onProposed: () => Promise<void>; sources: SourceSummary[] }) {
  const [form, setForm] = React.useState({
    sector: "saas",
    arr_low: "",
    arr_mid: "",
    arr_high: "",
    effective_from: "",
    source_url: "",
    source_title: "",
    source_published_at: "",
    source_excerpt: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/sector-multiples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok: boolean; reason?: string; error?: string };
      if (!data.ok) {
        setMsg({ kind: "err", text: `Not saved: ${data.error ?? data.reason ?? res.status}` });
        return;
      }
      setMsg({ kind: "ok", text: "Proposed. It still needs an approval above before any valuation uses it." });
      setForm((f) => ({ ...f, arr_low: "", arr_mid: "", arr_high: "", source_excerpt: "" }));
      await onProposed();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Propose an override</h2>
      <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium space-y-1">
          Sector
          <select value={form.sector} onChange={set("sector")} className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
            {SECTOR_KEYS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["arr_low", "arr_mid", "arr_high"] as const).map((k) => (
            <label key={k} className="text-xs font-medium space-y-1">
              {k.replace("arr_", "")} ×ARR
              <input required inputMode="decimal" value={form[k]} onChange={set(k)} placeholder="7.4" className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono" />
            </label>
          ))}
        </div>
        <label className="text-xs font-medium space-y-1 sm:col-span-2">
          Source URL
          <input required type="url" value={form.source_url} onChange={set("source_url")} list="sector-multiples-sources" placeholder="https://…" className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <datalist id="sector-multiples-sources">
            {sources.map((s) => (
              <option key={s.id} value={s.url}>{s.title}</option>
            ))}
          </datalist>
        </label>
        <label className="text-xs font-medium space-y-1">
          Source title
          <input required maxLength={200} value={form.source_title} onChange={set("source_title")} placeholder="SaaS Capital Index" className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-medium space-y-1">
            Published (optional)
            <input type="date" value={form.source_published_at} onChange={set("source_published_at")} className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs font-medium space-y-1">
            Effective from
            <input type="date" value={form.effective_from} onChange={set("effective_from")} className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </label>
        </div>
        <label className="text-xs font-medium space-y-1 sm:col-span-2">
          Verbatim excerpt (20–500 characters, copied exactly from the page — it must contain the number)
          <textarea required minLength={20} maxLength={500} rows={3} value={form.source_excerpt} onChange={set("source_excerpt")} className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={submitting} className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded font-medium">
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            Propose (needs approval)
          </button>
          {msg && <span className={cn("text-xs", msg.kind === "ok" ? "text-emerald-700" : "text-red-700")}>{msg.text}</span>}
        </div>
      </form>
    </section>
  );
}
