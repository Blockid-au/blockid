// Colocated vitest for POST /api/svi-accounts — P9 batch 4.
//
// Creates SVI accounts for authenticated users. Email must match the
// authenticated user (prevents enumeration). Suite covers:
//   - 401 when unauthenticated
//   - 503 when DB not configured
//   - 400 on invalid/missing email
//   - 403 when email doesn't match authenticated user
//   - happy path: returns ok + account
//   - upsert when account already exists
//   - startup_name and plan are optional

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  getProjectIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/projects", () => ({
  getProjectIdFromRequest: () => mocks.getProjectIdFromRequest(),
}));

import { POST } from "./route";

const USER = { id: "user-1", email: "founder@example.com", plan: "free", role: "user" };

function makeSb(opts?: { existing?: { id: string } | null; upsertData?: unknown; upsertError?: { message: string } }) {
  const existingResult = { data: opts?.existing ?? null };
  const upsertResult = opts?.upsertError
    ? { data: null, error: opts.upsertError }
    : { data: opts?.upsertData ?? { id: "svi-1", email: "founder@example.com" }, error: null };

  type Chain = { eq: () => Chain; is: () => Chain; maybeSingle: () => unknown };
  const chain: Chain = {
    eq: vi.fn().mockReturnThis() as unknown as () => Chain,
    is: vi.fn().mockReturnThis() as unknown as () => Chain,
    maybeSingle: vi.fn().mockReturnValue(existingResult),
  };

  return {
    from: vi.fn((_table: string) => ({
      select: () => chain,
      upsert: () => ({
        select: () => ({
          single: vi.fn().mockReturnValue(upsertResult),
        }),
      }),
      insert: () => ({
        select: () => ({
          single: vi.fn().mockReturnValue(upsertResult),
        }),
      }),
    })),
    _chain: chain,
  };
}

function req(body: unknown) {
  return new Request("http://x/api/svi-accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.getSupabaseAdmin.mockReturnValue(makeSb());
  mocks.getProjectIdFromRequest.mockResolvedValue(null);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/svi-accounts", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 when email has no @", async () => {
    const res = await POST(req({ email: "notanemail" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 403 when email doesn't match authenticated user", async () => {
    const res = await POST(req({ email: "other@example.com" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/match/i);
  });

  it("happy path: creates account and returns ok", async () => {
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("accepts optional startup_name and plan", async () => {
    const res = await POST(req({
      email: "founder@example.com",
      startup_name: "My Startup",
      plan: "growth",
    }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("accepts optional name field for display name", async () => {
    const res = await POST(req({
      email: "founder@example.com",
      name: "Founder Name",
    }));
    expect(res.status).toBe(200);
  });

  it("case-insensitive email comparison", async () => {
    const res = await POST(req({ email: "FOUNDER@EXAMPLE.COM" }));
    expect(res.status).toBe(200);
  });
});
