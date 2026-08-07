// Colocated vitest for GET /api/admin/rate-limits — P9 batch 5.
//
// Admin-only rate-limit snapshot. Suite covers:
//   - 401 when unauthenticated
//   - 403 when non-admin
//   - happy path: returns entries + generatedAt
//   - entries come from getRateLimitSnapshot

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getRateLimitSnapshot: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/rate-limit", () => ({
  getRateLimitSnapshot: () => mocks.getRateLimitSnapshot(),
}));

import { GET } from "./route";

const ADMIN_USER = { id: "admin-1", email: "admin@blockid.au", plan: "admin", role: "admin" };
const REGULAR_USER = { id: "user-2", email: "user@example.com", plan: "free", role: "user" };

const SNAPSHOT = [
  { key: "reset:1.1.1.1", count: 2, maxCount: 3, windowMs: 900000, expiresAt: Date.now() + 500000 },
];

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(ADMIN_USER);
  mocks.getRateLimitSnapshot.mockReturnValue(SNAPSHOT);
});

afterEach(() => { vi.clearAllMocks(); });

describe("GET /api/admin/rate-limits", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 403 for non-admin user", async () => {
    mocks.getCurrentUser.mockResolvedValue(REGULAR_USER);
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("happy path: returns ok + entries + generatedAt", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.generatedAt).toBe("number");
  });

  it("entries contain rate-limit snapshot data", async () => {
    const res = await GET();
    const body = await json(res);
    const entries = body.entries as typeof SNAPSHOT;
    expect(entries).toHaveLength(1);
    expect(entries[0].key).toBe("reset:1.1.1.1");
  });

  it("generatedAt is a current timestamp", async () => {
    const before = Date.now();
    const res = await GET();
    const after = Date.now();
    const body = await json(res);
    const ts = body.generatedAt as number;
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("returns empty entries when no rate limits active", async () => {
    mocks.getRateLimitSnapshot.mockReturnValue([]);
    const res = await GET();
    const body = await json(res);
    expect(body.entries).toEqual([]);
  });
});
