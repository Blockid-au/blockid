"use client";

// CohortTable — sortable table for one evaluation batch (T0272). Columns:
// startup, SVI, weighted score (the batch's rubric weights re-aggregating
// the 8 dimensions — see batch-shared.ts), stage, Δ since last, top
// strength, top gap, report link. Same table styling as evaluations-client.tsx.

import * as React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, FileDown } from "lucide-react";
import { formatDelta } from "@/lib/evaluations/progress-shared";
import { stageName, type BatchStatus, type CohortRow } from "@/lib/evaluations/batch-shared";

type SortKey = "startup" | "svi" | "weighted" | "stage" | "delta" | "topStrength" | "topGap" | "status";

const STATUS_CHIP: Record<BatchStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "border-surface-300 bg-surface-100 text-ink-600" },
  running: { label: "Scoring…", className: "border-brand-300 bg-brand-50 text-brand-700" },
  done: { label: "Scored", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", className: "border-red-300 bg-red-50 text-red-700" },
};

/** Nulls (unscored) always sort last, whichever direction is chosen. */
function compare(a: CohortRow, b: CohortRow, key: SortKey, dir: "asc" | "desc"): number {
  const av = a[key];
  const bv = b[key];
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

export function CohortTable({ rows }: { rows: CohortRow[] }) {
  const [sortKey, setSortKey] = React.useState<SortKey>("weighted");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(() => sortRows(rows, sortKey, dir), [rows, sortKey, dir]);

  function toggle(key: SortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "startup" || key === "topStrength" || key === "topGap" ? "asc" : "desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white">
      <table className="min-w-full text-sm" data-testid="cohort-table">
        <caption className="sr-only">Cohort table — one row per startup in this batch; column headers sort</caption>
        <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
          <tr>
            <SortHeader k="startup" sortKey={sortKey} dir={dir} onToggle={toggle}>Startup</SortHeader>
            <SortHeader k="svi" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">SVI</SortHeader>
            <SortHeader k="weighted" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">Weighted</SortHeader>
            <SortHeader k="stage" sortKey={sortKey} dir={dir} onToggle={toggle}>Stage</SortHeader>
            <SortHeader k="delta" sortKey={sortKey} dir={dir} onToggle={toggle} align="right">Δ since last</SortHeader>
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
              <tr key={r.itemId} data-testid="cohort-row" className="align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink-900">
                    {r.projectSlug ? (
                      <Link href={`/workspace/projects/${encodeURIComponent(r.projectSlug)}/analyze`} className="hover:underline">{r.startup}</Link>
                    ) : (
                      r.startup
                    )}
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
  );
}
