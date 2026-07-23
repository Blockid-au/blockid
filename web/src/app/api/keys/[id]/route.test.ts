// Unit test for DELETE /api/keys/[id] audit wire-in.
//
// Iteration-15 T1 (D3-CISO-05 SOC2-lite Wave 3). Asserts that a
// successful revoke logs an `api_key.revoked` audit row with
// { key_id, key_prefix } — never the raw secret.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const revokeApiKeyMock = vi.fn();
vi.mock("@/lib/api-keys", () => ({
  revokeApiKey: (keyId: string, userId: string) => revokeApiKeyMock(keyId, userId),
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.9",
  extractUserAgent: () => "vitest",
}));

import { DELETE } from "./route";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  revokeApiKeyMock.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("DELETE /api/keys/[id] audit wire-in", () => {
  it("logs api_key.revoked with key_id + DB-stored key_prefix after a successful revoke", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    revokeApiKeyMock.mockResolvedValue({
      ok: true,
      keyPrefix: "sk_bkid_abcdef01...",
    });

    const req = new Request("http://x/api/keys/key-1", { method: "DELETE" });
    const res = await DELETE(req, params("key-1"));
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("api_key.revoked");
    expect(arg.subjectType).toBe("api_key");
    expect(arg.subjectId).toBe("key-1");
    expect(arg.fields.key_id).toBe("key-1");
    expect(arg.fields.key_prefix).toBe("sk_bkid_abcdef01...");
    expect(arg.route).toBe("/api/keys/key-1");
  });

  it("omits key_prefix when revoke returns none (race / missing row)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    revokeApiKeyMock.mockResolvedValue({ ok: true });

    const req = new Request("http://x/api/keys/key-1", { method: "DELETE" });
    const res = await DELETE(req, params("key-1"));
    expect(res.status).toBe(200);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.fields.key_id).toBe("key-1");
    expect("key_prefix" in arg.fields).toBe(false);
  });

  it("does not log when auth fails", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const req = new Request("http://x/api/keys/key-1", { method: "DELETE" });
    const res = await DELETE(req, params("key-1"));
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when revoke fails", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    revokeApiKeyMock.mockResolvedValue({ ok: false, error: "boom" });
    const req = new Request("http://x/api/keys/key-1", { method: "DELETE" });
    const res = await DELETE(req, params("key-1"));
    expect(res.status).toBe(500);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});
