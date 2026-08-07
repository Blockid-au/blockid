// Colocated vitest for POST /api/auth/set-password — P9 batch 2.
//
// Password change for authenticated users. Critical auth surface — bypass
// allows account takeover. bcrypt is mocked to avoid slow hashing. Suite covers:
//   - 401 when unauthenticated
//   - 400 when newPassword missing
//   - 400 when newPassword too short (< 8 chars)
//   - 503 when DB not configured
//   - 404 when user row not found
//   - first-time set (no existing hash): skips current-password check
//   - 400 when has hash but currentPassword not provided
//   - 403 when currentPassword is wrong
//   - 500 on DB update error
//   - happy path: returns ok
//   - 500 on unexpected internal error

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  bcryptCompare: vi.fn(),
  bcryptHash: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mocks.bcryptCompare(...args),
    hash: (...args: unknown[]) => mocks.bcryptHash(...args),
  },
  compare: (...args: unknown[]) => mocks.bcryptCompare(...args),
  hash: (...args: unknown[]) => mocks.bcryptHash(...args),
}));

import { POST } from "./route";

const USER = { id: "user-1", email: "founder@example.com", plan: "free", role: "user" };
const EXISTING_HASH = "$2b$12$existinghash";
const NEW_HASH = "$2b$12$newhash";

function makeSb(opts?: { row?: { id: string; password_hash: string | null } | null; updateError?: unknown }) {
  const userRow = opts?.row !== undefined ? opts.row : { id: "user-1", password_hash: null };
  const singleFn = vi.fn().mockReturnValue({ data: userRow });
  const updateFn = vi.fn().mockReturnValue({ error: opts?.updateError ?? null });
  return {
    from: vi.fn((_table: string) => ({
      select: () => ({
        eq: () => ({
          single: singleFn,
        }),
      }),
      update: () => ({
        eq: updateFn,
      }),
    })),
    _single: singleFn,
    _update: updateFn,
  };
}

function req(body: unknown) {
  return new Request("http://x/api/auth/set-password", {
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
  mocks.bcryptCompare.mockResolvedValue(true);
  mocks.bcryptHash.mockResolvedValue(NEW_HASH);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/auth/set-password", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 when newPassword is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/8 characters/i);
  });

  it("returns 400 when newPassword is too short", async () => {
    const res = await POST(req({ newPassword: "short" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/8 characters/i);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(503);
  });

  it("returns 404 when user row not found", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ row: null }));
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(404);
  });

  it("first-time set: skips current-password check when no hash", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ row: { id: "user-1", password_hash: null } }));
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(200);
    expect(mocks.bcryptCompare).not.toHaveBeenCalled();
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("returns 400 when user has hash but currentPassword not provided", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ row: { id: "user-1", password_hash: EXISTING_HASH } }));
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toMatch(/current password is required/i);
  });

  it("returns 403 when currentPassword is wrong", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ row: { id: "user-1", password_hash: EXISTING_HASH } }));
    mocks.bcryptCompare.mockResolvedValue(false);
    const res = await POST(req({ currentPassword: "wrongpass", newPassword: "newpass123" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toMatch(/incorrect/i);
  });

  it("returns 500 on DB update error", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ updateError: { message: "db error" } }));
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(500);
  });

  it("happy path with existing hash: compares and updates", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(makeSb({ row: { id: "user-1", password_hash: EXISTING_HASH } }));
    mocks.bcryptCompare.mockResolvedValue(true);
    const res = await POST(req({ currentPassword: "correctpass", newPassword: "newpass123" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(mocks.bcryptCompare).toHaveBeenCalledWith("correctpass", EXISTING_HASH);
    expect(mocks.bcryptHash).toHaveBeenCalledWith("newpass123", 12);
  });

  it("happy path without existing hash: returns ok message", async () => {
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(typeof body.message).toBe("string");
  });

  it("returns 500 on unexpected error", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("unexpected"));
    const res = await POST(req({ newPassword: "newpass123" }));
    expect(res.status).toBe(500);
  });
});
