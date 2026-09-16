// Colocated vitest for deal-flow v2 (G13-W3-T2). Pins the NEW join —
// mandate_fit_scores.project_id → startup_taxonomy / projects / svi_snapshots
// (never scores.email → account_id) — the fit floor, the filter axes
// (industry incl. secondary, business model, stage, state, tags, min SVI,
// moved ≥ 5 pts / 30 d), the three sorts, the "Unclassified" badge, archived
// projects dropped, `never_computed`, `migrated:false` before 0393, the
// no-mandate empty state, and the saved views (≤ 10, same name replaces,
// delete).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
interface Call { table: string; op: string; filters: Array<[string, unknown]>; head?: boolean; }
const state = { configured: true, tables: {} as Record<string, Row[]>, errors: {} as Record<string, { code?: string; message: string }>, calls: [] as Call[] };

function fake(table: string) {
  const c: Call = { table, op: "select", filters: [] };
  state.calls.push(c);
  const b: Record<string, unknown> = {};
  const result = () => {
    const err = state.errors[table];
    if (err) return Promise.resolve({ data: null, error: err, count: null });
    let rows = state.tables[table] ?? [];
    for (const [col, v] of c.filters) {
      if (col.startsWith("in:")) rows = rows.filter((r) => (v as unknown[]).includes(r[col.slice(3)]));
      else if (col.startsWith("eq:")) rows = rows.filter((r) => r[col.slice(3)] === v);
      else if (col.startsWith("gte:")) rows = rows.filter((r) => Number(r[col.slice(4)]) >= Number(v));
      else if (col.startsWith("lte:")) rows = rows.filter((r) => String(r[col.slice(4)]) <= String(v));
      else if (col.startsWith("is:")) rows = rows.filter((r) => (r[col.slice(3)] ?? null) === v);
    }
    return Promise.resolve({ data: c.head ? null : rows, error: null, count: rows.length });
  };
  Object.assign(b, {
    select(_cols: string, opts?: { head?: boolean }) { c.head = opts?.head === true; return b; },
    eq(col: string, v: unknown) { c.filters.push([`eq:${col}`, v]); return b; },
    in(col: string, v: unknown[]) { c.filters.push([`in:${col}`, v]); return b; },
    gte(col: string, v: unknown) { c.filters.push([`gte:${col}`, v]); return b; },
    lte(col: string, v: unknown) { c.filters.push([`lte:${col}`, v]); return b; },
    is(col: string, v: unknown) { c.filters.push([`is:${col}`, v]); return b; },
    not() { return b; },
    or() { return b; },
    order() { return b; },
    limit() { return b; },
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return result().then(ok, err); },
  });
  return b;
}
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.configured,
  getSupabaseAdmin: () => (state.configured ? { from: (t: string) => fake(t) } : null),
}));

const { prefsState } = vi.hoisted(() => ({ prefsState: { prefs: {} as Record<string, unknown>, writeOk: true } }));
vi.mock("@/lib/investor-portal", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    getInvestorPreferences: async () => (real.normalisePrefs as (p: unknown) => unknown)(prefsState.prefs),
    setInvestorPreferences: async (_u: string, patch: Record<string, unknown>) => {
      const merged = (real.normalisePrefs as (p: unknown) => Record<string, unknown>)({ ...prefsState.prefs, ...patch });
      if (prefsState.writeOk) prefsState.prefs = merged;
      return { ok: prefsState.writeOk, prefs: merged, ...(prefsState.writeOk ? {} : { reason: "db_error" }) };
    },
  };
});

import { applyDealFlowFilters, deleteView, getDealFlowV2, saveView, toDealFlowRow, type DealFlowRowV2 } from "./dealflow";
import { EMPTY_FILTERS, activeAxes, filtersFromSearchParams, filtersToQuery, mandateAsFilters, normaliseSavedViews, toggleFilterHref } from "./saved-views";

const U = "u-inv";
const MANDATE = {
  id: "m1", org_id: "o1", owner_user_id: U, label: "Seed fintech", thesis: null, is_default: true, discoverable: true, is_active: true,
  sectors_include: ["fintech"], sectors_exclude: [], business_models: ["saas_subscription"], customer_types: [], stages: ["seed"],
  cheque_min_aud: null, cheque_max_aud: null, lead_or_follow: null, ownership_target_pct: null, followon_reserve_pct: null,
  geographies: ["NSW", "anz"], revenue_min_aud: null, growth_min_pct: null, min_svi: 50, tags_include: ["esic_eligible"], tags_exclude: [], esg_constraints: [],
  risk_tolerance: null, weights: {}, created_at: "", updated_at: "",
};

function seed() {
  state.tables = {
    investor_organisation_members: [{ org_id: "o1", user_id: U }],
    investor_mandates: [MANDATE, { ...MANDATE, id: "m2", is_default: false, label: "Fund II" }],
    mandate_fit_scores: [
      { mandate_id: "m1", project_id: "p-pay", score: "100.00", reasons: ["Invests in fintech"], gaps: [], blockers: [], computed_at: "2026-09-16T16:35:00Z" },
      { mandate_id: "m1", project_id: "p-agri", score: 62, reasons: [], gaps: ["industry unclassified — founder confirmation pending"], blockers: [], computed_at: "2026-09-16T16:35:00Z" },
      { mandate_id: "m1", project_id: "p-gated", score: 0, reasons: [], gaps: [], blockers: ["svi_floor"], computed_at: "2026-09-16T16:35:00Z" },
      { mandate_id: "m1", project_id: "p-gone", score: 90, reasons: [], gaps: [], blockers: [], computed_at: "2026-09-16T16:35:00Z" },
      { mandate_id: "m2", project_id: "p-pay", score: 55, reasons: [], gaps: [], blockers: [], computed_at: "2026-09-16T16:35:00Z" },
    ],
    projects: [
      { id: "p-pay", name: "PayFlow", industry: "fintech", stage: 3, archived_at: null },
      { id: "p-agri", name: "AgriSense", industry: "agtech", stage: 2, archived_at: null },
      { id: "p-gated", name: "Gated", industry: "x", stage: 1, archived_at: null },
      { id: "p-gone", name: "Gone", industry: "x", stage: 1, archived_at: "2026-01-01" },
    ],
    startup_taxonomy: [
      { project_id: "p-pay", industry: "fintech", industry_secondary: "software_saas", business_model: "saas_subscription", customer_types: ["b2b"], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: "national", tags: ["esic_eligible"] },
    ],
    svi_snapshots: [
      { id: "s1", project_id: "p-pay", svi_total: 64, stage: 3, created_at: "2026-09-15T00:00:00Z" },
      { id: "s0", project_id: "p-pay", svi_total: 52, stage: 3, created_at: "2026-08-01T00:00:00Z" },
      { id: "s2", project_id: "p-agri", svi_total: 58, stage: 2, created_at: "2026-09-10T00:00:00Z" },
    ],
  };
  state.errors = {};
  state.calls = [];
  prefsState.prefs = { sectors: ["fintech"], stages: ["seed"], geos: ["AU"], cheque_band: "any", min_svi: 50 };
  prefsState.writeOk = true;
}

beforeEach(() => {
  state.configured = true;
  seed();
});

describe("getDealFlowV2 — the project_id join", () => {
  it("reads mandate_fit_scores for the default mandate ≥ floor 40, joins taxonomy + project + latest SVI by project_id, drops archived, sorts by fit", async () => {
    const df = await getDealFlowV2(U);
    expect(df.migrated).toBe(true);
    expect(df.mandate?.id).toBe("m1");
    expect(df.mandates.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(df.never_computed).toBe(false);
    expect(df.rows.map((r) => r.project_id)).toEqual(["p-pay", "p-agri"]);
    expect(df.total_above_floor).toBe(2);
    const pay = df.rows[0];
    expect(pay).toMatchObject({ company_name: "PayFlow", svi: 64, svi_delta_30d: 12, industry: "fintech", business_model: "saas_subscription", stage_key: "seed", hq_state: "NSW", tags: ["esic_eligible"], unclassified: false, fit: 100, reasons: ["Invests in fintech"], updated_at: "2026-09-15T00:00:00Z" });
    // no taxonomy row → Unclassified badge, stage from projects.stage
    expect(df.rows[1]).toMatchObject({ company_name: "AgriSense", unclassified: true, industry: "unclassified", stage_key: "mvp_early_revenue", svi: 58, svi_delta_30d: null, fit: 62 });
    // the join never touches scores / svi_index_snapshots
    expect(state.calls.map((c) => c.table)).not.toContain("svi_index_snapshots");
    expect(state.calls.map((c) => c.table)).not.toContain("scores");
    const fitRead = state.calls.find((c) => c.table === "mandate_fit_scores")!;
    expect(fitRead.filters).toContainEqual(["eq:mandate_id", "m1"]);
    expect(fitRead.filters).toContainEqual(["gte:score", 40]);
  });

  it("filters: min_fit 0 shows the gated row (fit 0 + blocker chip); a chosen mandate_id switches the read", async () => {
    const df = await getDealFlowV2(U, { min_fit: 0 });
    expect(df.rows.map((r) => r.project_id)).toEqual(["p-pay", "p-agri", "p-gated"]);
    expect(df.rows[2].blockers).toEqual(["svi_floor"]);
    const m2 = await getDealFlowV2(U, { mandate_id: "m2" });
    expect(m2.mandate?.id).toBe("m2");
    expect(m2.rows.map((r) => [r.project_id, r.fit])).toEqual([["p-pay", 55]]);
  });

  it("never_computed when the cron has not run for the mandate; no mandate → empty with mandates:[]; 42P01 → migrated:false; views ride along", async () => {
    state.tables.mandate_fit_scores = [];
    expect((await getDealFlowV2(U)).never_computed).toBe(true);
    state.tables.investor_mandates = [];
    prefsState.prefs = { ...prefsState.prefs, saved_views: [{ id: "abc123", name: "Seed NSW", filters: { ...EMPTY_FILTERS, stage: ["seed"] }, sort: "fit", created_at: "2026-09-16T00:00:00Z" }] };
    const none = await getDealFlowV2(U);
    expect(none).toMatchObject({ migrated: true, mandate: null, rows: [], never_computed: true });
    expect(none.views.map((v) => v.name)).toEqual(["Seed NSW"]);
    state.errors.investor_mandates = { code: "42P01", message: "relation does not exist" };
    expect((await getDealFlowV2(U)).migrated).toBe(false);
    state.configured = false;
    expect((await getDealFlowV2(U)).migrated).toBe(false);
  });
});

describe("applyDealFlowFilters (pure)", () => {
  const rows: DealFlowRowV2[] = [
    toDealFlowRow({ project_id: "a", score: 90, reasons: [], gaps: [], blockers: [], computed_at: null }, { project_id: "a", name: "A", taxonomy: { industry: "fintech", industry_secondary: null, business_model: "saas_subscription", customer_types: [], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: null, tags: ["esic_eligible"] }, svi: 70, svi_30d_ago: 60, snapshot_id: "s", snapshot_at: "2026-09-10", archived: false }),
    toDealFlowRow({ project_id: "b", score: 80, reasons: [], gaps: [], blockers: [], computed_at: null }, { project_id: "b", name: "B", taxonomy: { industry: "agtech_food", industry_secondary: "fintech", business_model: "hardware_devices", customer_types: [], stage_key: "series_a", hq_state: "VIC", hq_country: "AU", geo_scope: null, tags: [] }, svi: 80, svi_30d_ago: 78, snapshot_id: "s", snapshot_at: "2026-09-12", archived: false }),
    toDealFlowRow({ project_id: "c", score: 45, reasons: [], gaps: [], blockers: [], computed_at: null }, { project_id: "c", name: "C", taxonomy: null, svi: null, svi_30d_ago: null, snapshot_id: null, snapshot_at: null, archived: false }),
  ];
  const ids = (f: Partial<typeof EMPTY_FILTERS>) => applyDealFlowFilters(rows, { ...EMPTY_FILTERS, ...f }).map((r) => r.project_id);

  it("each axis narrows (industry matches secondary too); sorts by fit / svi / updated", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
    expect(ids({ industry: ["fintech"] })).toEqual(["a", "b"]);
    expect(ids({ business_model: ["hardware_devices"] })).toEqual(["b"]);
    expect(ids({ stage: ["seed"] })).toEqual(["a"]);
    expect(ids({ state: ["VIC"] })).toEqual(["b"]);
    expect(ids({ tags: ["esic_eligible"] })).toEqual(["a"]);
    expect(ids({ min_svi: 75 })).toEqual(["b"]);
    expect(ids({ moved: true })).toEqual(["a"]);
    expect(ids({ sort: "svi" })).toEqual(["b", "a", "c"]);
    expect(ids({ sort: "updated" })).toEqual(["b", "a", "c"]);
    expect(rows[2]).toMatchObject({ unclassified: true, stage_key: "idea", company_name: "C" });
  });
});

describe("saved views", () => {
  it("saveView appends (≤ 10), same name replaces, deleteView removes; the list survives normalisePrefs", async () => {
    const f = { ...EMPTY_FILTERS, industry: ["fintech"], stage: ["seed"], min_fit: 60 };
    const a = await saveView(U, { name: "Seed fintech", filters: f });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.view.id).toMatch(/^[a-z0-9]{6,16}$/);
    expect(a.views).toHaveLength(1);
    expect(prefsState.prefs.sectors).toEqual(["fintech"]); // other prefs untouched
    const b = await saveView(U, { name: "seed FINTECH", filters: { ...f, min_fit: 70 } });
    expect(b.ok && b.views).toHaveLength(1);
    expect(b.ok && b.views[0].filters.min_fit).toBe(70);
    expect(b.ok && b.view.id).toBe(a.view.id);
    for (let i = 0; i < 9; i += 1) expect((await saveView(U, { name: `v${i}`, filters: f })).ok).toBe(true);
    const over = await saveView(U, { name: "one too many", filters: f });
    expect(over).toMatchObject({ ok: false, reason: "limit_reached" });
    expect(over.views).toHaveLength(10);
    const del = await deleteView(U, a.view.id);
    expect(del.ok).toBe(true);
    expect(del.views.find((v) => v.id === a.view.id)).toBeUndefined();
    expect((await deleteView(U, "nope")).ok).toBe(false);
    prefsState.writeOk = false;
    expect(await saveView(U, { name: "x", filters: f })).toMatchObject({ ok: false, reason: "db_error" });
  });

  it("normaliseSavedViews drops invalid entries and duplicates, caps at 10", () => {
    const good = { id: "abc123", name: "n", filters: EMPTY_FILTERS, sort: "fit", created_at: "t" };
    expect(normaliseSavedViews([good, good, { id: "bad!", name: "x" }, "junk"])).toHaveLength(1);
    expect(normaliseSavedViews(Array.from({ length: 12 }, (_, i) => ({ ...good, id: `id${i}00000` }))).length).toBe(10);
    expect(normaliseSavedViews(null)).toEqual([]);
  });
});

describe("URL ⇄ filters (pure)", () => {
  it("round-trips, drops unknown values axis by axis, and never throws on junk", () => {
    const f = filtersFromSearchParams({ industry: "fintech,ai_ml,bogus", model: "saas_subscription", stage: ["seed", "series_a"], state: "nsw,vic", tags: "regulated", fit: "60", svi: "abc", moved: "1", sort: "svi", mandate: "11111111-1111-4111-8111-111111111111" });
    expect(f).toEqual({ industry: ["fintech", "ai_ml"], business_model: ["saas_subscription"], stage: ["seed", "series_a"], state: ["NSW", "VIC"], tags: ["regulated"], min_fit: 60, moved: true, sort: "svi", mandate_id: "11111111-1111-4111-8111-111111111111" });
    const q = filtersToQuery(f);
    expect(filtersFromSearchParams(Object.fromEntries(new URLSearchParams(q)))).toEqual(f);
    expect(filtersToQuery(EMPTY_FILTERS)).toBe("");
    expect(filtersFromSearchParams({ fit: "500", mandate: "not-a-uuid" })).toEqual(EMPTY_FILTERS);
    expect(activeAxes(f)).toEqual(["industry", "business_model", "stage", "state", "tags", "min_fit", "moved"]);
    expect(toggleFilterHref("/workspace/investor/dealflow", EMPTY_FILTERS, "stage", "seed")).toBe("/workspace/investor/dealflow?stage=seed");
    expect(toggleFilterHref("/workspace/investor/dealflow", { ...EMPTY_FILTERS, stage: ["seed"] }, "stage", "seed")).toBe("/workspace/investor/dealflow");
  });

  it("mandateAsFilters = the 'My mandate' default view (states only, wide geos dropped)", () => {
    expect(mandateAsFilters(MANDATE)).toEqual({ industry: ["fintech"], business_model: ["saas_subscription"], stage: ["seed"], state: ["NSW"], tags: ["esic_eligible"], min_svi: 50, mandate_id: "m1", sort: "fit" });
  });
});
