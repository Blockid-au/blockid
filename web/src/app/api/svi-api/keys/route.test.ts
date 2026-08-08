// Colocated vitest for /api/svi-api/keys — P9-svi-api-keys-route-test.
//
// The SVI-API institutional key-management surface (T_SVI_EXC_0014).
//   - GET   → list the signed-in user's keys.
//   - POST  → create a NEW "free" key (paid tiers only via /api/svi-api/checkout).
//   - DELETE?id=<id> → revoke a key by id.
//
// A silent regression here would either leak keys across users (dropping the
// `me.id` filter into the lib layer), let an unauthenticated caller mint a
// key (missing 401 gate), or worse — let a client body override the tier
// so a free-tier user provisions an institutional key without paying (the
// route explicitly hard-codes "free" regardless of body.tier). Every branch
// here is pinned so a subtle rewrite surfaces at unit-test time.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  role: "user" | "admin";
  plan: string | null;
  googleId: string | null;
  avatarUrl: string | null;
  discountPct: number | null;
  startupName: string | null;
  startupStage: string | null;
  industry: string | null;
  onboardingCompleted: boolean;
  startupGoals: string[] | null;
}

type CreateResult = { raw: string; id: string } | { error: string };

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  listSviApiKeysMock: vi.fn<(userId: string) => Promise<unknown[]>>(),
  createSviApiKeyMock: vi.fn<
    (userId: string, tier: string, name?: string) => Promise<CreateResult>
  >(),
  revokeSviApiKeyMock: vi.fn<(userId: string, keyId: string) => Promise<boolean>>(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/svi-api-auth", () => ({
  listSviApiKeys: (userId: string) => mocks.listSviApiKeysMock(userId),
  createSviApiKey: (userId: string, tier: string, name?: string) =>
    mocks.createSviApiKeyMock(userId, tier, name),
  revokeSviApiKey: (userId: string, keyId: string) =>
    mocks.revokeSviApiKeyMock(userId, keyId),
}));

import { GET, POST, DELETE, dynamic } from "./route";
import type { NextRequest } from "next/server";

const USER: AppUser = {
  id: "user-1",
  email: "founder@example.com",
  displayName: "Founder",
  createdAt: "2026-01-01T00:00:00Z",
  lastLoginAt: null,
  role: "user",
  plan: "free",
  googleId: null,
  avatarUrl: null,
  discountPct: null,
  startupName: null,
  startupStage: null,
  industry: null,
  onboardingCompleted: true,
  startupGoals: null,
};

function postReq(body: unknown, opts?: { badJson?: boolean }): NextRequest {
  return new Request("http://x/api/svi-api/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function deleteReq(id?: string | null): NextRequest {
  const url = id === undefined
    ? "http://x/api/svi-api/keys"
    : id === null
      ? "http://x/api/svi-api/keys?id="
      : `http://x/api/svi-api/keys?id=${encodeURIComponent(id)}`;
  return new Request(url, { method: "DELETE" }) as unknown as NextRequest;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.listSviApiKeysMock.mockReset().mockResolvedValue([]);
  mocks.createSviApiKeyMock.mockReset().mockResolvedValue({
    raw: "svi_live_deadbeef",
    id: "key-1",
  });
  mocks.revokeSviApiKeyMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("route module exports", () => {
  it("marks route dynamic so Next never prerenders keys management", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET /api/svi-api/keys — list", () => {
  it("401 when getCurrentUser resolves null and never queries the key store", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Sign in required" });
    expect(mocks.listSviApiKeysMock).not.toHaveBeenCalled();
  });

  it("401 error message is a stable string — a wording drift breaks the sign-in prompt copy", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect((await json(res)).error).toBe("Sign in required");
  });

  it("returns 200 { ok: true, keys: [] } for a user with no keys", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true, keys: [] });
  });

  it("forwards the signed-in user's id — never trusts a query param or header", async () => {
    await GET();
    expect(mocks.listSviApiKeysMock).toHaveBeenCalledTimes(1);
    expect(mocks.listSviApiKeysMock).toHaveBeenCalledWith(USER.id);
  });

  it("echoes the lib's row list verbatim so the /workspace/svi-api table sees the same shape the lib returns", async () => {
    const rows = [
      { id: "k1", name: "Prod", key_prefix: "svi_live_aaaaaa1", tier: "free" },
      { id: "k2", name: "Staging", key_prefix: "svi_live_bbbbbb2", tier: "team" },
    ];
    mocks.listSviApiKeysMock.mockResolvedValueOnce(rows);
    const res = await GET();
    expect((await json(res)).keys).toEqual(rows);
  });
});

describe("POST /api/svi-api/keys — create", () => {
  it("401 when getCurrentUser resolves null and never mints a key", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(postReq({ name: "Prod" }));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Sign in required" });
    expect(mocks.createSviApiKeyMock).not.toHaveBeenCalled();
  });

  it("swallows invalid JSON body and still mints a key with undefined name (never 500)", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(200);
    expect(mocks.createSviApiKeyMock).toHaveBeenCalledWith(USER.id, "free", undefined);
  });

  it("empty body {} still mints a key with undefined name", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(200);
    expect(mocks.createSviApiKeyMock).toHaveBeenCalledWith(USER.id, "free", undefined);
  });

  it("forwards body.name into the lib call", async () => {
    await POST(postReq({ name: "Prod key" }));
    expect(mocks.createSviApiKeyMock).toHaveBeenCalledWith(USER.id, "free", "Prod key");
  });

  it("HARDCODES tier=free regardless of body.tier — paid tiers must go through /api/svi-api/checkout", async () => {
    await POST(postReq({ tier: "institutional", name: "Trying to bypass" }));
    const [, tier] = mocks.createSviApiKeyMock.mock.calls[0]!;
    expect(tier).toBe("free");
  });

  it("tier=team in body is also ignored — the free-tier lock is not bypassable via any tier string", async () => {
    await POST(postReq({ tier: "team" }));
    expect(mocks.createSviApiKeyMock.mock.calls[0]![1]).toBe("free");
  });

  it("forwards the signed-in user's id — never trusts a body.userId override", async () => {
    await POST(postReq({ userId: "another-user", name: "X" }));
    expect(mocks.createSviApiKeyMock.mock.calls[0]![0]).toBe(USER.id);
  });

  it("400 when the lib returns { error } — passes the message through unchanged", async () => {
    mocks.createSviApiKeyMock.mockResolvedValueOnce({
      error: "Maximum 5 active SVI API keys per account.",
    });
    const res = await POST(postReq({ name: "6th key" }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Maximum 5 active SVI API keys per account.",
    });
  });

  it("400 when the lib reports 'DB unavailable' — surfaces the ops signal to the founder", async () => {
    mocks.createSviApiKeyMock.mockResolvedValueOnce({ error: "DB unavailable" });
    const res = await POST(postReq({ name: "any" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("DB unavailable");
  });

  it("happy path 200 returns { ok, key, id, message } with the raw key ONLY once", async () => {
    mocks.createSviApiKeyMock.mockResolvedValueOnce({
      raw: "svi_live_" + "a".repeat(48),
      id: "key-abc",
    });
    const res = await POST(postReq({ name: "Prod" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      key: "svi_live_" + "a".repeat(48),
      id: "key-abc",
      message: "Store this key — it won't be shown again.",
    });
  });

  it("response 'message' is a stable string — the /workspace/svi-api UI copy depends on the exact wording", async () => {
    const res = await POST(postReq({ name: "X" }));
    expect((await json(res)).message).toBe(
      "Store this key — it won't be shown again.",
    );
  });
});

describe("DELETE /api/svi-api/keys — revoke", () => {
  it("401 when getCurrentUser resolves null and never touches the key store", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(deleteReq("key-1"));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Sign in required" });
    expect(mocks.revokeSviApiKeyMock).not.toHaveBeenCalled();
  });

  it("400 when ?id= param is missing — no revoke attempted", async () => {
    const res = await DELETE(deleteReq(undefined));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ ok: false, error: "id required" });
    expect(mocks.revokeSviApiKeyMock).not.toHaveBeenCalled();
  });

  it("400 when ?id= is present but empty (?id=) — the URL parser yields the empty string which is falsy", async () => {
    const res = await DELETE(deleteReq(null));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("id required");
    expect(mocks.revokeSviApiKeyMock).not.toHaveBeenCalled();
  });

  it("forwards { userId, keyId } into the lib — ownership guard lives in the lib layer", async () => {
    await DELETE(deleteReq("key-42"));
    expect(mocks.revokeSviApiKeyMock).toHaveBeenCalledTimes(1);
    expect(mocks.revokeSviApiKeyMock).toHaveBeenCalledWith(USER.id, "key-42");
  });

  it("cannot revoke another user's key — the userId argument comes from the SESSION not from the URL", async () => {
    // Even if someone crafts a URL with a foreign id, the userId arg is always the signed-in user's id.
    // A hostile caller trying to revoke user-2's key still sends USER.id as the ownership filter.
    await DELETE(deleteReq("someone-elses-key-id"));
    expect(mocks.revokeSviApiKeyMock.mock.calls[0]![0]).toBe(USER.id);
  });

  it("returns 200 { ok: true } when the lib confirms the revoke", async () => {
    const res = await DELETE(deleteReq("key-1"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });

  it("returns 200 { ok: false } when the lib reports the revoke failed (row missing / RLS denial)", async () => {
    mocks.revokeSviApiKeyMock.mockResolvedValueOnce(false);
    const res = await DELETE(deleteReq("key-not-mine"));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: false });
  });

  it("id param preserves url-encoded uuids verbatim", async () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    await DELETE(deleteReq(uuid));
    expect(mocks.revokeSviApiKeyMock.mock.calls[0]![1]).toBe(uuid);
  });
});
