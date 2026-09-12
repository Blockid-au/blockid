// S20-B review P1 — member-revoke cascade: the revoked user's ACTIVE
// project-level endpoints on that project are deactivated with
// `creator_not_member`, the owner is notified once per endpoint, other
// endpoints (other users, other projects, user-level, already inactive)
// are untouched, and nothing ever throws.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { deactivateEndpointsForRevokedMember } from "./membership";
import { memoryWebhookStore, type EndpointRow } from "./store";

function ep(over: Partial<EndpointRow>): EndpointRow {
  return {
    id: "ep",
    user_id: "u-agency",
    project_id: "p-1",
    url: "https://agency.example.com/hook",
    description: null,
    secret_hash: "h",
    secret_enc: "obf:eA==",
    events: ["svi.rescored"],
    active: true,
    failure_count: 4,
    disabled_reason: null,
    last_success_at: null,
    last_failure_at: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    ...over,
  };
}

describe("deactivateEndpointsForRevokedMember", () => {
  it("switches off the revoked creator's active endpoints on that project and tells the owner", async () => {
    const store = memoryWebhookStore({
      endpoints: [
        ep({ id: "mine-active" }),
        ep({ id: "mine-paused", active: false, disabled_reason: "paused_by_user" }),
        ep({ id: "mine-other-project", project_id: "p-2" }),
        ep({ id: "mine-user-level", project_id: null }),
        ep({ id: "owners", user_id: "u-owner" }),
      ],
      owners: new Map([["p-1", "u-owner"]]),
    });
    const notify = vi.fn(async () => undefined);
    const r = await deactivateEndpointsForRevokedMember("p-1", "u-agency", { store, notify });
    expect(r).toEqual({ deactivated: ["mine-active"] });
    const byId = Object.fromEntries(store.endpoints.map((e) => [e.id, e]));
    expect(byId["mine-active"]).toMatchObject({ active: false, disabled_reason: "creator_not_member", failure_count: 4 });
    expect(byId["mine-paused"]).toMatchObject({ active: false, disabled_reason: "paused_by_user" });
    expect(byId["mine-other-project"].active).toBe(true);
    expect(byId["mine-user-level"].active).toBe(true);
    expect(byId["owners"].active).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ userId: "u-owner", projectId: "p-1", endpointId: "mine-active", url: "https://agency.example.com/hook", reason: "creator_not_member" });
  });

  it("uses an explicit ownerId, skips the notification when the owner is the revoked user, and is a no-op with nothing to do", async () => {
    const store = memoryWebhookStore({ endpoints: [ep({ id: "a" }), ep({ id: "b" })] });
    const notify = vi.fn(async () => undefined);
    expect((await deactivateEndpointsForRevokedMember("p-1", "u-agency", { store, notify, ownerId: "u-explicit" })).deactivated).toEqual(["a", "b"]);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls.every((c) => (c as unknown[])[0] && ((c as unknown[])[0] as { userId: string }).userId === "u-explicit")).toBe(true);

    const own = memoryWebhookStore({ endpoints: [ep({ id: "c", user_id: "u-owner" })], owners: new Map([["p-1", "u-owner"]]) });
    notify.mockClear();
    expect((await deactivateEndpointsForRevokedMember("p-1", "u-owner", { store: own, notify })).deactivated).toEqual(["c"]);
    expect(notify).not.toHaveBeenCalled();

    expect(await deactivateEndpointsForRevokedMember("p-1", "nobody", { store, notify })).toEqual({ deactivated: [] });
    expect(await deactivateEndpointsForRevokedMember("", "u-agency", { store, notify })).toEqual({ deactivated: [] });
  });

  it("never throws: store errors and a missing store are reported, not raised", async () => {
    const store = memoryWebhookStore({ endpoints: [ep({ id: "a" })] });
    store.updateEndpoint = async () => {
      throw new Error("db down");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const r = await deactivateEndpointsForRevokedMember("p-1", "u-agency", { store, notify: async () => undefined });
      expect(r.error).toBe("db down");
      expect(r.deactivated).toEqual([]);
      expect(await deactivateEndpointsForRevokedMember("p-1", "u-agency", { store: null })).toEqual({ deactivated: [], error: "supabase_unavailable" });
    } finally {
      spy.mockRestore();
    }
  });
});
