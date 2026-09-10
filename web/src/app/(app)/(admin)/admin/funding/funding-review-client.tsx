"use client";

import * as React from "react";
import { Landmark, ExternalLink, Search, Check, X, Loader2, AlertTriangle } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import type { AuGrant, AuProgram, FundingStatus } from "@/lib/funding/data";
import type { FundingKind } from "@/lib/funding/admin-patch";
import type { ReviewQueueEntry } from "@/lib/funding/review-queue";

// /admin/funding — review table for au_grants + au_programs. Rows sort with
// status_confidence=low first (they are the ones the seed could not verify),
// then oldest last_verified_at. Edits call PATCH /api/admin/funding/[kind]/[id]
// which stamps verified_by='human' + last_verified_at=today. T0239.

interface Props {
  user: { email: string; displayName: string | null };
  grants: AuGrant[];
  programs: AuProgram[];
  /** Newest first; from grants-review-queue.jsonl (T0243). */
  queue?: ReviewQueueEntry[];
}

const STATUSES: FundingStatus[] = ["open", "upcoming", "paused", "closed"];
const CONFIDENCE_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

const STATUS_BADGE: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700 border-emerald-200",
  upcoming: "bg-brand-50 text-brand-700 border-brand-100",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  closed: "bg-surface-100 text-ink-500 border-surface-200",
};

const CONFIDENCE_BADGE: Record<string, string> = {
  low: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function Badge({ value, map }: { value: string; map: Record<string, string> }) {
  return (
    <span className={`inline-block text-[10px] font-medium rounded border px-1.5 py-0.5 ${map[value] ?? "bg-surface-100 text-ink-500 border-surface-200"}`}>
      {value}
    </span>
  );
}

interface ReviewRow {
  kind: FundingKind;
  id: string;
  name: string;
  region: string; // state for grants, capital for programs
  regionDetail: string; // provider / city
  status: FundingStatus;
  status_confidence: string;
  last_verified_at: string | null;
  verified_by: string;
  closes: string | null; // closes_at (grants) or applications_close (programs)
  note: string | null; // next_round_note (grants) or next_cohort_start (programs)
  official_url: string;
  excluded: boolean;
}

function toRows(grants: AuGrant[], programs: AuProgram[]): ReviewRow[] {
  const g = grants.map<ReviewRow>((r) => ({
    kind: "grants",
    id: r.id,
    name: r.name,
    region: r.state,
    regionDetail: r.provider ?? "",
    status: r.status,
    status_confidence: r.status_confidence,
    last_verified_at: r.last_verified_at,
    verified_by: r.verified_by,
    closes: r.closes_at,
    note: r.next_round_note,
    official_url: r.official_url,
    excluded: r.exclude_from_matching,
  }));
  const p = programs.map<ReviewRow>((r) => ({
    kind: "programs",
    id: r.id,
    name: r.name,
    region: r.capital,
    regionDetail: [r.operator, r.city !== r.capital ? r.city : null].filter(Boolean).join(" · "),
    status: r.status,
    status_confidence: r.status_confidence,
    last_verified_at: r.last_verified_at,
    verified_by: r.verified_by,
    closes: r.applications_close,
    note: r.next_cohort_start,
    official_url: r.official_url,
    excluded: false,
  }));
  return [...g, ...p];
}

function sortRows(rows: ReviewRow[]): ReviewRow[] {
  return [...rows].sort((a, b) => {
    const c = (CONFIDENCE_RANK[a.status_confidence] ?? 9) - (CONFIDENCE_RANK[b.status_confidence] ?? 9);
    if (c !== 0) return c;
    const av = a.last_verified_at ?? "";
    const bv = b.last_verified_at ?? "";
    if (av !== bv) return av < bv ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function FundingReviewClient({ user, grants, programs, queue = [] }: Props) {
  const [rows, setRows] = React.useState<ReviewRow[]>(() => sortRows(toRows(grants, programs)));
  const [kind, setKind] = React.useState<"all" | FundingKind>("all");
  const [region, setRegion] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [confidence, setConfidence] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<ReviewRow | null>(null);

  const regions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (kind === "all" || r.kind === kind) set.add(r.region);
    return [...set].sort();
  }, [rows, kind]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (region !== "all" && r.region !== region) return false;
      if (status !== "all" && r.status !== status) return false;
      if (confidence !== "all" && r.status_confidence !== confidence) return false;
      if (q && !`${r.name} ${r.id} ${r.regionDetail}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, kind, region, status, confidence, search]);

  const lowCount = rows.filter((r) => r.status_confidence === "low").length;
  const humanCount = rows.filter((r) => r.verified_by === "human").length;

  function applyUpdate(updated: ReviewRow) {
    setRows((prev) => sortRows(prev.map((r) => (r.kind === updated.kind && r.id === updated.id ? updated : r))));
  }

  return (
    <AdminLayout user={user}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Landmark strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            <h1 className="text-xl font-bold text-ink-800">AU Funding Review</h1>
          </div>
          <p className="text-xs text-ink-500">
            {grants.length} grants · {programs.length} programs · {lowCount} low-confidence · {humanCount} human-verified
          </p>
        </div>

        {rows.length === 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No rows. Apply migration <code>0311_au_funding.sql</code> then run <code>node scripts/seed-au-funding.mjs</code> from <code>web/</code>.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              type="text"
              placeholder="Search name, id, provider..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-surface-200 bg-white text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
            />
          </div>
          <Select label="Kind" value={kind} onChange={(v) => { setKind(v as "all" | FundingKind); setRegion("all"); }} options={[["all", "Grants + programs"], ["grants", "Grants"], ["programs", "Programs"]]} />
          <Select label="State / capital" value={region} onChange={setRegion} options={[["all", "All"], ...regions.map((r) => [r, r] as [string, string])]} />
          <Select label="Status" value={status} onChange={setStatus} options={[["all", "All"], ...STATUSES.map((s) => [s, s] as [string, string])]} />
          <Select label="Confidence" value={confidence} onChange={setConfidence} options={[["all", "All"], ["low", "low"], ["medium", "medium"], ["high", "high"]]} />
        </div>

        <ReviewQueuePanel queue={queue} />

        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-100">
                  <Th>Name</Th>
                  <Th>Kind</Th>
                  <Th>Region</Th>
                  <Th>Status</Th>
                  <Th>Confidence</Th>
                  <Th>Closes</Th>
                  <Th>Verified</Th>
                  <Th className="text-center">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-ink-600">No rows match the filters</td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={`${r.kind}:${r.id}`} id={rowAnchor(r.kind, r.id)} className="border-b border-surface-200/40 hover:bg-surface-50 transition-colors align-top target:bg-brand-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink-800">
                          {r.name}
                          {r.excluded && <span className="ml-2 text-[10px] text-ink-500">(excluded from matching)</span>}
                        </div>
                        <div className="text-xs text-ink-500">{r.regionDetail || r.id}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-600">{r.kind === "grants" ? "grant" : "program"}</td>
                      <td className="px-4 py-3 text-xs text-ink-600">{r.region}</td>
                      <td className="px-4 py-3"><Badge value={r.status} map={STATUS_BADGE} /></td>
                      <td className="px-4 py-3"><Badge value={r.status_confidence} map={CONFIDENCE_BADGE} /></td>
                      <td className="px-4 py-3 text-xs text-ink-600 whitespace-nowrap">{r.closes ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-ink-600 whitespace-nowrap">
                        {r.last_verified_at ?? "—"}
                        <span className="ml-1 text-[10px] text-ink-500">({r.verified_by})</span>
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <a href={r.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium mr-3">
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                        <button type="button" onClick={() => setEditing(r)} className="text-xs font-medium text-ink-700 hover:text-ink-900 underline underline-offset-2 cursor-pointer">
                          Review
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <ReviewDialog row={editing} onClose={() => setEditing(null)} onSaved={(u) => { applyUpdate(u); setEditing(null); }} />
      )}
    </AdminLayout>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`text-left px-4 py-3 text-xs text-ink-700 font-medium ${className}`}>{children}</th>;
}

/** DOM id for a catalogue row so queue entries can deep-link to it. */
function rowAnchor(kind: FundingKind | "grant" | "program", id: string): string {
  const k = kind === "grant" ? "grants" : kind === "program" ? "programs" : kind;
  return `row-${k}-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

const REASON_LABEL: Record<string, string> = {
  blocked: "Source blocked the bot (403/429)",
  unreachable: "Source page unreachable (4xx)",
  status_mismatch: "Page status differs",
  closes_at_mismatch: "Closing date differs",
  status_closes_mismatch: "Status + closing date differ",
  flipped_open: "Auto-flipped upcoming → open (audit)",
  possible_new_grant: "Possible new grant (GrantConnect)",
  feed_empty: "GrantConnect feed returned no items",
};

function hintSummary(e: ReviewQueueEntry): string {
  const h = e.hint ?? {};
  const parts: string[] = [];
  if (typeof h.status === "string") parts.push(`status ${h.status}`);
  if (typeof h.closes_at === "string") parts.push(`closes ${h.closes_at}`);
  if (typeof h.http_status === "number") parts.push(`HTTP ${h.http_status}`);
  if (typeof h.title === "string") parts.push(h.title);
  if (typeof h.confidence === "string") parts.push(`(${h.confidence})`);
  return parts.join(" · ");
}

function currentSummary(e: ReviewQueueEntry): string {
  const c = e.current;
  if (!c) return "—";
  const parts: string[] = [];
  if (typeof c.status === "string") parts.push(`status ${c.status}`);
  parts.push(`closes ${typeof c.closes_at === "string" ? c.closes_at : "—"}`);
  return parts.join(" · ");
}

// Read-only list of what the weekly refresh could not settle on its own.
// Resolving an entry = open the row (anchor link) and "Mark verified" there;
// the cron never edits the JSONL, so old lines simply age out of the last-200 window.
function ReviewQueuePanel({ queue }: { queue: ReviewQueueEntry[] }) {
  const [open, setOpen] = React.useState(true);
  const lastRun = queue[0]?.ts ?? null;
  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle strokeWidth={1.75} className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-ink-800">Review queue</span>
          <span className="text-xs text-ink-500">
            {queue.length} entr{queue.length === 1 ? "y" : "ies"} · from the weekly refresh-funding-sources cron
            {lastRun ? ` · last queued ${lastRun.slice(0, 16).replace("T", " ")} UTC` : ""}
          </span>
        </div>
        <span className="text-xs text-ink-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        queue.length === 0 ? (
          <p className="px-5 pb-4 text-xs text-ink-500">
            Nothing queued. The cron runs Sundays 04:00 UTC; run <code>/api/cron/refresh-funding-sources?dry=1</code> to preview.
          </p>
        ) : (
          <div className="overflow-x-auto border-t border-surface-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface-100 text-ink-700">
                  <Th>When</Th>
                  <Th>Kind</Th>
                  <Th>Row</Th>
                  <Th>Reason</Th>
                  <Th>Source said</Th>
                  <Th>Table has</Th>
                  <Th className="text-center">Links</Th>
                </tr>
              </thead>
              <tbody>
                {queue.map((e, i) => (
                  <tr key={`${e.ts}:${e.kind}:${e.id ?? e.url}:${i}`} className="border-b border-surface-200/40 align-top">
                    <td className="px-4 py-2 whitespace-nowrap text-ink-600">{e.ts.slice(0, 10)}</td>
                    <td className="px-4 py-2 text-ink-600">{e.kind}</td>
                    <td className="px-4 py-2 text-ink-800 font-medium">{e.id ?? "—"}</td>
                    <td className="px-4 py-2 text-ink-700">{REASON_LABEL[e.reason] ?? e.reason}</td>
                    <td className="px-4 py-2 text-ink-700 max-w-[320px]">
                      {hintSummary(e) || "—"}
                      {typeof e.hint?.evidence === "string" && (
                        <div className="text-[10px] text-ink-500 mt-0.5 line-clamp-2">“{e.hint.evidence}”</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-ink-600 whitespace-nowrap">{currentSummary(e)}</td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      {e.id && e.kind !== "new" && (
                        <a href={`#${rowAnchor(e.kind, e.id)}`} className="text-brand-600 hover:text-brand-700 font-medium mr-3">
                          Row
                        </a>
                      )}
                      <a href={e.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium">
                        Source <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-600">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-xs text-ink-800">
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

function ReviewDialog({ row, onClose, onSaved }: { row: ReviewRow; onClose: () => void; onSaved: (r: ReviewRow) => void }) {
  const [status, setStatus] = React.useState<FundingStatus>(row.status);
  const [confidence, setConfidence] = React.useState(row.status_confidence);
  const [closes, setCloses] = React.useState(row.closes ?? "");
  const [note, setNote] = React.useState(row.note ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isGrant = row.kind === "grants";

  async function save() {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { status, status_confidence: confidence, verified: true };
    body.closes_at = closes.trim() ? closes.trim() : null;
    if (isGrant) body.next_round_note = note.trim() ? note.trim() : null;
    else body.next_cohort_start = note.trim() ? note.trim() : null;
    try {
      const res = await fetch(`/api/admin/funding/${row.kind}/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: string; reason?: string; row?: Record<string, unknown> };
      if (!res.ok || !json.ok) {
        setError(json.error ?? json.reason ?? `HTTP ${res.status}`);
        return;
      }
      const saved = json.row ?? {};
      onSaved({
        ...row,
        status: (saved.status as FundingStatus) ?? status,
        status_confidence: (saved.status_confidence as string) ?? confidence,
        last_verified_at: (saved.last_verified_at as string) ?? row.last_verified_at,
        verified_by: (saved.verified_by as string) ?? "human",
        closes: (isGrant ? (saved.closes_at as string | null) : (saved.applications_close as string | null)) ?? null,
        note: (isGrant ? (saved.next_round_note as string | null) : (saved.next_cohort_start as string | null)) ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-surface-200 bg-white p-6 shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink-800">{row.name}</h2>
            <p className="text-xs text-ink-500">{row.kind === "grants" ? "grant" : "program"} · {row.id} · {row.region}</p>
          </div>
          <button type="button" onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:bg-surface-100 cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <a href={row.official_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium break-all">
          {row.official_url} <ExternalLink className="h-3 w-3 shrink-0" />
        </a>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-ink-600 space-y-1">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as FundingStatus)} className="w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-sm text-ink-800">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600 space-y-1">
            <span>Confidence</span>
            <select value={confidence} onChange={(e) => setConfidence(e.target.value)} className="w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-sm text-ink-800">
              {["high", "medium", "low"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="text-xs text-ink-600 space-y-1 col-span-2">
            <span>{isGrant ? "Closes (YYYY-MM-DD, blank = rolling / unknown)" : "Applications close (free text)"}</span>
            <input value={closes} onChange={(e) => setCloses(e.target.value)} placeholder={isGrant ? "2027-04-30" : "2026-11-08"} className="w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-sm text-ink-800" />
          </label>
          <label className="text-xs text-ink-600 space-y-1 col-span-2">
            <span>{isGrant ? "Next round note" : "Next cohort start"}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-surface-200 bg-white px-2 py-1.5 text-sm text-ink-800" />
          </label>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-ink-500">Saving stamps verified_by=human and last_verified_at=today.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-surface-200 px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-50 cursor-pointer">Cancel</button>
            <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 cursor-pointer">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mark verified
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
