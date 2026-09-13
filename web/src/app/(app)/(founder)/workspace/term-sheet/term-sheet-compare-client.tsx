"use client";

/**
 * Term-sheet compare view (S26-B) — sits on /workspace/term-sheet under the
 * history table. Pick 2–4 analysed sheets → show-cost-first preview
 * (2 credits / included Growth+) → side-by-side matrix with a "founder-
 * friendlier" tick per row and the weighted founder-friendliness score per
 * sheet. Print-friendly: the table carries `print:` classes and a Print
 * button; the comparison is not persisted (a re-run is a new charge) so it
 * stays on the page until the founder navigates away.
 *
 * `initial` seeds state for the colocated render test.
 */

import * as React from "react";
import { Check, Columns3, Loader2, Printer, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TermSheetComparison } from "@/lib/term-sheet/compare";

export interface CompareSheetOption {
  id: string;
  label: string;
}

interface Preview {
  cost: number;
  included: boolean;
  balance: number | null;
  creditNote: string;
  sheets: CompareSheetOption[];
}

export interface CompareClientState {
  selected?: string[];
  preview?: Preview | null;
  comparison?: TermSheetComparison | null;
}

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;

export function compareCostLabel(cost: number, included: boolean): string {
  return included || cost <= 0 ? "included in your plan" : `${cost} credits`;
}

export function TermSheetCompareClient({ options, initial }: { options: CompareSheetOption[]; initial?: CompareClientState }) {
  const [selected, setSelected] = React.useState<string[]>(initial?.selected ?? []);
  const [preview, setPreview] = React.useState<Preview | null>(initial?.preview ?? null);
  const [comparison, setComparison] = React.useState<TermSheetComparison | null>(initial?.comparison ?? null);
  const [busy, setBusy] = React.useState<"preview" | "compare" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (id: string) => {
    setPreview(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= COMPARE_MAX ? s : [...s, id]));
  };

  const post = async (body: unknown) => {
    const res = await fetch("/api/term-sheet/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  };

  const startPreview = async () => {
    setError(null);
    setBusy("preview");
    try {
      const { res, json } = await post({ ids: selected });
      if (!res.ok) {
        setError(json.error === "insufficient_credits" ? `Not enough credits — ${json.creditsRequired} needed, balance ${json.balance}.` : json.error ?? "Could not prepare the comparison");
        return;
      }
      setPreview({ cost: json.cost, included: json.included, balance: json.balance, creditNote: json.creditNote, sheets: json.sheets ?? [] });
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    setError(null);
    setBusy("compare");
    try {
      const { res, json } = await post({ ids: selected, confirm: true });
      if (!res.ok || !json.comparison) {
        setError(json.error ?? "Comparison failed");
        return;
      }
      setComparison(json.comparison as TermSheetComparison);
      setPreview(null);
    } finally {
      setBusy(null);
    }
  };

  const canCompare = selected.length >= COMPARE_MIN && selected.length <= COMPARE_MAX;

  return (
    <section className="mt-8 rounded-2xl border border-surface-200 bg-white p-5 md:p-6 print:border-0 print:p-0" data-testid="term-sheet-compare">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold flex items-center gap-1.5">
            <Columns3 strokeWidth={1.75} className="h-3.5 w-3.5" /> Compare term sheets
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink-800">Side-by-side comparison</h2>
          <p className="mt-1 text-sm text-ink-500 max-w-xl">
            Select {COMPARE_MIN}–{COMPARE_MAX} analysed sheets. Each row marks the founder-friendlier term; the score weights the terms that move founder outcomes most (weights printed under the table).
          </p>
        </div>
      </div>

      {options.length < COMPARE_MIN ? (
        <p className="mt-4 text-sm text-ink-500" data-testid="compare-empty">
          Analyse at least two term sheets to compare them.
        </p>
      ) : (
        <>
          <ul className="mt-4 flex flex-wrap gap-2 print:hidden" data-testid="compare-options">
            {options.map((o) => {
              const on = selected.includes(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    aria-pressed={on}
                    disabled={!on && selected.length >= COMPARE_MAX}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                      on ? "border-brand-500 bg-brand-50 text-brand-800" : "border-surface-200 bg-white text-ink-700 hover:bg-surface-50",
                    )}
                  >
                    {on ? <Check strokeWidth={2} className="h-3.5 w-3.5" /> : null}
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
            <button type="button" onClick={startPreview} disabled={!canCompare || busy !== null || preview !== null} data-testid="compare-start" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy === "preview" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <Columns3 strokeWidth={1.75} className="h-3.5 w-3.5" />}
              Compare {selected.length > 0 ? `${selected.length} sheet${selected.length === 1 ? "" : "s"}` : ""}
            </button>
            {comparison ? (
              <button type="button" onClick={() => window.print()} data-testid="compare-print" className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50">
                <Printer strokeWidth={1.75} className="h-3.5 w-3.5" /> Print
              </button>
            ) : null}
            {error ? <span className="text-xs text-red-600" role="alert" data-testid="compare-error">{error}</span> : null}
          </div>

          {preview ? (
            <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 p-4 print:hidden" data-testid="compare-preview">
              <p className="text-sm font-semibold text-ink-800">Confirm before anything is charged</p>
              <p className="mt-1 text-xs text-ink-600">
                Cost: <strong>{compareCostLabel(preview.cost, preview.included)}</strong>
                {preview.cost > 0 && preview.balance != null ? ` · balance ${preview.balance}` : ""}
                {preview.cost > 0 ? ` · ${preview.creditNote}` : ""} The result stays on this page (print it) — a re-run is a new comparison.
              </p>
              <ul className="mt-2 text-xs text-ink-600 list-disc pl-4">
                {preview.sheets.map((s) => (
                  <li key={s.id}>{s.label}</li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={confirm} disabled={busy !== null} data-testid="compare-confirm" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                  {busy === "compare" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <Check strokeWidth={1.75} className="h-3.5 w-3.5" />}
                  Confirm ({compareCostLabel(preview.cost, preview.included)})
                </button>
                <button type="button" onClick={() => setPreview(null)} disabled={busy !== null} className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}

      {comparison ? <ComparisonTable comparison={comparison} /> : null}
    </section>
  );
}

export function ComparisonTable({ comparison }: { comparison: TermSheetComparison }) {
  const best = comparison.friendliestSheetId;
  return (
    <div className="mt-5" data-testid="compare-table">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4" data-testid="compare-scores">
        {comparison.scores.map((s) => (
          <div key={s.sheetId} className={cn("rounded-xl border p-3", s.sheetId === best ? "border-emerald-300 bg-emerald-50" : "border-surface-200 bg-surface-50")} data-testid="compare-score" data-sheet={s.sheetId}>
            <p className="text-xs font-medium text-ink-700 flex items-center gap-1">
              {s.sheetId === best ? <Trophy strokeWidth={1.75} className="h-3.5 w-3.5 text-emerald-600" /> : null}
              {s.label}
            </p>
            <p className="mt-1 text-2xl font-bold font-mono text-ink-900">
              {s.score}
              <span className="text-xs font-normal text-ink-500">/100 founder-friendly</span>
            </p>
            <p className="text-[11px] text-ink-500">
              {s.wins.length} row{s.wins.length === 1 ? "" : "s"} friendlier · {s.missing.length} not stated
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-surface-200">
        <table className="w-full min-w-[640px] text-sm print:text-xs">
          <thead>
            <tr className="bg-surface-50 text-left text-[11px] uppercase tracking-[0.12em] text-ink-600">
              <th className="px-3 py-2 font-medium">Term</th>
              {comparison.sheets.map((s) => (
                <th key={s.id} className="px-3 py-2 font-medium" scope="col">
                  {s.label}
                  <span className="block text-[10px] normal-case tracking-normal text-ink-400">{s.instrument}</span>
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-right">Weight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200/70">
            {comparison.rows.map((r) => (
              <tr key={r.key} data-testid="compare-row" data-key={r.key} className={cn(!r.comparable && "text-ink-400")}>
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink-700">
                  {r.label}
                </th>
                {r.cells.map((c) => (
                  <td key={c.sheetId} className={cn("px-3 py-2", c.founderFriendlier && "bg-emerald-50 text-emerald-900 font-medium")} data-friendlier={c.founderFriendlier ? "1" : undefined}>
                    {c.founderFriendlier ? <Check strokeWidth={2} className="inline h-3.5 w-3.5 mr-1 text-emerald-600" aria-label="founder-friendlier" /> : null}
                    {c.display}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono text-xs text-ink-500">{r.weight > 0 ? r.weight : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-3 space-y-1 text-[11px] leading-relaxed text-ink-500" data-testid="compare-notes">
        {comparison.notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
