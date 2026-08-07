// Colocated vitest for GET+POST /api/admin/resellers — P9 batch 4.
//
// Admin reseller management. Note: GET uses 401 (not 403) per this route's
// convention (AdminGateError always → 401 here). Suite covers:
//   - GET 401 when unauthenticated/non-admin
//   - GET 503 when DB not configured
//   - GET happy path returns resellers list
//   - GET 500 on DB query error
//   - POST 401 when unauthenticated
//   - POST 400 bad JSON
//   - POST 400 code required
//   - POST 400 display_name required
//   - POST 400 wholesale without GST
//   - POST 400 wholesale without valid ABN
//   - POST 503 DB not configured
//   - POST 409 duplicate code
//   - POST 500 on insert error
//   - POST happy path retail: 201 + reseller
//   - POST happy path wholesale: 201 + reseller

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAdmin: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  normaliseResellerCode: vi.fn(),
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
vi.mock("@/lib/reseller/attribution", () => ({
  normaliseResellerCode: (c: string) => mocks.normaliseResellerCode(c),
}));

import { GET, POST } from "./route";

const { AdminGateError } = await import("@/lib/reseller/require-admin");

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const RESELLER_ROW = { id: "res-1", code: "ABC", display_name: "Test Reseller", billing_model: "retail", status: "active" };

function makeSb(opts?: {
  listData?: unknown[];
  listError?: { message: string } | null;
  insertData?: unknown;
  insertError?: { message: string } | null;
}) {
  const listResult = opts?.listError
    ? { data: null, error: opts.listError }
    : { data: opts?.listData ?? [RESELLER_ROW], error: null };
  const insertResult = opts?.insertError
    ? { data: null, error: opts.insertError }
    : { data: opts?.insertData ?? RESELLER_ROW, error: null };

  return {
    from: vi.fn((table: string) => {
      if (table === "resellers") {
        return {
          select: () => ({
            order: () => listResult,
          }),
          insert: () => ({
            select: () => ({
              single: vi.fn().mockReturnValue(insertResult),
            }),
          }),
        };
      }
      // reseller_audit_log — always succeed
      return {
        insert: vi.fn().mockReturnValue({ error: null }),
      };
    }),
  };
}

function postReq(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/admin/resellers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.requireAdmin.mockReturnValue(undefined);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
  mocks.normaliseResellerCode.mockImplementation((c: string) => c?.toUpperCase() ?? null);
});

afterEach(() => { vi.clearAllMocks(); });

describe("GET /api/admin/resellers", () => {
  it("returns 401 when AdminGateError", async () => {
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("happy path: returns resellers array", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.resellers)).toBe(true);
  });

  it("returns 500 on DB query error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ listError: { message: "db error" } }));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("query_failed");
  });
});

describe("POST /api/admin/resellers", () => {
  it("returns 401 when AdminGateError", async () => {
    mocks.requireAdmin.mockImplementation(() => { throw new AdminGateError("no_user"); });
    const res = await POST(postReq({ code: "ABC", display_name: "Test" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_body");
  });

  it("returns 400 when code is missing/empty", async () => {
    mocks.normaliseResellerCode.mockReturnValue(null);
    const res = await POST(postReq({ display_name: "Test" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("code_required");
  });

  it("returns 400 when display_name is missing", async () => {
    const res = await POST(postReq({ code: "ABC" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("display_name_required");
  });

  it("returns 400 for wholesale without gst_registered", async () => {
    const res = await POST(postReq({ code: "ABC", display_name: "Test", billing_model: "wholesale" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("wholesale_requires_gst");
  });

  it("returns 400 for wholesale without valid ABN", async () => {
    const res = await POST(postReq({
      code: "ABC",
      display_name: "Test",
      billing_model: "wholesale",
      gst_registered: true,
      abn: "badabn",
    }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("wholesale_requires_abn");
  });

  it("returns 400 for wholesale with missing ABN", async () => {
    const res = await POST(postReq({
      code: "ABC",
      display_name: "Test",
      billing_model: "wholesale",
      gst_registered: true,
    }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ code: "ABC", display_name: "Test" }));
    expect(res.status).toBe(503);
  });

  it("returns 409 when code is already taken", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ insertError: { message: "resellers_code_key duplicate" } }),
    );
    const res = await POST(postReq({ code: "ABC", display_name: "Test" }));
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.reason).toBe("code_taken");
  });

  it("returns 500 on other insert error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ insertError: { message: "generic db error" } }),
    );
    const res = await POST(postReq({ code: "ABC", display_name: "Test" }));
    expect(res.status).toBe(500);
  });

  it("happy path retail: returns 201 + reseller", async () => {
    const res = await POST(postReq({ code: "ABC", display_name: "Test Reseller" }));
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.reseller).toBeDefined();
  });

  it("happy path wholesale with valid ABN: returns 201", async () => {
    const res = await POST(postReq({
      code: "WHL",
      display_name: "Wholesale Co",
      billing_model: "wholesale",
      gst_registered: true,
      abn: "12 345 678 901",
    }));
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});
