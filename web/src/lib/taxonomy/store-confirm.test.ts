// Colocated vitest for confirmTaxonomy() (G13-W4-D2 E1.4). Stateful
// single-row fake so the human write and a later pipeline run interact the
// way production does. Pins:
//   * confirm stamps confirmed_at / confirmed_by and turns EVERY axis
//     source into 'founder' (T1); a later auto run never overwrites a
//     confirmed field (DQ-5) and only refreshes `suggested`;
//   * "Not sure" → unclassified (industry / business model / customer types)
//     or null (geo / state) — never "Other";
//   * protected tags: accepted from a founder, dropped (and reported) from
//     an evaluator (DQ-4); evaluator never overwrites founder-owned fields;
//   * inserts the row when the pipeline has not created it yet;
//   * audit taxonomy.confirmed / taxonomy.edited with field names only;
//   * validation (bad enum) → invalid; no client → unavailable.

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const state = { row: null as Row | null, admin: true, failUpdate: false };

function builder() {
  let op: "select" | "insert" | "update" = "select";
  let payload: Row = {};
  const run = async () => {
    if (op === "insert") {
      state.row = { created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", sub_industry: null, industry_secondary: null, anzsic_division: null, anzsic_class: null, sources: {}, confidence: {}, suggested: null, confirmed_by: null, confirmed_at: null, ...payload };
      return { data: state.row, error: null };
    }
    if (op === "update") {
      if (state.failUpdate) return { data: null, error: { message: "update failed" } };
      if (state.row) Object.assign(state.row, payload, { updated_at: "2026-09-16T01:00:00Z" });
      return { data: state.row, error: null };
    }
    return { data: state.row, error: null };
  };
  const q: Record<string, unknown> = {
    select: () => q,
    insert: (p: Row) => { op = "insert"; payload = p; return q; },
    update: (p: Row) => { op = "update"; payload = p; return q; },
    eq: () => q,
    maybeSingle: () => run(),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
  };
  return q;
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (state.admin ? { from: () => builder() } : null), isSupabaseConfigured: () => state.admin }));
const appendAuditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => appendAuditMock(p as never) }));

import { confirmTaxonomy, countUnclassified, getTaxonomy, upsertSuggestedTaxonomy } from "./store";
import { suggestTaxonomy } from "./suggest";

const FOUNDER = { userId: "u-founder", source: "founder" as const };
const EVALUATOR = { userId: "u-eval", source: "evaluator" as const };
const tick = () => new Promise((r) => setTimeout(r, 0));

function autoRow(over: Row = {}): Row {
  return {
    project_id: "p-1", taxonomy_version: "1.0.0", industry: "fintech", sub_industry: "fintech", industry_secondary: null, business_model: "transactional_fintech",
    customer_types: ["b2b"], stage_key: "seed", hq_state: "NSW", hq_country: "AU", geo_scope: "national", tags: ["regulated"], anzsic_division: "K", anzsic_class: null,
    sources: { industry: "auto", business_model: "auto", customer_types: "auto", stage_key: "auto", hq_state: "auto", geo_scope: "auto", tags: { regulated: "auto" } },
    confidence: { industry: 0.82, business_model: 0.6 }, suggested: { industry: "fintech" }, confirmed_by: null, confirmed_at: null,
    created_at: "2026-09-15T00:00:00Z", updated_at: "2026-09-15T00:00:00Z", ...over,
  };
}

beforeEach(() => {
  state.row = null;
  state.admin = true;
  state.failUpdate = false;
  appendAuditMock.mockClear();
});

describe("confirmTaxonomy — founder", () => {
  it("Confirm as shown: stamps confirmed_at/by, every axis source becomes founder, nothing else changes; audit taxonomy.confirmed", async () => {
    state.row = autoRow();
    const r = await confirmTaxonomy("p-1", { confirm: true }, FOUNDER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toEqual([]);
    expect(r.row.confirmed_by).toBe("u-founder");
    expect(r.row.confirmed_at).toBeTruthy();
    expect(r.row.industry).toBe("fintech");
    expect(r.row.sources).toMatchObject({ industry: "founder", business_model: "founder", stage_key: "founder", customer_types: "founder", geo_scope: "founder", hq_state: "founder", tags: { regulated: "auto" } });
    expect(r.unclassifiedCount).toBe(0);
    await tick();
    expect(appendAuditMock).toHaveBeenCalledTimes(1);
    expect(appendAuditMock.mock.calls[0][0]).toMatchObject({ action: "taxonomy.confirmed", resource_type: "startup_taxonomy", resource_id: "p-1", user_id: "u-founder", detail: { source: "founder", changed: [], unclassified_count: 0 } });
  });

  it("Edit + Confirm writes the edited axes with source founder and re-anchors ANZSIC; Not sure → unclassified (T1), never 'Other'", async () => {
    state.row = autoRow();
    const r = await confirmTaxonomy("p-1", { industry: "healthtech_medtech", stage_key: "series_a", not_sure: ["business_model", "geo_scope"], confirm: true }, FOUNDER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed.sort()).toEqual(["business_model", "geo_scope", "industry", "stage_key"]);
    expect(r.row.industry).toBe("healthtech_medtech");
    expect(r.row.anzsic_division).toBe("Q");
    expect(r.row.business_model).toBe("unclassified");
    expect(r.row.geo_scope).toBeNull();
    expect(r.row.stage_key).toBe("series_a");
    expect(r.unclassifiedCount).toBe(1);
    await tick();
    expect((appendAuditMock.mock.calls[0][0] as unknown as Row).detail).toMatchObject({ not_sure: ["business_model", "geo_scope"], unclassified_count: 1 });
  });

  it("a later auto run never overwrites confirmed fields — only `suggested` is refreshed and `differs` names the axis", async () => {
    state.row = autoRow();
    await confirmTaxonomy("p-1", { industry: "healthtech_medtech", confirm: true }, FOUNDER);
    const res = await upsertSuggestedTaxonomy("p-1", suggestTaxonomy({ description: "PayFlow is a payments platform for Australian SMEs holding an AFSL.", sector: "fintech", stage: 3 }));
    expect(res.ok).toBe(true);
    expect(res.applied).toEqual([]);
    expect(res.differs).toContain("industry");
    const row = await getTaxonomy("p-1");
    expect(row?.industry).toBe("healthtech_medtech");
    expect(row?.confirmed_by).toBe("u-founder");
    expect(row?.sources.industry).toBe("founder");
    expect((row?.suggested as Row).industry).toBe("fintech");
  });

  it("founder may declare protected tags; Save without confirming keeps confirmed_at null and audits taxonomy.edited", async () => {
    state.row = autoRow();
    const r = await confirmTaxonomy("p-1", { tags: ["regulated", "female_founded", "esic_eligible"], confirm: false }, FOUNDER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.tags).toEqual(["esic_eligible", "female_founded", "regulated"]);
    expect(r.row.sources.tags).toEqual({ esic_eligible: "founder", female_founded: "founder", regulated: "founder" });
    expect(r.row.confirmed_at).toBeNull();
    expect(r.droppedProtectedTags).toEqual([]);
    await tick();
    expect((appendAuditMock.mock.calls[0][0] as unknown as Row).action).toBe("taxonomy.edited");
  });

  it("inserts the row when the pipeline has not classified the project yet", async () => {
    const r = await confirmTaxonomy("p-9", { industry: "edtech", customer_types: ["b2c"], confirm: true }, FOUNDER);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(state.row).toMatchObject({ project_id: "p-9", industry: "edtech", customer_types: ["b2c"], business_model: "unclassified", confirmed_by: "u-founder" });
    expect(r.row.sources.industry).toBe("founder");
    expect(r.unclassifiedCount).toBe(1);
  });
});

describe("confirmTaxonomy — evaluator (T2 / DQ-4 / founder supersedes)", () => {
  it("writes sources.industry = evaluator on an auto row", async () => {
    state.row = autoRow();
    const r = await confirmTaxonomy("p-1", { industry: "agtech_food", confirm: false }, EVALUATOR);
    expect(r.ok && r.row.industry).toBe("agtech_food");
    expect(r.ok && r.row.sources.industry).toBe("evaluator");
  });

  it("protected tags from an evaluator are dropped and reported; existing founder / protected tags survive", async () => {
    state.row = autoRow({ tags: ["female_founded", "regulated"], sources: { tags: { female_founded: "founder", regulated: "auto" } } });
    const r = await confirmTaxonomy("p-1", { tags: ["first_nations", "esic_eligible"], confirm: false }, EVALUATOR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.droppedProtectedTags).toEqual(["first_nations"]);
    expect(r.row.tags).toEqual(["esic_eligible", "female_founded"]);
    expect(r.row.sources.tags).toEqual({ female_founded: "founder", esic_eligible: "evaluator" });
  });

  it("never overwrites a founder-owned field and never re-stamps a founder confirmation", async () => {
    state.row = autoRow();
    await confirmTaxonomy("p-1", { industry: "healthtech_medtech", confirm: true }, FOUNDER);
    const r = await confirmTaxonomy("p-1", { industry: "agtech_food", stage_key: "idea", confirm: true }, EVALUATOR);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lockedByFounder).toEqual(["industry", "stage_key"]);
    expect(r.changed).toEqual([]);
    expect(r.row.industry).toBe("healthtech_medtech");
    expect(r.row.confirmed_by).toBe("u-founder");
    expect(r.row.sources.industry).toBe("founder");
  });
});

describe("confirmTaxonomy — errors", () => {
  it("invalid enum → invalid; missing client → unavailable; update failure → db_error", async () => {
    state.row = autoRow();
    expect(await confirmTaxonomy("p-1", { industry: "crypto" as never, confirm: true }, FOUNDER)).toMatchObject({ ok: false, error: "invalid" });
    state.failUpdate = true;
    expect(await confirmTaxonomy("p-1", { confirm: true }, FOUNDER)).toMatchObject({ ok: false, error: "db_error" });
    state.admin = false;
    expect(await confirmTaxonomy("p-1", { confirm: true }, FOUNDER)).toMatchObject({ ok: false, error: "unavailable" });
  });
  it("countUnclassified counts the three DQ-1 axes", () => {
    expect(countUnclassified({ industry: "unclassified", business_model: "unclassified", customer_types: [] })).toBe(3);
    expect(countUnclassified({ industry: "fintech", business_model: "saas_subscription", customer_types: ["b2b"] })).toBe(0);
    expect(countUnclassified({ industry: "fintech", business_model: "saas_subscription", customer_types: ["unclassified"] })).toBe(1);
  });
});
