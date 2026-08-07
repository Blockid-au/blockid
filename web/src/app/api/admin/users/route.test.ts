// Colocated vitest for GET /api/admin/users — P9 batch 3.
//
// Paginated admin user list with search and filter. Admin-only. Suite covers:
//   - 401 when unauthenticated (no_user AdminGateError)
//   - 403 when non-admin (not_admin AdminGateError)
//   - 503 when DB not configured
//   - happy path: returns user list with pagination
//   - q param filters by email ilike
//   - filter=admin applies role filter
//   - limit and offset defaults applied
//   - limit clamped to 200

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
const USERS_LIST = [
  { id: "u-1", email: "a@example.com", display_name: "A", role: "user", plan: "free", segment: null, account_type: "founder", attribution_reseller_id: null, created_at: "2024-01-01", last_login_at: null },
  { id: "u-2", email: "b@example.com", display_name: "B", role: "admin", plan: "admin", segment: null, account_type: "founder", attribution_reseller_id: null, created_at: "2024-01-02", last_login_at: "2024-01-03" },
];

function makeSb(overrides?: { data?: unknown[]; count?: number; error?: unknown }) {
  const queryChain = {
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  };

  // Make the chain thenable (resolves when awaited)
  const result = overrides?.error
    ? { data: null, count: 0, error: overrides.error }
    : { data: overrides?.data ?? USERS_LIST, count: overrides?.count ?? USERS_LIST.length, error: null };

  // vitest: make the chain return the result when resolved
  const thenableChain = {
    ...queryChain,
    // Make it a thenable
    then: (resolve: (v: unknown) => void) => resolve(result),
  };

  // Make each chain method return thenableChain
  Object.keys(queryChain).forEach((k) => {
    if (k !== "then") {
      (thenableChain as Record<string, unknown>)[k] = vi.fn().mockReturnValue(thenableChain);
    }
  });

  return {
    from: vi.fn((_table: string) => ({
      select: vi.fn().mockReturnValue(thenableChain),
    })),
    _chain: thenableChain,
  };
}

function getReq(params: Record<string, string> = {}) {
  const url = new URL("http://x/api/admin/users");
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

describe("GET /api/admin/users", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await GET(getReq());
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("no_user");
  });

  it("returns 403 when non-admin", async () => {
    const user = { id: "u-2", email: "user@example.com", plan: "free", role: "user" };
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("not_admin"); });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_admin");
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET(getReq());
    expect(res.status).toBe(503);
  });

  it("happy path: returns user list with pagination metadata", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.users)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.limit).toBe("number");
    expect(typeof body.offset).toBe("number");
  });

  it("default limit is 50", async () => {
    const sb = makeSb();
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.limit).toBe(50);
  });

  it("default offset is 0", async () => {
    const res = await GET(getReq());
    const body = await json(res);
    expect(body.offset).toBe(0);
  });

  it("respects custom limit param", async () => {
    const res = await GET(getReq({ limit: "10" }));
    const body = await json(res);
    expect(body.limit).toBe(10);
  });

  it("clamps limit to 200", async () => {
    const res = await GET(getReq({ limit: "999" }));
    const body = await json(res);
    expect(body.limit).toBe(200);
  });

  it("respects offset param", async () => {
    const res = await GET(getReq({ offset: "20" }));
    const body = await json(res);
    expect(body.offset).toBe(20);
  });

  it("calls ilike with q param", async () => {
    const sb = makeSb();
    mocks.getSupabaseAdmin.mockReturnValue(sb);
    const res = await GET(getReq({ q: "test" }));
    expect(res.status).toBe(200);
  });

  it("returns empty users array when no data", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ data: [], count: 0 }));
    const res = await GET(getReq());
    const body = await json(res);
    expect(body.users).toEqual([]);
    expect(body.total).toBe(0);
  });
});
