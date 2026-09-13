// Colocated tests for POST /api/expenses/categorise (S28-C).
//
//   preview (`confirm` absent) → 200 with queue / units / cost, NO spend, NO
//   model call; confirm → spendCreditsUnits(ceil(n/100)) then the model;
//   Growth+ (gate) → cost 0 and no spend; insufficient balance → 402 before
//   preview; empty queue → 409; total model failure after a spend → refund,
//   nothing written; partial (unsure) answers keep the charge; editor
//   allowed, viewer 403, no project 404.

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

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const credits = vi.hoisted(() => ({ balance: 10, spendCreditsUnits: vi.fn(), grantCredits: vi.fn() }));
vi.mock("@/lib/credits", async () => {
  const real = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return {
    FEATURE_COSTS: real.FEATURE_COSTS,
    getBalance: async () => credits.balance,
    spendCreditsUnits: (...a: unknown[]) => credits.spendCreditsUnits(...a),
    grantCredits: (...a: unknown[]) => credits.grantCredits(...a),
  };
});

const gate = vi.hoisted(() => ({ included: false }));
vi.mock("@/lib/expenses/gate", () => ({ categoriseIncluded: async () => ({ included: gate.included, via: gate.included ? "growth" : null }) }));

const model = vi.hoisted(() => ({ mode: "ok" as "ok" | "throw" | "unsure" | "junk" | "partial", calls: 0 }));
vi.mock("@/lib/expenses/categorise", async () => {
  const real = await vi.importActual<typeof import("@/lib/expenses/categorise")>("@/lib/expenses/categorise");
  return {
    ...real,
    defaultAi: async ({ user }: { system: string; user: string }) => {
      model.calls++;
      if (model.mode === "throw") throw new Error("model down");
      if (model.mode === "junk") return { text: "I cannot help with that." };
      if (model.mode === "partial" && model.calls === 2) throw new Error("model down");
      const batch = JSON.parse(user) as Array<{ i: number }>;
      const conf = model.mode === "unsure" ? 0.2 : 0.8;
      return { text: JSON.stringify(batch.map((b) => ({ i: b.i, category: "contractors", confidence: conf }))) };
    },
  };
});

import { POST } from "./route";

function queueRow(i: number) {
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    project_id: "proj-1",
    statement_ref: "ANZ:x.csv:abc",
    occurred_on: "2026-06-01",
    description: `PAYMENT ${i}`,
    amount_aud: -10 - i,
    counterparty: "unknown",
    category: "other",
    category_source: null,
    confidence: 0,
    needs_review: true,
    gst_treatment: "unknown",
    hash: `h${i}`,
    created_at: "2026-06-02T00:00:00Z",
  };
}

function req(body: unknown = {}) {
  return new NextRequest("http://x/api/expenses/categorise", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

function reset(rows = 3) {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  db.sb = fakeSupabase({ bank_transactions: Array.from({ length: rows }, (_, i) => queueRow(i)) });
  credits.balance = 10;
  credits.spendCreditsUnits.mockReset().mockImplementation(async (_u: string, _f: string, units: number) => ({ ok: true, balance: credits.balance - units, cost: units }));
  credits.grantCredits.mockReset().mockResolvedValue({ ok: true, balance: 10 });
  gate.included = false;
  model.mode = "ok";
  model.calls = 0;
}

beforeEach(() => reset());

describeMemberAccess("POST /api/expenses/categorise", {
  state: scopeState,
  kind: "write",
  reset: () => reset(),
  run: () => POST(req({ confirm: true })),
  skipNoProject: true,
});

describe("POST /api/expenses/categorise — preview → confirm", () => {
  it("preview: shows queue, units and cost; spends nothing; never calls the model", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, preview: true, queue: 3, units: 1, cost: 1, listedCost: 1, included: false, balance: 10 });
    expect(credits.spendCreditsUnits).not.toHaveBeenCalled();
    expect(model.calls).toBe(0);
    expect(db.sb!.find("bank_transactions", "update")).toEqual([]);
  });

  it("credit maths: 150 queued rows → 2 units → 2 credits", async () => {
    reset(150);
    const body = await (await POST(req({}))).json();
    expect(body).toMatchObject({ queue: 150, units: 2, cost: 2 });
  });

  it("confirm: spends the units to the CALLER (project_id in metadata) BEFORE the model, then writes every decision", async () => {
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(credits.spendCreditsUnits).toHaveBeenCalledWith("user-caller", "expense_categorise", 1, { project_id: "proj-1", rows: 3 });
    expect(body).toMatchObject({ ok: true, categorised: 3, accepted: 3, needsReview: 0, batches: 1, cost: 1, creditsCharged: 1, balance: 9 });
    const updates = db.sb!.find("bank_transactions", "update");
    expect(updates).toHaveLength(3);
    expect(updates[0].args[0]).toMatchObject({ category: "contractors", category_source: "ai", needs_review: false });
    expect(db.sb!.hasEq("bank_transactions", "project_id", "proj-1")).toBe(true);
  });

  it("Growth+ / Startup Package: included → cost 0, no spend, model still runs", async () => {
    gate.included = true;
    const prev = await (await POST(req({}))).json();
    expect(prev).toMatchObject({ preview: true, cost: 0, units: 0, included: true, includedVia: "growth" });
    // Lane-2 P3-d: an included preview carries the real balance and an honest note.
    expect(prev.balance).toBe(credits.balance);
    expect(prev.creditNote).toBe("Included in your plan — no credits charged.");
    const body = await (await POST(req({ confirm: true }))).json();
    expect(body).toMatchObject({ ok: true, cost: 0, creditsCharged: 0, included: true, accepted: 3, creditNote: "Included in your plan — no credits charged." });
    expect(credits.spendCreditsUnits).not.toHaveBeenCalled();
  });

  it("insufficient balance → 402 with the price, before preview and before any spend", async () => {
    credits.balance = 0;
    const res = await POST(req({}));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "insufficient_credits", creditsRequired: 1, balance: 0 });
    expect(credits.spendCreditsUnits).not.toHaveBeenCalled();
  });

  it("credit spend failure → 402, model not called", async () => {
    credits.spendCreditsUnits.mockResolvedValue({ ok: false, balance: 0, cost: 0 });
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(402);
    expect(model.calls).toBe(0);
  });

  it("empty queue → 409 and nothing charged", async () => {
    reset(0);
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(409);
    expect(credits.spendCreditsUnits).not.toHaveBeenCalled();
  });

  it("total model failure after a spend → refund, nothing written, 503", async () => {
    model.mode = "throw";
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "ai_unavailable", retryCost: 1 });
    expect(credits.grantCredits).toHaveBeenCalledWith("user-caller", 1, "refund", expect.objectContaining({ feature: "expense_categorise", reason: "ai_unavailable" }));
    expect(db.sb!.find("bank_transactions", "update")).toEqual([]);
  });

  it("unparseable model text counts as a failed batch → same refund path", async () => {
    model.mode = "junk";
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(503);
    expect(credits.grantCredits).toHaveBeenCalledTimes(1);
  });

  it("S29-hardening: PARTIAL model failure → the failed batch's rows stay queued and their credit blocks are refunded pro rata (`refunded`)", async () => {
    // 150 rows → 4 batches (40/40/40/30) → 2 units; the second batch fails (40 rows → 1 unit back).
    reset(150);
    model.mode = "partial";
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, categorised: 110, accepted: 110, batches: 4, failedBatches: 1, failedRows: 40, cost: 2, creditsCharged: 2, refunded: 1, balance: 10 });
    expect(credits.grantCredits).toHaveBeenCalledWith("user-caller", 1, "refund", expect.objectContaining({ feature: "expense_categorise", project_id: "proj-1", reason: "ai_partial", failed_rows: 40, units: 1 }));
    expect(db.sb!.find("bank_transactions", "update")).toHaveLength(110);
  });

  it("S29-hardening: a partial failure on an included (free) run refunds nothing and reports refunded: 0", async () => {
    reset(150);
    gate.included = true;
    model.mode = "partial";
    const body = await (await POST(req({ confirm: true }))).json();
    expect(body).toMatchObject({ ok: true, failedRows: 40, creditsCharged: 0, refunded: 0 });
    expect(credits.grantCredits).not.toHaveBeenCalled();
  });

  it("unsure answers (confidence < 0.5) are written as other + review and the charge stands", async () => {
    model.mode = "unsure";
    const res = await POST(req({ confirm: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ accepted: 0, needsReview: 3, creditsCharged: 1 });
    expect(credits.grantCredits).not.toHaveBeenCalled();
    const updates = db.sb!.find("bank_transactions", "update");
    expect(updates[0].args[0]).toMatchObject({ category: "other", category_source: "ai", needs_review: true });
  });

  it("viewer → 403 before anything; no project → 404", async () => {
    scopeState.role = "viewer";
    expect((await POST(req({ confirm: true }))).status).toBe(403);
    expect(credits.spendCreditsUnits).not.toHaveBeenCalled();
    reset();
    scopeState.projectId = null;
    expect((await POST(req({ confirm: true }))).status).toBe(404);
  });

  it("unauthenticated → 401", async () => {
    auth.user = null;
    expect((await POST(req({}))).status).toBe(401);
  });
});
