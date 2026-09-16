// Colocated vitest for /api/cron/mandate-fit-refresh (G13-W3-T2). Pins:
// the Bearer CRON_SECRET gate (401 unset / mismatched / lowercase scheme),
// POST === GET, `?dry=1` → dryRun, 503 on supabase_unavailable, 500 on a
// failed run — and, through a supabase fake, the pass itself: active
// mandates × visible projects (public_index ∪ consent ≥ reports_shared ∪
// scores.investor_visible via svi_accounts) → scoreFit → upsert batches on
// (mandate_id, project_id) with reasons / gaps / blockers / breakdown,
// inactive mandates' rows deleted, archived projects skipped, `migrated:
// false` before 0393, and dry-run writing nothing.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
interface Call { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]>; opts?: unknown; }
const state = {
  configured: true,
  tables: {} as Record<string, Row[]>,
  errors: {} as Record<string, { code?: string; message: string }>,
  calls: [] as Call[],
};

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
      else if (col.startsWith("is:")) rows = rows.filter((r) => (r[col.slice(3)] ?? null) === v);
      else if (col.startsWith("not:")) rows = rows.filter((r) => (r[col.slice(4)] ?? null) !== null);
      else if (col.startsWith("lte:")) rows = rows.filter((r) => String(r[col.slice(4)]) <= String(v));
    }
    if (c.op === "delete") return Promise.resolve({ data: null, error: null, count: rows.length });
    return Promise.resolve({ data: rows, error: null, count: rows.length });
  };
  Object.assign(b, {
    select() { return b; },
    upsert(p: unknown, opts: unknown) { c.op = "upsert"; c.payload = p; c.opts = opts; return b; },
    delete(opts: unknown) { c.op = "delete"; c.opts = opts; return b; },
    eq(col: string, v: unknown) { c.filters.push([`eq:${col}`, v]); return b; },
    in(col: string, v: unknown[]) { c.filters.push([`in:${col}`, v]); return b; },
    is(col: string, v: unknown) { c.filters.push([`is:${col}`, v]); return b; },
    not(col: string) { c.filters.push([`not:${col}`, null]); return b; },
    lte(col: string, v: unknown) { c.filters.push([`lte:${col}`, v]); return b; },
    lt(col: string, v: unknown) { c.filters.push([`lt:${col}`, v]); return b; },
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

import { GET, POST, dynamic, maxDuration } from "./route";

const MANDATE = {
  id: "m-fintech", org_id: "o1", owner_user_id: "u1", label: "Seed fintech", thesis: null, is_default: true, discoverable: true, is_active: true,
  sectors_include: ["fintech"], sectors_exclude: [], business_models: [], customer_types: [], stages: ["seed"],
  cheque_min_aud: null, cheque_max_aud: null, lead_or_follow: null, ownership_target_pct: null, followon_reserve_pct: null,
  geographies: ["NSW"], revenue_min_aud: null, growth_min_pct: null, min_svi: 50, tags_include: [], tags_exclude: [], esg_constraints: [],
  risk_tolerance: null, weights: {}, created_at: "", updated_at: "",
};

function seed() {
  state.tables = {
    investor_mandates: [MANDATE, { ...MANDATE, id: "m-old", is_active: false }],
    projects: [
      { id: "p-pay", name: "PayFlow", industry: "fintech", stage: 3, archived_at: null, public_index: true },
      { id: "p-agri", name: "AgriSense", industry: "agtech", stage: 2, archived_at: null, public_index: false },
      { id: "p-gone", name: "Gone", industry: "x", stage: 1, archived_at: "2026-01-01", public_index: true },
      { id: "p-private", name: "Private", industry: "x", stage: 1, archived_at: null, public_index: false },
    ],
    evaluations: [{ project_id: "p-agri", consent_tier: "reports_shared" }, { project_id: "p-private", consent_tier: "none" }],
    scores: [{ email: "Gone@Example.com", investor_visible: true }],
    svi_accounts: [{ email: "gone@example.com", project_id: "p-gone" }],
    startup_taxonomy: [
      { project_id: "p-pay", industry: "fintech", industry_secondary: null, business_model: "transactional_fintech", customer_types: ["b2b"], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: "national", tags: [] },
    ],
    svi_snapshots: [
      { id: "s-pay-new", project_id: "p-pay", svi_total: 64, stage: 3, created_at: "2026-09-15T00:00:00Z" },
      { id: "s-pay-old", project_id: "p-pay", svi_total: 40, stage: 3, created_at: "2026-08-01T00:00:00Z" },
      { id: "s-agri", project_id: "p-agri", svi_total: 58, stage: 2, created_at: "2026-09-10T00:00:00Z" },
    ],
  };
  state.errors = {};
  state.calls = [];
}

function req(url = "http://localhost/api/cron/mandate-fit-refresh", auth?: string) {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}
const upserts = () => state.calls.filter((c) => c.table === "mandate_fit_scores" && c.op === "upsert");

describe("mandate-fit-refresh route", () => {
  const orig = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    state.configured = true;
    seed();
  });
  afterEach(() => {
    if (orig === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = orig;
  });

  it("exports force-dynamic + 300 s maxDuration and POST === GET", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
    expect(POST).toBe(GET);
  });

  it("401 without the bearer secret, on a mismatch, on a lowercase scheme, and when CRON_SECRET is unset", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req(undefined, "Bearer nope"))).status).toBe(401);
    expect((await GET(req(undefined, "bearer s3cret"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req(undefined, "Bearer s3cret"))).status).toBe(401);
    expect(upserts()).toHaveLength(0);
  });

  it("scores every active mandate × visible project on (mandate_id, project_id): public_index ∪ consent ∪ scores opt-in, archived skipped, inactive rows deleted", async () => {
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: false, migrated: true, mandates: 1, projects: 2, pairs: 2, upserts: 2, batches: 1, errors: 0, deleted_inactive: 0 });
    // W3 review P1: after a completed pass, rows not recomputed this run
    // (revoked consent / unlisted / archived) are swept for the active mandates.
    const sweep = state.calls.find((c) => c.table === "mandate_fit_scores" && c.op === "delete" && c.filters.some(([k]) => k === "lt:computed_at"));
    expect(sweep).toBeTruthy();
    expect(sweep!.filters).toContainEqual(["in:mandate_id", ["m-fintech"]]);
    expect(body.deleted_stale).toBe(0);
    expect(typeof body.ms).toBe("number");

    const up = upserts();
    expect(up).toHaveLength(1);
    expect(up[0].opts).toEqual({ onConflict: "mandate_id,project_id" });
    const rows = up[0].payload as Row[];
    expect(rows.map((r) => r.project_id).sort()).toEqual(["p-agri", "p-pay"]);
    const pay = rows.find((r) => r.project_id === "p-pay")!;
    expect(pay).toMatchObject({ mandate_id: "m-fintech", score: 100, blockers: [], snapshot_id: "s-pay-new" });
    expect(pay.reasons).toContain("Invests in fintech");
    expect(pay.breakdown).toEqual(expect.arrayContaining([{ axis: "industry", weight: 25, points: 25 }]));
    expect(typeof pay.computed_at).toBe("string");
    // AgriSense: no taxonomy row (unclassified, stage fallback from projects.stage=2 → mvp_early_revenue, adjacent to seed), SVI 58 ≥ 50
    const agri = rows.find((r) => r.project_id === "p-agri")!;
    expect(agri.blockers).toEqual([]);
    expect(agri.gaps).toContain("industry unclassified — founder confirmation pending");
    expect(agri.score).toBeLessThan(100);
    expect(agri.snapshot_id).toBe("s-agri");

    // the inactive mandate's rows are deleted
    const del = state.calls.find((c) => c.table === "mandate_fit_scores" && c.op === "delete")!;
    expect(del.filters).toContainEqual(["in:mandate_id", ["m-old"]]);
    // the private project never reached the scorer
    expect(rows.find((r) => r.project_id === "p-private")).toBeUndefined();
    expect(rows.find((r) => r.project_id === "p-gone")).toBeUndefined();
  });

  it("?dry=1 scores everything and writes nothing", async () => {
    const res = await GET(req("http://localhost/api/cron/mandate-fit-refresh?dry=1", "Bearer s3cret"));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: true, pairs: 2, upserts: 2 });
    expect(upserts()).toHaveLength(0);
    expect(state.calls.find((c) => c.table === "mandate_fit_scores" && c.op === "delete")).toBeUndefined();
  });

  it("batches upserts at the configured size (500) — 1 mandate × 2 projects is one batch; a failing upsert → 500 + error", async () => {
    state.errors.mandate_fit_scores = { message: "boom" };
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, error: "upsert_failed", errors: 2 });
  });

  it("before 0393: migrated:false, ok, nothing written", async () => {
    state.errors.investor_mandates = { code: "42P01", message: 'relation "public.investor_mandates" does not exist' };
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, migrated: false, mandates: 0, upserts: 0 });
    expect(upserts()).toHaveLength(0);
  });

  it("503 when Supabase is unavailable", async () => {
    state.configured = false;
    const res = await GET(req(undefined, "Bearer s3cret"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ ok: false, error: "supabase_unavailable" });
  });
});
