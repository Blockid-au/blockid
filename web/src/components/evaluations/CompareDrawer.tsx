"use client";

// CompareDrawer — side-by-side comparison of ≤ 4 cohort rows (G21 P2-B, FI
// § 53): the 8 dimension scores as horizontal bars (model score; the latest
// human override, when any, drawn as a marker beside it — never replacing
// it), SVI · Program score · Evidence Confidence · BlockID Verified · gaps ·
// decision, and an "Open dossier" link per column. Slides in from the right
// (transform only, 200 ms, reduced-motion respected), Escape closes, focus
// lands on the close button, the page behind is inert to the pointer.

import * as React from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSION_KEYS, DIMENSION_LABELS, COHORT_DECISION_LABELS } from "@/lib/evaluations/batch-shared";
import type { CohortRow } from "@/lib/evaluations/cohort-rows";
import { MAX_COMPARE } from "./cohort-view-state";

export interface CompareDrawerProps {
  open: boolean;
  rows: readonly CohortRow[];
  onClose: () => void;
  onRemove?: (itemId: number) => void;
}

function tone(v: number | null | undefined): string {
  if (v == null) return "bg-line";
  if (v >= 70) return "bg-bull";
  if (v >= 40) return "bg-brand-500";
  return "bg-warn";
}

export function CompareDrawer({ open, rows, onClose, onRemove }: CompareDrawerProps) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const shown = rows.slice(0, MAX_COMPARE);

  return (
    <div className={cn("fixed inset-0 z-[90]", open ? "" : "pointer-events-none")} aria-hidden={!open} data-testid="compare-drawer-root" data-open={open ? "true" : "false"}>
      <div className={cn("absolute inset-0 bg-black/50 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="compare-drawer-title"
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-4xl flex-col bg-surface text-primary shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
        data-testid="compare-drawer"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-4 py-3 sm:px-6">
          <div>
            <h2 id="compare-drawer-title" className="text-base font-semibold">
              Compare {shown.length} startup{shown.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-0.5 text-xs text-secondary">Model scores side by side. Human overrides are marked, never substituted. Humans make the decision.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line text-secondary hover:bg-surface-hover" aria-label="Close comparison" data-testid="compare-close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {shown.length === 0 ? (
          <p className="p-6 text-sm text-secondary">Select up to {MAX_COMPARE} startups in the table to compare them here.</p>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
            <table className="w-full min-w-[32rem] border-separate border-spacing-0 text-sm" data-testid="compare-table">
              <caption className="sr-only">Side-by-side comparison of the selected startups</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-surface pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">
                    Metric
                  </th>
                  {shown.map((r) => (
                    <th key={r.itemId} scope="col" className="min-w-[9rem] pb-2 pr-3 text-left align-top">
                      <div className="font-semibold text-primary">{r.company}</div>
                      <div className="mt-0.5 text-xs font-normal text-secondary">
                        {r.stageLabel}
                        {r.sector ? ` · ${r.sector}` : ""}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs font-normal">
                        <Link href={r.dossierUrl} className="inline-flex items-center gap-1 text-action hover:underline">
                          Open dossier <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          <span className="sr-only"> for {r.company}</span>
                        </Link>
                        {onRemove ? (
                          <button type="button" onClick={() => onRemove(r.itemId)} className="text-muted hover:text-primary hover:underline" aria-label={`Remove ${r.company} from the comparison`}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <Row label="SVI (canonical)">{shown.map((r) => <Num key={r.itemId} v={r.svi} bold />)}</Row>
                <Row label="Program score">{shown.map((r) => <Num key={r.itemId} v={r.weightedScore} suffix={r.overrideWeightedScore != null ? ` · with overrides ${r.overrideWeightedScore}` : ""} />)}</Row>
                <Row label="Evidence confidence">{shown.map((r) => <Num key={r.itemId} v={r.confidence} />)}</Row>
                <Row label="BlockID Verified">{shown.map((r) => <td key={r.itemId} className="py-1.5 pr-3 tabular-nums">{r.verification}</td>)}</Row>
                <Row label="Evidence gaps">{shown.map((r) => <Num key={r.itemId} v={r.gapsCount} />)}</Row>
                <Row label="Decision">
                  {shown.map((r) => (
                    <td key={r.itemId} className="py-1.5 pr-3">
                      {r.decision ? `${COHORT_DECISION_LABELS[r.decision]}${r.conviction != null ? ` · conviction ${r.conviction}` : ""}${r.assessmentStatus === "draft" ? " (draft)" : ""}` : <span className="text-muted">—</span>}
                    </td>
                  ))}
                </Row>
                {DIMENSION_KEYS.map((k) => (
                  <Row key={k} label={DIMENSION_LABELS[k]}>
                    {shown.map((r) => {
                      const v = r.dimensionScores?.[k] ?? null;
                      const o = r.overriddenDimensions[k];
                      return (
                        <td key={r.itemId} className="py-1.5 pr-3 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                              <div className={cn("h-full rounded-full", tone(v))} style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }} />
                              {o ? <div className="absolute top-0 h-full w-0.5 bg-primary" style={{ left: `calc(${Math.max(0, Math.min(100, o.to))}% - 1px)` }} /> : null}
                            </div>
                            <span className="w-14 text-right text-xs tabular-nums text-primary">
                              {v == null ? "—" : Math.round(v)}
                              {o ? <span className="ml-1 text-secondary" title={`Human override · ${o.reasonCode.replace(/_/g, " ")}`}>→{Math.round(o.to)}</span> : null}
                            </span>
                          </div>
                          <span className="sr-only">
                            {DIMENSION_LABELS[k]} {v == null ? "not scored" : Math.round(v)}
                            {o ? `, human override ${Math.round(o.to)}` : ""}
                          </span>
                        </td>
                      );
                    })}
                  </Row>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </aside>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="border-t border-line-subtle">
      <th scope="row" className="sticky left-0 z-10 bg-surface py-1.5 pr-3 text-left text-xs font-medium text-secondary">
        {label}
      </th>
      {children}
    </tr>
  );
}

function Num({ v, bold, suffix }: { v: number | null; bold?: boolean; suffix?: string }) {
  return (
    <td className={cn("py-1.5 pr-3 tabular-nums", bold ? "font-semibold" : "")}>
      {v == null ? <span className="text-muted">—</span> : Math.round(v * 10) / 10}
      {suffix ? <span className="text-xs text-secondary">{suffix}</span> : null}
    </td>
  );
}
