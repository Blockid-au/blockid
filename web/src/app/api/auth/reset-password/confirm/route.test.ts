// Colocated vitest for POST /api/auth/reset-password/confirm — release QA-4 P2-d.
//
// The consume half of the token-based reset. Pins: rate limit → body guard
// → validation → consumePasswordReset; all token failures collapse to ONE
// generic 400 (no "expired" vs "unknown" distinction leaks token state);
// infra failures are 503; the response never carries the token or a hash.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumePasswordReset: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  consumePasswordReset: (t: string, p: string) => mocks.consumePasswordReset(t, p),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));

import { POST } from "./route";

function raw(body: string, ip?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip) headers["x-forwarded-for"] = ip;
  return new Request("http://x/api/auth/reset-password/confirm", { method: "POST", headers, body });
}
const req = (body: unknown, ip?: string) => raw(JSON.stringify(body), ip);
const json = async (res: Response) => (await res.json()) as Record<string, unknown>;

beforeEach(() => {
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.consumePasswordReset.mockResolvedValue({ ok: true, userId: "u-1", email: "a@b.co" });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.clearAllMocks());

describe("POST /api/auth/reset-password/confirm", () => {
  it("429 when the per-IP limit denies; consume never runs", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(req({ token: "t".repeat(32), password: "longenough" }, "9.9.9.9"));
    expect(res.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("reset-confirm:9.9.9.9", 10, 15 * 60 * 1000);
    expect(mocks.consumePasswordReset).not.toHaveBeenCalled();
  });

  it("empty body → 400 invalid_json (not 500)", async () => {
    const res = await POST(raw(""));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("invalid_json");
  });

  it("malformed body → 400 invalid_json (not 500)", async () => {
    const res = await POST(raw("{"));
    expect(res.status).toBe(400);
  });

  it("missing token → 400", async () => {
    const res = await POST(req({ password: "longenough" }));
    expect(res.status).toBe(400);
    expect(mocks.consumePasswordReset).not.toHaveBeenCalled();
  });

  it("short password → 400 before consume", async () => {
    const res = await POST(req({ token: "t".repeat(32), password: "short" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toMatch(/8 characters/);
    expect(mocks.consumePasswordReset).not.toHaveBeenCalled();
  });

  it.each(["invalid_token", "expired", "already_used"])(
    "%s → the same generic 400 (token state is not disclosed)",
    async (reason) => {
      mocks.consumePasswordReset.mockResolvedValue({ ok: false, reason });
      const res = await POST(req({ token: "t".repeat(32), password: "longenough" }));
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe(
        "This reset link is invalid or has expired. Request a new one.",
      );
    },
  );

  it.each(["not_configured", "db_error"])("%s → 503 retryable", async (reason) => {
    mocks.consumePasswordReset.mockResolvedValue({ ok: false, reason });
    const res = await POST(req({ token: "t".repeat(32), password: "longenough" }));
    expect(res.status).toBe(503);
  });

  it("happy path: passes the trimmed token + raw password through and returns 200 without echoing either", async () => {
    const res = await POST(req({ token: "  tok_abc  ", password: "NewPassw0rd!" }));
    expect(res.status).toBe(200);
    expect(mocks.consumePasswordReset).toHaveBeenCalledWith("tok_abc", "NewPassw0rd!");
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/tok_abc|NewPassw0rd/);
  });

  it("500 when consume throws unexpectedly (generic body)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.consumePasswordReset.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ token: "t".repeat(32), password: "longenough" }));
    expect(res.status).toBe(500);
    expect((await json(res)).error).toBe("Internal server error");
  });
});
