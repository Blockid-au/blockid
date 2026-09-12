// S20-B — GET/POST /api/webhooks: auth, plan gate (402), member admin for
// project-level endpoints, secret returned ONCE (never stored in clear),
// SSRF 400, events validation, per-scope limit. (Cross-site refusal is the
// S9-A proxy gate — src/proxy.test.ts — not per route.)
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async () => [] }));

const scopeMock = vi.fn<(user: { id: string }, projectId: string, minRole?: string) => Promise<unknown>>();
vi.mock("@/lib/projects", () => ({
  assertProjectScope: (u: { id: string }, p: string, r?: string) => scopeMock(u, p, r),
  assertProjectAccess: async () => ({ role: "owner" }),
}));

const checkUrlMock = vi.fn<(url: string) => Promise<{ ok: true } | { ok: false; reason: string }>>();
vi.mock("@/lib/webhooks/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhooks/dispatch")>();
  return { ...actual, validateEndpointUrl: (u: string) => checkUrlMock(u) };
});

import { memoryWebhookStore, type MemoryStore } from "@/lib/webhooks/store";
let store: MemoryStore | null;
vi.mock("@/lib/webhooks/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhooks/store")>();
  return { ...actual, supabaseWebhookStore: () => store };
});

import { hashSecret, openSecret } from "@/lib/webhooks/sign";
import { GET, POST } from "./route";

const PID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const growth = { id: "u-growth", email: "g@x.test", plan: "founder_growth", role: "user" };
const free = { id: "u-free", email: "f@x.test", plan: "founder_free", role: "user" };

function post(body: unknown) {
  return new NextRequest("http://x/api/webhooks", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
function get(qs = "") {
  return new NextRequest(`http://x/api/webhooks${qs}`);
}
function accessError(code: "not_found" | "forbidden") {
  const err = new Error(code) as Error & { code: string };
  err.name = "ProjectAccessError";
  err.code = code;
  return err;
}

beforeEach(() => {
  store = memoryWebhookStore({ packageUsers: new Set(["u-pkg"]) });
  getCurrentUserMock.mockReset().mockResolvedValue(growth);
  scopeMock.mockReset().mockResolvedValue({ projectId: PID, role: "admin" });
  checkUrlMock.mockReset().mockResolvedValue({ ok: true });
});

describe("POST /api/webhooks", () => {
  it("401 anonymous, 503 without a store", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({}))).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(growth);
    store = null;
    expect((await POST(post({}))).status).toBe(503);
  });

  it("402 plan_required for a Free / Starter founder; Starter + Startup Package passes", async () => {
    getCurrentUserMock.mockResolvedValue(free);
    const res = await POST(post({ url: "https://h.example.com/x", events: ["svi.rescored"] }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("plan_required");
    getCurrentUserMock.mockResolvedValue({ id: "u-pkg", email: "p@x.test", plan: "founder_starter", role: "user" });
    expect((await POST(post({ url: "https://h.example.com/x", events: ["svi.rescored"] }))).status).toBe(201);
  });

  it("creates a user-level endpoint and returns the secret ONCE; the store only holds hash + sealed copy", async () => {
    const res = await POST(post({ url: " https://h.example.com/x ", events: ["evidence.uploaded", "svi.rescored"], description: " Zapier " }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.secret).toMatch(/^whsec_/);
    expect(body.endpoint).toMatchObject({ url: "https://h.example.com/x", events: ["svi.rescored", "evidence.uploaded"], description: "Zapier", project_id: null, active: true });
    expect(JSON.stringify(body.endpoint)).not.toContain("secret");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const row = store!.endpoints[0];
    expect(row.user_id).toBe("u-growth");
    expect(row.secret_hash).toBe(hashSecret(body.secret));
    expect(row.secret_enc).not.toContain(body.secret);
    expect(openSecret(row.secret_enc)).toBe(body.secret);
    // Listing afterwards never returns the secret again.
    const list = await (await GET(get())).json();
    expect(JSON.stringify(list)).not.toContain(body.secret);
    expect(list.endpoints).toHaveLength(1);
    expect(list.access).toEqual({ allowed: true, reason: "founder_growth" });
    expect(list.events.map((e: { event: string }) => e.event)).toContain("funding.report_ready");
  });

  it("400 on missing url / unknown event / empty events / bad json / bad project id", async () => {
    expect((await (await POST(post({ events: ["svi.rescored"] }))).json()).error).toBe("url_required");
    expect((await (await POST(post({ url: "https://h.example.com/x", events: ["ping"] }))).json()).error).toBe("unknown_event:ping");
    expect((await (await POST(post({ url: "https://h.example.com/x", events: [] }))).json()).error).toBe("events_required");
    expect((await POST(new NextRequest("http://x/api/webhooks", { method: "POST", body: "{nope" }))).status).toBe(400);
    expect((await (await POST(post({ url: "https://h.example.com/x", events: ["svi.rescored"], project_id: "p1" }))).json()).error).toBe("invalid_project_id");
  });

  it("400 url_rejected from the SSRF guard (http, private ip, internal host) — nothing stored", async () => {
    checkUrlMock.mockResolvedValue({ ok: false, reason: "hostname_forbidden" });
    const res = await POST(post({ url: "https://169.254.169.254/latest", events: ["svi.rescored"] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "url_rejected", reason: "hostname_forbidden" });
    expect(store!.endpoints).toHaveLength(0);
    expect(checkUrlMock).toHaveBeenCalledWith("https://169.254.169.254/latest");
  });

  it("project-level endpoint: admin member creates it (assertProjectScope admin), editor 403, non-member 404", async () => {
    const res = await POST(post({ url: "https://h.example.com/x", events: ["svi.rescored"], project_id: PID }));
    expect(res.status).toBe(201);
    expect(scopeMock).toHaveBeenCalledWith({ id: "u-growth", email: "g@x.test" }, PID, "admin");
    expect((await res.json()).endpoint.project_id).toBe(PID);
    scopeMock.mockRejectedValue(accessError("forbidden"));
    expect((await POST(post({ url: "https://h.example.com/x", events: ["svi.rescored"], project_id: PID }))).status).toBe(403);
    scopeMock.mockRejectedValue(accessError("not_found"));
    expect((await POST(post({ url: "https://h.example.com/x", events: ["svi.rescored"], project_id: PID }))).status).toBe(404);
    expect(store!.endpoints).toHaveLength(1);
  });

  it("409 limit_reached at 10 endpoints per scope", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await POST(post({ url: `https://h${i}.example.com/x`, events: ["svi.rescored"] }))).status).toBe(201);
    }
    const res = await POST(post({ url: "https://h11.example.com/x", events: ["svi.rescored"] }));
    expect(res.status).toBe(409);
    // A project scope has its own budget.
    expect((await POST(post({ url: "https://p.example.com/x", events: ["svi.rescored"], project_id: PID }))).status).toBe(201);
  });
});

describe("GET /api/webhooks", () => {
  it("401 anonymous; own endpoints by default; ?project_id requires admin", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(free);
    await store!.insertEndpoint({ user_id: "u-free", project_id: null, url: "https://a.example.com", description: null, secret_hash: "h", secret_enc: "obf:eA==", events: ["svi.rescored"] });
    await store!.insertEndpoint({ user_id: "other", project_id: PID, url: "https://b.example.com", description: null, secret_hash: "h", secret_enc: "obf:eA==", events: ["svi.rescored"] });
    const mine = await (await GET(get())).json();
    expect(mine.endpoints.map((e: { url: string }) => e.url)).toEqual(["https://a.example.com"]);
    expect(mine.access.allowed).toBe(false);
    const proj = await (await GET(get(`?project_id=${PID}`))).json();
    expect(proj.endpoints.map((e: { url: string }) => e.url)).toEqual(["https://b.example.com"]);
    expect(scopeMock).toHaveBeenCalledWith({ id: "u-free", email: "f@x.test" }, PID, "admin");
    scopeMock.mockRejectedValue(accessError("not_found"));
    expect((await GET(get(`?project_id=${PID}`))).status).toBe(404);
    expect((await GET(get("?project_id=nope"))).status).toBe(400);
  });
});
