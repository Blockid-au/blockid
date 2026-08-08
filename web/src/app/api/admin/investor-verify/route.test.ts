// Colocated vitest for POST /api/admin/investor-verify — P9-admin-investor-verify-route-test.
//
// The route powers the admin sophisticated-investor verification queue: an
// admin toggles a signed-in investor's `app_users.verified_at` + `verified_by`
// columns after sighting the accountant's certificate the founder is asked to
// upload under Corporations Act 2001 (Cth) s708(8)(c) / s761G(7)(c). A silent
// regression here would either let a non-admin flip the verification bit for
// any user in the register (breaking the wholesale-client audit trail), or
// blank out the `verified_by` provenance the compliance log keys on.
//
// Silent regressions this suite pins against:
//
//   - Dropping the getCurrentUser() 403 branch — a logged-out visitor could
//     verify or un-verify any investor by POSTing a userId.
//   - Loosening the admin-role check (e.g. accepting role === "user") — any
//     signed-in user could flip the wholesale-investor bit.
//   - Dropping the getSupabaseAdmin() null-guard 500 — a mis-configured
//     server would throw a TypeError against `null.from(...)` rather than
//     returning the "DB unavailable" envelope the admin UI keys off.
//   - Reading the body before the auth + supabase-config checks — the
//     current order is auth → supabase → body-parse → userId-required,
//     which lets us short-circuit unauthenticated hits without allocating
//     the JSON parser.
//   - Losing the `try/catch` around `req.json()` — a malformed body would
//     surface as a 500 instead of the documented 400 "Invalid JSON".
//   - Losing the `userId required` 400 branch — a body without a userId
//     would run the `.update(...).eq("id", undefined)` and rewrite EVERY
//     row in app_users (mass-verify / mass-unverify catastrophe).
//   - Regressing the verified-branch payload from
//     `{ verified_at: <ISO>, verified_by: me.id }` to something else —
//     the compliance log joins on verified_by, so a null there would
//     erase the admin-provenance audit trail.
//   - Regressing the unverified branch from `{ verified_at: null,
//     verified_by: null }` — an "unverify" that only clears verified_at
//     but keeps verified_by would leave a stale "who verified" pointer.
//   - Losing the `.eq("id", body.userId)` — an unfiltered `.update()`
//     rewrites the whole app_users table.
//   - Regressing the target table from `app_users` — a rename that lands
//     without updating the route would silently no-op every verification.
//   - Losing `export const dynamic = "force-dynamic"` — the route reads
//     per-request auth state and MUST NOT be pinned to a build-time cache.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── auth + supabase mocks (hoisted so they exist before the route import) ──

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<{ id: string; email: string; role?: string } | null>>(),
  getSupabaseAdmin: vi.fn<() => unknown | null>(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { POST, dynamic } from "./route";
import { NextRequest } from "next/server";

// ── Fake supabase — records .from().update().eq() shape ────────────────────

interface UpdateCall {
  patch: Record<string, unknown>;
}
interface EqCall {
  col: string;
  val: unknown;
}
interface QueryLog {
  from: string;
  update: UpdateCall | null;
  eqs: EqCall[];
}

interface FakeState {
  logs: QueryLog[];
  updateResult: { error: { message: string } | null };
}

function makeSupabase(state: FakeState): unknown {
  return {
    from(table: string) {
      const log: QueryLog = { from: table, update: null, eqs: [] };
      state.logs.push(log);
      const api: Record<string, unknown> = {};
      api.update = (patch: Record<string, unknown>) => {
        log.update = { patch };
        return api;
      };
      api.eq = (col: string, val: unknown) => {
        log.eqs.push({ col, val });
        // Terminal — .update().eq() awaits.
        return Promise.resolve(state.updateResult);
      };
      return api;
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function postReq(body: unknown, opts?: { badJson?: boolean }): NextRequest {
  return new NextRequest("http://localhost/api/admin/investor-verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{oops" : JSON.stringify(body ?? {}),
  });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

const ADMIN_USER = { id: "u-admin-1", email: "admin@blockid.au", role: "admin" };
const NON_ADMIN_USER = { id: "u-42", email: "someone@example.com", role: "user" };

let state: FakeState;

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  state = {
    logs: [],
    updateResult: { error: null },
  };
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSupabase(state));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe("dynamic export", () => {
  it("forces dynamic — route reads per-request auth + writes live supabase state, must not be prerendered", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
describe("auth gate", () => {
  it("returns 403 { ok:false, error:'Admin only' } when getCurrentUser() is null (logged-out visitor)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Admin only" });
  });

  it("returns 403 when caller has role='user' (not 'admin')", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(403);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Admin only" });
  });

  it("returns 403 when caller has no role at all (undefined role must not admit)", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u-9", email: "x@x.com" });
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(403);
  });

  it("admits a caller with role='admin' — 200 { ok: true }", async () => {
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: true });
  });

  it("does not touch supabase for an unauthenticated caller (no wasted round-trip)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await POST(postReq({ userId: "u-1", verified: true }));
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
    expect(state.logs).toHaveLength(0);
  });

  it("does not parse the body for an unauthenticated caller (no wasted JSON allocation)", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    // Malformed body would 400 on parse — if the route parsed before the
    // auth gate, we'd see 400 instead of 403.
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(403);
  });

  it("does not touch supabase for a non-admin caller (role='user')", async () => {
    mocks.getCurrentUser.mockResolvedValue(NON_ADMIN_USER);
    await POST(postReq({ userId: "u-1", verified: true }));
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("supabase-not-configured branch", () => {
  it("returns 500 { ok:false, error:'DB unavailable' } when getSupabaseAdmin() is null", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "DB unavailable" });
  });

  it("still runs the admin gate before probing supabase — 403 dominates 500", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(403);
  });

  it("does not parse the body when supabase is unconfigured (short-circuits before)", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    // Malformed body would 400 on parse — if the route parsed before the
    // supabase-config check, we'd see 400 instead of 500.
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
describe("body validation", () => {
  it("returns 400 { ok:false, error:'Invalid JSON' } when the body is not JSON", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "Invalid JSON" });
  });

  it("returns 400 { ok:false, error:'userId required' } when the body has no userId", async () => {
    const res = await POST(postReq({ verified: true }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "userId required" });
  });

  it("returns 400 'userId required' for an empty-string userId (falsy — must not update every row)", async () => {
    const res = await POST(postReq({ userId: "", verified: true }));
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({ ok: false, error: "userId required" });
    // Critical: the .update() must NOT have been dispatched (unfiltered .eq).
    expect(state.logs).toHaveLength(0);
  });

  it("does not dispatch a supabase update when the body is malformed", async () => {
    await POST(postReq(null, { badJson: true }));
    expect(state.logs).toHaveLength(0);
  });

  it("does not dispatch a supabase update when userId is missing", async () => {
    await POST(postReq({ verified: true }));
    expect(state.logs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("supabase target — table + filter", () => {
  it("writes to the `app_users` table (rename-detector — a silent rename would 500-mask this)", async () => {
    await POST(postReq({ userId: "u-1", verified: true }));
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].from).toBe("app_users");
  });

  it("scopes the update to the target userId via .eq('id', userId) — no mass-verify", async () => {
    await POST(postReq({ userId: "u-target-42", verified: true }));
    expect(state.logs[0].eqs).toEqual([{ col: "id", val: "u-target-42" }]);
  });

  it("calls .eq exactly once — regressing to zero would rewrite every row in app_users", async () => {
    await POST(postReq({ userId: "u-1", verified: true }));
    expect(state.logs[0].eqs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("verify branch — verified:true", () => {
  it("stamps verified_at with an ISO timestamp when verified:true", async () => {
    await POST(postReq({ userId: "u-1", verified: true }));
    const patch = state.logs[0].update?.patch ?? {};
    expect(typeof patch.verified_at).toBe("string");
    expect(patch.verified_at as string).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("stamps verified_by with the current admin's id (compliance provenance)", async () => {
    await POST(postReq({ userId: "u-1", verified: true }));
    const patch = state.logs[0].update?.patch ?? {};
    expect(patch.verified_by).toBe(ADMIN_USER.id);
  });

  it("writes exactly two columns on the verify branch — no schema-drift leak", async () => {
    await POST(postReq({ userId: "u-1", verified: true }));
    const patch = state.logs[0].update?.patch ?? {};
    expect(Object.keys(patch).sort()).toEqual(["verified_at", "verified_by"]);
  });

  it("uses a fresh timestamp per call (not a module-level constant)", async () => {
    await POST(postReq({ userId: "u-1", verified: true }));
    await new Promise((r) => setTimeout(r, 5));
    await POST(postReq({ userId: "u-2", verified: true }));
    const t1 = state.logs[0].update?.patch.verified_at as string;
    const t2 = state.logs[1].update?.patch.verified_at as string;
    expect(t1).not.toBe(t2);
    expect(new Date(t2).getTime()).toBeGreaterThanOrEqual(new Date(t1).getTime());
  });

  it("carries the admin's id across two distinct admins (no cached me.id from a prior request)", async () => {
    await POST(postReq({ userId: "u-1", verified: true }));
    mocks.getCurrentUser.mockResolvedValue({ id: "u-admin-B", email: "b@x.com", role: "admin" });
    await POST(postReq({ userId: "u-2", verified: true }));
    expect(state.logs[0].update?.patch.verified_by).toBe(ADMIN_USER.id);
    expect(state.logs[1].update?.patch.verified_by).toBe("u-admin-B");
  });
});

// ---------------------------------------------------------------------------
describe("unverify branch — verified:false / falsy", () => {
  it("nulls both verified_at AND verified_by when verified:false (no stale provenance)", async () => {
    await POST(postReq({ userId: "u-1", verified: false }));
    const patch = state.logs[0].update?.patch ?? {};
    expect(patch).toEqual({ verified_at: null, verified_by: null });
  });

  it("treats missing `verified` key as unverify (Boolean-coerce falsy default)", async () => {
    await POST(postReq({ userId: "u-1" }));
    const patch = state.logs[0].update?.patch ?? {};
    expect(patch).toEqual({ verified_at: null, verified_by: null });
  });

  it("writes exactly two null columns on the unverify branch — no extra keys leaked", async () => {
    await POST(postReq({ userId: "u-1", verified: false }));
    const patch = state.logs[0].update?.patch ?? {};
    expect(Object.keys(patch).sort()).toEqual(["verified_at", "verified_by"]);
    expect(patch.verified_at).toBeNull();
    expect(patch.verified_by).toBeNull();
  });

  it("does NOT stamp an ISO timestamp on the unverify branch (verified_at must be null, not now())", async () => {
    await POST(postReq({ userId: "u-1", verified: false }));
    const patch = state.logs[0].update?.patch ?? {};
    // If someone regressed to `{ verified_at: new Date(...), verified_by: null }`
    // the unverify audit trail would look identical to a verify.
    expect(patch.verified_at).toBeNull();
    expect(typeof patch.verified_at).not.toBe("string");
  });
});

// ---------------------------------------------------------------------------
describe("supabase error → 500 envelope", () => {
  it("returns 500 { ok:false, error:<db-message> } when supabase update returns an error", async () => {
    state.updateResult = { error: { message: "duplicate key value violates unique constraint" } };
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({
      ok: false,
      error: "duplicate key value violates unique constraint",
    });
  });

  it("still dispatched the update before surfacing the error (error path is post-write)", async () => {
    state.updateResult = { error: { message: "boom" } };
    await POST(postReq({ userId: "u-1", verified: true }));
    expect(state.logs).toHaveLength(1);
    expect(state.logs[0].update?.patch).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("happy path — success envelope", () => {
  it("returns 200 { ok: true } (exact shape — no extra keys leaked)", async () => {
    const res = await POST(postReq({ userId: "u-1", verified: true }));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body).toEqual({ ok: true });
    expect(Object.keys(body)).toEqual(["ok"]);
  });

  it("returns 200 { ok: true } on the unverify happy path too", async () => {
    const res = await POST(postReq({ userId: "u-1", verified: false }));
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ ok: true });
  });
});
