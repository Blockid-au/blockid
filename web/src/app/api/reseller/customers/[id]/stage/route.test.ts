// Colocated vitest for POST /api/reseller/customers/[id]/stage (G2 #7, S19-B).
//
// Pins the ownership chain: 401 no session → 403 no membership → 403 viewer
// role → 403 customer not attributed to THIS reseller → 400 bad body →
// audit row written before the upsert (and a failed audit aborts) → manual
// moves in either direction → same manual stage is a no-op.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  scopedReseller: vi.fn(),
  resellerSupabase: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/reseller/scope", () => ({
  scopedReseller: (u: unknown) => mocks.scopedReseller(u),
  ResellerScopeError: class ResellerScopeError extends Error {
    code: string;
    constructor(msg: string, code = "no_membership") {
      super(msg);
      this.code = code;
    }
  },
}));
vi.mock("@/lib/reseller/supabase", () => ({
  resellerSupabase: (s: unknown) => mocks.resellerSupabase(s),
}));

import { POST } from "./route";

const { ResellerScopeError } = await import("@/lib/reseller/scope");

const CUST = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACTOR = { id: "actor-1", email: "owner@partner.au", plan: "reseller_admin", role: "user" };

function makeScope(role: "owner" | "admin" | "viewer" = "owner") {
  return {
    reseller_id: "res-1",
    role,
    allowedCustomerIds: vi.fn().mockResolvedValue([CUST]),
  };
}

function makeDb(current: unknown[] = []) {
  return {
    customerStages: vi.fn().mockResolvedValue(current),
    auditLog: vi.fn().mockResolvedValue(undefined),
    setCustomerStage: vi.fn().mockResolvedValue({ stage_updated_at: "2026-09-11T10:00:00.000Z" }),
  };
}

function req(body: unknown, id = CUST) {
  const request = new Request(`https://blockid.au/api/reseller/customers/${id}/stage`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", "user-agent": "vitest" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(ACTOR);
  mocks.scopedReseller.mockResolvedValue(makeScope());
  mocks.resellerSupabase.mockReturnValue(makeDb());
});

describe("POST /api/reseller/customers/[id]/stage", () => {
  it("401 without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await req({ stage: "scored" });
    expect(res.status).toBe(401);
  });

  it("403 without a reseller membership", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("nope", "no_membership"));
    const res = await req({ stage: "scored" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "no_membership" });
  });

  it("403 for a viewer — only owner/admin of that reseller may move a customer", async () => {
    mocks.scopedReseller.mockResolvedValue(makeScope("viewer"));
    const db = makeDb();
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await req({ stage: "scored" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "not_admin" });
    expect(db.setCustomerStage).not.toHaveBeenCalled();
    expect(db.auditLog).not.toHaveBeenCalled();
  });

  it("admin role is allowed", async () => {
    mocks.scopedReseller.mockResolvedValue(makeScope("admin"));
    const res = await req({ stage: "scored" });
    expect(res.status).toBe(200);
  });

  it("403 when the customer is not attributed to this reseller (IDOR guard)", async () => {
    const db = makeDb();
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await req({ stage: "scored" }, OTHER);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, reason: "not_in_scope" });
    expect(db.setCustomerStage).not.toHaveBeenCalled();
  });

  it("400 for a non-uuid id", async () => {
    const res = await req({ stage: "scored" }, "not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("400 for an unknown stage or extra keys", async () => {
    expect((await req({ stage: "won" })).status).toBe(400);
    expect((await req({ stage: "scored", extra: 1 })).status).toBe(400);
    expect((await req("{not json")).status).toBe(400);
  });

  it("writes the audit row, then upserts the manual stage (forward move from auto)", async () => {
    const db = makeDb([
      { customer_user_id: CUST, stage: "onboarded", stage_source: "auto", stage_updated_at: "2026-09-01T00:00:00Z", stage_set_by: null, stage_note: null },
    ]);
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await req({ stage: "invested", note: "Term sheet signed 10 Sep" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      changed: true,
      from: "onboarded",
      stage: "invested",
      stage_source: "manual",
      stage_updated_at: "2026-09-11T10:00:00.000Z",
    });
    expect(db.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: "actor-1",
        subject_user_id: CUST,
        action: "set_customer_stage",
        fields: ["stage"],
        route: "/api/reseller/customers/[id]/stage",
        ip: "203.0.113.9",
        user_agent: "vitest",
        metadata: { from: "onboarded", to: "invested", previous_source: "auto", note: "Term sheet signed 10 Sep" },
      }),
    );
    expect(db.setCustomerStage).toHaveBeenCalledWith({
      customer_user_id: CUST,
      stage: "invested",
      actor_user_id: "actor-1",
      note: "Term sheet signed 10 Sep",
    });
    const auditOrder = db.auditLog.mock.invocationCallOrder[0];
    const writeOrder = db.setCustomerStage.mock.invocationCallOrder[0];
    expect(auditOrder).toBeLessThan(writeOrder);
  });

  it("manual can move backwards (auto never does)", async () => {
    const db = makeDb([
      { customer_user_id: CUST, stage: "fundraising", stage_source: "auto", stage_updated_at: "2026-09-01T00:00:00Z", stage_set_by: null, stage_note: null },
    ]);
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await req({ stage: "onboarded" });
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, changed: true, from: "fundraising", stage: "onboarded" });
    expect(db.setCustomerStage).toHaveBeenCalledWith(expect.objectContaining({ stage: "onboarded" }));
  });

  it("re-asserting the same manual stage is a no-op with no audit row", async () => {
    const db = makeDb([
      { customer_user_id: CUST, stage: "churned", stage_source: "manual", stage_updated_at: "2026-09-05T00:00:00Z", stage_set_by: "actor-1", stage_note: null },
    ]);
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await req({ stage: "churned" });
    expect(await res.json()).toEqual({
      ok: true,
      changed: false,
      stage: "churned",
      stage_source: "manual",
      stage_updated_at: "2026-09-05T00:00:00Z",
    });
    expect(db.auditLog).not.toHaveBeenCalled();
    expect(db.setCustomerStage).not.toHaveBeenCalled();
  });

  it("a failed audit write aborts before any mutation", async () => {
    const db = makeDb();
    db.auditLog.mockRejectedValue(new Error("append-only table down"));
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await req({ stage: "scored" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, reason: "audit_failed" });
    expect(db.setCustomerStage).not.toHaveBeenCalled();
  });

  it("surfaces a failed upsert as 500 write_failed", async () => {
    const db = makeDb();
    db.setCustomerStage.mockRejectedValue(new Error("relation reseller_customers does not exist"));
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await req({ stage: "scored" });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, reason: "write_failed" });
  });
});
