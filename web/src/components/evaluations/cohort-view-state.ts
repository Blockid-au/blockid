// cohort-view-state — pure view-state helpers for the BlockID Cohort table
// (G21 P2-B): the column registry, the column chooser + saved views that
// persist per user in localStorage (every read / write wrapped in try/catch —
// G20 rule: storage can be empty, blocked or throwing, and the table must
// render identically without it), row density, and the compare selection
// cap (≤ 4).

import type { CohortFilters, CohortSortKey, SortDir } from "@/lib/evaluations/cohort-rows";

export const COHORT_COLUMNS = [
  "company",
  "stage",
  "sector",
  "svi",
  "weightedScore",
  "confidence",
  "verification",
  "delta",
  "strongest",
  "weakest",
  "gaps",
  "reviewStatus",
  "reviewer",
  "decision",
  "shortlist",
] as const;
export type CohortColumn = (typeof COHORT_COLUMNS)[number];

export interface ColumnDef {
  key: CohortColumn;
  label: string;
  short?: string;
  /** Right-aligned numeric column (tabular figures). */
  numeric?: boolean;
  /** Sortable through this key (undefined = not sortable). */
  sort?: CohortSortKey;
  /** Cannot be hidden. */
  locked?: boolean;
  /** One-line explanation for the header tooltip / column chooser. */
  hint: string;
}

export const COLUMN_DEFS: Readonly<Record<CohortColumn, ColumnDef>> = Object.freeze({
  company: { key: "company", label: "Company", sort: "company", locked: true, hint: "Startup name — opens the BlockID Dossier" },
  stage: { key: "stage", label: "Stage", sort: "stage", hint: "Growth stage (0 pre-idea … 7 mature)" },
  sector: { key: "sector", label: "Sector", sort: "sector", hint: "Industry / sector" },
  svi: { key: "svi", label: "SVI", numeric: true, sort: "svi", hint: "Canonical Startup Value Index — unweighted, comparable across cohorts, never altered by program weights or overrides" },
  weightedScore: { key: "weightedScore", label: "Program score", short: "Program", numeric: true, sort: "weightedScore", hint: "Your rubric weights over the 8 dimension scores — drives the default ranking; the SVI stays canonical" },
  confidence: { key: "confidence", label: "Confidence", short: "Conf.", numeric: true, sort: "confidence", hint: "Evidence Confidence 0–100 — how much of the score rests on verified evidence" },
  verification: { key: "verification", label: "Verified", sort: "verification", hint: "BlockID Verified level L0–L5" },
  delta: { key: "delta", label: "Δ", numeric: true, sort: "delta", hint: "SVI change since the last snapshot" },
  strongest: { key: "strongest", label: "Strongest", sort: "strongest", hint: "Highest-scoring dimension" },
  weakest: { key: "weakest", label: "Weakest", sort: "weakest", hint: "Lowest-scoring dimension" },
  gaps: { key: "gaps", label: "Gaps", numeric: true, sort: "gaps", hint: "Evidence gaps: pending dimensions + unverified material claims" },
  reviewStatus: { key: "reviewStatus", label: "Review", sort: "reviewStatus", hint: "Human review state: unreviewed → in review → reviewed" },
  reviewer: { key: "reviewer", label: "Reviewer", sort: "reviewer", hint: "Seat assigned to review this startup" },
  decision: { key: "decision", label: "Decision", sort: "decision", hint: "Your latest decision (pass / track / proceed) with conviction 1–5" },
  shortlist: { key: "shortlist", label: "Shortlist", sort: "shortlist", hint: "Shortlisted for the next stage" },
});

export const DEFAULT_COLUMNS: readonly CohortColumn[] = COHORT_COLUMNS;

export type Density = "comfortable" | "compact";

export interface SavedView {
  name: string;
  filters: CohortFilters;
  columns: CohortColumn[];
  sort?: { key: CohortSortKey; dir: SortDir };
}

export const DEFAULT_VIEW: Readonly<SavedView> = Object.freeze<SavedView>({ name: "Default", filters: {}, columns: [...DEFAULT_COLUMNS], sort: { key: "weightedScore", dir: "desc" } });

export const MAX_COMPARE = 4;
export const MAX_SAVED_VIEWS = 12;

const KEY_COLUMNS = "blockid.cohort.columns.v1";
const KEY_VIEWS = "blockid.cohort.views.v1";
const KEY_DENSITY = "blockid.cohort.density.v1";

type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void } | null | undefined;

function storage(): StorageLike {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, store: StorageLike = storage()): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown, store: StorageLike = storage()): boolean {
  try {
    store?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Pure: keep only known columns, in registry order, company always first. */
export function normaliseColumns(input: unknown): CohortColumn[] {
  const wanted = new Set(Array.isArray(input) ? input.filter((c): c is CohortColumn => typeof c === "string" && (COHORT_COLUMNS as readonly string[]).includes(c)) : []);
  wanted.add("company");
  return COHORT_COLUMNS.filter((c) => wanted.has(c));
}

export function loadColumns(store: StorageLike = storage()): CohortColumn[] {
  const stored = readJson<unknown>(KEY_COLUMNS, store);
  return stored == null ? [...DEFAULT_COLUMNS] : normaliseColumns(stored);
}

export function saveColumns(columns: readonly CohortColumn[], store: StorageLike = storage()): boolean {
  return writeJson(KEY_COLUMNS, normaliseColumns(columns), store);
}

export function loadDensity(store: StorageLike = storage()): Density {
  const v = readJson<unknown>(KEY_DENSITY, store);
  return v === "compact" ? "compact" : "comfortable";
}

export function saveDensity(d: Density, store: StorageLike = storage()): boolean {
  return writeJson(KEY_DENSITY, d, store);
}

function isSavedView(v: unknown): v is SavedView {
  return !!v && typeof v === "object" && typeof (v as SavedView).name === "string" && (v as SavedView).name.trim().length > 0;
}

/** Saved views — "Default" is always first and never stored. */
export function loadSavedViews(store: StorageLike = storage()): SavedView[] {
  const stored = readJson<unknown>(KEY_VIEWS, store);
  const list = Array.isArray(stored) ? stored.filter(isSavedView).filter((v) => v.name !== DEFAULT_VIEW.name) : [];
  return [
    { ...DEFAULT_VIEW, columns: [...DEFAULT_VIEW.columns] },
    ...list.slice(0, MAX_SAVED_VIEWS).map((v) => ({ name: v.name.slice(0, 40), filters: v.filters && typeof v.filters === "object" ? v.filters : {}, columns: normaliseColumns(v.columns), sort: v.sort })),
  ];
}

/** Pure: upsert a view by name into the stored list (Default excluded). */
export function upsertSavedView(views: readonly SavedView[], view: SavedView): SavedView[] {
  const name = view.name.trim().slice(0, 40);
  if (!name || name === DEFAULT_VIEW.name) return [...views];
  const rest = views.filter((v) => v.name !== name && v.name !== DEFAULT_VIEW.name);
  return [views[0]?.name === DEFAULT_VIEW.name ? views[0] : { ...DEFAULT_VIEW }, ...rest.slice(0, MAX_SAVED_VIEWS - 1), { ...view, name, columns: normaliseColumns(view.columns) }];
}

export function removeSavedView(views: readonly SavedView[], name: string): SavedView[] {
  return views.filter((v) => v.name !== name || v.name === DEFAULT_VIEW.name);
}

export function persistSavedViews(views: readonly SavedView[], store: StorageLike = storage()): boolean {
  return writeJson(KEY_VIEWS, views.filter((v) => v.name !== DEFAULT_VIEW.name), store);
}

/** Pure: toggle an id in the compare selection, capped at MAX_COMPARE (returns the same array when full). */
export function toggleCompare(selected: readonly number[], itemId: number, max = MAX_COMPARE): { selected: number[]; full: boolean } {
  if (selected.includes(itemId)) return { selected: selected.filter((id) => id !== itemId), full: false };
  if (selected.length >= max) return { selected: [...selected], full: true };
  return { selected: [...selected, itemId], full: false };
}
