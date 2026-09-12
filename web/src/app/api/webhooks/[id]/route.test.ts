// S20-B — PATCH/DELETE /api/webhooks/[id], POST …/test, GET …/deliveries:
// creator or project admin only (404 otherwise), SSRF 400 on a new URL,
// resume resets the failure counter, ping is booked single-shot, delivery
// list is capped at 50 newest first.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const accessMock = vi.fn<(userId: string, projectId: string, minRole?: string) => Promise<unknown>>();
vi.mock("@/lib/projects", () => ({
  assertProjectAccess: (u: string, p: string, r?: string) => accessMock(u, p, r),
  assertProjectScope: async () => ({}),
}));

const checkUrlMock = vi.fn<(url: string) => Promise<{ ok: true } | { ok: false; reason: string }>>();
const sendPingMock = vi.fn();
vi.mock("@/lib/webhooks/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhooks/dispatch")>();
  return {
    ...actual,
    validateEndpointUrl: (u: string) => checkUrlMock(u),
    sendPing: (...a: unknown[]) => sendPingMock(...a),
  };
});

import { memoryWebhookStore, type EndpointRow, type MemoryStore } from "@/lib/webhooks/store";
let store: MemoryStore | null;
vi.mock("@/lib/webhooks/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/webhooks/store")>();
  return { ...actual, supabaseWebhookStore: () => store };
});

import { DELETE, PATCH } from "./route";
import { POST as TEST } from "./test/route";
import { GET as DELIVERIES } from "./deliveries/route";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PID = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const creator = { id: "creator", email: "c@x.test", plan: "founder_growth", role: "user" };

function ep(over: Partial<EndpointRow> = {}): EndpointRow {
  return {
    id: ID,
    user_id: "creator",
    project_id: null,
    url: "https://h.example.com/x",
    description: null,
    secret_hash: "h",
    secret_enc: "obf:d2hzZWM=",
    events: ["svi.rescored"],
    active: false,
    failure_count: 20,
    disabled_reason: "auto_disabled:20_consecutive_failures",
    last_success_at: null,
    last_failure_at: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    ...over,
  };
}
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
function req(method: string, body?: unknown) {
  return new NextRequest(`http://x/api/webhooks/${ID}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
}
function accessError(code: "not_found" | "forbidden") {
  const err = new Error(code) as Error & { code: string };
  err.name = "ProjectAccessError";
  err.code = code;
  return err;
}

beforeEach(() => {
  store = memoryWebhookStore({ endpoints: [ep()] });
  getCurrentUserMock.mockReset().mockResolvedValue(creator);
  accessMock.mockReset().mockResolvedValue({ role: "admin" });
  checkUrlMock.mockReset().mockResolvedValue({ ok: true });
  sendPingMock.mockReset().mockResolvedValue({ delivery_id: "d-ping", outcome: { ok: true, status: 200, durationMs: 12 } });
});

describe("PATCH /api/webhooks/[id]", () => {
  it("401 anonymous · 404 unknown id · 404 someone else's user-level endpoint", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { active: true }), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(creator);
    expect((await PATCH(req("PATCH", { active: true }), ctx("cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee"))).status).toBe(404);
    getCurrentUserMock.mockResolvedValue({ ...creator, id: "stranger" });
    expect((await PATCH(req("PATCH", { active: true }), ctx())).status).toBe(404);
    expect(accessMock).not.toHaveBeenCalled();
  });

  it("resume resets failure_count + disabled_reason; pause records paused_by_user", async () => {
    const res = await PATCH(req("PATCH", { active: true }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).endpoint).toMatchObject({ active: true, failure_count: 0, disabled_reason: null });
    expect(store!.endpoints[0]).toMatchObject({ active: true, failure_count: 0, disabled_reason: null });
    await PATCH(req("PATCH", { active: false }), ctx());
    expect(store!.endpoints[0]).toMatchObject({ active: false, disabled_reason: "paused_by_user" });
  });

  it("url / events / description are validated; a rejected URL is 400 and nothing changes", async () => {
    checkUrlMock.mockResolvedValue({ ok: false, reason: "private_ip" });
    const res = await PATCH(req("PATCH", { url: "https://10.0.0.1/x" }), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "url_rejected", reason: "private_ip" });
    expect(store!.endpoints[0].url).toBe("https://h.example.com/x");
    checkUrlMock.mockResolvedValue({ ok: true });
    expect((await PATCH(req("PATCH", { url: "https://new.example.com/x", events: ["funding.report_ready"], description: "n" }), ctx())).status).toBe(200);
    expect(store!.endpoints[0]).toMatchObject({ url: "https://new.example.com/x", events: ["funding.report_ready"], description: "n" });
    expect((await (await PATCH(req("PATCH", { events: ["nope"] }), ctx())).json()).error).toBe("unknown_event:nope");
    expect((await (await PATCH(req("PATCH", { active: "yes" }), ctx())).json()).error).toBe("invalid_active");
    expect((await (await PATCH(req("PATCH", {}), ctx())).json()).error).toBe("nothing_to_update");
  });

  it("P1: a revoked creator gets 404 on PATCH / DELETE / test / deliveries of their project-level endpoint", async () => {
    store = memoryWebhookStore({ endpoints: [ep({ project_id: PID, user_id: "creator" })] });
    accessMock.mockRejectedValue(accessError("not_found"));
    expect((await PATCH(req("PATCH", { active: true }), ctx())).status).toBe(404);
    expect(store!.endpoints[0].active).toBe(false);
    expect((await DELETE(req("DELETE"), ctx())).status).toBe(404);
    expect(store!.endpoints).toHaveLength(1);
    expect((await TEST(req("POST"), ctx())).status).toBe(404);
    expect(sendPingMock).not.toHaveBeenCalled();
    expect((await DELIVERIES(req("GET"), ctx())).status).toBe(404);
    expect(accessMock).toHaveBeenCalledWith("creator", PID, "admin");
    // Still an admin → everything works again.
    accessMock.mockResolvedValue({ role: "admin" });
    expect((await PATCH(req("PATCH", { active: true }), ctx())).status).toBe(200);
  });

  it("project-level endpoint: admin member may edit, editor 403, non-member 404", async () => {
    store = memoryWebhookStore({ endpoints: [ep({ project_id: PID })] });
    getCurrentUserMock.mockResolvedValue({ ...creator, id: "member" });
    expect((await PATCH(req("PATCH", { active: true }), ctx())).status).toBe(200);
    expect(accessMock).toHaveBeenCalledWith("member", PID, "admin");
    accessMock.mockRejectedValue(accessError("forbidden"));
    expect((await PATCH(req("PATCH", { active: true }), ctx())).status).toBe(403);
    accessMock.mockRejectedValue(accessError("not_found"));
    expect((await PATCH(req("PATCH", { active: true }), ctx())).status).toBe(404);
  });
});

describe("DELETE /api/webhooks/[id]", () => {
  it("creator deletes; stranger 404; anonymous 401", async () => {
    getCurrentUserMock.mockResolvedValue({ ...creator, id: "stranger" });
    expect((await DELETE(req("DELETE"), ctx())).status).toBe(404);
    expect(store!.endpoints).toHaveLength(1);
    getCurrentUserMock.mockResolvedValue(creator);
    expect((await DELETE(req("DELETE"), ctx())).status).toBe(200);
    expect(store!.endpoints).toHaveLength(0);
    getCurrentUserMock.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), ctx())).status).toBe(401);
  });
});

describe("POST /api/webhooks/[id]/test", () => {
  it("sends a ping for the creator and reports the receiver's verdict", async () => {
    const res = await TEST(req("POST"), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, delivery_id: "d-ping", status: 200, duration_ms: 12 });
    expect(sendPingMock).toHaveBeenCalledWith(store, store!.endpoints[0]);
    sendPingMock.mockResolvedValue({ delivery_id: "d-2", outcome: { ok: false, status: null, error: "ssrf_refused:private_ip", durationMs: 1 } });
    expect(await (await TEST(req("POST"), ctx())).json()).toEqual({ ok: false, delivery_id: "d-2", status: null, error: "ssrf_refused:private_ip", duration_ms: 1 });
  });
  it("404 for a stranger, 401 anonymous, 503 without a store", async () => {
    getCurrentUserMock.mockResolvedValue({ ...creator, id: "stranger" });
    expect((await TEST(req("POST"), ctx())).status).toBe(404);
    expect(sendPingMock).not.toHaveBeenCalled();
    getCurrentUserMock.mockResolvedValue(null);
    expect((await TEST(req("POST"), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(creator);
    store = null;
    expect((await TEST(req("POST"), ctx())).status).toBe(503);
  });
});

describe("GET /api/webhooks/[id]/deliveries", () => {
  it("returns the newest 50 without payloads; stranger 404", async () => {
    for (let i = 0; i < 60; i++) {
      await store!.insertDeliveries([{ id: `d-${i}`, endpoint_id: ID, event: "ping", payload: { secret_ish: i } }]);
      store!.deliveries[i].created_at = new Date(Date.UTC(2026, 8, 12, 0, i)).toISOString();
    }
    const res = await DELIVERIES(req("GET"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deliveries).toHaveLength(50);
    expect(body.deliveries[0].id).toBe("d-59");
    expect(JSON.stringify(body)).not.toContain("secret_ish");
    expect(body.deliveries[0]).toMatchObject({ event: "ping", status: "queued", attempts: 0 });
    getCurrentUserMock.mockResolvedValue({ ...creator, id: "stranger" });
    expect((await DELIVERIES(req("GET"), ctx())).status).toBe(404);
  });
});
