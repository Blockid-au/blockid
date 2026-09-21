"use client";

// CohortTable — the BlockID Cohort view (G21 P2-B; FI § 53/54).
//
// Columns  company · stage · sector · SVI · Program score · confidence ·
//          verification · Δ · strongest · weakest · gaps · review status ·
//          reviewer · decision (+ conviction) · shortlist — column chooser
//          (localStorage, try/catch), saved views (name + filters + columns,
//          localStorage for now, "Default" always present), sortable headers
//          with aria-sort, sticky first column, density toggle, keyboard
//          row navigation (↑ / ↓ between rows), horizontal scroll INSIDE the
//          container at 375 px (no page overflow), tokens for dark mode,
//          empty state, skeleton while loading.
// Filters  ./CohortFilters — URL-synced through cohortFiltersToParams.
// Compare  ./CompareDrawer — ≤ 4 rows side by side.
// Override ./OverrideDialog — dimension · from → to · reason code · note.
// Log      per-row decision log (assessment versions + overrides, newest
//          first) in an expandable row.
// Writes   shortlist toggle + review status → PATCH …/items/[itemId]
//          (optimistic, rolled back on error); bulk decision (draft) with an
//          optional reason code → POST …/assessments (the S-D3 toolbar).
//
// Ranking  the default sort is the Program score (rubric_weights over the 8
//          stored dimension scores). The canonical SVI is always its own
//          column and is never altered; the caption says so with the weight
//          set version. Human overrides render BESIDE the model number.
//
// Roles    owner / reviewer write; viewer sees everything read-only.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Bookmark, Columns3, FileDown, History, Rows3, Scale, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { COHORT_DECISIONS, COHORT_DECISION_LABELS, type CohortDecision } from "@/lib/evaluations/batch-shared";
import { DECISION_REASON_CODES, DECISION_REASON_LABELS } from "@/lib/evaluations/cohort-decisions-shared";
import {
  REVIEW_STATUSES,
  REVIEW_STATUS_LABELS,
  RISK_FLAG_LABELS,
  activeFilterCount,
  cohortFiltersToParams,
  defaultSortDir,
  filterCohortRows,
  parseCohortFilters,
  sortCohortRows,
  type CohortFilters as Filters,
  type CohortRow,
  type CohortSortKey,
  type ReviewStatus,
  type SortDir,
} from "@/lib/evaluations/cohort-rows";
import { userErrorMessage } from "@/lib/ui/user-error";
import { CohortFilters } from "./CohortFilters";
import { CompareDrawer } from "./CompareDrawer";
import { DemoCohortChip } from "./DemoCohortChip";
import { OverrideDialog } from "./OverrideDialog";
import {
  COHORT_COLUMNS,
  COLUMN_DEFS,
  DEFAULT_VIEW,
  MAX_COMPARE,
  loadColumns,
  loadDensity,
  loadSavedViews,
  persistSavedViews,
  removeSavedView,
  saveColumns,
  saveDensity,
  toggleCompare,
  upsertSavedView,
  type CohortColumn,
  type Density,
  type SavedView,
} from "./cohort-view-state";

export type CohortViewerRole = "owner" | "reviewer" | "viewer";

export interface CohortTableProps {
  rows: CohortRow[];
  batchId: string;
  role: CohortViewerRole;
  /** rubric_weights version (P2-A `weights_version`; default 1). */
  weightsVersion?: number;
  /**
   * G22-A A.3: the two snapshots behind the Δ column were ranked with
   * different weight sets (`{ from, to }` = their `weights_version`s). The
   * caption says so — the Δ is on the canonical SVI (unweighted) and stays
   * comparable; the Program score between those snapshots is not.
   */
  deltaWeightsChanged?: { from: number; to: number } | null;
  /** True → skeleton instead of rows. */
  loading?: boolean;
  /** Server-parsed filters from the URL (the client re-parses on navigation). */
  initialFilters?: Filters;
  className?: string;
  /** G24-C: the fictional demo cohort — every company cell carries the "Demo data — fictional" chip. */
  isDemo?: boolean;
  /** Catalogue copy for the chip (EN default). */
  demoChip?: { label: string; title: string };
}

const DECISION_CHIP: Record<CohortDecision, string> = {
  pass: "border-bear/40 text-bear",
  track: "border-warn/50 text-warn",
  proceed: "border-bull/50 text-bull",
};

const REVIEW_CHIP: Record<ReviewStatus, string> = {
  unreviewed: "border-line text-muted",
  in_review: "border-warn/50 text-warn",
  reviewed: "border-bull/50 text-bull",
};

function fmtDelta(d: number | null, svi: number | null): { text: string; tone: string } {
  if (svi == null) return { text: "—", tone: "text-muted" };
  if (d == null) return { text: "New", tone: "text-muted" };
  if (d === 0) return { text: "0", tone: "text-muted" };
  return { text: `${d > 0 ? "+" : ""}${Math.round(d * 10) / 10}`, tone: d > 0 ? "text-bull" : "text-bear" };
}

type BulkState = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; n: number; skipped: number } | { kind: "error"; message: string };

export function CohortTable({ rows, batchId, role, weightsVersion = 1, deltaWeightsChanged = null, loading = false, initialFilters, className, isDemo = false, demoChip }: CohortTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const canWrite = role !== "viewer";

  // ── filters ↔ URL ───────────────────────────────────────────────────────
  const urlKey = searchParams?.toString() ?? "";
  const [filters, setFilters] = React.useState<Filters>(() => (urlKey ? parseCohortFilters(urlKey) : initialFilters ?? {}));
  // Derived state: back / forward navigation changes the URL → adopt it during render (no effect).
  const [prevUrlKey, setPrevUrlKey] = React.useState(urlKey);
  if (urlKey !== prevUrlKey) {
    setPrevUrlKey(urlKey);
    setFilters(parseCohortFilters(urlKey));
  }
  const applyFilters = React.useCallback(
    (next: Filters) => {
      setFilters(next);
      const qs = cohortFiltersToParams(next).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      // Shallow: Next syncs useSearchParams from history.replaceState without a server round-trip
      // (the rows are already on the client); fall back to the router when history is unavailable.
      try {
        window.history.replaceState(window.history.state, "", url);
      } catch {
        router.replace(url, { scroll: false });
      }
    },
    [router, pathname],
  );

  // ── view state (persisted per user) ─────────────────────────────────────
  const [columns, setColumns] = React.useState<CohortColumn[]>(() => [...DEFAULT_VIEW.columns]);
  const [density, setDensity] = React.useState<Density>("comfortable");
  const [views, setViews] = React.useState<SavedView[]>(() => [{ ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] }]);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration read of localStorage; a lazy initialiser would mismatch the server render
    setColumns(loadColumns());
    setDensity(loadDensity());
    setViews(loadSavedViews());
  }, []);
  const [sortKey, setSortKey] = React.useState<CohortSortKey>("weightedScore");
  const [dir, setDir] = React.useState<SortDir>("desc");
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [viewsOpen, setViewsOpen] = React.useState(false);

  function toggleColumn(c: CohortColumn) {
    if (COLUMN_DEFS[c].locked) return;
    const next = columns.includes(c) ? columns.filter((x) => x !== c) : COHORT_COLUMNS.filter((x) => x === c || columns.includes(x));
    setColumns(next);
    saveColumns(next);
  }
  function setDensityPersist(d: Density) {
    setDensity(d);
    saveDensity(d);
  }
  function saveCurrentView() {
    const name = typeof window !== "undefined" ? window.prompt("Name this view", "") : null;
    if (!name?.trim()) return;
    const next = upsertSavedView(views, { name: name.trim(), filters, columns, sort: { key: sortKey, dir } });
    setViews(next);
    persistSavedViews(next);
  }
  function applyView(v: SavedView) {
    setColumns(v.columns);
    saveColumns(v.columns);
    if (v.sort) {
      setSortKey(v.sort.key);
      setDir(v.sort.dir);
    }
    applyFilters(v.filters);
    setViewsOpen(false);
  }
  function deleteView(name: string) {
    const next = removeSavedView(views, name);
    setViews(next);
    persistSavedViews(next);
  }

  function toggleSort(key: CohortSortKey) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(defaultSortDir(key));
    }
  }

  // ── rows (optimistic copies for shortlist / review status) ──────────────
  const [local, setLocal] = React.useState<Record<number, Partial<CohortRow>>>({});
  // Fresh server rows (router.refresh) supersede the optimistic copies — derived during render.
  const [prevRows, setPrevRows] = React.useState(rows);
  if (rows !== prevRows) {
    setPrevRows(rows);
    setLocal({});
  }
  const merged = React.useMemo(() => rows.map((r) => (local[r.itemId] ? { ...r, ...local[r.itemId] } : r)), [rows, local]);
  const visible = React.useMemo(() => sortCohortRows(filterCohortRows(merged, filters), sortKey, dir), [merged, filters, sortKey, dir]);
  const sectors = React.useMemo(() => [...new Set(rows.map((r) => r.sector).filter((s): s is string => !!s))].sort(), [rows]);
  const stages = React.useMemo(() => [...new Set(rows.map((r) => r.stage).filter((s): s is number => s != null))].sort((a, b) => a - b), [rows]);

  const [rowError, setRowError] = React.useState<string | null>(null);
  async function patchItem(row: CohortRow, patch: { shortlisted?: boolean; review_status?: ReviewStatus }) {
    if (!canWrite) return;
    const optimistic: Partial<CohortRow> = {};
    if (patch.shortlisted !== undefined) optimistic.shortlisted = patch.shortlisted;
    if (patch.review_status !== undefined) optimistic.reviewStatus = patch.review_status;
    setLocal((prev) => ({ ...prev, [row.itemId]: { ...(prev[row.itemId] ?? {}), ...optimistic } }));
    setRowError(null);
    try {
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/items/${row.itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? `HTTP ${res.status}`), { status: res.status, body });
      router.refresh();
    } catch (err) {
      setLocal((prev) => {
        const next = { ...prev };
        delete next[row.itemId];
        return next;
      });
      setRowError(userErrorMessage(err, "Could not save — try again."));
    }
  }

  // ── compare / override / log ────────────────────────────────────────────
  const [compare, setCompare] = React.useState<number[]>([]);
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [compareFull, setCompareFull] = React.useState(false);
  const compareRows = React.useMemo(() => compare.map((id) => merged.find((r) => r.itemId === id)).filter((r): r is CohortRow => !!r), [compare, merged]);
  function onToggleCompare(id: number) {
    const r = toggleCompare(compare, id);
    setCompare(r.selected);
    setCompareFull(r.full);
  }
  const [overrideRow, setOverrideRow] = React.useState<CohortRow | null>(null);
  const closeOverride = React.useCallback(() => setOverrideRow(null), []);
  const closeCompare = React.useCallback(() => setCompareOpen(false), []);
  const [logOpen, setLogOpen] = React.useState<number | null>(null);

  // ── bulk decision (S-D3 toolbar + reason code) ──────────────────────────
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [reason, setReason] = React.useState<string>("");
  const [bulk, setBulk] = React.useState<BulkState>({ kind: "idle" });
  const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.evaluationId));
  async function setDecision(decision: CohortDecision | null) {
    if (!canWrite || selected.size === 0) return;
    setBulk({ kind: "busy" });
    try {
      const payload: Record<string, unknown> = { evaluation_ids: [...selected], decision };
      if (reason) payload.reason_code = reason;
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/assessments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; updated?: number; created?: number; skipped?: string[]; message?: string; error?: string };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? `HTTP ${res.status}`), { status: res.status, body });
      setBulk({ kind: "ok", n: (body.updated ?? 0) + (body.created ?? 0), skipped: body.skipped?.length ?? 0 });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setBulk({ kind: "error", message: userErrorMessage(err, "Could not set the decision — try again.") });
    }
  }

  // ── keyboard: ↑ / ↓ move between rows ───────────────────────────────────
  function onBodyKey(e: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const tr = (e.target as HTMLElement).closest("tr[data-cohort-row]");
    if (!tr) return;
    const sib = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;
    const target = sib?.matches("tr[data-cohort-row]") ? (sib.querySelector<HTMLElement>("a, button, input, select") ?? null) : null;
    if (target) {
      e.preventDefault();
      target.focus();
    }
  }

  const pad = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const show = (c: CohortColumn) => columns.includes(c);
  const colCount = columns.length + 2;

  return (
    <div className={cn("space-y-3", className)} data-testid="blockid-cohort" data-role={role}>
      <CohortFilters filters={filters} onChange={applyFilters} sectors={sectors} stages={stages} shown={visible.length} total={rows.length} />

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="cohort-toolbar">
        <div className="relative">
          <button type="button" onClick={() => setChooserOpen((o) => !o)} aria-expanded={chooserOpen} aria-controls="cohort-column-chooser" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-medium text-secondary hover:bg-surface-hover" data-testid="column-chooser-toggle">
            <Columns3 className="h-4 w-4" aria-hidden="true" /> Columns ({columns.length})
          </button>
          {chooserOpen ? (
            <div id="cohort-column-chooser" className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-line-subtle bg-surface-raised p-2 shadow-lg" data-testid="column-chooser">
              <p className="px-2 pb-1 text-[11px] uppercase tracking-wider text-muted">Show columns</p>
              {COHORT_COLUMNS.map((c) => (
                <label key={c} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-primary hover:bg-surface-hover">
                  <input type="checkbox" checked={columns.includes(c)} disabled={!!COLUMN_DEFS[c].locked} onChange={() => toggleColumn(c)} data-testid={`column-toggle-${c}`} />
                  <span>{COLUMN_DEFS[c].label}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button type="button" onClick={() => setViewsOpen((o) => !o)} aria-expanded={viewsOpen} aria-controls="cohort-saved-views" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-medium text-secondary hover:bg-surface-hover" data-testid="saved-views-toggle">
            <Bookmark className="h-4 w-4" aria-hidden="true" /> Views ({views.length})
          </button>
          {viewsOpen ? (
            <div id="cohort-saved-views" className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-line-subtle bg-surface-raised p-2 shadow-lg" data-testid="saved-views">
              {views.map((v) => (
                <div key={v.name} className="flex items-center gap-1">
                  <button type="button" onClick={() => applyView(v)} className="flex min-h-9 flex-1 items-center rounded-lg px-2 text-left text-sm text-primary hover:bg-surface-hover" data-testid={`saved-view-${v.name === DEFAULT_VIEW.name ? "default" : "custom"}`}>
                    {v.name}
                  </button>
                  {v.name !== DEFAULT_VIEW.name ? (
                    <button type="button" onClick={() => deleteView(v.name)} className="min-h-9 rounded-lg px-2 text-xs text-muted hover:text-bear" aria-label={`Delete view ${v.name}`}>
                      Delete
                    </button>
                  ) : null}
                </div>
              ))}
              <button type="button" onClick={saveCurrentView} className="mt-1 flex min-h-9 w-full items-center rounded-lg border border-dashed border-line px-2 text-sm text-action hover:bg-surface-hover" data-testid="save-view">
                Save current view…
              </button>
            </div>
          ) : null}
        </div>
        <button type="button" onClick={() => setDensityPersist(density === "compact" ? "comfortable" : "compact")} aria-pressed={density === "compact"} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-medium text-secondary hover:bg-surface-hover" data-testid="density-toggle">
          <Rows3 className="h-4 w-4" aria-hidden="true" /> {density === "compact" ? "Compact" : "Comfortable"}
        </button>
        <button type="button" onClick={() => setCompareOpen(true)} disabled={compare.length === 0} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-brand-300 bg-surface px-3 font-semibold text-action hover:bg-surface-hover disabled:opacity-50 dark:border-brand-700" data-testid="compare-open">
          <Scale className="h-4 w-4" aria-hidden="true" /> Compare ({compare.length}/{MAX_COMPARE})
        </button>
        {compareFull ? (
          <span role="status" className="text-warn" data-testid="compare-full">
            Up to {MAX_COMPARE} startups can be compared at once.
          </span>
        ) : null}
        {rowError ? (
          <span role="alert" className="text-bear">
            {rowError}
          </span>
        ) : null}
        <a href={`/api/evaluations/batch/${encodeURIComponent(batchId)}/export.csv`} className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 font-medium text-secondary hover:bg-surface-hover" data-testid="export-csv">
          <FileDown className="h-4 w-4" aria-hidden="true" /> Export CSV
        </a>
      </div>

      {/* bulk decision toolbar */}
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line-subtle bg-surface px-3 py-2 text-xs" data-testid="cohort-bulk-toolbar">
          <span className="text-secondary" data-testid="cohort-selected-count">
            {selected.size} selected
          </span>
          <span className="text-muted">·</span>
          <span className="text-secondary">Set decision (draft):</span>
          {COHORT_DECISIONS.map((d) => (
            <button key={d} type="button" onClick={() => setDecision(d)} disabled={selected.size === 0 || bulk.kind === "busy"} className={cn("inline-flex min-h-9 items-center rounded-lg border bg-surface px-2.5 font-semibold disabled:opacity-50", DECISION_CHIP[d])} data-testid={`bulk-${d}`}>
              {COHORT_DECISION_LABELS[d]}
            </button>
          ))}
          <button type="button" onClick={() => setDecision(null)} disabled={selected.size === 0 || bulk.kind === "busy"} className="inline-flex min-h-9 items-center rounded-lg border border-line px-2.5 text-secondary disabled:opacity-50" data-testid="bulk-clear">
            Clear
          </button>
          <label className="inline-flex items-center gap-1 text-secondary">
            Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-xs text-primary" data-testid="bulk-reason">
              <option value="">—</option>
              {DECISION_REASON_CODES.map((c) => (
                <option key={c} value={c}>
                  {DECISION_REASON_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {bulk.kind === "busy" ? <span className="text-muted">Saving…</span> : null}
          {bulk.kind === "ok" ? (
            <span className="text-bull" role="status" data-testid="bulk-result">
              Draft set on {bulk.n} startup{bulk.n === 1 ? "" : "s"}
              {bulk.skipped ? ` · ${bulk.skipped} skipped` : ""} — open a dossier to submit with conviction.
            </span>
          ) : null}
          {bulk.kind === "error" ? (
            <span className="text-bear" role="alert">
              {bulk.message}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-secondary" data-testid="viewer-note">
          You have view access to this cohort — ask the owner for a reviewer seat to shortlist, override or record decisions.
        </p>
      )}

      {/* table */}
      <div className="overflow-x-auto rounded-2xl border border-line-subtle bg-surface" data-testid="cohort-scroll">
        <table className={cn("min-w-full border-separate border-spacing-0 text-sm text-primary", density === "compact" ? "text-[13px]" : "")} data-testid="cohort-table" data-density={density}>
          <caption className="px-3 py-2 text-left text-xs text-secondary" data-testid="cohort-caption">
            BlockID Cohort — one row per startup. Ranked by Program score (weights v{weightsVersion}) · canonical SVI unchanged · human overrides shown beside the model score.
            {deltaWeightsChanged ? (
              <span className="ml-1 text-warn" data-testid="cohort-weights-changed">
                Weights changed between the last two snapshots (v{deltaWeightsChanged.from} → v{deltaWeightsChanged.to}): the Δ column compares the canonical SVI, which is unaffected; Program scores across those snapshots are not comparable.
              </span>
            ) : null}
          </caption>
          <thead className="bg-surface-sunken text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className={cn("sticky left-0 z-20 bg-surface-sunken", pad)}>
                {canWrite ? <input type="checkbox" aria-label="Select all visible startups" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((r) => r.evaluationId)))} data-testid="cohort-select-all" /> : <span className="sr-only">Select</span>}
              </th>
              {columns.map((c) => {
                const def = COLUMN_DEFS[c];
                const active = def.sort === sortKey;
                const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th key={c} scope="col" title={def.hint} aria-sort={def.sort ? (active ? (dir === "asc" ? "ascending" : "descending") : "none") : undefined} className={cn("whitespace-nowrap font-semibold", pad, def.numeric ? "text-right" : "", c === "company" ? "sticky left-10 z-20 bg-surface-sunken" : "")}>
                    {def.sort ? (
                      <button type="button" onClick={() => toggleSort(def.sort!)} className="inline-flex min-h-6 cursor-pointer items-center gap-1 hover:text-primary" data-testid={`sort-${c}`}>
                        {def.short ?? def.label}
                        <Icon className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                        <span className="sr-only">{active ? (dir === "asc" ? ", sorted ascending" : ", sorted descending") : ", sortable"}</span>
                      </button>
                    ) : (
                      def.label
                    )}
                  </th>
                );
              })}
              <th scope="col" className={cn("text-right font-semibold", pad)}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody onKeyDown={onBodyKey} className="divide-y divide-line-subtle">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk-${i}`} data-testid="cohort-skeleton-row" aria-hidden="true">
                  <td colSpan={colCount} className={pad}>
                    <div className="h-4 w-full animate-pulse rounded bg-surface-sunken" />
                  </td>
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-6 py-14 text-center text-sm text-secondary" data-testid="cohort-empty">
                  {rows.length === 0 ? "No startups in this cohort yet." : activeFilterCount(filters) > 0 ? "No startups match these filters." : "Nothing to show."}
                  {rows.length > 0 && activeFilterCount(filters) > 0 ? (
                    <>
                      {" "}
                      <button type="button" onClick={() => applyFilters({})} className="font-medium text-action hover:underline">
                        Clear filters
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const delta = fmtDelta(r.delta, r.svi);
                const inCompare = compare.includes(r.itemId);
                const open = logOpen === r.itemId;
                return (
                  <React.Fragment key={r.itemId}>
                    <tr data-cohort-row data-testid="cohort-row" data-item-id={r.itemId} data-decision={r.decision ?? ""} data-shortlisted={r.shortlisted ? "true" : "false"} className={cn("align-top", r.shortlisted ? "bg-accent-soft/40" : "")}>
                      <td className={cn("sticky left-0 z-10 bg-surface", pad)}>
                        {canWrite ? <input type="checkbox" aria-label={`Select ${r.company}`} checked={selected.has(r.evaluationId)} onChange={() => setSelected((prev) => { const n = new Set(prev); if (n.has(r.evaluationId)) n.delete(r.evaluationId); else n.add(r.evaluationId); return n; })} data-testid="cohort-select" /> : null}
                      </td>
                      {show("company") ? (
                        <td className={cn("sticky left-10 z-10 min-w-[11rem] bg-surface", pad)}>
                          <Link href={r.dossierUrl} className="font-medium text-primary hover:underline" aria-label={`Open the BlockID Dossier for ${r.company}`}>
                            {r.company}
                          </Link>
                          {isDemo ? (
                            <div className="mt-0.5">
                              <DemoCohortChip label={demoChip?.label} title={demoChip?.title} />
                            </div>
                          ) : null}
                          {r.riskFlags.length ? (
                            <div className="mt-0.5 flex flex-wrap gap-1" data-testid="risk-flags">
                              {r.riskFlags.map((f) => (
                                <span key={f} className="rounded border border-warn/50 px-1 text-[10px] font-medium text-warn" title={RISK_FLAG_LABELS[f]}>
                                  {RISK_FLAG_LABELS[f]}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {r.error ? <div className="mt-0.5 text-[11px] text-bear" data-testid="item-error">{r.error}</div> : null}
                        </td>
                      ) : null}
                      {show("stage") ? <td className={cn("whitespace-nowrap text-secondary", pad)}>{r.stageLabel}</td> : null}
                      {show("sector") ? <td className={cn("text-secondary", pad)}>{r.sector ?? "—"}</td> : null}
                      {show("svi") ? (
                        <td className={cn("text-right font-semibold tabular-nums", pad)} data-testid="svi-cell">
                          {r.svi == null ? "—" : Math.round(r.svi)}
                          {r.overriddenDimensions.total ? <span className="ml-1 text-xs font-normal text-secondary" title="Human override of the total — the canonical SVI is unchanged">→{Math.round(r.overriddenDimensions.total.to)}</span> : null}
                        </td>
                      ) : null}
                      {show("weightedScore") ? (
                        <td className={cn("text-right tabular-nums", pad)} data-testid="weighted-cell">
                          {r.weightedScore == null ? "—" : r.weightedScore}
                          {r.overrideWeightedScore != null ? <span className="ml-1 text-xs text-secondary" title="Program score with the latest human override per dimension">→{r.overrideWeightedScore}</span> : null}
                        </td>
                      ) : null}
                      {show("confidence") ? <td className={cn("text-right tabular-nums", pad)} data-testid="confidence-cell">{r.confidence == null ? "—" : r.confidence}</td> : null}
                      {show("verification") ? <td className={cn("whitespace-nowrap tabular-nums", pad, r.verificationLevel >= 2 ? "text-action" : "text-secondary")} data-testid="verification-cell">{r.verification}</td> : null}
                      {show("delta") ? <td className={cn("text-right font-semibold tabular-nums", pad, delta.tone)} data-testid="delta-cell">{delta.text}</td> : null}
                      {show("strongest") ? <td className={cn("text-secondary", pad)}>{r.strongestLabel ?? "—"}</td> : null}
                      {show("weakest") ? <td className={cn("text-secondary", pad)}>{r.weakestLabel ?? "—"}</td> : null}
                      {show("gaps") ? <td className={cn("text-right tabular-nums", pad)} data-testid="gaps-cell">{r.gapsCount}</td> : null}
                      {show("reviewStatus") ? (
                        <td className={cn("whitespace-nowrap", pad)} data-testid="review-status-cell">
                          {canWrite ? (
                            <select value={r.reviewStatus} onChange={(e) => patchItem(r, { review_status: e.target.value as ReviewStatus })} aria-label={`Review status for ${r.company}`} className={cn("h-8 rounded-lg border bg-surface px-1.5 text-xs", REVIEW_CHIP[r.reviewStatus])} data-testid="review-status-select">
                              {REVIEW_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {REVIEW_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", REVIEW_CHIP[r.reviewStatus])}>{REVIEW_STATUS_LABELS[r.reviewStatus]}</span>
                          )}
                        </td>
                      ) : null}
                      {show("reviewer") ? <td className={cn("text-secondary", pad)}>{r.reviewer ? r.reviewer.name ?? "Assigned" : "—"}</td> : null}
                      {show("decision") ? (
                        <td className={cn("whitespace-nowrap", pad)} data-testid="decision-cell">
                          {r.decision ? (
                            <span className={cn("inline-flex items-center rounded-full border bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase", DECISION_CHIP[r.decision])}>
                              {r.decision}
                              {r.conviction != null ? <span className="ml-1 font-normal normal-case text-secondary">· {r.conviction}/5</span> : null}
                              {r.assessmentStatus === "draft" ? <span className="ml-1 font-normal normal-case text-muted">draft</span> : null}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      ) : null}
                      {show("shortlist") ? (
                        <td className={cn("text-center", pad)} data-testid="shortlist-cell">
                          <button type="button" onClick={() => patchItem(r, { shortlisted: !r.shortlisted })} disabled={!canWrite} aria-pressed={r.shortlisted} aria-label={`${r.shortlisted ? "Remove" : "Add"} ${r.company} ${r.shortlisted ? "from" : "to"} the shortlist`} className={cn("inline-flex h-9 w-9 items-center justify-center rounded-lg border", r.shortlisted ? "border-warn/60 text-warn" : "border-line text-muted hover:text-primary", canWrite ? "" : "cursor-default")} data-testid="shortlist-toggle">
                            <Star className="h-4 w-4" fill={r.shortlisted ? "currentColor" : "none"} aria-hidden="true" />
                          </button>
                        </td>
                      ) : null}
                      <td className={cn("whitespace-nowrap text-right", pad)}>
                        <div className="inline-flex items-center gap-1">
                          <button type="button" onClick={() => onToggleCompare(r.itemId)} aria-pressed={inCompare} className={cn("inline-flex h-9 items-center gap-1 rounded-lg border px-2 text-xs", inCompare ? "border-brand-600 text-action" : "border-line text-secondary hover:text-primary")} data-testid="compare-toggle">
                            <Scale className="h-3.5 w-3.5" aria-hidden="true" /> {inCompare ? "Comparing" : "Compare"}
                          </button>
                          {canWrite ? (
                            <button type="button" onClick={() => setOverrideRow(r)} disabled={r.svi == null} className="inline-flex h-9 items-center rounded-lg border border-line px-2 text-xs text-secondary hover:text-primary disabled:opacity-50" data-testid="override-open">
                              Override
                            </button>
                          ) : null}
                          <button type="button" onClick={() => setLogOpen(open ? null : r.itemId)} aria-expanded={open} aria-controls={`cohort-log-${r.itemId}`} className="inline-flex h-9 items-center gap-1 rounded-lg border border-line px-2 text-xs text-secondary hover:text-primary" data-testid="log-toggle">
                            <History className="h-3.5 w-3.5" aria-hidden="true" /> Log{r.log.length ? ` (${r.log.length})` : ""}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr id={`cohort-log-${r.itemId}`} data-testid="cohort-log-row">
                        <td colSpan={colCount} className="bg-surface-sunken px-4 py-3">
                          <DecisionLog row={r} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CompareDrawer open={compareOpen} rows={compareRows} onClose={closeCompare} onRemove={(id) => setCompare((c) => c.filter((x) => x !== id))} batchId={batchId} />
      <OverrideDialog open={!!overrideRow} batchId={batchId} row={overrideRow} onClose={closeOverride} onSaved={() => router.refresh()} />
    </div>
  );
}

/** Per-row decision log: assessment versions + human overrides, newest first. */
export function DecisionLog({ row }: { row: CohortRow }) {
  if (row.log.length === 0) {
    return (
      <p className="text-xs text-secondary" data-testid="decision-log-empty">
        No decisions or overrides recorded for {row.company} yet.
      </p>
    );
  }
  return (
    <ol className="space-y-1.5 text-xs" aria-label={`Decision log for ${row.company}`} data-testid="decision-log">
      {row.log.map((e, i) => (
        <li key={`${e.kind}-${e.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", e.kind === "override" ? "border-warn/50 text-warn" : "border-line text-secondary")}>{e.kind === "override" ? "Human override" : "Decision"}</span>
          <span className="text-primary">{e.summary}</span>
          {e.note ? <span className="text-secondary">— {e.note}</span> : null}
          <span className="text-muted">
            {e.actorName ?? "—"} · {e.at ? new Date(e.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
        </li>
      ))}
    </ol>
  );
}
