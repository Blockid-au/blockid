"use client";

// CohortFilters — the BlockID Cohort filter bar (G21 P2-B, FI § 53): stage ·
// sector · SVI range · confidence range · traction range · risk flags ·
// minimum verification · review status · decision · shortlist · search.
// Controlled: the parent owns `filters` and mirrors them to the URL
// (`?stage=&sector=&svi=&conf=&traction=&risk=&ver=&status=&decision=&shortlist=&q=`)
// through `cohortFiltersToParams`, so a filtered view is a shareable link
// and the back button restores it.
//
// Chips for the enumerable facets (stage / status / decision / toggles),
// paired number inputs for the ranges, a native <select> for sector and
// verification. Every control has a visible label; the active-filter count
// sits on the "Clear" button; the bar wraps at 375 px.

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COHORT_DECISION_LABELS, COHORT_DECISIONS, STAGE_NAMES, type CohortDecision } from "@/lib/evaluations/batch-shared";
import { REVIEW_STATUSES, REVIEW_STATUS_LABELS, activeFilterCount, type CohortFilters as Filters, type Range, type ReviewStatus } from "@/lib/evaluations/cohort-rows";

export interface CohortFiltersProps {
  filters: Filters;
  onChange: (next: Filters) => void;
  /** Sector values present in the cohort (the select lists these). */
  sectors: readonly string[];
  /** Stages present in the cohort. */
  stages: readonly number[];
  /** Rows shown / total (for the live summary). */
  shown: number;
  total: number;
  className?: string;
}

const chip = (active: boolean) =>
  cn(
    "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action",
    active ? "rounded-full border-brand-navy bg-action text-on-action" : "border-line bg-surface text-secondary hover:bg-surface-hover",
  );

function toggleIn<T>(list: T[] | undefined, v: T): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
}

function RangeField({ id, label, value, onChange }: { id: string; label: string; value: Range | undefined; onChange: (r: Range | undefined) => void }) {
  const [lo, hi] = value ?? [0, 100];
  const set = (nextLo: number, nextHi: number) => {
    const a = Math.max(0, Math.min(100, Number.isFinite(nextLo) ? nextLo : 0));
    const b = Math.max(0, Math.min(100, Number.isFinite(nextHi) ? nextHi : 100));
    onChange(a === 0 && b === 100 ? undefined : [Math.min(a, b), Math.max(a, b)]);
  };
  return (
    <fieldset className="flex items-center gap-1.5" data-testid={`filter-${id}`}>
      <legend className="sr-only">{label} range</legend>
      <span className="text-xs font-medium text-secondary">{label}</span>
      <label className="sr-only" htmlFor={`${id}-lo`}>
        {label} minimum
      </label>
      <input
        id={`${id}-lo`}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        value={lo}
        onChange={(e) => set(Number(e.target.value), hi)}
        className="h-9 w-14 rounded-lg border border-line bg-surface px-2 text-right text-sm tabular-nums text-primary"
      />
      <span className="text-xs text-muted" aria-hidden="true">
        –
      </span>
      <label className="sr-only" htmlFor={`${id}-hi`}>
        {label} maximum
      </label>
      <input
        id={`${id}-hi`}
        type="number"
        inputMode="numeric"
        min={0}
        max={100}
        value={hi}
        onChange={(e) => set(lo, Number(e.target.value))}
        className="h-9 w-14 rounded-lg border border-line bg-surface px-2 text-right text-sm tabular-nums text-primary"
      />
    </fieldset>
  );
}

export function CohortFilters({ filters, onChange, sectors, stages, shown, total, className }: CohortFiltersProps) {
  const count = activeFilterCount(filters);
  const [q, setQ] = React.useState(filters.q ?? "");
  // Derived state (React docs pattern): when the URL-driven value changes, adopt it during render.
  const [prevQ, setPrevQ] = React.useState(filters.q);
  if (filters.q !== prevQ) {
    setPrevQ(filters.q);
    setQ(filters.q ?? "");
  }
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((q.trim() || undefined) !== (filters.q?.trim() || undefined)) onChange({ ...filters, q: q.trim() || undefined });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce the search box only
  }, [q]);

  return (
    <section aria-label="Filter the cohort" className={cn("rounded-2xl border border-line-subtle bg-surface p-3 text-sm text-primary", className)} data-testid="cohort-filters">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[10rem] flex-1 items-center sm:flex-none">
          <span className="sr-only">Search company or sector</span>
          <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search company or sector"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-8 pr-3 text-sm text-primary placeholder:text-muted sm:w-56"
            data-testid="filter-q"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Stage">
          <span className="text-xs font-medium text-secondary">Stage</span>
          {stages.map((s) => (
            <button key={s} type="button" aria-pressed={!!filters.stage?.includes(s)} className={chip(!!filters.stage?.includes(s))} onClick={() => onChange({ ...filters, stage: toggleIn(filters.stage, s) })} data-testid={`filter-stage-${s}`}>
              {STAGE_NAMES[s] ?? `Stage ${s}`}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-secondary">Sector</span>
          <select
            value={filters.sector?.[0] ?? ""}
            onChange={(e) => onChange({ ...filters, sector: e.target.value ? [e.target.value] : undefined })}
            className="h-11 max-w-[11rem] rounded-lg border border-line bg-surface px-2 text-sm text-primary"
            data-testid="filter-sector"
          >
            <option value="">All</option>
            {sectors.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <RangeField id="svi" label="SVI" value={filters.svi} onChange={(r) => onChange({ ...filters, svi: r })} />
        <RangeField id="conf" label="Confidence" value={filters.conf} onChange={(r) => onChange({ ...filters, conf: r })} />
        <RangeField id="traction" label="Traction" value={filters.traction} onChange={(r) => onChange({ ...filters, traction: r })} />

        <label className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-secondary">Verified ≥</span>
          <select
            value={filters.ver ?? ""}
            onChange={(e) => onChange({ ...filters, ver: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="h-11 rounded-lg border border-line bg-surface px-2 text-sm text-primary"
            data-testid="filter-ver"
          >
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((l) => (
              <option key={l} value={l}>
                L{l}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Review status">
          <span className="text-xs font-medium text-secondary">Review</span>
          {REVIEW_STATUSES.map((s: ReviewStatus) => (
            <button key={s} type="button" aria-pressed={!!filters.status?.includes(s)} className={chip(!!filters.status?.includes(s))} onClick={() => onChange({ ...filters, status: toggleIn(filters.status, s) })} data-testid={`filter-status-${s}`}>
              {REVIEW_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Decision">
          <span className="text-xs font-medium text-secondary">Decision</span>
          {COHORT_DECISIONS.map((d: CohortDecision) => (
            <button key={d} type="button" aria-pressed={!!filters.decision?.includes(d)} className={chip(!!filters.decision?.includes(d))} onClick={() => onChange({ ...filters, decision: toggleIn(filters.decision, d) })} data-testid={`filter-decision-${d}`}>
              {COHORT_DECISION_LABELS[d]}
            </button>
          ))}
          <button type="button" aria-pressed={!!filters.decision?.includes("none")} className={chip(!!filters.decision?.includes("none"))} onClick={() => onChange({ ...filters, decision: toggleIn(filters.decision, "none") })} data-testid="filter-decision-none">
            Undecided
          </button>
        </div>
        <button type="button" aria-pressed={!!filters.risk} className={chip(!!filters.risk)} onClick={() => onChange({ ...filters, risk: filters.risk ? undefined : true })} data-testid="filter-risk">
          Risk flags
        </button>
        <button type="button" aria-pressed={!!filters.shortlist} className={chip(!!filters.shortlist)} onClick={() => onChange({ ...filters, shortlist: filters.shortlist ? undefined : true })} data-testid="filter-shortlist">
          Shortlisted
        </button>
        <span className="ml-auto text-xs text-secondary" role="status" aria-live="polite" data-testid="filter-summary">
          {shown} of {total} startup{total === 1 ? "" : "s"}
        </span>
        {count > 0 ? (
          <button type="button" onClick={() => onChange({})} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line px-3 text-xs font-medium text-secondary hover:bg-surface-hover" data-testid="filter-clear">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear ({count})
          </button>
        ) : null}
      </div>
    </section>
  );
}
