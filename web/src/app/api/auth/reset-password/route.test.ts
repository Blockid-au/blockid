// Colocated vitest for POST /api/auth/reset-password — P9 batch 1.
//
// Password reset is a public endpoint (no auth required). A bypass here
// could allow account takeover or email flooding. Suite covers:
//   - 429 when rate limit exceeded
//   - 400 on invalid email
//   - 400 on missing body
//   - always returns ok:true (no email enumeration)
//   - calls resetWithTempPassword on valid email
//   - sends password reset email when tempPassword returned
//   - does NOT send email when resetWithTempPassword returns no tempPassword
//   - detects locale from cookie header (vi / en)
//   - 500 on unexpected internal error

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isValidEmail: vi.fn(),
  normaliseEmail: vi.fn(),
  resetWithTempPassword: vi.fn(),
  sendPasswordReset: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  isValidEmail: (e: string) => mocks.isValidEmail(e),
  normaliseEmail: (e: string) => mocks.normaliseEmail(e),
  resetWithTempPassword: (e: string) => mocks.resetWithTempPassword(e),
}));
vi.mock("@/lib/email", () => ({
  sendPasswordReset: (args: unknown) => mocks.sendPasswordReset(args),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
}));

import { POST } from "./route";

function req(body: unknown, opts?: { cookies?: string }) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.cookies) headers["cookie"] = opts.cookies;
  return new Request("http://x/api/auth/reset-password", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.isValidEmail.mockReturnValue(true);
  mocks.normaliseEmail.mockImplementation((e: string) => e.toLowerCase().trim());
  mocks.resetWithTempPassword.mockResolvedValue({ ok: true, tempPassword: "Tmp123!@#" });
  mocks.sendPasswordReset.mockResolvedValue(undefined);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/auth/reset-password", () => {
  it("returns 429 when rate limit exceeded", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false });
    const res = await POST(req({ email: "user@example.com" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 on invalid email", async () => {
    mocks.isValidEmail.mockReturnValue(false);
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/email/i);
  });

  it("returns 400 when email is missing", async () => {
    mocks.isValidEmail.mockReturnValue(false);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("always returns ok:true even when user not found (no email enumeration)", async () => {
    mocks.resetWithTempPassword.mockResolvedValue({ ok: false, tempPassword: undefined });
    const res = await POST(req({ email: "nobody@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("calls resetWithTempPassword with normalised email", async () => {
    await POST(req({ email: "User@EXAMPLE.com" }));
    expect(mocks.resetWithTempPassword).toHaveBeenCalledWith("user@example.com");
  });

  it("sends password reset email when tempPassword is returned", async () => {
    mocks.resetWithTempPassword.mockResolvedValue({ ok: true, tempPassword: "Tmp123!@#" });
    await POST(req({ email: "user@example.com" }));
    // sendPasswordReset is called via void — wait for micro-tasks
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ to: "user@example.com", tempPassword: "Tmp123!@#" }),
    );
  });

  it("does NOT send email when resetWithTempPassword returns no tempPassword", async () => {
    mocks.resetWithTempPassword.mockResolvedValue({ ok: false });
    await POST(req({ email: "user@example.com" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("detects Vietnamese locale from cookie", async () => {
    mocks.resetWithTempPassword.mockResolvedValue({ ok: true, tempPassword: "Tmp123!@#" });
    await POST(req({ email: "user@example.com" }, { cookies: "blockid_lang=vi; other=val" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "vi" }),
    );
  });

  it("defaults to English locale when cookie not set", async () => {
    mocks.resetWithTempPassword.mockResolvedValue({ ok: true, tempPassword: "Tmp123!@#" });
    await POST(req({ email: "user@example.com" }));
    await new Promise((r) => setTimeout(r, 10));
    expect(mocks.sendPasswordReset).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en" }),
    );
  });

  it("returns 200 with ok message on happy path", async () => {
    const res = await POST(req({ email: "user@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(typeof body.message).toBe("string");
  });

  it("returns 500 on unexpected internal error", async () => {
    mocks.resetWithTempPassword.mockRejectedValue(new Error("DB down"));
    const res = await POST(req({ email: "user@example.com" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("rate limit key includes IP from x-forwarded-for", async () => {
    const r = new Request("http://x/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    await POST(r);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("1.2.3.4"),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("falls back to unknown IP when x-forwarded-for missing", async () => {
    const r = new Request("http://x/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.com" }),
    });
    await POST(r);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("unknown"),
      expect.any(Number),
      expect.any(Number),
    );
  });
});
