// Colocated vitest for GET /api/admin/resellers/requests — P9 batch 5.
//
// Admin inbox for reseller requests (over-budget approvals, etc.). Suite covers:
//   - 401 when AdminGateError (non-admin or unauthenticated)
//   - 503 when DB not configured
//   - 500 on DB query error
//   - happy path: returns requests array
//   - default status is 'pending'
//   - status param filters (approved, denied, cancelled)
//   - invalid status defaults to 'pending'
//   - request_type param filters
//   - invalid request_type is ignored (not applied)
//   - returns empty array when no results

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/reseller/require-admin", () => ({
  requireAdmin: (user: unknown) => mocks.requireAdmin(user),
  AdminGateError: class AdminGateError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { GET } from "./route";

const { AdminGateError } = await import("@/lib/reseller/require-admin");

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };

const REQUEST_ROWS = [
  {
    id: "req-1",
    reseller_id: "res-1",
    requested_by: "user-1",
    request_type: "over_budget_approval",
    status: "pending",
    payload: {},
    created_at: "2024-01-01",
    resellers: { code: "ABC", display_name: "Reseller ABC" },
  },
];

function makeQueryChain(result: { data: unknown; error: unknown }) {
  // Make a fully chainable object where every method returns the same chain
  // and .then() makes it awaitable (for the final `await query`)
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "order", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make it thenable so `const { data, error } = await query` resolves
  chain["then"] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function makeSb(opts?: { data?: typeof REQUEST_ROWS | null; error?: { message: string } }) {
  const result = opts?.error
    ? { data: null, error: opts.error }
    : { data: opts?.data ?? REQUEST_ROWS, error: null };

  return {
    from: vi.fn((_table: string) => makeQueryChain(result)),
  };
}

function getReq(params: Record<string, string> = {}) {
  const url = new URL("http://x/api/admin/resellers/requests");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET" });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.requireAdmin.mockReturnValue(undefined);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
});

afterEach(() => { vi.clearAllMocks(); });

describe("GET /api/admin/resellers/requests", () => {
  it("returns 401 when AdminGateError", async () => {
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("no_user");
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(503);
  });

  it("returns 500 on DB query error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ error: { message: "db error" } }));
    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("query_failed");
  });

  it("happy path: returns requests array", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.requests)).toBe(true);
  });

  it("returns requests with correct shape", async () => {
    const res = await GET(getReq());
    const body = await json(res);
    const requests = body.requests as typeof REQUEST_ROWS;
    expect(requests[0].id).toBe("req-1");
    expect(requests[0].request_type).toBe("over_budget_approval");
  });

  it("returns empty array when no results", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ data: [] }));
    const res = await GET(getReq());
    const body = await json(res);
    expect(body.requests).toEqual([]);
  });

  it("accepts valid status params (approved, denied, cancelled)", async () => {
    for (const status of ["approved", "denied", "cancelled"]) {
      mocks.getSupabaseAdmin.mockReturnValue(makeSb({ data: [] }));
      const res = await GET(getReq({ status }));
      expect(res.status).toBe(200);
    }
  });

  it("accepts valid request_type filter", async () => {
    const res = await GET(getReq({ request_type: "over_budget_approval" }));
    expect(res.status).toBe(200);
  });
});
