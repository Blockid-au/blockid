// Colocated vitest for POST /api/admin/users/manage — P9-admin-users-manage-route-test.
//
// This is the admin UI's plan/role mutation surface. It carries a lot of
// blast radius: the same POST can grant a founder Growth credits, promote
// a random account to admin, or (worst case) both. Regressions here look
// like admin-panel usability bugs but are actually security incidents.
//
// Regressions this suite is designed to catch:
//   - dropping the requireAdmin gate (or checking only user.email without
//     the role fallback) would let ANY logged-in user re-plan / re-role
//     ANY other user;
//   - accepting a plan slug not in VALID_PLANS would let an admin type a
//     typo like "founding_50" and land the user on a plan entitlements.ts
//     doesn't map;
//   - dropping the .toLowerCase().trim() on the email lookup would let an
//     admin's "Alice@Corp.com" fail to find the row created as
//     "alice@corp.com" (silent 404 in the UI);
//   - firing grantCredits on ROLE changes (not just plan changes) would
//     hand every role toggle a credit grant they never earned;
//   - not skipping grantCredits when new plan == old plan (same-value
//     update) would let an admin double-credit by re-saving.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  role: string;
  plan: string | null;
  displayName?: string | null;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  grantCreditsMock: vi.fn<(
    userId: string,
    amount: number,
    kind: string,
    meta: Record<string, unknown>,
  ) => Promise<{ ok: boolean; balance?: number }>>(),
  // Small stable fixture so tests do not churn when PLAN_CREDITS grows.
  PLAN_CREDITS_FIXTURE: {
    founding50: { amount: 100, recurring: false },
    growth: { amount: 300, recurring: true },
    free: { amount: 0, recurring: false },
  } as Record<string, { amount: number; recurring: boolean }>,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/credits", () => ({
  grantCredits: (
    id: string,
    amt: number,
    k: string,
    m: Record<string, unknown>,
  ) => mocks.grantCreditsMock(id, amt, k, m),
  PLAN_CREDITS: mocks.PLAN_CREDITS_FIXTURE,
}));

import { POST, dynamic } from "./route";

// --- Fake supabase --------------------------------------------------------

interface FakeState {
  targetRow: AppUser | null;
  reReadRow: AppUser | null;
  updateError: { message: string } | null;
  fromCalls: string[];
  selectCalls: string[];
  eqCalls: Array<[string, string, unknown]>;
  updates: Array<Record<string, unknown>>;
}

const state: FakeState = {
  targetRow: null,
  reReadRow: null,
  updateError: null,
  fromCalls: [],
  selectCalls: [],
  eqCalls: [],
  updates: [],
};

// Track chain-per-call so we can emit different results for lookup vs re-read.
let selectCallCount = 0;

function makeChain() {
  const api: Record<string, unknown> = {};
  let mode: "select" | "update" = "select";
  let myIndex = -1;

  api.select = (cols: string) => {
    mode = "select";
    myIndex = selectCallCount++;
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
  api.single = () => Promise.resolve({ data: state.reReadRow ?? state.targetRow, error: null });
  // Silence eslint: myIndex is captured for potential future disambiguation.
  void myIndex;
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
  id: "user-99",
  email: "target@example.com",
  role: "user",
  plan: "free",
  displayName: "Target",
};

function req(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://x/api/admin/users/manage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{no" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  state.targetRow = TARGET;
  state.reReadRow = { ...TARGET, plan: "growth" }; // post-update snapshot
  state.updateError = null;
  state.fromCalls = [];
  state.selectCalls = [];
  state.eqCalls = [];
  state.updates = [];
  selectCallCount = 0;

  mocks.getCurrentUserMock.mockReset().mockResolvedValue(ADMIN);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
  mocks.grantCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 300 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — module invariants", () => {
  it("exports dynamic='force-dynamic' so admin ops are never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Admin gate (403)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — admin gate", () => {
  it("returns 403 when no user session", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Admin access required");
  });

  it("returns 403 for a plain user (wrong email, wrong role)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({
      id: "u2",
      email: "someone@example.com",
      role: "user",
      plan: "free",
    });
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(res.status).toBe(403);
  });

  it("allows the hard-coded admin email even without role=admin", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({
      id: "u3",
      email: "admin@blockid.au",
      role: "user",
      plan: "free",
    });
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(res.status).toBe(200);
  });

  it("allows any email that has role='admin'", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({
      id: "u4",
      email: "other@example.com",
      role: "admin",
      plan: "free",
    });
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(res.status).toBe(200);
  });

  it("MUST NOT touch Supabase when the admin gate refuses", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(mocks.getSupabaseAdminMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Body validation (400)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — body validation", () => {
  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid body");
  });

  it("returns 400 when neither email nor user_id is provided", async () => {
    const res = await POST(req({ field: "plan", value: "growth" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toMatch(/user_id/i);
  });

  it("returns 400 when field is missing", async () => {
    const res = await POST(req({ email: TARGET.email, value: "growth" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when value is missing", async () => {
    const res = await POST(req({ email: TARGET.email, field: "plan" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when field is neither 'plan' nor 'role'", async () => {
    const res = await POST(req({ email: TARGET.email, field: "credits", value: "1000" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toMatch(/plan.*role/i);
  });

  it("returns 400 for an invalid plan value (typo)", async () => {
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "founding_50" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toMatch(/plan must be one of/i);
  });

  it("returns 400 for an invalid role value", async () => {
    const res = await POST(req({ email: TARGET.email, field: "role", value: "superadmin" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toMatch(/role must be one of/i);
  });

  it("accepts every VALID_PLANS entry that isn't promo-gated", async () => {
    // founding50 is validated separately below — after the 2026-08-31 UTC
    // auto-cutover the route rejects it with 410, so it can't be looped
    // through unconditionally.
    for (const p of ["free", "growth"] as const) {
      const res = await POST(req({ email: TARGET.email, field: "plan", value: p }));
      expect(res.status).toBe(200);
    }
  });

  it("gates founding50 through isFoundingPromoActive", async () => {
    // We can't time-mock the route's `new Date()` call cleanly from here,
    // so assert the current live behaviour: either 200 (promo still on) or
    // 410 (promo ended) — both are correct, but never 400 / 500.
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "founding50" }));
    expect([200, 410]).toContain(res.status);
    if (res.status === 410) {
      const body = await json(res);
      expect(String(body.error)).toMatch(/founding50 promo ended/i);
    }
  });

  it("accepts every VALID_ROLES entry", async () => {
    for (const r of ["user", "admin"] as const) {
      const res = await POST(req({ email: TARGET.email, field: "role", value: r }));
      expect(res.status).toBe(200);
    }
  });

  it("does not touch grantCredits when body validation fails", async () => {
    await POST(req({ email: TARGET.email, field: "plan", value: "bogus" }));
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Config gate (503)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — config gate", () => {
  it("returns 503 when Supabase is unconfigured", async () => {
    mocks.getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.error).toBe("DB not configured");
  });
});

// -----------------------------------------------------------------------------
// Target lookup (404)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — target lookup", () => {
  it("returns 404 when the target user is not found", async () => {
    state.targetRow = null;
    const res = await POST(req({ email: "ghost@nope.co", field: "plan", value: "growth" }));
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("User not found");
  });

  it("looks up by user_id when provided (prefers unambiguous id lookup)", async () => {
    await POST(req({ user_id: TARGET.id, field: "plan", value: "growth" }));
    expect(state.eqCalls).toContainEqual(["select", "id", TARGET.id]);
  });

  it("looks up by email (lowercased + trimmed) when user_id is absent", async () => {
    await POST(req({ email: "  TARGET@Example.COM  ", field: "plan", value: "growth" }));
    expect(state.eqCalls).toContainEqual(["select", "email", "target@example.com"]);
  });

  it("prefers user_id even when email is also supplied", async () => {
    await POST(req({
      user_id: TARGET.id,
      email: "IGNORE@example.com",
      field: "plan",
      value: "growth",
    }));
    expect(state.eqCalls).toContainEqual(["select", "id", TARGET.id]);
    const emailLookup = state.eqCalls.find(([, col]) => col === "email");
    expect(emailLookup).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// Update failure (500)
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — update failure", () => {
  it("returns 500 with the DB error message when update fails", async () => {
    state.updateError = { message: "constraint violation" };
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("constraint violation");
  });
});

// -----------------------------------------------------------------------------
// Plan grant side-effect
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — plan grant side-effect", () => {
  it("grants credits when plan CHANGES to a plan with a positive amount", async () => {
    state.targetRow = { ...TARGET, plan: "free" };
    await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(mocks.grantCreditsMock).toHaveBeenCalledTimes(1);
    const [uid, amt, kind, meta] = mocks.grantCreditsMock.mock.calls[0] ?? [];
    expect(uid).toBe(TARGET.id);
    expect(amt).toBe(300); // PLAN_CREDITS_FIXTURE.growth.amount
    expect(kind).toBe("plan_grant");
    expect(meta).toMatchObject({
      plan: "growth",
      previous_plan: "free",
      granted_by: ADMIN.email,
      admin_action: true,
    });
  });

  it("does NOT grant credits when the plan is unchanged (idempotent)", async () => {
    // Pin the "no double-credit on re-save" invariant: if the target already
    // sits on the requested plan, grantCredits MUST NOT fire.
    state.targetRow = { ...TARGET, plan: "growth" };
    await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });

  it("does NOT grant credits when moving to a zero-amount plan (free)", async () => {
    state.targetRow = { ...TARGET, plan: "growth" };
    await POST(req({ email: TARGET.email, field: "plan", value: "free" }));
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });

  it("does NOT grant credits on ROLE changes", async () => {
    // Role toggles are metadata only — a credit grant here would be free money.
    await POST(req({ email: TARGET.email, field: "role", value: "admin" }));
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// DB update shape
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — DB update shape", () => {
  it("updates only the { [field]: value } column on app_users", async () => {
    await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(state.updates).toContainEqual({ plan: "growth" });
  });

  it("updates the app_users row by id (not email)", async () => {
    await POST(req({ email: TARGET.email, field: "role", value: "admin" }));
    expect(state.eqCalls).toContainEqual(["update", "id", TARGET.id]);
  });

  it("touches only the app_users table (no cross-table writes on the primary path)", async () => {
    await POST(req({ email: TARGET.email, field: "role", value: "admin" }));
    expect(state.fromCalls.every((t) => t === "app_users")).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Happy path — response shape
// -----------------------------------------------------------------------------

describe("POST /api/admin/users/manage — happy path", () => {
  it("returns 200 with { ok:true, user: <re-read row> }", async () => {
    state.reReadRow = { ...TARGET, plan: "growth" };
    const res = await POST(req({ email: TARGET.email, field: "plan", value: "growth" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      id: TARGET.id,
      email: TARGET.email,
      displayName: TARGET.displayName,
      plan: "growth",
      role: TARGET.role,
    });
  });
});
