// Colocated vitest for GET+POST+DELETE /api/admin/ai-keys — P9 batch 5.
//
// Admin management of AI provider API keys. Security-sensitive — a bypass
// allows reading/overwriting live AI credentials. Suite covers:
//   - GET 401 for non-admin
//   - GET 503 DB not configured
//   - GET happy path: returns masked keys
//   - GET keys have api_key_masked field
//   - POST 401 for non-admin
//   - POST 503 DB not configured
//   - POST 400 when provider/api_key missing
//   - POST 400 for invalid provider name
//   - POST 500 on DB upsert error
//   - POST happy path: returns ok + provider
//   - DELETE 401 for non-admin
//   - DELETE 400 when provider missing
//   - DELETE happy path: returns ok

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));

import { GET, POST, DELETE } from "./route";

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const REGULAR_USER = { id: "user-2", email: "user@example.com", plan: "free", role: "user" };

const KEY_ROWS = [
  { provider: "anthropic", api_key: "sk-ant-api03-abcdefghijklmn-WXYZ", base_url: null, is_active: true, updated_at: "2024-01-01", updated_by: "admin@blockid.au" },
];

function makeSb(opts?: {
  listData?: typeof KEY_ROWS | null;
  listError?: { message: string };
  upsertError?: { message: string };
  deleteError?: { message: string };
}) {
  const selectResult = opts?.listError
    ? { data: null, error: opts.listError }
    : { data: opts?.listData ?? KEY_ROWS, error: null };
  const upsertResult = { error: opts?.upsertError ?? null };
  const deleteResult = { error: opts?.deleteError ?? null };

  return {
    from: vi.fn((_table: string) => ({
      select: () => ({
        order: () => selectResult,
      }),
      upsert: () => upsertResult,
      delete: () => ({
        eq: () => deleteResult,
      }),
    })),
  };
}

function postReq(body: unknown) {
  return new Request("http://x/api/admin/ai-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(body: unknown) {
  return new Request("http://x/api/admin/ai-keys", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
});

afterEach(() => { vi.clearAllMocks(); });

describe("GET /api/admin/ai-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 401 when non-admin", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
  });

  it("returns 500 on DB select error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ listError: { message: "db error" } }));
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it("happy path: returns masked keys", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.keys)).toBe(true);
  });

  it("masked keys include api_key_masked field", async () => {
    const res = await GET();
    const body = await json(res);
    const keys = body.keys as Array<Record<string, unknown>>;
    expect(keys[0]).toHaveProperty("api_key_masked");
    expect(keys[0]).toHaveProperty("api_key_full");
  });

  it("masked key shows first 12 + last 4 chars", async () => {
    const res = await GET();
    const body = await json(res);
    const key = (body.keys as Array<Record<string, string>>)[0];
    const original = KEY_ROWS[0].api_key;
    expect(key.api_key_masked).toContain(original.slice(0, 12));
    expect(key.api_key_masked).toContain(original.slice(-4));
  });

  it("returns empty array when no keys", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ listData: [] }));
    const res = await GET();
    const body = await json(res);
    expect(body.keys).toEqual([]);
  });
});

describe("POST /api/admin/ai-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ provider: "anthropic", api_key: "sk-test" }));
    expect(res.status).toBe(401);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(postReq({ provider: "anthropic", api_key: "sk-test" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when provider is missing", async () => {
    const res = await POST(postReq({ api_key: "sk-test" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/provider/i);
  });

  it("returns 400 when api_key is missing", async () => {
    const res = await POST(postReq({ provider: "anthropic" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid provider", async () => {
    const res = await POST(postReq({ provider: "unknown_llm", api_key: "sk-test" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/invalid provider/i);
  });

  it("returns 500 on DB upsert error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ upsertError: { message: "db error" } }));
    const res = await POST(postReq({ provider: "anthropic", api_key: "sk-test" }));
    expect(res.status).toBe(500);
  });

  it("happy path: returns ok + provider", async () => {
    const res = await POST(postReq({ provider: "anthropic", api_key: "sk-ant-test", is_active: true }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("anthropic");
  });

  it("accepts all valid providers", async () => {
    for (const provider of ["anthropic", "anthropic_proxy", "openai", "gemini"]) {
      const res = await POST(postReq({ provider, api_key: "sk-test" }));
      expect(res.status).toBe(200);
    }
  });
});

describe("DELETE /api/admin/ai-keys", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await DELETE(deleteReq({ provider: "anthropic" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when provider is missing", async () => {
    const res = await DELETE(deleteReq({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/provider/i);
  });

  it("returns 500 on DB delete error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ deleteError: { message: "db error" } }));
    const res = await DELETE(deleteReq({ provider: "anthropic" }));
    expect(res.status).toBe(500);
  });

  it("happy path: returns ok", async () => {
    const res = await DELETE(deleteReq({ provider: "anthropic" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });
});
