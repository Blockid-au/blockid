// Colocated tests for lib/funding/application-drafts (T0251): row mapping
// (junk answers → "", prompts parsed, status clamp) and gatherDraftContext
// (project facts + report intake/match notes + SVI + data-room evidence,
// degrading to the base context when the DB is unavailable).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const { latestReportMock } = vi.hoisted(() => ({ latestReportMock: vi.fn() }));
vi.mock("./workspace", () => ({
  latestFundingReportForUser: (u: string, p: string | null) => latestReportMock(u, p),
  stageFromNumeric: (n: number | null) => (n === 2 ? "mvp" : null),
}));

import { gatherDraftContext, getGrantDraft, latestGrantDraft, rowFromDb } from "./application-drafts";

const PROJECT = { id: "p1", userId: "u1", name: "Acme", slug: "acme", description: "Soil sensors", industry: "AgTech", stage: 2, isDefault: true, archivedAt: null, createdAt: "", updatedAt: "", growth_phase_current: null };

function fakeDb(tables: Record<string, unknown>, ops: Array<{ table: string; op: string; args: unknown[] }> = []) {
  const chain = (table: string) => {
    const c: Record<string, unknown> = {};
    for (const op of ["select", "eq", "neq", "is", "order", "limit"]) {
      c[op] = (...args: unknown[]) => {
        ops.push({ table, op, args });
        return c;
      };
    }
    c.maybeSingle = async () => ({ data: (tables[table] as { single?: unknown } | undefined)?.single ?? null, error: null });
    c.then = (r: (v: unknown) => unknown) => r({ data: (tables[table] as { rows?: unknown[] } | undefined)?.rows ?? [], error: null });
    return c;
  };
  return { from: (t: string) => chain(t) } as unknown as NonNullable<ReturnType<typeof import("@/lib/supabase").getSupabaseAdmin>>;
}

beforeEach(() => {
  latestReportMock.mockReset().mockResolvedValue(null);
});

describe("rowFromDb", () => {
  it("coerces answers to strings, parses prompts, clamps status", () => {
    const row = rowFromDb({
      id: "d1", user_id: "u1", project_id: null, grant_id: "g1",
      answers: { a: "yes", b: 3, c: null }, prompts: [{ id: "a", question: "Q" }, { bad: true }],
      credits_cost: "2", status: "weird", meta: null, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
    });
    expect(row).toMatchObject({ id: "d1", project_id: null, answers: { a: "yes", b: "", c: "" }, prompts: [{ id: "a", question: "Q" }], credits_cost: 2, status: "draft", meta: {} });
  });
});

// Review 2026-09-10 #3 belt-and-braces: a row whose credit spend did not
// land (status = spend_failed, migration 0324) must never be what the editor
// opens — both readers filter it out server-side.
describe("spend_failed drafts are invisible", () => {
  it("rowFromDb keeps the spend_failed status instead of clamping it to draft", () => {
    expect(rowFromDb({ id: "d1", user_id: "u1", grant_id: "g1", status: "spend_failed" }).status).toBe("spend_failed");
  });

  it("getGrantDraft and latestGrantDraft both add neq(status, spend_failed)", async () => {
    const ops: Array<{ table: string; op: string; args: unknown[] }> = [];
    const db = fakeDb({}, ops);
    await getGrantDraft("d1", "u1", { db });
    const getOps = ops.splice(0);
    expect(getOps.map((o) => o.table)).toContain("grant_application_drafts");
    expect(getOps.some((o) => o.op === "neq" && o.args[0] === "status" && o.args[1] === "spend_failed")).toBe(true);

    await latestGrantDraft("u1", "p1", "g1", { db });
    const latestOps = ops.splice(0);
    expect(latestOps.some((o) => o.op === "neq" && o.args[0] === "status" && o.args[1] === "spend_failed")).toBe(true);
    expect(latestOps.some((o) => o.op === "eq" && o.args[0] === "project_id" && o.args[1] === "p1")).toBe(true);
  });
});

describe("gatherDraftContext", () => {
  it("no DB → base context from the project only (never throws)", async () => {
    const ctx = await gatherDraftContext({ id: "u1", email: "f@acme.io" }, PROJECT, "g1", { db: null });
    expect(ctx).toEqual({ startup: "Acme", description: "Soil sensors", industry: "AgTech", stage: "mvp", state: null, svi: null, evidence: [], matchWhy: [], eligibility: [] });
  });

  it("merges the latest report (state, match why + checklist), the SVI snapshot and data-room evidence", async () => {
    latestReportMock.mockResolvedValue({
      intake: { description: "ignored — project wins", state: "NSW", stage: "early_revenue" },
      grant_matches: [{ ref_id: "g1", why: ["Fits NSW."], eligibility_checklist: [{ label: "HQ state", status: "pass" }] }, { ref_id: "other", why: ["no"], eligibility_checklist: [] }],
    });
    const db = fakeDb({
      svi_snapshots: { single: { index_value: 61.4, svi_total: 60, dimension_scores: { FTV: 70 }, ai_summary: "Solid." } },
      dataroom_files: { rows: [{ file_name: "Deck.pdf", svi_dimension: "IRI" }, { file_name: null }] },
    });
    const ctx = await gatherDraftContext({ id: "u1", email: "f@acme.io" }, PROJECT, "g1", { db });
    expect(ctx.description).toBe("Soil sensors");
    expect(ctx.state).toBe("NSW");
    expect(ctx.stage).toBe("early_revenue");
    expect(ctx.svi).toEqual({ total: 61.4, dimensions: { FTV: 70 }, summary: "Solid." });
    expect(ctx.evidence).toEqual(["Deck.pdf (IRI)"]);
    expect(ctx.matchWhy).toEqual(["Fits NSW."]);
    expect(ctx.eligibility).toEqual(["HQ state: pass"]);
  });

  it("no project → 'Our startup' with the report description filling the gap", async () => {
    latestReportMock.mockResolvedValue({ intake: { description: "From the intake" }, grant_matches: [] });
    const ctx = await gatherDraftContext({ id: "u1", email: null }, null, "g1", { db: fakeDb({}) });
    expect(ctx.startup).toBe("Our startup");
    expect(ctx.description).toBe("From the intake");
    expect(ctx.svi).toBeNull();
  });
});
