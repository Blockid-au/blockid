// Colocated tests for GET /api/expenses/summary and GET /api/expenses (S28-C).
//
//   viewer+ reads the PROJECT's lines (member reads the owner's project,
//   never their own); from/to validated; the summary carries the GST
//   "estimate" flag + disclaimer; the list is needs-review first with the
//   AI queue price shown before any run; no project 404.

import { beforeEach, describe, expect, it, vi } from "vitest";
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

const gate = vi.hoisted(() => ({ included: false }));
vi.mock("@/lib/expenses/gate", () => ({ categoriseIncluded: async () => ({ included: gate.included, via: null }) }));

import { GET as SUMMARY, DISCLAIMER } from "./route";
import { GET as LIST } from "../route";

function row(id: string, over: Record<string, unknown>) {
  return {
    id,
    project_id: "proj-1",
    statement_ref: "ANZ:x.csv:abc",
    occurred_on: "2026-06-10",
    description: "x",
    amount_aud: -100,
    counterparty: "aws",
    category: "cloud_hosting",
    category_source: "rule",
    confidence: 0.9,
    needs_review: false,
    gst_treatment: "gst",
    hash: id,
    created_at: "2026-06-11T00:00:00Z",
    ...over,
  };
}

const ROWS = [
  row("a", { occurred_on: "2026-06-01", amount_aud: 1100, category: "revenue", counterparty: "stripe" }),
  row("b", { occurred_on: "2026-06-05", amount_aud: -220 }),
  row("c", { occurred_on: "2026-07-05", amount_aud: -440 }),
  row("d", { occurred_on: "2026-07-06", amount_aud: -80, category: "other", category_source: null, needs_review: true, gst_treatment: "unknown", counterparty: "unknown" }),
];

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ bank_transactions: ROWS });
  gate.included = false;
}

beforeEach(reset);

const summary = (qs = "") => SUMMARY(new Request(`http://x/api/expenses/summary${qs}`));
const list = (qs = "") => LIST(new Request(`http://x/api/expenses${qs}`));

describeMemberAccess("GET /api/expenses/summary", { state: scopeState, kind: "read", reset, run: () => summary(), skipNoProject: true });
describeMemberAccess("GET /api/expenses", { state: scopeState, kind: "read", reset, run: () => list(), skipNoProject: true });

describe("GET /api/expenses/summary", () => {
  it("viewer member: summary for the PROJECT with GST flagged estimate + disclaimer", async () => {
    scopeState.role = "viewer";
    const res = await summary();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("viewer");
    expect(body.disclaimer).toBe(DISCLAIMER);
    expect(body.summary).toMatchObject({ rowCount: 4, needsReviewCount: 1, monthsWithData: 2, burnRateAud: 370 });
    expect(body.summary.gst).toMatchObject({ estimate: true, gstOnSales: 100, gstCreditsOnPurchases: 60, netPosition: 40 });
    expect(body.summary.months.map((m: { month: string }) => m.month)).toEqual(["2026-06", "2026-07"]);
    expect(db.sb!.hasEq("bank_transactions", "project_id", "proj-1")).toBe(true);
  });

  it("from / to are passed to the query and validated", async () => {
    const res = await summary("?from=2026-07-01&to=2026-07-31");
    expect(res.status).toBe(200);
    expect(db.sb!.calls.some((c) => c.table === "bank_transactions" && c.op === "gte" && c.args[1] === "2026-07-01")).toBe(true);
    expect(db.sb!.calls.some((c) => c.table === "bank_transactions" && c.op === "lte" && c.args[1] === "2026-07-31")).toBe(true);
    expect((await summary("?from=July")).status).toBe(400);
    expect((await summary("?from=2026-07-31&to=2026-07-01")).status).toBe(400);
  });

  it("no project → 404; unauthenticated → 401", async () => {
    scopeState.projectId = null;
    expect((await summary()).status).toBe(404);
    reset();
    auth.user = null;
    expect((await summary()).status).toBe(401);
  });
});

describe("GET /api/expenses", () => {
  it("needs-review rows first, then newest; queue size + price before any run; categories for the select", async () => {
    const body = await (await list()).json();
    expect(body.transactions.map((t: { id: string }) => t.id)).toEqual(["d", "c", "b", "a"]);
    expect(body.transactions[0]).toMatchObject({ needsReview: true, category: "other", categorySource: null, gstTreatment: "unknown" });
    expect(body).toMatchObject({ total: 4, queue: 4, cost: 1, listedCost: 1, included: false });
    expect(body.categories).toHaveLength(21);
    expect(body.categories[0]).toMatchObject({ key: "revenue", label: "Revenue", kind: "income" });
  });

  it("Growth+ → cost 0", async () => {
    gate.included = true;
    const body = await (await list()).json();
    expect(body).toMatchObject({ cost: 0, included: true });
  });

  it("limit is clamped to 1..2000", async () => {
    await list("?limit=99999");
    expect(db.sb!.calls.find((c) => c.table === "bank_transactions" && c.op === "limit")?.args[0]).toBe(2000);
    expect((await list("?from=bad")).status).toBe(400);
  });
});
