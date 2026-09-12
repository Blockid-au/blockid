// S20-B — the Supabase store issues the filters the 0336 indexes expect
// (active + events @> for enqueue; status in + next_attempt_at ≤ now +
// lease-free for the dispatcher; conditional UPDATE for claim).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const packageMock = vi.fn(async (_db: unknown, opts: { userIds?: readonly string[] }) => new Set(opts.userIds ?? []));
vi.mock("@/lib/funding/growth-extras", () => ({ listActiveStartupPackageUserIds: (db: unknown, o: { userIds?: readonly string[] }) => packageMock(db, o) }));

import { fakeSupabase } from "@/test/fake-supabase";
import { supabaseWebhookStore } from "./store";

const T = new Date("2026-09-12T04:00:00.000Z");

describe("supabaseWebhookStore", () => {
  it("returns null without a client (default getSupabaseAdmin → null)", () => {
    expect(supabaseWebhookStore()).toBeNull();
  });

  it("listActiveEndpointsFor: project query + user-level query, deduped by id", async () => {
    const sb = fakeSupabase({ webhook_endpoints: [{ id: "e1" }, { id: "e1" }] });
    const store = supabaseWebhookStore(sb)!;
    const rows = await store.listActiveEndpointsFor("svi.rescored", "p-1", ["u-1", "u-1", "u-2"]);
    expect(rows.map((r) => r.id)).toEqual(["e1"]);
    expect(sb.hasEq("webhook_endpoints", "active", true)).toBe(true);
    expect(sb.hasEq("webhook_endpoints", "project_id", "p-1")).toBe(true);
    expect(sb.find("webhook_endpoints", "contains").every((c) => c.args[0] === "events" && (c.args[1] as string[])[0] === "svi.rescored")).toBe(true);
    expect(sb.find("webhook_endpoints", "is")[0].args).toEqual(["project_id", null]);
    expect(sb.find("webhook_endpoints", "in")[0].args).toEqual(["user_id", ["u-1", "u-2"]]);
    // No project and no users → no query at all.
    const sb2 = fakeSupabase();
    expect(await supabaseWebhookStore(sb2)!.listActiveEndpointsFor("svi.rescored", null, [])).toEqual([]);
    expect(sb2.calls).toHaveLength(0);
  });

  it("listDue / claim use the dispatcher predicates", async () => {
    const sb = fakeSupabase({ webhook_deliveries: [{ id: "d1" }] });
    const store = supabaseWebhookStore(sb)!;
    await store.listDue(T, 50);
    expect(sb.find("webhook_deliveries", "in")[0].args).toEqual(["status", ["queued", "failed"]]);
    expect(sb.find("webhook_deliveries", "lte")[0].args).toEqual(["next_attempt_at", T.toISOString()]);
    expect(sb.find("webhook_deliveries", "or")[0].args[0]).toBe(`locked_until.is.null,locked_until.lt.${T.toISOString()}`);
    expect(sb.find("webhook_deliveries", "limit")[0].args).toEqual([50]);

    expect(await store.claim("d1", T, 120_000)).toBe(true);
    const upd = sb.find("webhook_deliveries", "update")[0];
    expect(upd.args[0]).toEqual({ locked_until: new Date(T.getTime() + 120_000).toISOString() });
    expect(sb.hasEq("webhook_deliveries", "id", "d1")).toBe(true);
  });

  it("insertDeliveries writes the rows; endpoint CRUD scopes by id / user / project", async () => {
    const sb = fakeSupabase({ webhook_endpoints: [{ id: "e1", user_id: "u" }] });
    const store = supabaseWebhookStore(sb)!;
    expect(await store.insertDeliveries([])).toBe(0);
    expect(await store.insertDeliveries([{ id: "d", endpoint_id: "e1", event: "ping", payload: {} }])).toBe(1);
    expect(sb.find("webhook_deliveries", "insert")).toHaveLength(1);

    expect((await store.getEndpoint("e1"))?.id).toBe("e1");
    await store.listEndpoints({ userId: "u" });
    expect(sb.hasEq("webhook_endpoints", "user_id", "u")).toBe(true);
    await store.listEndpoints({ projectId: "p" });
    expect(sb.hasEq("webhook_endpoints", "project_id", "p")).toBe(true);
    expect(await store.listEndpoints({})).toEqual([]);
    await store.updateEndpoint("e1", { active: false });
    expect(sb.find("webhook_endpoints", "update")[0].args[0]).toEqual({ active: false });
    await store.deleteEndpoint("e1");
    expect(sb.find("webhook_endpoints", "delete")).toHaveLength(1);
    await store.listDeliveries("e1", 50);
    expect(sb.hasEq("webhook_deliveries", "endpoint_id", "e1")).toBe(true);
  });

  it("userPlans / activePackageUserIds / projectOwnerIds", async () => {
    const sb = fakeSupabase({ app_users: [{ id: "u", plan: "founder_growth", role: "user" }], projects: [{ id: "p", user_id: "o" }] });
    const store = supabaseWebhookStore(sb)!;
    expect(await store.userPlans(["u"])).toEqual([{ id: "u", plan: "founder_growth", role: "user" }]);
    expect(await store.userPlans([])).toEqual([]);
    expect(await store.activePackageUserIds(["u"])).toEqual(new Set(["u"]));
    expect((await store.activePackageUserIds([])).size).toBe(0);
    expect(await store.projectOwnerIds(["p"])).toEqual(new Map([["p", "o"]]));
  });

  it("projectAdminMemberships: one accepted+admin read over project_members, keyed project:user (P1)", async () => {
    const sb = fakeSupabase({ project_members: [{ project_id: "p", user_id: "u" }, { project_id: "p", user_id: null }] });
    const store = supabaseWebhookStore(sb)!;
    expect(await store.projectAdminMemberships(["p", "p"], ["u", "v"])).toEqual(new Set(["p:u"]));
    expect(sb.find("project_members", "in").map((c) => c.args)).toEqual([["project_id", ["p"]], ["user_id", ["u", "v"]]]);
    expect(sb.hasEq("project_members", "status", "accepted")).toBe(true);
    expect(sb.hasEq("project_members", "role", "admin")).toBe(true);
    expect((await store.projectAdminMemberships([], ["u"])).size).toBe(0);
    expect(sb.find("project_members", "in")).toHaveLength(2);
  });

  it("recordFailure / recordSuccess call the 0340 RPCs; a missing function (42883 / PGRST202) → null / false so the caller falls back (P2)", async () => {
    const sb = fakeSupabase();
    const store = supabaseWebhookStore(sb)!;
    sb.rpc = async (fn: string, args?: Record<string, unknown>) => {
      sb.calls.push({ table: "rpc", op: fn, args: [args] });
      return { data: [{ failure_count: 7, active: true, disabled: false }], error: null };
    };
    expect(await store.recordFailure("e1")).toEqual({ failure_count: 7, active: true, disabled: false });
    expect(sb.find("rpc", "webhook_endpoint_record_failure")[0].args).toEqual([{ p_id: "e1" }]);
    expect(await store.recordSuccess("e1")).toBe(true);
    expect(sb.find("rpc", "webhook_endpoint_record_success")[0].args).toEqual([{ p_id: "e1" }]);

    sb.rpc = async () => ({ data: null, error: { code: "42883", message: "function public.webhook_endpoint_record_failure(uuid) does not exist" } as never });
    expect(await store.recordFailure("e1")).toBeNull();
    expect(await store.recordSuccess("e1")).toBe(false);
    sb.rpc = async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.webhook_endpoint_record_success(p_id) in the schema cache" } as never });
    expect(await store.recordFailure("e1")).toBeNull();
    expect(await store.recordSuccess("e1")).toBe(false);
    // Any other error is raised (a real failure must not be silently swallowed).
    sb.rpc = async () => ({ data: null, error: { code: "57014", message: "canceling statement" } as never });
    await expect(store.recordFailure("e1")).rejects.toThrow("canceling statement");
    await expect(store.recordSuccess("e1")).rejects.toThrow("canceling statement");
  });
});
