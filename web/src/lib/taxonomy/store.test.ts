import { beforeEach, describe, expect, it, vi } from "vitest";

// Colocated vitest for the startup_taxonomy store (G13-W1-T1). Pins the
// DB chain shapes and the DQ-5 lock rules: confirmed / human-sourced fields
// are never overwritten, protected tags are never touched (DQ-4), and every
// auto-filled field records sources=auto (DQ-2). Same supabase-admin fake
// pattern as evaluations.test.ts / investor-links.test.ts.

type Row = Record<string, unknown>;

interface Captured {
  table: string;
  op: "select" | "insert" | "update" | null;
  selectCols: string | null;
  payload: Row | null;
  eqs: Array<{ col: string; val: unknown }>;
  terminal: "maybeSingle" | "await" | null;
}

interface Queued {
  table: string;
  data?: unknown;
  error?: unknown;
}

const state = {
  adminConfigured: true,
  queue: [] as Queued[],
  calls: [] as Captured[],
};

function nextResponse(table: string): { data: unknown; error: unknown } {
  const idx = state.queue.findIndex((q) => q.table === table);
  if (idx === -1) return { data: null, error: null };
  const [q] = state.queue.splice(idx, 1);
  return { data: q.data ?? null, error: q.error ?? null };
}

function makeBuilder(table: string) {
  const c: Captured = { table, op: null, selectCols: null, payload: null, eqs: [], terminal: null };
  state.calls.push(c);
  const resolve = () => Promise.resolve(nextResponse(table));
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select(cols: string) { if (c.op === null) c.op = "select"; c.selectCols = cols; return b; },
    insert(payload: Row) { c.op = "insert"; c.payload = payload; return b; },
    update(payload: Row) { c.op = "update"; c.payload = payload; return b; },
    eq(col: string, val: unknown) { c.eqs.push({ col, val }); return b; },
    maybeSingle() { c.terminal = "maybeSingle"; return resolve(); },
    then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) { c.terminal = "await"; return resolve().then(onOk, onErr); },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.adminConfigured,
  getSupabaseAdmin: () => (state.adminConfigured ? { from: (t: string) => makeBuilder(t) } : null),
}));

import { getTaxonomy, isFieldLocked, isTagLocked, upsertSuggestedTaxonomy } from "./store";
import { suggestTaxonomy, type TaxonomySuggestion } from "./suggest";

const NOW = new Date("2026-09-16T00:00:00Z");
const calls = (table: string) => state.calls.filter((c) => c.table === table);

function suggestion(overrides: Partial<TaxonomySuggestion> = {}): TaxonomySuggestion {
  return {
    ...suggestTaxonomy({
      description: "PayFlow is a payments platform for Australian SMEs. We hold an AFSL and charge a transaction fee per payment. Based in Sydney.",
      sector: "fintech",
      stage: 3,
    }, NOW),
    ...overrides,
  };
}

function existingRow(overrides: Row = {}): Row {
  return {
    project_id: "p-1",
    taxonomy_version: "1.0.0",
    industry: "unclassified",
    sub_industry: null,
    industry_secondary: null,
    business_model: "unclassified",
    customer_types: [],
    stage_key: "idea",
    hq_state: null,
    hq_country: "AU",
    geo_scope: null,
    tags: [],
    anzsic_division: null,
    anzsic_class: null,
    sources: {},
    confidence: {},
    suggested: null,
    confirmed_by: null,
    confirmed_at: null,
    created_at: "2026-09-15T00:00:00Z",
    updated_at: "2026-09-15T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
});

describe("getTaxonomy", () => {
  it("reads one row by project_id and normalises it", async () => {
    state.queue.push({ table: "startup_taxonomy", data: existingRow({ industry: "fintech", tags: ["regulated", "bogus"] }) });
    const row = await getTaxonomy("p-1");
    expect(row).toMatchObject({ project_id: "p-1", industry: "fintech", tags: ["regulated"], hq_country: "AU" });
    const c = calls("startup_taxonomy")[0];
    expect(c.op).toBe("select");
    expect(c.eqs).toEqual([{ col: "project_id", val: "p-1" }]);
    expect(c.terminal).toBe("maybeSingle");
  });

  it("returns null when missing, on error, or without a client", async () => {
    expect(await getTaxonomy("p-1")).toBeNull();
    state.queue.push({ table: "startup_taxonomy", error: { message: "boom" } });
    expect(await getTaxonomy("p-1")).toBeNull();
    state.adminConfigured = false;
    expect(await getTaxonomy("p-1")).toBeNull();
  });
});

describe("upsertSuggestedTaxonomy — insert", () => {
  it("inserts the suggestion into live columns with sources=auto and the full suggestion in `suggested`", async () => {
    const s = suggestion();
    const res = await upsertSuggestedTaxonomy("p-1", s);
    expect(res).toMatchObject({ ok: true, mode: "inserted", differs: [] });
    expect(res.applied).toEqual(expect.arrayContaining(["industry", "business_model", "stage_key", "tags"]));

    const ins = calls("startup_taxonomy").find((c) => c.op === "insert")!;
    expect(ins.payload).toMatchObject({
      project_id: "p-1",
      taxonomy_version: "1.0.0",
      industry: "fintech",
      sub_industry: "fintech",
      business_model: "transactional_fintech",
      stage_key: "seed",
      hq_state: "NSW",
      hq_country: "AU",
      anzsic_division: "K",
      tags: ["regulated"],
    });
    expect(ins.payload!.sources).toMatchObject({ industry: "auto", business_model: "auto", stage_key: "auto", tags: { regulated: "auto" } });
    expect(ins.payload!.suggested).toMatchObject({ industry: "fintech", suggested_at: NOW.toISOString() });
    expect(ins.payload).not.toHaveProperty("confirmed_at");
  });

  it("an unclassified suggestion still inserts an honest row (no sources, no tags)", async () => {
    const s = suggestTaxonomy({ description: "We help people." }, NOW);
    const res = await upsertSuggestedTaxonomy("p-2", s);
    expect(res.mode).toBe("inserted");
    expect(res.applied).toEqual([]);
    const ins = calls("startup_taxonomy").find((c) => c.op === "insert")!;
    expect(ins.payload).toMatchObject({ industry: "unclassified", business_model: "unclassified", stage_key: "idea", tags: [], sources: {}, anzsic_division: null });
  });

  it("drops a protected tag that somehow reached it (DQ-4 runtime guard)", async () => {
    const s = suggestion({ tags: ["regulated", "female_founded" as never] });
    await upsertSuggestedTaxonomy("p-1", s);
    const ins = calls("startup_taxonomy").find((c) => c.op === "insert")!;
    expect(ins.payload!.tags).toEqual(["regulated"]);
  });

  it("returns ok:false without throwing when the read or insert errors, or without a client", async () => {
    state.queue.push({ table: "startup_taxonomy", error: { message: 'relation "startup_taxonomy" does not exist' } });
    expect(await upsertSuggestedTaxonomy("p-1", suggestion())).toMatchObject({ ok: false, mode: "skipped" });

    state.queue.push({ table: "startup_taxonomy", data: null });
    state.queue.push({ table: "startup_taxonomy", error: { message: "insert failed" } });
    expect(await upsertSuggestedTaxonomy("p-1", suggestion())).toMatchObject({ ok: false, mode: "skipped", error: "insert failed" });

    state.adminConfigured = false;
    expect(await upsertSuggestedTaxonomy("p-1", suggestion())).toMatchObject({ ok: false, mode: "skipped" });
    expect(await upsertSuggestedTaxonomy("", suggestion())).toMatchObject({ ok: false, mode: "skipped" });
  });
});

describe("upsertSuggestedTaxonomy — update (DQ-5 locks)", () => {
  it("overwrites auto fields on an unconfirmed row and refreshes `suggested`", async () => {
    state.queue.push({ table: "startup_taxonomy", data: existingRow({ industry: "software_saas", sources: { industry: "auto" }, confidence: { industry: 0.55 } }) });
    const res = await upsertSuggestedTaxonomy("p-1", suggestion());
    expect(res).toMatchObject({ ok: true, mode: "updated", differs: [] });
    const upd = calls("startup_taxonomy").find((c) => c.op === "update")!;
    expect(upd.eqs).toEqual([{ col: "project_id", val: "p-1" }]);
    expect(upd.payload).toMatchObject({ industry: "fintech", business_model: "transactional_fintech", stage_key: "seed", anzsic_division: "K" });
    expect(upd.payload!.sources).toMatchObject({ industry: "auto", business_model: "auto", tags: { regulated: "auto" } });
    expect(upd.payload!.suggested).toMatchObject({ industry: "fintech" });
    expect((upd.payload!.confidence as Row).industry).toBeGreaterThanOrEqual(0.5);
  });

  it("never overwrites a founder-sourced field; reports it in `differs`; still stores `suggested`", async () => {
    state.queue.push({
      table: "startup_taxonomy",
      data: existingRow({ industry: "healthtech_medtech", sources: { industry: "founder" } }),
    });
    const res = await upsertSuggestedTaxonomy("p-1", suggestion());
    expect(res.ok).toBe(true);
    expect(res.differs).toContain("industry");
    expect(res.applied).not.toContain("industry");
    const upd = calls("startup_taxonomy").find((c) => c.op === "update")!;
    expect(upd.payload).not.toHaveProperty("industry");
    expect(upd.payload!.suggested).toMatchObject({ industry: "fintech" });
    expect((upd.payload!.sources as Row).industry).toBe("founder");
    // unlocked fields on the same row still fill
    expect(upd.payload).toMatchObject({ business_model: "transactional_fintech", stage_key: "seed" });
  });

  it("a confirmed row locks every field without an explicit auto source → suggested_only", async () => {
    state.queue.push({
      table: "startup_taxonomy",
      data: existingRow({
        industry: "edtech",
        business_model: "saas_subscription",
        stage_key: "idea",
        tags: ["female_founded", "university_spinout"],
        sources: { industry: "founder", business_model: "founder", stage_key: "founder", tags: { female_founded: "founder", university_spinout: "founder" } },
        confirmed_by: "u-1",
        confirmed_at: "2026-09-15T12:00:00Z",
      }),
    });
    const res = await upsertSuggestedTaxonomy("p-1", suggestion());
    expect(res.mode).toBe("suggested_only");
    expect(res.applied).toEqual([]);
    expect(res.differs).toEqual(expect.arrayContaining(["industry", "business_model", "stage_key"]));
    const upd = calls("startup_taxonomy").find((c) => c.op === "update")!;
    expect(Object.keys(upd.payload!).sort()).toEqual(["confidence", "suggested"]);
  });

  it("keeps protected + founder tags and merges auto tags; protected tags never leave the row", async () => {
    state.queue.push({
      table: "startup_taxonomy",
      data: existingRow({
        industry: "fintech",
        tags: ["female_founded", "accelerator_alumni", "climate_impact"],
        sources: { industry: "auto", tags: { female_founded: "founder", accelerator_alumni: "founder", climate_impact: "auto" } },
      }),
    });
    const res = await upsertSuggestedTaxonomy("p-1", suggestion()); // suggests only `regulated`
    expect(res.applied).toContain("tags");
    const upd = calls("startup_taxonomy").find((c) => c.op === "update")!;
    const tags = upd.payload!.tags as string[];
    expect(tags).toEqual(expect.arrayContaining(["female_founded", "accelerator_alumni", "regulated"]));
    expect(tags).not.toContain("climate_impact"); // stale auto tag replaced
    expect((upd.payload!.sources as Row).tags).toEqual({ female_founded: "founder", accelerator_alumni: "founder", regulated: "auto" });
  });

  it("an auto field on a confirmed row stays writable (founder said 'not sure')", async () => {
    state.queue.push({
      table: "startup_taxonomy",
      data: existingRow({
        industry: "unclassified",
        business_model: "saas_subscription",
        sources: { industry: "auto", business_model: "founder" },
        confirmed_at: "2026-09-15T12:00:00Z",
      }),
    });
    const res = await upsertSuggestedTaxonomy("p-1", suggestion());
    expect(res.mode).toBe("updated");
    expect(res.applied).toContain("industry");
    expect(res.differs).toContain("business_model");
    const upd = calls("startup_taxonomy").find((c) => c.op === "update")!;
    expect(upd.payload).toMatchObject({ industry: "fintech" });
    expect(upd.payload).not.toHaveProperty("business_model");
  });

  it("an identical re-run is `unchanged` and only refreshes suggested/confidence", async () => {
    const s = suggestion();
    state.queue.push({
      table: "startup_taxonomy",
      data: existingRow({
        industry: s.industry, sub_industry: s.sub_industry, business_model: s.business_model, customer_types: s.customer_types,
        stage_key: s.stage_key, hq_state: s.hq_state, geo_scope: s.geo_scope, tags: s.tags, sources: s.sources, confidence: s.confidence,
      }),
    });
    const res = await upsertSuggestedTaxonomy("p-1", s);
    expect(res).toMatchObject({ ok: true, mode: "unchanged", applied: [], differs: [] });
    const upd = calls("startup_taxonomy").find((c) => c.op === "update")!;
    expect(Object.keys(upd.payload!).sort()).toEqual(["confidence", "suggested"]);
  });

  it("update error → ok:false, no throw", async () => {
    state.queue.push({ table: "startup_taxonomy", data: existingRow() });
    state.queue.push({ table: "startup_taxonomy", error: { message: "update failed" } });
    expect(await upsertSuggestedTaxonomy("p-1", suggestion())).toMatchObject({ ok: false, mode: "skipped", error: "update failed" });
  });
});

describe("lock predicates", () => {
  it("isFieldLocked / isTagLocked follow DQ-4 / DQ-5", () => {
    expect(isFieldLocked({ sources: {}, confirmed_at: null }, "industry")).toBe(false);
    expect(isFieldLocked({ sources: { industry: "auto" }, confirmed_at: null }, "industry")).toBe(false);
    expect(isFieldLocked({ sources: { industry: "founder" }, confirmed_at: null }, "industry")).toBe(true);
    expect(isFieldLocked({ sources: { industry: "evaluator" }, confirmed_at: null }, "industry")).toBe(true);
    expect(isFieldLocked({ sources: {}, confirmed_at: "2026-09-15T00:00:00Z" }, "industry")).toBe(true);
    expect(isFieldLocked({ sources: { industry: "auto" }, confirmed_at: "2026-09-15T00:00:00Z" }, "industry")).toBe(false);
    expect(isTagLocked({ sources: {}, confirmed_at: null }, "female_founded")).toBe(true);
    expect(isTagLocked({ sources: {}, confirmed_at: null }, "first_nations")).toBe(true);
    expect(isTagLocked({ sources: {}, confirmed_at: null }, "regulated")).toBe(false);
    expect(isTagLocked({ sources: { tags: { regulated: "founder" } }, confirmed_at: null }, "regulated")).toBe(true);
  });
});
