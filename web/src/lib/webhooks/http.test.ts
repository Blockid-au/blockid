// S20-B — route helpers: public shapes never leak the secret; input
// parsing; the endpoint access rule (creator / project admin / 404).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const accessMock = vi.fn<(userId: string, projectId: string, minRole?: string) => Promise<unknown>>();
vi.mock("@/lib/projects", () => ({ assertProjectAccess: (u: string, p: string, r?: string) => accessMock(u, p, r) }));

import { loadEndpointForCaller, parseDescription, parseEventsInput, publicDelivery, publicEndpoint } from "./http";
import { memoryWebhookStore, type EndpointRow } from "./store";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function ep(over: Partial<EndpointRow> = {}): EndpointRow {
  return {
    id: ID,
    user_id: "creator",
    project_id: null,
    url: "https://h.example.com/x",
    description: "desc",
    secret_hash: "HASH",
    secret_enc: "SEALED",
    events: ["svi.rescored", "bogus"],
    active: true,
    failure_count: 2,
    disabled_reason: null,
    last_success_at: null,
    last_failure_at: "2026-09-12T00:00:00.000Z",
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    ...over,
  };
}

function accessError(code: "not_found" | "forbidden") {
  const err = new Error(code) as Error & { code: string };
  err.name = "ProjectAccessError";
  err.code = code;
  return err;
}

describe("public shapes", () => {
  it("publicEndpoint drops secret_hash / secret_enc and unknown events", () => {
    const out = publicEndpoint(ep());
    expect(JSON.stringify(out)).not.toMatch(/HASH|SEALED|secret/);
    expect(out.events).toEqual(["svi.rescored"]);
    expect(out).toMatchObject({ id: ID, failure_count: 2, active: true });
  });
  it("publicDelivery exposes next_attempt_at only while pending", () => {
    const base = { id: "d", endpoint_id: ID, event: "ping", payload: { secret: "x" }, attempts: 1, next_attempt_at: "2026-09-12T01:00:00.000Z", locked_until: null, response_status: 500, last_error: "http_500", created_at: "2026-09-12T00:00:00.000Z", delivered_at: null };
    expect(publicDelivery({ ...base, status: "failed" }).next_attempt_at).toBe("2026-09-12T01:00:00.000Z");
    expect(publicDelivery({ ...base, status: "dead" }).next_attempt_at).toBeNull();
    expect(JSON.stringify(publicDelivery({ ...base, status: "delivered" }))).not.toContain("payload");
  });
});

describe("input parsing", () => {
  it("parseEventsInput: non-empty, known, deduped, catalogue order", () => {
    expect(parseEventsInput(["evidence.uploaded", "svi.rescored", "svi.rescored"])).toEqual({ ok: true, events: ["svi.rescored", "evidence.uploaded"] });
    expect(parseEventsInput([])).toEqual({ ok: false, error: "events_required" });
    expect(parseEventsInput("svi.rescored")).toEqual({ ok: false, error: "events_required" });
    expect(parseEventsInput(["ping"])).toEqual({ ok: false, error: "unknown_event:ping" });
    expect(parseEventsInput([1])).toEqual({ ok: false, error: "unknown_event:number" });
  });
  it("parseDescription: optional, trimmed, ≤ 200 chars", () => {
    expect(parseDescription(undefined)).toEqual({ ok: true, description: null });
    expect(parseDescription("  Zapier  ")).toEqual({ ok: true, description: "Zapier" });
    expect(parseDescription("x".repeat(201))).toEqual({ ok: false, error: "description_too_long" });
    expect(parseDescription(5)).toEqual({ ok: false, error: "invalid_description" });
  });
});

describe("loadEndpointForCaller", () => {
  it("creator → ok; non-uuid / missing → 404 without touching the store", async () => {
    const store = memoryWebhookStore({ endpoints: [ep()] });
    expect((await loadEndpointForCaller(store, { id: "creator" }, ID)).endpoint?.id).toBe(ID);
    const r = await loadEndpointForCaller(store, { id: "creator" }, "not-a-uuid");
    expect(r.denied?.status).toBe(404);
    expect((await loadEndpointForCaller(store, { id: "creator" }, "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee")).denied?.status).toBe(404);
    expect(accessMock).not.toHaveBeenCalled();
  });
  it("user-level endpoint of someone else → 404 (no project check)", async () => {
    const store = memoryWebhookStore({ endpoints: [ep()] });
    accessMock.mockReset();
    const r = await loadEndpointForCaller(store, { id: "stranger" }, ID);
    expect(r.denied?.status).toBe(404);
    expect(accessMock).not.toHaveBeenCalled();
  });
  it("project-level endpoint: admin member → ok, editor → 403, non-member → 404", async () => {
    const store = memoryWebhookStore({ endpoints: [ep({ project_id: "p-1" })] });
    accessMock.mockReset().mockResolvedValue({ role: "admin" });
    const ok = await loadEndpointForCaller(store, { id: "admin-member" }, ID);
    expect(ok.endpoint?.id).toBe(ID);
    expect(accessMock).toHaveBeenCalledWith("admin-member", "p-1", "admin");
    accessMock.mockRejectedValue(accessError("forbidden"));
    expect((await loadEndpointForCaller(store, { id: "editor" }, ID)).denied?.status).toBe(403);
    accessMock.mockRejectedValue(accessError("not_found"));
    expect((await loadEndpointForCaller(store, { id: "outsider" }, ID)).denied?.status).toBe(404);
    accessMock.mockRejectedValue(new Error("db down"));
    await expect(loadEndpointForCaller(store, { id: "x" }, ID)).rejects.toThrow("db down");
  });
});
