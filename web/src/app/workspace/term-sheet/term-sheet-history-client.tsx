"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";

interface Row {
  id: string;
  createdAt: string;
  companyName: string | null;
  valuationAud: number | null;
  valuationDisplay: string;
  risk: string | null;
}

function riskTone(risk: string | null): string {
  switch (risk) {
    case "critical":
      return "border-red-500/40 bg-red-500/10 text-red-500";
    case "high":
      return "border-orange-500/40 bg-orange-500/10 text-orange-500";
    case "medium":
      return "border-amber-500/40 bg-amber-500/10 text-amber-500";
    case "low":
      return "border-slate-400/40 bg-slate-400/10 text-slate-500";
    default:
      return "border-surface-200 bg-surface-100 text-ink-500";
  }
}

export function TermSheetHistoryClient({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async (id: string) => {
    if (deletingId) return;
    if (!window.confirm("Delete this term sheet analysis? This cannot be undone.")) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/term-sheet?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || "Delete failed");
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-500/40 bg-red-500/5 px-4 py-2 text-sm text-red-500"
        >
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.15em] text-ink-600">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Company</th>
              <th className="px-5 py-3 font-medium text-right">Valuation</th>
              <th className="px-5 py-3 font-medium">Risk</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200/70">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-100/40">
                <td className="px-5 py-3 text-ink-500 font-mono tabular-nums">
                  {new Date(r.createdAt).toISOString().slice(0, 10)}
                </td>
                <td className="px-5 py-3 text-ink-800">
                  {r.companyName ?? "—"}
                </td>
                <td className="px-5 py-3 text-right font-mono tabular-nums text-ink-500">
                  {r.valuationDisplay}
                </td>
                <td className="px-5 py-3">
                  {r.risk ? (
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${riskTone(r.risk)}`}
                    >
                      {r.risk}
                    </span>
                  ) : (
                    <span className="text-ink-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    disabled={deletingId === r.id}
                    aria-label="Delete analysis"
                    className="inline-flex h-11 w-11 sm:h-9 sm:w-9 items-center justify-center rounded-md border border-surface-200 bg-white text-ink-500 hover:border-red-500/40 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-1"
                  >
                    {deletingId === r.id ? (
                      <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 strokeWidth={1.75} className="h-4 w-4" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
