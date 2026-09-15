import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const getCurrentUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUser() }));

async function load() {
  return await import("./route");
}

function req(url: string) {
  const u = new URL(url);
  return { nextUrl: u } as unknown as import("next/server").NextRequest;
}

describe("GET /api/auth/svi-handoff", () => {
  beforeEach(() => {
    vi.resetModules();
    getCurrentUser.mockReset();
    process.env.SVI_HANDOFF_SECRET = "test-secret";
  });

  it("rejects a return URL that is not on the SVI origin (no token leaves blockid.au)", async () => {
    const { GET } = await load();
    getCurrentUser.mockResolvedValue({ id: "u1" });
    const res = await GET(req("https://blockid.au/api/auth/svi-handoff?return=https%3A%2F%2Fevil.example%2Fx"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "bad_return_url" });
  });

  it("bounces anonymous visitors through /auth/login with next= pointing back here", async () => {
    const { GET } = await load();
    getCurrentUser.mockResolvedValue(null);
    const res = await GET(req("https://blockid.au/api/auth/svi-handoff?return=https%3A%2F%2Fstartupvalueindex.com%2Fapi%2Fauth%2Fsession%3Freturn%3D%2Fpitchbook%2Fupload"));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("https://blockid.au"); // never the proxied 0.0.0.0:4001 origin
    expect(loc.pathname).toBe("/auth/login");
    expect(loc.searchParams.get("next")).toContain("/api/auth/svi-handoff?return=");
  });

  it("redirects a signed-in founder to SVI with a 5-minute HMAC token carrying only the user id", async () => {
    const { GET } = await load();
    getCurrentUser.mockResolvedValue({ id: "u-42", email: "f@x.au" });
    const res = await GET(req("https://blockid.au/api/auth/svi-handoff?return=https%3A%2F%2Fstartupvalueindex.com%2Fapi%2Fauth%2Fsession%3Freturn%3D%2Fpitchbook%2Fupload"));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("https://startupvalueindex.com");
    expect(loc.searchParams.get("return")).toBe("/pitchbook/upload");
    const token = loc.searchParams.get("svi_token")!;
    const [payload, sig] = token.split(".");
    const expected = Buffer.from(createHmac("sha256", "test-secret").update(payload).digest()).toString("base64url");
    expect(sig).toBe(expected);
    const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    expect(body.uid).toBe("u-42");
    expect(body.email).toBeUndefined();
    expect(body.exp - Math.floor(Date.now() / 1000)).toBeGreaterThan(290);
    expect(body.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(300);
  });

  it("returns handoff_not_configured when the shared secret is missing", async () => {
    delete process.env.SVI_HANDOFF_SECRET;
    const { GET } = await load();
    const res = await GET(req("https://blockid.au/api/auth/svi-handoff?return=https%3A%2F%2Fstartupvalueindex.com%2F"));
    expect(res.status).toBe(400);
  });
});
