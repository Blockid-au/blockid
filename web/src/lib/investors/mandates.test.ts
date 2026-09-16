// Colocated vitest for the mandates lib (G13-W3-T2). Pins: the 7-section
// Zod (vocab = taxonomy, unclassified never selectable, cheque range, no
// include∩exclude, weights sum 100, thesis 280), plan limits (Scout 1 /
// Firm 3 / Program 10, plans.usage_limits.mandates override), the personal
// org bootstrap (one per user + seat row), list (owner ∪ seat orgs, 42P01 →
// migrated:false), upsert (create with limit, update ownership, single
// default, prefs mirror written only for the default mandate, audit
// `mandate.saved` with field names only) and the one-release read-through
// (legacyPrefsToDraft crosswalks free-text sectors + StageBands).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
interface Captured { table: string; op: string | null; payload: unknown; filters: Array<[string, unknown]>; }
interface Queued { table: string; op?: string; data?: unknown; error?: unknown; }

const state = { configured: true, queue: [] as Queued[], calls: [] as Captured[] };

function next(table: string, op: string | null) {
  let idx = state.queue.findIndex((q) => q.table === table && (!q.op || q.op === op));
  if (idx === -1) idx = state.queue.findIndex((q) => q.table === table && !q.op);
  if (idx === -1) return { data: null, error: null };
  const [q] = state.queue.splice(idx, 1);
  return { data: q.data ?? null, error: q.error ?? null };
}

function builder(table: string) {
  const c: Captured = { table, op: null, payload: null, filters: [] };
  state.calls.push(c);
  const b: Record<string, unknown> = {};
  const chain = () => b;
  const resolve = () => Promise.resolve(next(table, c.op));
  Object.assign(b, {
    select(cols: string) { if (!c.op) c.op = "select"; c.filters.push(["select", cols]); return b; },
    insert(p: unknown) { c.op = "insert"; c.payload = p; return b; },
    update(p: unknown) { c.op = "update"; c.payload = p; return b; },
    upsert(p: unknown) { c.op = "upsert"; c.payload = p; return b; },
    eq(col: string, v: unknown) { c.filters.push([col, v]); return b; },
    neq(col: string, v: unknown) { c.filters.push([`neq:${col}`, v]); return b; },
    or(f: string) { c.filters.push(["or", f]); return b; },
    order: chain, limit: chain,
    maybeSingle: resolve, single: resolve,
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return resolve().then(ok, err); },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.configured,
  getSupabaseAdmin: () => (state.configured ? { from: (t: string) => builder(t) } : null),
}));

const { auditMock, planMock, setPrefsMock, setDiscMock, getPrefsMock } = vi.hoisted(() => ({
  auditMock: vi.fn(async () => ({ id: 1n, curr_hash: "h" })),
  planMock: vi.fn(async (): Promise<null | { usage_limits: Record<string, number> }> => null),
  setPrefsMock: vi.fn(async () => ({ ok: true, prefs: {} })),
  setDiscMock: vi.fn(async (_u: string, on: boolean) => ({ ok: true, discoverable: on })),
  getPrefsMock: vi.fn(async () => ({ sectors: [], stages: ["any"], geos: ["AU"], cheque_band: "any", min_svi: null, updated_at: null })),
}));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));
vi.mock("@/lib/plans-db", () => ({ getPlanCached: (id: string) => planMock(id) }));
vi.mock("@/lib/investor-portal", () => ({
  FIRM_MAX_LEN: 80,
  THESIS_MAX_LEN: 200,
  getInvestorPreferences: () => getPrefsMock(),
  setInvestorPreferences: (u: string, p: unknown) => setPrefsMock(u as never, p as never),
  setInvestorDiscoverable: (u: string, on: boolean) => setDiscMock(u, on),
}));

import {
  MANDATE_INDUSTRIES,
  MANDATE_LIMIT_BY_TIER,
  MANDATE_SECTIONS,
  canEditWeights,
  changedFields,
  getOrCreatePersonalOrg,
  legacyPrefsToDraft,
  listMandates,
  mandateDraftFor,
  mandateFromRow,
  mandateInputSchema,
  mandateLimitFor,
  mandateToLegacyPrefs,
  sectionsFilled,
  stageKeyToBand,
  upsertMandate,
} from "./mandates";

const USER = { id: "11111111-1111-4111-8111-111111111111", plan: "investor_angel", evaluator: true };
const MID = "22222222-2222-4222-8222-222222222222";
const OID = "33333333-3333-4333-8333-333333333333";

function mandateRow(over: Row = {}): Row {
  return {
    id: MID, org_id: OID, owner_user_id: USER.id, label: "Sydney Angels", thesis: "Pre-seed B2B", is_default: true, discoverable: true, is_active: true,
    sectors_include: ["fintech"], sectors_exclude: [], business_models: [], customer_types: ["b2b"], stages: ["seed"],
    cheque_min_aud: "50000.00", cheque_max_aud: "250000.00", lead_or_follow: "both", ownership_target_pct: null, followon_reserve_pct: null,
    geographies: ["NSW"], revenue_min_aud: null, growth_min_pct: null, min_svi: 50, tags_include: [], tags_exclude: [], esg_constraints: [],
    risk_tolerance: null, weights: {}, created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", ...over,
  };
}
const calls = (table: string, op?: string) => state.calls.filter((c) => c.table === table && (!op || c.op === op));

beforeEach(() => {
  state.configured = true;
  state.queue = [];
  state.calls = [];
  auditMock.mockClear();
  planMock.mockReset().mockResolvedValue(null);
  setPrefsMock.mockClear();
  setDiscMock.mockClear();
  getPrefsMock.mockReset().mockResolvedValue({ sectors: [], stages: ["any"], geos: ["AU"], cheque_band: "any", min_svi: null, updated_at: null });
});

describe("mandateInputSchema — 7 sections", () => {
  it("accepts a minimal identity-only body and defaults every other section to 'any'", () => {
    const r = mandateInputSchema.safeParse({ label: " Sydney Angels " });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.label).toBe("Sydney Angels");
    expect(r.data).toMatchObject({ kind: "angel", thesis: null, discoverable: false, sectors_include: [], stages: [], geographies: [], min_svi: null, weights: {} });
    expect(MANDATE_SECTIONS).toHaveLength(7);
  });

  it("vocabulary is the taxonomy — unclassified and legacy slugs are rejected", () => {
    expect(mandateInputSchema.safeParse({ label: "x", sectors_include: ["fintech", "climate_cleantech"] }).success).toBe(true);
    expect(mandateInputSchema.safeParse({ label: "x", sectors_include: ["unclassified"] }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", sectors_include: ["saas"] }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", stages: ["pre_seed"] }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", stages: ["seed", "series_a"] }).success).toBe(true);
    expect(mandateInputSchema.safeParse({ label: "x", geographies: ["NSW", "anz"] }).success).toBe(true);
    expect(mandateInputSchema.safeParse({ label: "x", geographies: ["AU"] }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", tags_include: ["female_founded"], esg_constraints: ["no_fossil"], risk_tolerance: "high" }).success).toBe(true);
    expect(MANDATE_INDUSTRIES).not.toContain("unclassified");
  });

  it("dedupes chips, trims, and rejects include∩exclude, a reversed cheque range and an over-long thesis", () => {
    const ok = mandateInputSchema.safeParse({ label: "x", sectors_include: ["fintech", "fintech"], tags_include: ["regulated", "regulated"] });
    expect(ok.success && ok.data.sectors_include).toEqual(["fintech"]);
    expect(mandateInputSchema.safeParse({ label: "x", sectors_include: ["fintech"], sectors_exclude: ["fintech"] }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", tags_include: ["regulated"], tags_exclude: ["regulated"] }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", cheque_min_aud: 500_000, cheque_max_aud: 100_000 }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", thesis: "t".repeat(281) }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "" }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", min_svi: 101 }).success).toBe(false);
    expect(mandateInputSchema.safeParse({ label: "x", min_svi: 54.5 }).success).toBe(false);
  });

  it("weights: null / {} → {}, a valid override is kept, an invalid sum or axis is rejected", () => {
    expect(mandateInputSchema.safeParse({ label: "x", weights: null }).success).toBe(true);
    const full = mandateInputSchema.safeParse({ label: "x", weights: { industry: 40, business_model: 0, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 } });
    expect(full.success && full.data.weights).toEqual({ industry: 40, business_model: 0, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 });
    const bad = mandateInputSchema.safeParse({ label: "x", weights: { industry: 90 } });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(JSON.stringify(bad.error.issues)).toContain("sum to 100");
    expect(mandateInputSchema.safeParse({ label: "x", weights: { sector: 25 } }).success).toBe(false);
  });
});

describe("plan limits", () => {
  it("Scout 1 / Firm 3 / Program 10 by tier; plans.usage_limits.mandates wins when present; ≥ 9999 = unlimited", async () => {
    expect(MANDATE_LIMIT_BY_TIER).toMatchObject({ angel: 1, advisor: 3, vc_small: 10 });
    expect(await mandateLimitFor("investor_angel")).toBe(1);
    expect(await mandateLimitFor("investor_advisor")).toBe(3);
    expect(await mandateLimitFor("investor_vc_small")).toBe(10);
    expect(await mandateLimitFor("founder_free")).toBe(1);
    planMock.mockResolvedValueOnce({ usage_limits: { mandates: 5 } });
    expect(await mandateLimitFor("investor_angel")).toBe(5);
    planMock.mockResolvedValueOnce({ usage_limits: { mandates: 9999 } });
    expect(await mandateLimitFor("investor_angel")).toBe(Number.MAX_SAFE_INTEGER);
    planMock.mockRejectedValueOnce(new Error("plans down"));
    expect(await mandateLimitFor("investor_vc_small")).toBe(10);
  });

  it("weights (section 7) are Program and above", () => {
    expect(canEditWeights("investor_angel")).toBe(false);
    expect(canEditWeights("investor_advisor")).toBe(false);
    expect(canEditWeights("investor_vc_small")).toBe(true);
    expect(canEditWeights("investor_vc_ent")).toBe(true);
  });
});

describe("getOrCreatePersonalOrg", () => {
  it("returns the existing personal org (and syncs its name / kind)", async () => {
    state.queue.push({ table: "investor_organisations", op: "select", data: { id: OID, slug: "old", name: "Old", kind: "angel", owner_user_id: USER.id, is_personal: true } });
    const org = await getOrCreatePersonalOrg(USER.id, { name: "Sydney Angels", kind: "vc" });
    expect(org).toMatchObject({ id: OID, name: "Sydney Angels", kind: "vc", is_personal: true });
    const upd = calls("investor_organisations", "update")[0];
    expect(upd.payload).toEqual({ name: "Sydney Angels", kind: "vc" });
    expect(calls("investor_organisations", "insert")).toHaveLength(0);
  });

  it("creates it once with owner_user_id + is_personal and a seat row", async () => {
    state.queue.push({ table: "investor_organisations", op: "select", data: null });
    state.queue.push({ table: "investor_organisations", op: "insert", data: { id: OID, slug: "sydney-angels-11111111", name: "Sydney Angels", kind: "angel", owner_user_id: USER.id, is_personal: true } });
    const org = await getOrCreatePersonalOrg(USER.id, { name: "Sydney Angels" });
    expect(org?.id).toBe(OID);
    const ins = calls("investor_organisations", "insert")[0].payload as Row;
    expect(ins).toMatchObject({ owner_user_id: USER.id, is_personal: true, name: "Sydney Angels", kind: "angel" });
    expect(String(ins.slug)).toMatch(/^sydney-angels-11111111$/);
    const seat = calls("investor_organisation_members", "upsert")[0].payload as Row;
    expect(seat).toEqual({ org_id: OID, user_id: USER.id, role: "investment_partner" });
  });

  it("returns null (no throw, no noise) when 0393 is not applied", async () => {
    state.queue.push({ table: "investor_organisations", op: "select", error: { code: "42P01", message: 'relation "public.investor_organisations" does not exist' } });
    expect(await getOrCreatePersonalOrg(USER.id)).toBeNull();
  });
});

describe("listMandates", () => {
  it("unions owned mandates and the user's seat orgs, default first; numerics normalised", async () => {
    state.queue.push({ table: "investor_organisation_members", data: [{ org_id: OID }, { org_id: "o2" }] });
    state.queue.push({ table: "investor_mandates", data: [mandateRow(), mandateRow({ id: "m2", is_default: false, label: "Fund II", org_id: "o2", owner_user_id: "someone-else" })] });
    const list = await listMandates(USER.id);
    expect(list.migrated).toBe(true);
    expect(list.mandates.map((m) => m.id)).toEqual([MID, "m2"]);
    expect(list.primary?.id).toBe(MID);
    expect(list.primary?.cheque_min_aud).toBe(50_000);
    expect(list.primary?.min_svi).toBe(50);
    const q = calls("investor_mandates", "select")[0];
    expect(q.filters).toContainEqual(["or", `owner_user_id.eq.${USER.id},org_id.in.(${OID},o2)`]);
    expect(q.filters).toContainEqual(["is_active", true]);
  });

  it("42P01 → migrated:false; empty → primary null", async () => {
    state.queue.push({ table: "investor_mandates", error: { code: "42P01", message: "relation does not exist" } });
    expect(await listMandates(USER.id)).toEqual({ migrated: false, mandates: [], primary: null });
    state.queue.push({ table: "investor_mandates", data: [] });
    expect(await listMandates(USER.id)).toEqual({ migrated: true, mandates: [], primary: null });
    state.configured = false;
    expect((await listMandates(USER.id)).migrated).toBe(false);
  });
});

describe("upsertMandate", () => {
  const INPUT = mandateInputSchema.parse({ label: "Sydney Angels", thesis: "Pre-seed B2B", discoverable: true, sectors_include: ["fintech"], stages: ["seed"], geographies: ["NSW"], min_svi: 50, cheque_min_aud: 50_000, cheque_max_aud: 250_000, lead_or_follow: "both", customer_types: ["b2b"] });

  function queueCreate() {
    state.queue.push({ table: "investor_mandates", op: "select", data: [] }); // list
    state.queue.push({ table: "investor_organisations", op: "select", data: { id: OID, slug: "s", name: "Sydney Angels", kind: "angel", owner_user_id: USER.id, is_personal: true } });
    state.queue.push({ table: "investor_mandates", op: "insert", data: mandateRow() });
  }

  it("creates the first mandate as default: personal org bootstrapped, both owner_user_id and org_id set, mirror written, audit carries field names only", async () => {
    queueCreate();
    const r = await upsertMandate(USER, INPUT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(true);
    expect(r.mandate.id).toBe(MID);
    expect(r.org?.id).toBe(OID);
    const ins = calls("investor_mandates", "insert")[0].payload as Row;
    expect(ins).toMatchObject({ owner_user_id: USER.id, org_id: OID, is_default: true, discoverable: true, label: "Sydney Angels", sectors_include: ["fintech"], stages: ["seed"], min_svi: 50, weights: {} });
    // mirror: legacy prefs + the 0323 master flag (evaluator persona)
    expect(setPrefsMock).toHaveBeenCalledWith(USER.id, expect.objectContaining({ sectors: ["fintech"], stages: ["seed"], geos: ["AU"], cheque_band: "100k_500k", min_svi: 50, firm: "Sydney Angels", thesis: "Pre-seed B2B" }));
    expect(setDiscMock).toHaveBeenCalledWith(USER.id, true);
    expect(r.mirror.ok).toBe(true);
    const audit = auditMock.mock.calls[0][0] as Row;
    expect(audit).toMatchObject({ actor: "user", action: "mandate.saved", resource_type: "investor_mandate", resource_id: MID, user_id: USER.id });
    expect(JSON.stringify(audit.detail)).not.toContain("Pre-seed B2B");
    expect((audit.detail as Row).sections_filled).toBe(5);
  });

  it("Scout hits the 1-mandate limit on a second create (402-style reason with the limit)", async () => {
    state.queue.push({ table: "investor_mandates", op: "select", data: [mandateRow()] });
    state.queue.push({ table: "investor_organisations", op: "select", data: { id: OID, slug: "s", name: "Sydney Angels", kind: "angel", owner_user_id: USER.id, is_personal: true } });
    const r = await upsertMandate(USER, { ...INPUT, label: "Second" });
    expect(r).toEqual({ ok: false, reason: "limit_reached", limit: 1 });
    expect(calls("investor_mandates", "insert")).toHaveLength(0);
  });

  it("updates an owned mandate by id, clears other defaults, and rejects an id the user cannot read", async () => {
    state.queue.push({ table: "investor_mandates", op: "select", data: [mandateRow()] });
    state.queue.push({ table: "investor_organisations", op: "select", data: { id: OID, slug: "s", name: "Sydney Angels", kind: "angel", owner_user_id: USER.id, is_personal: true } });
    state.queue.push({ table: "investor_mandates", op: "update", data: mandateRow({ label: "Renamed", sectors_include: ["fintech", "ai_ml"] }) });
    const r = await upsertMandate(USER, { ...INPUT, id: MID, label: "Renamed", sectors_include: ["fintech", "ai_ml"] });
    expect(r.ok && r.created).toBe(false);
    expect(r.ok && r.mandate.label).toBe("Renamed");
    const upd = calls("investor_mandates", "update");
    expect(upd[0].filters).toContainEqual(["id", MID]);
    expect((upd[0].payload as Row).label).toBe("Renamed");
    // second update: un-default the rest
    expect(upd[1].payload).toEqual({ is_default: false });
    expect(upd[1].filters).toContainEqual([`neq:id`, MID]);

    state.queue.push({ table: "investor_mandates", op: "select", data: [mandateRow()] });
    state.queue.push({ table: "investor_organisations", op: "select", data: null });
    state.queue.push({ table: "investor_organisations", op: "insert", data: { id: OID, slug: "s", name: "x", kind: "angel", owner_user_id: USER.id, is_personal: true } });
    const nf = await upsertMandate(USER, { ...INPUT, id: "44444444-4444-4444-8444-444444444444" });
    expect(nf).toEqual({ ok: false, reason: "not_found" });
  });

  it("not migrated → not_migrated; founder persona never flips the 0323 flag", async () => {
    state.queue.push({ table: "investor_mandates", op: "select", error: { code: "42P01", message: "relation does not exist" } });
    expect(await upsertMandate(USER, INPUT)).toEqual({ ok: false, reason: "not_migrated" });
    queueCreate();
    await upsertMandate({ ...USER, evaluator: false }, INPUT);
    expect(setDiscMock).not.toHaveBeenCalled();
    expect(setPrefsMock).toHaveBeenCalled();
  });
});

describe("mirror + read-through (one release)", () => {
  it("mandateToLegacyPrefs: canonical stages → StageBands, wide geos → AU+NZ, cheque band from the max", () => {
    const m = mandateFromRow(mandateRow({ stages: ["idea", "seed", "series_b_c"], geographies: ["anz"], cheque_max_aud: "3000000" }));
    expect(mandateToLegacyPrefs(m)).toMatchObject({ stages: ["pre_seed", "seed", "series_b"], geos: ["AU", "NZ"], cheque_band: "2m_plus", firm: "Sydney Angels" });
    expect(stageKeyToBand("validation")).toBe("pre_seed");
    expect(stageKeyToBand("late_stage")).toBe("growth");
    expect(stageKeyToBand("bogus")).toBeNull();
    expect(mandateToLegacyPrefs(mandateFromRow(mandateRow({ stages: [], cheque_min_aud: null, cheque_max_aud: null }))).stages).toEqual(["any"]);
  });

  it("legacyPrefsToDraft crosswalks free-text sectors and StageBands, keeps firm / thesis / min_svi, drops unknowns", () => {
    const d = legacyPrefsToDraft({ sectors: ["agtech", "AI", "mystery"], stages: ["pre_seed", "any"], min_svi: 54.4, firm: "Sydney Angels", thesis: "t" }, true);
    expect(d).toMatchObject({ label: "Sydney Angels", thesis: "t", discoverable: true, min_svi: 54, sectors_include: ["agtech_food", "ai_ml"], stages: ["idea", "validation", "mvp_early_revenue"] });
    expect(mandateInputSchema.safeParse(d).success).toBe(true);
    expect(legacyPrefsToDraft(null)).toMatchObject({ label: "", sectors_include: [], stages: [], min_svi: null });
  });

  it("mandateDraftFor: primary mandate wins; else the prefs read-through; else empty", async () => {
    state.queue.push({ table: "investor_mandates", data: [mandateRow()] });
    const a = await mandateDraftFor(USER.id, false);
    expect(a.source).toBe("mandate");
    expect(a.mandateId).toBe(MID);
    expect(a.draft).toMatchObject({ id: MID, label: "Sydney Angels", sectors_include: ["fintech"], cheque_min_aud: 50_000, weights: null });

    state.queue.push({ table: "investor_mandates", data: [] });
    getPrefsMock.mockResolvedValueOnce({ sectors: ["fintech"], stages: ["seed"], geos: ["AU"], cheque_band: "any", min_svi: 40, updated_at: null, firm: "Old Firm" } as never);
    const b = await mandateDraftFor(USER.id, true);
    expect(b.source).toBe("prefs");
    expect(b.draft).toMatchObject({ label: "Old Firm", sectors_include: ["fintech"], stages: ["seed"], min_svi: 40, discoverable: true });

    state.queue.push({ table: "investor_mandates", data: [] });
    expect((await mandateDraftFor(USER.id, false)).source).toBe("empty");
  });
});

describe("pure helpers", () => {
  it("sectionsFilled counts non-default sections; changedFields names deltas only", () => {
    const m = mandateFromRow(mandateRow());
    expect(sectionsFilled(m)).toBe(5); // identity, appetite, stage/cheque, geography, floors
    expect(sectionsFilled(mandateFromRow(mandateRow({ tags_include: ["regulated"], weights: { industry: 30, business_model: 10, stage: 20, geo: 10, cheque: 10, tags: 10, floors: 10 } })))).toBe(7);
    expect(changedFields(m, mandateFromRow(mandateRow({ label: "X", min_svi: 60 })))).toEqual(["label", "min_svi"]);
  });
});
