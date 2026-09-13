// Colocated tests for PATCH /api/expenses/[id] (S28-C).
//
//   editor+ (viewer 403); the row must belong to the scope's project (404
//   otherwise, non-uuid 404); a manual category writes source=manual,
//   confidence 1, review cleared, GST default; the merchant is learned into
//   expense_rules (upsert on project_id,merchant_key) and applied to the
//   project's other non-manual lines of that merchant; `learn:false` skips
//   both; bad category 400.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { describeMemberAccess } from "@/test/member-access-suite";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import { PATCH } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const SIB = "22222222-2222-4222-8222-222222222222";

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    project_id: "proj-1",
    statement_ref: "ANZ:x.csv:abc",
    occurred_on: "2026-06-10",
    description: "Bunnings Warehouse Alexandria",
    amount_aud: -145.9,
    counterparty: "bunnings warehouse alexandria",
    category: "equipment",
    category_source: "rule",
    confidence: 0.9,
    needs_review: false,
    gst_treatment: "gst",
    hash: `h-${id}`,
    created_at: "2026-06-11T00:00:00Z",
    ...over,
  };
}

function req(id: string, body: unknown) {
  return new NextRequest(`http://x/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
const call = (id: string, body: unknown) => PATCH(req(id, body), { params: Promise.resolve({ id }) });

function reset(rows: Record<string, unknown>[] = [row(ID)]) {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ bank_transactions: rows, expense_rules: [] });
}

beforeEach(() => reset());

describeMemberAccess("PATCH /api/expenses/[id]", {
  state: scopeState,
  kind: "write",
  reset: () => reset(),
  run: () => call(ID, { category: "r_and_d" }),
  skipNoProject: true,
});

describe("PATCH /api/expenses/[id] — manual re-category + learned rule", () => {
  it("writes manual / confidence 1 / review cleared / GST default, scoped to the project", async () => {
    scopeState.role = "editor";
    const res = await call(ID, { category: "superannuation" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transaction).toMatchObject({ id: ID, category: "superannuation", categorySource: "manual", confidence: 1, needsReview: false, gstTreatment: "gst_free" });
    const update = db.sb!.find("bank_transactions", "update")[0];
    expect(update.args[0]).toEqual({ category: "superannuation", category_source: "manual", confidence: 1, needs_review: false, gst_treatment: "gst_free" });
    expect(db.sb!.hasEq("bank_transactions", "project_id", "proj-1")).toBe(true);
    expect(db.sb!.hasEq("bank_transactions", "id", ID)).toBe(true);
  });

  it("learns the merchant into expense_rules and re-categorises the project's other non-manual lines of it", async () => {
    reset([row(ID), row(SIB, { category: "other", category_source: "ai", needs_review: true })]);
    const body = await (await call(ID, { category: "r_and_d" })).json();
    expect(body.learnedRule).toBe("bunnings warehouse alexandria");
    const upsert = db.sb!.find("expense_rules", "upsert")[0];
    expect(upsert.args[0]).toMatchObject({ project_id: "proj-1", merchant_key: "bunnings warehouse alexandria", category: "r_and_d" });
    expect(upsert.args[1]).toEqual({ onConflict: "project_id,merchant_key" });
    // siblings: the fake returns both rows for the counterparty query; the
    // route filters out manual rows and the edited row itself
    expect(body.siblingsUpdated).toBe(1);
    const sibUpdate = db.sb!.find("bank_transactions", "update").find((c) => (c.args[0] as { category_source: string }).category_source === "rule");
    expect(sibUpdate?.args[0]).toMatchObject({ category: "r_and_d", category_source: "rule", needs_review: false });
    expect(db.sb!.find("bank_transactions", "in")[0].args[1]).toEqual([SIB]);
  });

  it("learn:false → no rule, no siblings", async () => {
    const body = await (await call(ID, { category: "r_and_d", learn: false })).json();
    expect(body.learnedRule).toBeNull();
    expect(body.siblingsUpdated).toBe(0);
    expect(db.sb!.find("expense_rules", "upsert")).toEqual([]);
  });

  it("bad category → 400; unknown / other project's row → 404; non-uuid → 404", async () => {
    expect((await call(ID, { category: "snacks" })).status).toBe(400);
    reset([]);
    expect((await call(ID, { category: "r_and_d" })).status).toBe(404);
    expect((await call("nope", { category: "r_and_d" })).status).toBe(404);
  });

  it("viewer → 403 with no writes; no project → 404", async () => {
    scopeState.role = "viewer";
    expect((await call(ID, { category: "r_and_d" })).status).toBe(403);
    expect(db.sb!.calls).toEqual([]);
    reset();
    scopeState.projectId = null;
    expect((await call(ID, { category: "r_and_d" })).status).toBe(404);
  });

  it("unauthenticated → 401", async () => {
    auth.user = null;
    expect((await call(ID, { category: "r_and_d" })).status).toBe(401);
  });
});
