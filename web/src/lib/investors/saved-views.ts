// Deal-flow filters + saved views — the pure part (G13-W3-T2, BA spec §B.8
// "Filters / saved views", §B.10 T6). Views live in
// `app_users.investor_prefs.saved_views[]` (jsonb, ≤ 10 per user,
// `{id, name, filters, sort, created_at}`) and are URL-serialised so a view
// is shareable inside the org (`?industry=fintech,ai_ml&stage=seed&fit=60`).
//
// No server-only import: investor-portal.ts `normalisePrefs()` carries the
// list through on every prefs write, the dealflow page parses searchParams
// with it, and the client filter bar builds hrefs from it.

import { z } from "zod";
import { BUSINESS_MODELS, CANONICAL_STAGES, HQ_STATES, INDUSTRIES, TAGS } from "@/lib/taxonomy/startup-taxonomy";

export const SAVED_VIEWS_MAX = 10;
export const SAVED_VIEW_NAME_MAX = 40;

export const DEALFLOW_SORTS = ["fit", "svi", "updated"] as const;
export type DealFlowSort = (typeof DEALFLOW_SORTS)[number];

export const EMPTY_FILTERS: DealFlowFiltersV2 = Object.freeze({
  industry: [],
  business_model: [],
  stage: [],
  state: [],
  tags: [],
  sort: "fit",
}) as DealFlowFiltersV2;

const list = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).max(32).default([]);
const tuple = <T extends readonly string[]>(v: T) => v as unknown as [T[number], ...T[number][]];

/** The deal-flow filter axes (§B.8): every list is an OR within the axis, AND across axes. */
export const dealFlowFiltersSchema = z.object({
  industry: list(tuple(INDUSTRIES)),
  business_model: list(tuple(BUSINESS_MODELS)),
  stage: list(tuple(CANONICAL_STAGES)),
  state: list(tuple(HQ_STATES)),
  tags: list(tuple(TAGS)),
  min_fit: z.number().int().min(0).max(100).optional(),
  min_svi: z.number().int().min(0).max(100).optional(),
  moved: z.boolean().optional(),
  mandate_id: z.uuid().optional(),
  sort: z.enum(DEALFLOW_SORTS).default("fit"),
});

/**
 * `min_fit` = fit ≥ N (undefined → FIT_FLOOR_V2); `min_svi` = SVI ≥ N;
 * `moved` = "moved ≥ 5 pts in 30 d"; `mandate_id` = which mandate's scores
 * (undefined → the default mandate); `sort` = fit | svi | updated.
 */
export type DealFlowFiltersV2 = z.infer<typeof dealFlowFiltersSchema>;

export const savedViewSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,16}$/),
  name: z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX),
  filters: dealFlowFiltersSchema,
  sort: z.enum(DEALFLOW_SORTS).default("fit"),
  created_at: z.string(),
});
export type SavedView = z.infer<typeof savedViewSchema>;

/** Body of POST /api/investor/dealflow/views — the id + created_at are server-assigned. */
export const saveViewBodySchema = z.object({
  name: z.string().trim().min(1).max(SAVED_VIEW_NAME_MAX),
  filters: dealFlowFiltersSchema,
  sort: z.enum(DEALFLOW_SORTS).optional(),
});

/** Untrusted jsonb → at most SAVED_VIEWS_MAX valid views (invalid entries dropped, never thrown). */
export function normaliseSavedViews(v: unknown): SavedView[] {
  if (!Array.isArray(v)) return [];
  const out: SavedView[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const r = savedViewSchema.safeParse(item);
    if (!r.success || seen.has(r.data.id)) continue;
    seen.add(r.data.id);
    out.push(r.data);
    if (out.length >= SAVED_VIEWS_MAX) break;
  }
  return out;
}

/** Stable short id for a new view (not a secret — just unique within the user's list). */
export function newViewId(existing: readonly SavedView[], rand: () => number = Math.random): string {
  const ids = new Set(existing.map((v) => v.id));
  for (let i = 0; i < 20; i += 1) {
    const id = rand().toString(36).slice(2, 10).padEnd(8, "0");
    if (!ids.has(id)) return id;
  }
  return `v${Date.now().toString(36)}`;
}

// ─── URL ⇄ filters ───────────────────────────────────────────────────────────

/** Keep only the values of a vocabulary (typed narrowing). */
function keep<T extends readonly string[]>(values: readonly string[], vals: T): T[number][] {
  return values.filter((x): x is T[number] => (vals as readonly string[]).includes(x));
}

type SP = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function csv(v: string | string[] | undefined): string[] {
  const raw = Array.isArray(v) ? v : v ? [v] : [];
  return raw.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
}
function int(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
}

/** Parse `searchParams` → filters. Unknown values are dropped axis by axis (never a 400 on a page). */
export function filtersFromSearchParams(sp: SP): DealFlowFiltersV2 {
  const raw = {
    industry: csv(sp.industry),
    business_model: csv(sp.model ?? sp.business_model),
    stage: csv(sp.stage),
    state: csv(sp.state).map((s) => (s.toLowerCase() === "national" ? "national" : s.toUpperCase())),
    tags: csv(sp.tags),
    min_fit: int(first(sp.fit) ?? first(sp.min_fit)),
    min_svi: int(first(sp.svi) ?? first(sp.min_svi)),
    moved: first(sp.moved) === "1" || first(sp.moved) === "true" ? true : undefined,
    mandate_id: first(sp.mandate) ?? first(sp.mandate_id),
    sort: first(sp.sort),
  };
  const out: DealFlowFiltersV2 = {
    industry: keep(raw.industry, INDUSTRIES),
    business_model: keep(raw.business_model, BUSINESS_MODELS),
    stage: keep(raw.stage, CANONICAL_STAGES),
    state: keep(raw.state, HQ_STATES),
    tags: keep(raw.tags, TAGS),
    sort: (DEALFLOW_SORTS as readonly string[]).includes(raw.sort ?? "") ? (raw.sort as DealFlowSort) : "fit",
  };
  if (raw.min_fit !== undefined && raw.min_fit >= 0 && raw.min_fit <= 100) out.min_fit = raw.min_fit;
  if (raw.min_svi !== undefined && raw.min_svi >= 0 && raw.min_svi <= 100) out.min_svi = raw.min_svi;
  if (raw.moved) out.moved = true;
  if (raw.mandate_id && z.uuid().safeParse(raw.mandate_id).success) out.mandate_id = raw.mandate_id;
  return out;
}

/** Filters → query string (no leading `?`; empty when nothing is set). */
export function filtersToQuery(f: Partial<DealFlowFiltersV2>): string {
  const p = new URLSearchParams();
  if (f.industry?.length) p.set("industry", f.industry.join(","));
  if (f.business_model?.length) p.set("model", f.business_model.join(","));
  if (f.stage?.length) p.set("stage", f.stage.join(","));
  if (f.state?.length) p.set("state", f.state.join(","));
  if (f.tags?.length) p.set("tags", f.tags.join(","));
  if (typeof f.min_fit === "number") p.set("fit", String(f.min_fit));
  if (typeof f.min_svi === "number") p.set("svi", String(f.min_svi));
  if (f.moved) p.set("moved", "1");
  if (f.mandate_id) p.set("mandate", f.mandate_id);
  if (f.sort && f.sort !== "fit") p.set("sort", f.sort);
  return p.toString();
}

/** Toggle one value on a list axis and return the new href for the deal-flow page. */
export function toggleFilterHref(base: string, f: DealFlowFiltersV2, axis: "industry" | "business_model" | "stage" | "state" | "tags", value: string): string {
  const cur = f[axis] as string[];
  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  const q = filtersToQuery({ ...f, [axis]: next } as DealFlowFiltersV2);
  return q ? `${base}?${q}` : base;
}

/** True when any axis is set (drives the "Save view" affordance and the GA4 `dealflow_filter_applied` axis list). */
export function activeAxes(f: DealFlowFiltersV2): string[] {
  const out: string[] = [];
  if (f.industry.length) out.push("industry");
  if (f.business_model.length) out.push("business_model");
  if (f.stage.length) out.push("stage");
  if (f.state.length) out.push("state");
  if (f.tags.length) out.push("tags");
  if (typeof f.min_fit === "number") out.push("min_fit");
  if (typeof f.min_svi === "number") out.push("min_svi");
  if (f.moved) out.push("moved");
  return out;
}

/** The default "My mandate" view = the mandate's own axes as filters (§B.8). */
export function mandateAsFilters(m: { id: string; sectors_include: readonly string[]; business_models: readonly string[]; stages: readonly string[]; geographies: readonly string[]; tags_include: readonly string[]; min_svi: number | null }): DealFlowFiltersV2 {
  return {
    industry: keep(m.sectors_include, INDUSTRIES),
    business_model: keep(m.business_models, BUSINESS_MODELS),
    stage: keep(m.stages, CANONICAL_STAGES),
    state: keep(m.geographies, HQ_STATES),
    tags: keep(m.tags_include, TAGS),
    ...(typeof m.min_svi === "number" ? { min_svi: m.min_svi } : {}),
    mandate_id: m.id,
    sort: "fit",
  };
}
