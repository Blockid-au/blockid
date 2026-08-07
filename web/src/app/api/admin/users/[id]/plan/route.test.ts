// Colocated vitest for POST /api/admin/users/[id]/plan — P9-admin-users-plan-route-test.
//
// This is the v2 plan-mutation surface (matches P12.7 in the reseller-module
// plan). Differs from /api/admin/users/manage in three ways: (1) it looks up
// the plan slug against the plans-db catalogue (so a typo can't strand a
// user on a non-existent plan); (2) it writes a hash-chained audit row on
// every change; (3) it supports an opt-in reconcile_credits flag so the
// admin can decide whether the destination plan's monthly_credits allowance
// should be granted along with the plan swap.
//
// Regressions this suite is designed to catch:
//   - dropping the requireAdmin gate would let any logged-in user mutate
//     any other user's plan;
//   - flipping the no_user / not_admin status codes (401 vs 403) would
//     desync the admin console's session-timeout handling;
//   - dropping the plans-db lookup would let an admin type a hallucinated
//     slug that matches PLAN_SLUG but resolves nowhere;
//   - firing grantCredits on a no-op mutation (same plan in/out) would
//     let a re-save double-credit the founder;
//   - skipping the audit write on a real change would erase the trail
//     for a plan mutation that must be reconstructable at year-end.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  role: string;
  plan: string | null;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  appendAuditMock: vi.fn<(entry: Record<string, unknown>) => Promise<void>>(),
  grantCreditsMock: vi.fn<(
    id: string,
    amount: number,
    kind: string,
    meta: Record<string, unknown>,
  ) => Promise<{ ok: boolean }>>(),
  getPlanCachedMock: vi.fn<(slug: string) => Promise<{
    id: string;
    usage_limits?: { monthly_credits?: number | null };
    segment?: string | null;
  } | null>>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/reseller/require-admin", async () => {
  // Re-export the real AdminGateError but stub requireAdmin so we can pin
  // the "throws" behaviour without depending on ADMIN_EMAIL env config.
  class AdminGateError extends Error {
    constructor(public code: "no_user" | "not_admin" = "not_admin") {
      super(code);
    }
  }
  return {
    AdminGateError,
    requireAdmin(user: AppUser | null | undefined): asserts user is AppUser {
      if (!user) throw new AdminGateError("no_user");
      const isAdmin = user.role === "admin" || user.email === "admin@blockid.au";
      if (!isAdmin) throw new AdminGateError("not_admin");
    },
  };
});

vi.mock("@/lib/audit", () => ({
  appendAudit: (e: Record<string, unknown>) => mocks.appendAuditMock(e),
}));

vi.mock("@/lib/credits", () => ({
  grantCredits: (
    id: string,
    amt: number,
    k: string,
    m: Record<string, unknown>,
  ) => mocks.grantCreditsMock(id, amt, k, m),
}));

vi.mock("@/lib/plans-db", () => ({
  getPlanCached: (slug: string) => mocks.getPlanCachedMock(slug),
}));

import { POST } from "./route";

// --- Fake supabase --------------------------------------------------------

interface FakeState {
  targetRow: AppUser | null;
  updateError: { message: string } | null;
  fromCalls: string[];
  selectCalls: string[];
  eqCalls: Array<[string, string, unknown]>;
  updates: Array<Record<string, unknown>>;
}

const state: FakeState = {
  targetRow: null,
  updateError: null,
  fromCalls: [],
  selectCalls: [],
  eqCalls: [],
  updates: [],
};

function makeChain() {
  const api: Record<string, unknown> = {};
  let mode: "select" | "update" = "select";
  api.select = (cols: string) => {
    mode = "select";
    state.selectCalls.push(cols);
    return api;
  };
  api.update = (patch: Record<string, unknown>) => {
    mode = "update";
    state.updates.push(patch);
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    state.eqCalls.push([mode, col, val]);
    if (mode === "update") {
      return Promise.resolve({ data: null, error: state.updateError });
    }
    return api;
  };
  api.maybeSingle = () => Promise.resolve({ data: state.targetRow, error: null });
  return api;
}

function fakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      return makeChain();
    },
  };
}

const ADMIN: AppUser = {
  id: "admin-1",
  email: "admin@blockid.au",
  role: "admin",
  plan: "growth",
};
const TARGET: AppUser = {
  id: "target-uuid",
  email: "target@example.com",
  role: "user",
  plan: "free",
};

async function callPost(
  body: unknown,
  opts?: { id?: string; badJson?: boolean },
): Promise<Response> {
  const id = opts?.id ?? TARGET.id;
  const request = new Request(`http://x/api/admin/users/${id}/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state.targetRow = TARGET;
  state.updateError = null;
  state.fromCalls = [];
  state.selectCalls = [];
  state.eqCalls = [];
  state.updates = [];

  mocks.getCurrentUserMock.mockReset().mockResolvedValue(ADMIN);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
  mocks.appendAuditMock.mockReset().mockResolvedValue(undefined);
  mocks.grantCreditsMock.mockReset().mockResolvedValue({ ok: true });
  mocks.getPlanCachedMock.mockReset().mockResolvedValue({
    id: "founder_growth",
    usage_limits: { monthly_credits: 300 },
    segment: "founder",
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Admin gate — 401 vs 403 mapping
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — admin gate", () => {
  it("returns 401 (not 403) with reason='no_user' when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "no_user" });
  });

  it("returns 403 with reason='not_admin' for a plain user", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({
      id: "u2",
      email: "someone@example.com",
      role: "user",
      plan: "free",
    });
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "not_admin" });
  });

  it("MUST NOT touch Supabase when the admin gate refuses", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await callPost({ plan: "founder_growth" });
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("MUST NOT touch plans-db when the admin gate refuses", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await callPost({ plan: "founder_growth" });
    expect(mocks.getPlanCachedMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Body parsing (400)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — body parsing", () => {
  it("returns 400 with reason='invalid_body' on invalid JSON", async () => {
    const res = await callPost(undefined, { badJson: true });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "invalid_body" });
  });

  it("returns 400 with reason='plan_invalid' when plan is missing", async () => {
    const res = await callPost({});
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("plan_invalid");
  });

  it("returns 400 with reason='plan_slug_invalid' when plan violates PLAN_SLUG shape", async () => {
    const res = await callPost({ plan: "Not A Valid Slug!" });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("plan_slug_invalid");
  });

  it("returns 400 with reason='reconcile_credits_invalid' when it's a string", async () => {
    const res = await callPost({ plan: "founder_growth", reconcile_credits: "yes" });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("reconcile_credits_invalid");
  });
});

// -----------------------------------------------------------------------------
// Plans-db lookup (400 plan_not_found)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — plans-db resolution", () => {
  it("returns 400 with reason='plan_not_found' when getPlanCached returns null", async () => {
    mocks.getPlanCachedMock.mockResolvedValue(null);
    const res = await callPost({ plan: "hallucinated_plan" });
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("plan_not_found");
  });

  it("passes the exact slug through to getPlanCached", async () => {
    await callPost({ plan: "founder_growth" });
    expect(mocks.getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("MUST NOT update app_users when the plan slug does not resolve", async () => {
    mocks.getPlanCachedMock.mockResolvedValue(null);
    await callPost({ plan: "hallucinated_plan" });
    expect(state.updates).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Config gate (503)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — config gate", () => {
  it("returns 503 with reason='not_configured' when Supabase is null", async () => {
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.reason).toBe("not_configured");
  });
});

// -----------------------------------------------------------------------------
// Target lookup (404)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — target lookup", () => {
  it("returns 404 with reason='not_found' when the target user does not exist", async () => {
    state.targetRow = null;
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.reason).toBe("not_found");
  });

  it("queries app_users by id (from the URL param)", async () => {
    await callPost({ plan: "founder_growth" });
    expect(state.eqCalls).toContainEqual(["select", "id", TARGET.id]);
  });
});

// -----------------------------------------------------------------------------
// No-op mutation
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — no-op", () => {
  it("returns { ok:true, unchanged:true } when target already on requested plan", async () => {
    state.targetRow = { ...TARGET, plan: "founder_growth" };
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true, unchanged: true, plan: "founder_growth" });
  });

  it("MUST NOT UPDATE app_users on a no-op", async () => {
    // Pin the "no empty rows in the hash-chained audit" invariant.
    state.targetRow = { ...TARGET, plan: "founder_growth" };
    await callPost({ plan: "founder_growth" });
    expect(state.updates).toEqual([]);
  });

  it("MUST NOT appendAudit on a no-op", async () => {
    state.targetRow = { ...TARGET, plan: "founder_growth" };
    await callPost({ plan: "founder_growth" });
    expect(mocks.appendAuditMock).not.toHaveBeenCalled();
  });

  it("MUST NOT grantCredits on a no-op even when reconcile_credits=true", async () => {
    state.targetRow = { ...TARGET, plan: "founder_growth" };
    await callPost({ plan: "founder_growth", reconcile_credits: true });
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Update failure (500)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — update failure", () => {
  it("returns 500 with reason='update_failed' when the DB update errors", async () => {
    state.updateError = { message: "row locked" };
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("update_failed");
    expect(body.error).toBe("row locked");
  });

  it("MUST NOT appendAudit when the update failed", async () => {
    state.updateError = { message: "row locked" };
    await callPost({ plan: "founder_growth" });
    expect(mocks.appendAuditMock).not.toHaveBeenCalled();
  });

  it("MUST NOT grantCredits when the update failed", async () => {
    state.updateError = { message: "row locked" };
    await callPost({ plan: "founder_growth", reconcile_credits: true });
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Happy path — plan change (no reconciliation)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — plan change (default: no reconcile)", () => {
  it("returns 200 with { ok, plan, previous_plan, credits_granted:0 }", async () => {
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      plan: "founder_growth",
      previous_plan: "free",
      credits_granted: 0,
    });
  });

  it("updates app_users.plan by target id", async () => {
    await callPost({ plan: "founder_growth" });
    expect(state.updates).toContainEqual({ plan: "founder_growth" });
    expect(state.eqCalls).toContainEqual(["update", "id", TARGET.id]);
  });

  it("does NOT grant credits when reconcile_credits is absent", async () => {
    await callPost({ plan: "founder_growth" });
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });

  it("does NOT grant credits when reconcile_credits=false", async () => {
    await callPost({ plan: "founder_growth", reconcile_credits: false });
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });

  it("appends an audit event with action='admin.plan.changed' on every real change", async () => {
    await callPost({ plan: "founder_growth" });
    expect(mocks.appendAuditMock).toHaveBeenCalledTimes(1);
    const entry = mocks.appendAuditMock.mock.calls[0]?.[0];
    expect(entry?.action).toBe("admin.plan.changed");
    expect(entry?.resource_type).toBe("app_users");
    expect(entry?.resource_id).toBe(TARGET.id);
    expect(entry?.user_id).toBe(ADMIN.id);
  });

  it("audit detail records previous_plan + new_plan + actor_email", async () => {
    await callPost({ plan: "founder_growth" });
    const entry = mocks.appendAuditMock.mock.calls[0]?.[0];
    const detail = entry?.detail as Record<string, unknown>;
    expect(detail.previous_plan).toBe("free");
    expect(detail.new_plan).toBe("founder_growth");
    expect(detail.actor_email).toBe(ADMIN.email);
    expect(detail.credits_granted).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Reconcile credits branch
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — reconcile_credits", () => {
  it("grants monthly_credits when reconcile_credits=true and plan advertises >0", async () => {
    await callPost({ plan: "founder_growth", reconcile_credits: true });
    expect(mocks.grantCreditsMock).toHaveBeenCalledTimes(1);
    const [uid, amt, kind, meta] = mocks.grantCreditsMock.mock.calls[0] ?? [];
    expect(uid).toBe(TARGET.id);
    expect(amt).toBe(300);
    expect(kind).toBe("plan_grant");
    expect(meta).toMatchObject({
      plan: "founder_growth",
      previous_plan: "free",
      granted_by: ADMIN.email,
      admin_action: true,
      changed_via: "admin.users.plan",
    });
  });

  it("returns credits_granted=300 in the response body when the grant succeeded", async () => {
    const res = await callPost({ plan: "founder_growth", reconcile_credits: true });
    const body = await json(res);
    expect(body.credits_granted).toBe(300);
  });

  it("returns credits_granted=0 when grantCredits.ok===false (grant failed)", async () => {
    mocks.grantCreditsMock.mockResolvedValue({ ok: false });
    const res = await callPost({ plan: "founder_growth", reconcile_credits: true });
    const body = await json(res);
    expect(body.credits_granted).toBe(0);
  });

  it("does NOT grant credits when destination plan monthly_credits is 0", async () => {
    mocks.getPlanCachedMock.mockResolvedValue({
      id: "founder_free",
      usage_limits: { monthly_credits: 0 },
    });
    await callPost({ plan: "founder_free", reconcile_credits: true });
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });

  it("does NOT grant credits when destination plan monthly_credits is missing", async () => {
    mocks.getPlanCachedMock.mockResolvedValue({ id: "founder_free" });
    await callPost({ plan: "founder_free", reconcile_credits: true });
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });

  it("does NOT grant credits when destination plan monthly_credits is the -1 sentinel (unlimited)", async () => {
    // decidePlanChange gates on `> 0` — pin the sentinel does not trigger
    // Math.floor(-1) = -1 credits granted (absurd) or infinite grant.
    mocks.getPlanCachedMock.mockResolvedValue({
      id: "founder_unlimited",
      usage_limits: { monthly_credits: -1 },
    });
    await callPost({ plan: "founder_unlimited", reconcile_credits: true });
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Audit resilience — audit failure never breaks the response
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/[id]/plan — audit resilience", () => {
  it("still returns 200 when appendAudit throws (best-effort audit)", async () => {
    // The audit write is important but never load-bearing on the response —
    // dropping this try/catch would surface transient audit-DB blips as 500s.
    mocks.appendAuditMock.mockRejectedValue(new Error("hash chain locked"));
    const res = await callPost({ plan: "founder_growth" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});
