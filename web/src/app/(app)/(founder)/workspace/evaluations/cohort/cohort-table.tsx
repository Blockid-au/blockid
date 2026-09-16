"use client";

// CohortTable — sortable table for one evaluation batch (T0272). Columns:
// startup, SVI, weighted score (the batch's rubric weights re-aggregating
// the 8 dimensions — see batch-shared.ts), stage, Δ since last, top
// strength, top gap, report link. Same table styling as evaluations-client.tsx.
//
// G13-W5-D3 (S-D3, BA spec §A.5 P1 / P2): decision · conviction · thesis
// fit columns from the owner's latest `evaluation_assessments` row
// (sortable), a select column and the "Set decision" toolbar — one
// POST /api/evaluations/batch/[id]/assessments per click that writes a
// DRAFT per selected row (nothing submitted, nothing charged), then
// router.refresh() re-reads the columns.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, FileDown } from "lucide-react";
import { formatDelta } from "@/lib/evaluations/progress-shared";
import { COHORT_DECISIONS, COHORT_DECISION_LABELS, stageName, type BatchStatus, type CohortDecision, type CohortRow } from "@/lib/evaluations/batch-shared";
import { userErrorMessage } from "@/lib/ui/user-error";

type SortKey = "startup" | "svi" | "weighted" | "stage" | "delta" | "topStrength" | "topGap" | "status" | "decision" | "conviction" | "thesisFitPct";

const STATUS_CHIP: Record<BatchStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "border-surface-300 bg-surface-100 text-ink-600" },
  running: { label: "Scoring…", className: "border-brand-300 bg-brand-50 text-brand-700" },
  done: { label: "Scored", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", className: "border-red-300 bg-red-50 text-red-700" },
};

const DECISION_CHIP: Record<CohortDecision, string> = {
  pass: "border-red-200 bg-red-50 text-red-800",
  track: "border-amber-200 bg-amber-50 text-amber-800",
  proceed: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/** Decisions sort proceed > track > pass (a pipeline, not an alphabet). */
const DECISION_RANK: Record<CohortDecision, number> = { pass: 1, track: 2, proceed: 3 };

/** Nulls (unscored / undecided) always sort last, whichever direction is chosen. */
function compare(a: CohortRow, b: CohortRow, key: SortKey, dir: "asc" | "desc"): number {
  const av = key === "decision" ? (a.decision ? DECISION_RANK[a.decision] : null) : a[key];
  const bv = key === "decision" ? (b.decision ? DECISION_RANK[b.decision] : null) : b[key];
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  const base = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
  return dir === "asc" ? base : -base;
}

export function sortRows(rows: CohortRow[], key: SortKey, dir: "asc" | "desc"): CohortRow[] {
  return [...rows].sort((a, b) => compare(a, b, key, dir));
}

interface SortHeaderProps {
  k: SortKey;
  sortKey: SortKey;
  dir: "asc" | "desc";
  onToggle: (k: SortKey) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}

function SortHeader({ k, sortKey, dir, onToggle, align = "left", children }: SortHeaderProps) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={`px-4 py-3 font-semibold ${align === "right" ? "text-right" : ""}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onToggle(k)}
        className="inline-flex min-h-6 items-center gap-1 hover:text-ink-800 cursor-pointer"
        data-testid={`sort-${k}`}
      >
        {children}
        <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
        <span className="sr-only">{active ? (dir === "asc" ? ", sorted ascending" : ", sorted descending") : ", sortable"}</span>
      </button>
    </th>
  );
}

export interface CohortTableProps {
  rows: CohortRow[];
  /** Batch id → enables the select column + "Set decision" toolbar (S-D3 P2). Omit for read-only tables. */
  batchId?: string;
}

type BulkState = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; updated: number; created: number; skipped: number } | { kind: "error"; message: string };

export function CohortTable({ rows, batchId }: CohortTableProps) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>("weighted");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = React.useState<BulkState>({ kind: "idle" });

  const sorted = React.useMemo(() => sortRows(rows, sortKey, dir), [rows, sortKey, dir]);
  const bulkEnabled = !!batchId;
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "startup" || key === "topStrength" || key === "topGap" ? "asc" : "desc");
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setDecision(decision: CohortDecision | null) {
    if (!batchId || selected.size === 0) return;
    setBulk({ kind: "busy" });
    try {
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluation_ids: [...selected], decision }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; updated?: number; created?: number; skipped?: string[]; message?: string; error?: string };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? `HTTP ${res.status}`), { status: res.status, body });
      setBulk({ kind: "ok", updated: body.updated ?? 0, created: body.created ?? 0, skipped: body.skipped?.length ?? 0 });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setBulk({ kind: "error", message: userErrorMessage(err, "Could not set the decision — try again.") });
    }
  }

  return (
    <div className="space-y-2">
      {bulkEnabled ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2 text-xs" data-testid="cohort-bulk-toolbar">
          <span className="text-ink-600" data-testid="cohort-selected-count">
            {selected.size} selected
          </span>
          <span className="text-ink-500">·</span>
          <span className="text-ink-600">Set decision (draft):</span>
          {COHORT_DECISIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDecision(d)}
              disabled={selected.size === 0 || bulk.kind === "busy"}
              className={`inline-flex min-h-8 items-center rounded-lg border px-2.5 py-1 font-semibold disabled:opacity-50 ${DECISION_CHIP[d]}`}
              data-testid={`bulk-${d}`}
            >
              {COHORT_DECISION_LABELS[d]}
            </button>
          ))}
          <button type="button" onClick={() => setDecision(null)} disabled={selected.size === 0 || bulk.kind === "busy"} className="inline-flex min-h-8 items-center rounded-lg border border-surface-300 px-2.5 py-1 text-ink-700 disabled:opacity-50" data-testid="bulk-clear">
            Clear
          </button>
          {bulk.kind === "busy" ? <span className="text-ink-500">Saving…</span> : null}
          {bulk.kind === "ok" ? (
            <span className="text-emerald-800" role="status" data-testid="bulk-result">
              Draft set on {bulk.updated + bulk.created} startup{bulk.updated + bulk.created === 1 ? "" : "s"}
              {bulk.skipped ? ` · ${bulk.skipped} skipped` : ""} — open a dossier to submit with conviction.
            </span>
          ) : null}
          {bulk.kind === "error" ? (
            <span className="text-red-700" role="alert">
              {bulk.message}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white">
        <table className="min-w-full text-sm" data-testid="cohort-table">
          <caption className="sr-only">Cohort table — one row per startup in this batch; column headers sort</caption>
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
            <tr>
              {bulkEnabled ? (
                <th scope="col" className="px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all startups"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.evaluationId)))}
                    data-testid="cohort-select-all"
                  />
                </th>
              ) : null}
              <SortHeader k="startup" sortKey={sortKey} dir={dir} onToggle={toggle}>Startup</SortHeader>
              <SortHeader k="svi" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">SVI</SortHeader>
              <SortHeader k="weighted" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">Weighted</SortHeader>
              <SortHeader k="stage" sortKey={sortKey} dir={dir} onToggle={toggle}>Stage</SortHeader>
              <SortHeader k="delta" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">Δ since last</SortHeader>
              <SortHeader k="decision" sortKey={sortKey} dir={dir} onToggle={toggle}>Decision</SortHeader>
              <SortHeader k="conviction" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">Conviction</SortHeader>
              <SortHeader k="thesisFitPct" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">Thesis fit</SortHeader>
              <SortHeader k="topStrength" sortKey={sortKey} dir={dir} onToggle={toggle}>Top strength</SortHeader>
              <SortHeader k="topGap" sortKey={sortKey} dir={dir} onToggle={toggle}>Top gap</SortHeader>
              <SortHeader k="status" sortKey={sortKey} dir={dir} onToggle={toggle}>Status</SortHeader>
              <th scope="col" className="px-4 py-3 font-semibold text-right">Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100">
            {sorted.map((r) => {
              const chip = STATUS_CHIP[r.status];
              const tone = r.delta == null || r.delta === 0 ? "text-ink-500" : r.delta > 0 ? "text-emerald-700" : "text-red-700";
              return (
                <tr key={r.itemId} data-testid="cohort-row" data-decision={r.decision ?? ""} className="align-top">
                  {bulkEnabled ? (
                    <td className="px-3 py-3">
                      <input type="checkbox" aria-label={`Select ${r.startup}`} checked={selected.has(r.evaluationId)} onChange={() => toggleRow(r.evaluationId)} data-testid="cohort-select" />
                    </td>
                  ) : null}
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink-900">
                      <Link href={`/workspace/evaluations/${encodeURIComponent(r.evaluationId)}`} className="hover:underline" aria-label={`Open the Investor Dossier for ${r.startup}`}>{r.startup}</Link>
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {r.label ? <span className="rounded bg-surface-100 px-1.5 py-0.5 text-ink-700">{r.label}</span> : null}
                      {r.industry ? <span className={r.label ? "ml-2" : ""}>{r.industry}</span> : null}
                      {r.state ? <span className="ml-2 uppercase">{r.state}</span> : null}
                    </div>
                    {r.error ? <div className="mt-1 text-[11px] text-red-700" data-testid="item-error">{r.error}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-800 font-semibold">{r.svi == null ? "—" : Math.round(r.svi)}</td>
                  <td className="px-4 py-3 text-right text-ink-800" data-testid="weighted-cell">{r.weighted == null ? "—" : r.weighted}</td>
                  <td className="px-4 py-3 text-ink-700">{stageName(r.stage)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${tone}`}>{r.svi == null ? "—" : r.delta == null ? "New" : formatDelta(r.delta)}</td>
                  <td className="px-4 py-3" data-testid="decision-cell">
                    {r.decision ? (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${DECISION_CHIP[r.decision]}`}>
                        {r.decision}
                        {r.assessmentStatus === "draft" ? <span className="ml-1 font-normal normal-case text-ink-500">draft</span> : null}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-800">{r.conviction ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-800">{r.thesisFitPct == null ? "—" : `${r.thesisFitPct}%`}</td>
                  <td className="px-4 py-3 text-ink-700">{r.topStrength ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-700">{r.topGap ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>{chip.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.reportUrl ? (
                      <>
                        <a href={r.reportUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                          Open<span className="sr-only"> {r.startup} report (opens in a new tab)</span>
                        </a>
                        {r.pdfUrl ? (
                          <>
                            {" · "}
                            <a href={r.pdfUrl} className="inline-flex items-center gap-0.5 text-brand-700 hover:underline">
                              <FileDown className="h-3 w-3" aria-hidden="true" /> PDF<span className="sr-only"> for {r.startup}</span>
                            </a>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-ink-500">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
