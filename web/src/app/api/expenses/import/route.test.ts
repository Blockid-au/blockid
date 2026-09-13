// Colocated tests for POST /api/expenses/import (S28-C).
//
//   editor+ (viewer 403 before the file is parsed); rows land on the
//   PROJECT id from the scope (never a caller key); dedupe on
//   (project_id, hash) — a duplicate line inside the upload is stored once;
//   learned expense_rules are applied before the keyword table; the
//   response says how many rows the rules placed, how many the model would
//   take and what that costs (Growth+ → 0); no project 404; bad file 400;
//   unparseable 422.

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
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

const gate = vi.hoisted(() => ({ included: false }));
vi.mock("@/lib/expenses/gate", () => ({ categoriseIncluded: async () => ({ included: gate.included, via: gate.included ? "growth" : null }) }));

import { POST } from "./route";

const CSV = [
  "Date,Description,Amount,Balance",
  "01/06/2026,Stripe payout,1500.00,5000.00",
  "05/06/2026,AWS EMEA,-320.50,4679.50",
  "05/06/2026,AWS EMEA,-320.50,4359.00", // duplicate line
  "09/06/2026,PAYMENT 88213 ZQ,-80.00,4279.00",
  "10/06/2026,Bunnings Warehouse,-145.90,4133.10",
].join("\n");

function req(csv = CSV, name = "statement.csv") {
  const fd = new FormData();
  fd.set("file", new File([csv], name, { type: "text/csv" }));
  return new NextRequest("http://x/api/expenses/import", { method: "POST", body: fd });
}

// The fake's count for `bank_transactions` is the seeded store (the upsert
// does not add to it), so one seeded pending row stands in for the queue
// the import just created.
const PENDING = { id: "q1", project_id: "proj-1", category_source: null };

function reset(rules: Array<{ merchant_key: string; category: string }> = []) {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ expense_rules: rules, bank_transactions: [PENDING] });
  gate.included = false;
}

beforeEach(() => reset());

describeMemberAccess("POST /api/expenses/import", {
  state: scopeState,
  kind: "write",
  reset: () => reset(),
  run: () => POST(req()),
  skipNoProject: true,
});

describe("POST /api/expenses/import — storage + rules", () => {
  it("editor: rows are upserted on the PROJECT id with (project_id, hash) dedupe; duplicates inside the file collapse", async () => {
    scopeState.role = "editor";
    const res = await POST(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, bankName: "CBA", parsed: 5, skipped: 0, inserted: 4, duplicates: 1 });
    const upsert = db.sb!.find("bank_transactions", "upsert")[0];
    const rows = upsert.args[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.project_id === "proj-1")).toBe(true);
    expect(upsert.args[1]).toEqual({ onConflict: "project_id,hash", ignoreDuplicates: true });
    expect(body.statementRef).toMatch(/^CBA:statement\.csv:[0-9a-f]{16}$/);
    expect(rows.every((r) => r.statement_ref === body.statementRef)).toBe(true);
    // learned rules were read for the project
    expect(db.sb!.hasEq("expense_rules", "project_id", "proj-1")).toBe(true);
  });

  it("rules layer runs at import: Stripe payout / AWS / Bunnings placed, the bare reference left for the model with its price", async () => {
    const body = await (await POST(req())).json();
    expect(body).toMatchObject({ ruleCategorised: 3, needsAi: 1, queue: 1, cost: 1, listedCost: 1, included: false });
    const rows = db.sb!.find("bank_transactions", "upsert")[0].args[0] as Array<Record<string, unknown>>;
    const byDesc = Object.fromEntries(rows.map((r) => [r.description, r]));
    expect(byDesc["Stripe payout"]).toMatchObject({ category: "revenue", category_source: "rule", needs_review: false, amount_aud: 1500, occurred_on: "2026-06-01" });
    expect(byDesc["AWS EMEA"]).toMatchObject({ category: "cloud_hosting", category_source: "rule", gst_treatment: "gst" });
    expect(byDesc["Bunnings Warehouse"]).toMatchObject({ category: "equipment" });
    expect(byDesc["PAYMENT 88213 ZQ"]).toMatchObject({ category: "other", category_source: null, needs_review: true });
  });

  it("a learned expense_rules row beats the keyword table", async () => {
    reset([{ merchant_key: "bunnings warehouse", category: "r_and_d" }]);
    await POST(req());
    const rows = db.sb!.find("bank_transactions", "upsert")[0].args[0] as Array<Record<string, unknown>>;
    expect(rows.find((r) => r.description === "Bunnings Warehouse")).toMatchObject({ category: "r_and_d", category_source: "rule", confidence: 0.97 });
  });

  it("Growth+ → the model run is included (cost 0)", async () => {
    gate.included = true;
    const body = await (await POST(req())).json();
    expect(body).toMatchObject({ needsAi: 1, queue: 1, cost: 0, included: true });
  });

  it("viewer: 403 and nothing written", async () => {
    scopeState.role = "viewer";
    expect((await POST(req())).status).toBe(403);
    expect(db.sb!.calls).toEqual([]);
  });

  it("no project → 404 (rows are per project, never per caller)", async () => {
    scopeState.projectId = null;
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(db.sb!.calls).toEqual([]);
  });

  it("400 without a CSV, 422 when the header is unknown or nothing parses", async () => {
    const fd = new FormData();
    expect((await POST(new NextRequest("http://x/api/expenses/import", { method: "POST", body: fd }))).status).toBe(400);
    expect((await POST(req(CSV, "statement.xlsx"))).status).toBe(400);
    expect((await POST(req("foo,bar\n1,2"))).status).toBe(422);
    expect((await POST(req("Date,Description,Amount\njunk,x,notanumber"))).status).toBe(422);
  });

  it("unauthenticated → 401", async () => {
    auth.user = null;
    expect((await POST(req())).status).toBe(401);
  });
});
