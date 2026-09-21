"use client";

// CompareDrawer — side-by-side comparison of ≤ 4 cohort rows (G21 P2-B, FI
// § 53): the 8 dimension scores as horizontal bars (model score; the latest
// human override, when any, drawn as a marker beside it — never replacing
// it), SVI · Program score · Evidence Confidence · BlockID Verified · gaps ·
// decision, and an "Open dossier" link per column. Slides in from the right
// (transform only, 200 ms, reduced-motion respected), Escape closes, focus
// lands on the close button and RETURNS to whatever opened the drawer when
// it closes (G22-A A.4), the page behind is inert to the pointer.
//
// G22-A A.5: under the table, one compact TrajectoryTimeline per selected
// row (Day 0 / 60 / 180 — SVI, Evidence Confidence, evidence level,
// confirmed outcomes), fetched while the drawer is open from
// GET /api/evaluations/batch/[id]/items/[itemId]/trajectory (viewer+; the
// route withholds outcome VALUES below the evaluation's `reports_shared`
// consent tier, so a reviewer never sees wider than the evaluator does).
// Each fetch is fail-soft: an item whose read fails shows a one-line note.

import * as React from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DIMENSION_KEYS, DIMENSION_LABELS, COHORT_DECISION_LABELS } from "@/lib/evaluations/batch-shared";
import type { CohortRow } from "@/lib/evaluations/cohort-rows";
import type { Trajectory } from "@/lib/svi/trajectory";
import { TrajectoryTimeline } from "@/components/svi/TrajectoryTimeline";
import { MAX_COMPARE } from "./cohort-view-state";
import { useReturnFocus } from "./use-return-focus";

export interface CompareDrawerProps {
  open: boolean;
  rows: readonly CohortRow[];
  onClose: () => void;
  onRemove?: (itemId: number) => void;
  /** G22-A: when set, each selected row loads its trajectory from the batch items route. */
  batchId?: string;
}

export type TrajectoryState = { status: "loading" } | { status: "ready"; trajectory: Trajectory; valuesWithheld: boolean } | { status: "error" };

export interface TrajectoryResponse {
  ok?: boolean;
  trajectory?: Trajectory;
  values_withheld?: boolean;
}

/** Pure: the route response → the per-row state (anything malformed reads as an error, never a throw). */
export function trajectoryStateFromResponse(status: number, body: TrajectoryResponse | null | undefined): TrajectoryState {
  if (status !== 200 || !body || body.ok !== true || !body.trajectory || typeof body.trajectory !== "object") return { status: "error" };
  return { status: "ready", trajectory: body.trajectory, valuesWithheld: body.values_withheld === true };
}

function tone(v: number | null | undefined): string {
  if (v == null) return "bg-line";
  if (v >= 70) return "bg-bull";
  if (v >= 40) return "bg-brand-500";
  return "bg-warn";
}

export function CompareDrawer({ open, rows, onClose, onRemove, batchId }: CompareDrawerProps) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  // G22-A A.4: focus returns to the "Compare" button on close (captured at open time).
  useReturnFocus(open);
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

  // G22-A A.5: one trajectory per shown row, loaded while open; cached by
  // item id for the drawer's lifetime. A row with no entry yet renders the
  // skeleton (no "loading" state is written from the effect); `inflight`
  // stops a second fetch for the same item while the first is running, and
  // an aborted fetch (rows changed / drawer closed mid-flight) leaves no
  // entry so the next open fetches it again.
  const [trajectories, setTrajectories] = React.useState<Record<number, TrajectoryState>>({});
  const inflight = React.useRef<Set<number>>(new Set());
  const shownIds = shown.map((r) => r.itemId).join(",");
  React.useEffect(() => {
    if (!open || !batchId || !shownIds) return;
    const ids = shownIds.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const controller = new AbortController();
    const pending = inflight.current;
    for (const id of ids) {
      if (trajectories[id] || pending.has(id)) continue;
      pending.add(id);
      void (async () => {
        let state: TrajectoryState | null = null;
        try {
          const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/items/${id}/trajectory`, { signal: controller.signal, headers: { Accept: "application/json" } });
          const body = (await res.json().catch(() => null)) as TrajectoryResponse | null;
          state = trajectoryStateFromResponse(res.status, body);
        } catch (err) {
          if (!controller.signal.aborted) {
            console.error("[compare-drawer] trajectory", err);
            state = { status: "error" };
          }
        } finally {
          pending.delete(id);
        }
        if (state && !controller.signal.aborted) {
          const next = state;
          setTrajectories((prev) => ({ ...prev, [id]: next }));
        }
      })();
    }
    return () => controller.abort();
    // `trajectories` is read for the "already loaded" check only; re-running on its change would refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId, shownIds]);

  return (
    <div className={cn("fixed inset-0 z-[90]", open ? "" : "pointer-events-none invisible")} aria-hidden={!open} data-testid="compare-drawer-root" data-open={open ? "true" : "false"}>
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

            {batchId ? (
              <section aria-labelledby="compare-trajectories-title" className="mt-6 border-t border-line-subtle pt-4" data-testid="compare-trajectories">
                <h3 id="compare-trajectories-title" className="text-sm font-semibold text-primary">
                  Trajectory since Day 0
                </h3>
                <p className="mt-0.5 text-xs text-secondary">SVI and Evidence Confidence over every snapshot, confirmed outcomes as markers. Same methodology on every point — movement is evidence, not a rule change.</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {shown.map((r) => {
                    const t = trajectories[r.itemId];
                    return (
                      <div key={r.itemId} className="min-w-0 rounded-xl border border-line-subtle bg-surface p-3" data-testid="compare-trajectory" data-item-id={r.itemId} data-state={t?.status ?? "idle"}>
                        {!t || t.status === "loading" ? (
                          <div role="status" aria-live="polite" className="space-y-2" aria-label={`Loading the trajectory for ${r.company}`}>
                            <p className="text-xs font-semibold text-primary">{r.company}</p>
                            <div className="h-24 animate-pulse rounded-lg bg-surface-sunken motion-reduce:animate-none" aria-hidden="true" />
                          </div>
                        ) : t.status === "error" ? (
                          <p className="text-xs text-secondary">
                            <span className="font-semibold text-primary">{r.company}</span> — the trajectory could not be loaded right now; the dossier still shows it.
                          </p>
                        ) : (
                          <>
                            <TrajectoryTimeline data={t.trajectory} variant="compact" headingLevel={3} title={r.company} id={`compare-trajectory-${r.itemId}`} />
                            {t.valuesWithheld ? (
                              <p className="mt-1 text-[11px] text-muted" data-testid="compare-trajectory-withheld">
                                Outcome amounts are withheld at this startup&apos;s consent tier; the kinds still show as markers.
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
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
