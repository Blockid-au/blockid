// Unit test for POST /api/keys audit wire-in.
//
// Iteration-15 T1 (D3-CISO-05 SOC2-lite Wave 3). Asserts that a
// successful key create logs an `api_key.created` audit row carrying
// ONLY key_name + first-8-char key_prefix. The raw secret must never
// appear in the audit fields.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const listApiKeysMock = vi.fn();
const createApiKeyMock = vi.fn();
const canCreateApiKeysMock = vi.fn();
const getRateLimitForPlanMock = vi.fn();
vi.mock("@/lib/api-keys", () => ({
  listApiKeys: (userId: string) => listApiKeysMock(userId),
  createApiKey: (userId: string, plan: string, name?: string) =>
    createApiKeyMock(userId, plan, name),
  canCreateApiKeys: (user: unknown) => canCreateApiKeysMock(user),
  getRateLimitForPlan: (plan: string) => getRateLimitForPlanMock(plan),
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.9",
  extractUserAgent: () => "vitest",
}));

import { POST } from "./route";

beforeEach(() => {
  getCurrentUserMock.mockReset();
  listApiKeysMock.mockReset();
  createApiKeyMock.mockReset();
  canCreateApiKeysMock.mockReset();
  getRateLimitForPlanMock.mockReset();
  getRateLimitForPlanMock.mockReturnValue(60);
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("POST /api/keys audit wire-in", () => {
  it("logs api_key.created with key_name + first-8 key_prefix after a successful create", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "growth" });
    canCreateApiKeysMock.mockResolvedValue(true);
    createApiKeyMock.mockResolvedValue({
      id: "key-uuid-1",
      key: "sk_bkid_abcdef012345_rest_of_secret_MUST_NOT_LEAK",
    });

    const req = new Request("http://x/api/keys", {
      method: "POST",
      body: JSON.stringify({ name: "ci-integration" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("api_key.created");
    expect(arg.subjectType).toBe("api_key");
    expect(arg.subjectId).toBe("key-uuid-1");
    expect(arg.fields.key_name).toBe("ci-integration");
    expect(arg.fields.key_prefix).toBe("sk_bkid_");
    expect(arg.fields.key_prefix.length).toBe(8);
    // Guard: the raw secret must never appear anywhere in the fields blob.
    expect(JSON.stringify(arg.fields)).not.toContain("rest_of_secret");
    expect(arg.route).toBe("/api/keys");
  });

  it("defaults key_name to 'Default' when body has no name", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "growth" });
    canCreateApiKeysMock.mockResolvedValue(true);
    createApiKeyMock.mockResolvedValue({
      id: "key-2",
      key: "sk_bkid_zzzzzzzz_more",
    });
    const req = new Request("http://x/api/keys", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.fields.key_name).toBe("Default");
  });

  it("does not log when auth fails", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const req = new Request("http://x/api/keys", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when plan cannot create keys", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "free" });
    canCreateApiKeysMock.mockResolvedValue(false);
    const req = new Request("http://x/api/keys", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when createApiKey returns an error", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", plan: "growth" });
    canCreateApiKeysMock.mockResolvedValue(true);
    createApiKeyMock.mockResolvedValue({ error: "quota_exceeded" });
    const req = new Request("http://x/api/keys", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
