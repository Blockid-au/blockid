// Colocated vitest for POST /api/svi/share.
//
// Route sends an SVI share email to a recipient after verifying that the
// authenticated caller owns the target svi_analyses row (email match,
// case-insensitive + trimmed). Suite covers:
//   - 401 when unauthenticated
//   - 400 on unparseable JSON body
//   - 400 when recipientEmail missing or malformed (no "@")
//   - 400 when slug missing
//   - 403 when the analysis is owned by a different user (case/whitespace
//     normalised on both sides)
//   - 200 happy path — svi score is looked up and passed to sendSVIShare
//   - 200 when supabase is unconfigured (svi defaults to 0, no ownership check)
//   - 200 when the analysis row is absent (svi stays 0; no 403 raised)
//   - 200 when the row exists but total_svi is null (svi stays 0)
//   - 503 when sendSVIShare returns reason=not_configured
//   - 500 when sendSVIShare returns reason=send_error
//   - senderName is forwarded, defaulting to null when absent

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  sendSVIShare: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdmin(),
}));
vi.mock("@/lib/email", () => ({
  sendSVIShare: (args: unknown) => mocks.sendSVIShare(args),
}));

import { POST } from "./route";

const USER = { id: "u-1", email: "Founder@Example.com" };

function makeSb(row: { total_svi: number | null; email: string | null } | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: row }),
        })),
      })),
    })),
  };
}

function req(body: unknown, opts?: { raw?: string }) {
  return new Request("http://x/api/svi/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getCurrentUser.mockReset();
  mocks.getSupabaseAdmin.mockReset();
  mocks.sendSVIShare.mockReset();
});

describe("POST /api/svi/share", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(req({ recipientEmail: "x@y.com", slug: "s" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(mocks.sendSVIShare).not.toHaveBeenCalled();
  });

  it("returns 400 when body is not valid JSON", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await POST(req(null, { raw: "{not json" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON/i);
    expect(mocks.sendSVIShare).not.toHaveBeenCalled();
  });

  it("returns 400 when recipientEmail is missing", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await POST(req({ slug: "s" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/recipientEmail/i);
  });

  it("returns 400 when recipientEmail has no '@'", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await POST(req({ recipientEmail: "not-an-email", slug: "s" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when slug is missing", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    const res = await POST(req({ recipientEmail: "to@example.com" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/slug/i);
  });

  it("returns 403 when the analysis belongs to a different email", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ total_svi: 82, email: "someone-else@example.com" }),
    );
    const res = await POST(
      req({ recipientEmail: "to@example.com", slug: "svi-999" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/do not own/i);
    expect(mocks.sendSVIShare).not.toHaveBeenCalled();
  });

  it("passes ownership check when emails differ only in case/whitespace, and forwards the svi score", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ total_svi: 88, email: "  founder@example.com  " }),
    );
    mocks.sendSVIShare.mockResolvedValue({ ok: true, id: "msg-1" });

    const res = await POST(
      req({
        recipientEmail: "friend@example.com",
        slug: "svi-1",
        senderName: "Alice",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(mocks.sendSVIShare).toHaveBeenCalledTimes(1);
    expect(mocks.sendSVIShare).toHaveBeenCalledWith({
      to: "friend@example.com",
      senderName: "Alice",
      slug: "svi-1",
      svi: 88,
    });
  });

  it("defaults senderName to null when the caller omits it", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ total_svi: 55, email: "founder@example.com" }),
    );
    mocks.sendSVIShare.mockResolvedValue({ ok: true, id: "msg-2" });

    const res = await POST(
      req({ recipientEmail: "friend@example.com", slug: "svi-2" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendSVIShare.mock.calls[0][0].senderName).toBeNull();
  });

  it("skips ownership + score lookup when supabase is unconfigured (svi defaults to 0)", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(null);
    mocks.sendSVIShare.mockResolvedValue({ ok: true, id: "msg-3" });

    const res = await POST(
      req({ recipientEmail: "friend@example.com", slug: "svi-3" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendSVIShare).toHaveBeenCalledWith({
      to: "friend@example.com",
      senderName: null,
      slug: "svi-3",
      svi: 0,
    });
  });

  it("does not raise 403 when the analysis row is absent (svi stays 0)", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(makeSb(null));
    mocks.sendSVIShare.mockResolvedValue({ ok: true, id: "msg-4" });

    const res = await POST(
      req({ recipientEmail: "friend@example.com", slug: "does-not-exist" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendSVIShare.mock.calls[0][0].svi).toBe(0);
  });

  it("keeps svi at 0 when the row exists but total_svi is null", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ total_svi: null, email: "founder@example.com" }),
    );
    mocks.sendSVIShare.mockResolvedValue({ ok: true, id: "msg-5" });

    const res = await POST(
      req({ recipientEmail: "friend@example.com", slug: "svi-null" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.sendSVIShare.mock.calls[0][0].svi).toBe(0);
  });

  it("returns 503 when sendSVIShare reports not_configured", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ total_svi: 70, email: "founder@example.com" }),
    );
    mocks.sendSVIShare.mockResolvedValue({ ok: false, reason: "not_configured" });

    const res = await POST(
      req({ recipientEmail: "friend@example.com", slug: "svi-6" }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("not_configured");
  });

  it("returns 500 when sendSVIShare reports send_error", async () => {
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getSupabaseAdmin.mockReturnValue(
      makeSb({ total_svi: 70, email: "founder@example.com" }),
    );
    mocks.sendSVIShare.mockResolvedValue({ ok: false, reason: "send_error" });

    const res = await POST(
      req({ recipientEmail: "friend@example.com", slug: "svi-7" }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("send_error");
  });
});
