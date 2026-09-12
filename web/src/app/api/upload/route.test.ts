// Colocated vitest for POST /api/upload — release QA-4 P2-b.
//
// Pins the gate ORDER: the auth check runs BEFORE the body is parsed. Before
// this fix `request.formData()` ran first, so an anonymous POST with no /
// bad body was a 500 and never a 401 — and any caller could make the route
// throw for free. Now:
//   - anonymous + no UPLOAD_PASSWORD configured → 401 without touching the body
//   - anonymous + UPLOAD_PASSWORD configured but non-multipart body → 401
//   - signed-in + malformed multipart → 400 (not 500)
//   - signed-in + no file field → 400
// fs / clamav / supabase are mocked so nothing is written.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/security/clamav", () => ({
  scanBuffer: vi.fn(async () => ({ ok: true, verdict: "clean" })),
  getScannerVersion: vi.fn(async () => "test"),
}));
vi.mock("fs/promises", () => ({ writeFile: vi.fn(async () => undefined), mkdir: vi.fn(async () => undefined) }));
vi.mock("fs", () => ({ existsSync: () => true }));

import { POST } from "./route";

function post(init: { body?: BodyInit | null; contentType?: string }): Request {
  const headers: Record<string, string> = {};
  if (init.contentType) headers["content-type"] = init.contentType;
  return new Request("http://localhost/api/upload", { method: "POST", headers, body: init.body ?? null });
}

const ORIGINAL_PW = process.env.UPLOAD_PASSWORD;

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  delete process.env.UPLOAD_PASSWORD;
});

afterEach(() => {
  if (ORIGINAL_PW === undefined) delete process.env.UPLOAD_PASSWORD;
  else process.env.UPLOAD_PASSWORD = ORIGINAL_PW;
});

describe("POST /api/upload — auth before body parse", () => {
  it("anonymous, empty body → 401 (not 500)", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/unauthorized/i);
  });

  it("anonymous, malformed JSON body → 401 (not 500)", async () => {
    const res = await POST(post({ body: "{", contentType: "application/json" }));
    expect(res.status).toBe(401);
  });

  it("anonymous, multipart body without a session → 401 (password path closed when UPLOAD_PASSWORD unset)", async () => {
    const fd = new FormData();
    fd.set("password", "1243");
    fd.set("file", new File(["x"], "a.txt", { type: "text/plain" }));
    const res = await POST(new Request("http://localhost/api/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(401);
  });

  it("signed-in, empty body → 400 (not 500)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "u@x.co" });
    const res = await POST(post({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid body|multipart/i);
  });

  it("signed-in, malformed body → 400 (not 500)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "u@x.co" });
    const res = await POST(post({ body: "not multipart", contentType: "application/json" }));
    expect(res.status).toBe(400);
  });

  it("signed-in, multipart without a file → 400 'No file provided'", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "u@x.co" });
    const fd = new FormData();
    fd.set("note", "hi");
    const res = await POST(new Request("http://localhost/api/upload", { method: "POST", body: fd }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no file provided/i);
  });
});
