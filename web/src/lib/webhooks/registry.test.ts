// S20-B — event registry, plan gate and enqueue (recipient resolution).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const entitlementsMock = vi.fn<(plan: string | null | undefined, userId?: string | null) => Promise<string[]>>(async () => []);
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (p: string | null | undefined, u?: string | null) => entitlementsMock(p, u) }));

import {
  buildEnvelope,
  canUseWebhooks,
  enqueueWebhook,
  isWebhookEvent,
  usersAllowedWebhooks,
  WEBHOOK_API_VERSION,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENTS,
  webhookAccessForPlan,
} from "./registry";
import { memoryWebhookStore, type EndpointRow } from "./store";

function ep(over: Partial<EndpointRow>): EndpointRow {
  return {
    id: "ep",
    user_id: "owner",
    project_id: null,
    url: "https://h.example.com/x",
    description: null,
    secret_hash: "h",
    secret_enc: "obf:d2hzZWM=",
    events: ["svi.rescored", "evidence.uploaded", "funding.report_ready", "evaluation.report_ready"],
    active: true,
    failure_count: 0,
    disabled_reason: null,
    last_success_at: null,
    last_failure_at: null,
    created_at: "2026-09-12T00:00:00.000Z",
    updated_at: "2026-09-12T00:00:00.000Z",
    ...over,
  };
}

describe("event catalogue", () => {
  it("lists the four subscribable events with labels; ping is not subscribable", () => {
    expect([...WEBHOOK_EVENTS]).toEqual(["svi.rescored", "evidence.uploaded", "funding.report_ready", "evaluation.report_ready"]);
    for (const e of WEBHOOK_EVENTS) expect(WEBHOOK_EVENT_LABELS[e].label).toBeTruthy();
    expect(isWebhookEvent("ping")).toBe(false);
    expect(isWebhookEvent("svi.rescored")).toBe(true);
  });
  it("buildEnvelope: id, event, created_at, api_version, data", () => {
    const now = new Date("2026-09-12T02:00:00.000Z");
    const env = buildEnvelope("ping", { endpoint_id: "ep", sent_at: now.toISOString() }, { id: "evt", now });
    expect(env).toEqual({ id: "evt", event: "ping", created_at: now.toISOString(), api_version: WEBHOOK_API_VERSION, data: { endpoint_id: "ep", sent_at: now.toISOString() } });
    expect(buildEnvelope("ping", { endpoint_id: "ep", sent_at: "" }).id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("plan gate", () => {
  it("webhookAccessForPlan: Growth+ founders, every evaluator tier, api.access, admin; Starter/Free none", () => {
    expect(webhookAccessForPlan("founder_growth")).toBe("founder_growth");
    expect(webhookAccessForPlan("growth")).toBe("founder_growth"); // legacy id grandfathered
    expect(webhookAccessForPlan("founder_scale")).toBe("founder_growth");
    expect(webhookAccessForPlan("founder_enterprise")).toBe("founder_growth");
    expect(webhookAccessForPlan("investor_angel")).toBe("evaluator");
    expect(webhookAccessForPlan("investor_advisor")).toBe("evaluator");
    expect(webhookAccessForPlan("investor_vc_small")).toBe("evaluator");
    expect(webhookAccessForPlan("investor_vc_ent")).toBe("evaluator");
    expect(webhookAccessForPlan("accelerator_enterprise", { features: ["api.access"] })).toBe("api_access");
    expect(webhookAccessForPlan("founder_free", { role: "admin" })).toBe("admin");
    expect(webhookAccessForPlan("founder_starter")).toBe("none");
    expect(webhookAccessForPlan("founder_free")).toBe("none");
    expect(webhookAccessForPlan(null)).toBe("none");
    expect(webhookAccessForPlan("accelerator_starter")).toBe("none");
  });

  it("canUseWebhooks: plan → no DB; Starter + active Startup Package → allowed; Free → denied", async () => {
    const store = memoryWebhookStore({ packageUsers: new Set(["u-pkg"]) });
    expect(await canUseWebhooks({ id: "u1", plan: "founder_growth" }, { store })).toEqual({ allowed: true, reason: "founder_growth" });
    expect(await canUseWebhooks({ id: "u-pkg", plan: "founder_starter" }, { store })).toEqual({ allowed: true, reason: "startup_package" });
    expect(await canUseWebhooks({ id: "u-free", plan: "founder_free" }, { store })).toEqual({ allowed: false, reason: "none" });
    expect(await canUseWebhooks(null, { store })).toEqual({ allowed: false, reason: "none" });
    // A manual api.access grant (entitlements table) counts.
    expect(await canUseWebhooks({ id: "u-grant", plan: "founder_starter" }, { store, features: async () => ["api.access"] })).toEqual({ allowed: true, reason: "api_access" });
    // No store at all → package check impossible → denied, never throws.
    expect(await canUseWebhooks({ id: "u-pkg", plan: "founder_starter" }, { store: null, features: async () => [] })).toEqual({ allowed: false, reason: "none" });
  });

  it("usersAllowedWebhooks batches plan + package checks", async () => {
    entitlementsMock.mockResolvedValue([]);
    const store = memoryWebhookStore({
      plans: [
        { id: "a", plan: "founder_growth", role: "user" },
        { id: "b", plan: "founder_starter", role: "user" },
        { id: "c", plan: "founder_free", role: "user" },
        { id: "d", plan: "investor_angel", role: "user" },
      ],
      packageUsers: new Set(["b"]),
    });
    const allowed = await usersAllowedWebhooks(store, ["a", "b", "c", "d", "missing"]);
    expect([...allowed].sort()).toEqual(["a", "b", "d"]);
    expect((await usersAllowedWebhooks(store, [])).size).toBe(0);
  });
});

describe("enqueueWebhook", () => {
  it("queues one delivery per subscribed endpoint: project-level + the owner's user-level (default recipient)", async () => {
    const store = memoryWebhookStore({
      endpoints: [
        ep({ id: "proj", project_id: "p-1", user_id: "admin-member" }),
        ep({ id: "owner-user", project_id: null, user_id: "owner" }),
        ep({ id: "other-user", project_id: null, user_id: "someone-else" }),
        ep({ id: "other-proj", project_id: "p-2", user_id: "owner" }),
        ep({ id: "inactive", project_id: "p-1", user_id: "owner", active: false }),
        ep({ id: "not-subscribed", project_id: "p-1", user_id: "owner", events: ["evidence.uploaded"] }),
      ],
      owners: new Map([["p-1", "owner"]]),
    });
    const now = new Date("2026-09-12T03:00:00.000Z");
    const r = await enqueueWebhook(
      "svi.rescored",
      "p-1",
      { project_id: "p-1", account_id: "a", svi_total: 120, previous_svi: 100, delta: 20, stage: 2, source: "rescore", snapshot_date: "2026-09-12" },
      { store, now },
    );
    expect(r.queued).toBe(2);
    expect(r.endpoints.sort()).toEqual(["owner-user", "proj"]);
    expect(store.deliveries).toHaveLength(2);
    for (const d of store.deliveries) {
      expect(d.status).toBe("queued");
      expect(d.attempts).toBe(0);
      expect(d.event).toBe("svi.rescored");
      expect(d.next_attempt_at).toBe(now.toISOString());
      expect(d.payload).toMatchObject({ id: r.envelopeId, event: "svi.rescored", api_version: WEBHOOK_API_VERSION, data: { svi_total: 120, delta: 20 } });
      expect(d.id).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(new Set(store.deliveries.map((d) => d.id)).size).toBe(2);
  });

  it("explicit userIds replace the owner default; projectEndpoints:false keeps the founder's project endpoints out", async () => {
    const store = memoryWebhookStore({
      endpoints: [ep({ id: "founder-proj", project_id: "p-1", user_id: "owner" }), ep({ id: "owner-user", user_id: "owner" }), ep({ id: "evaluator-user", user_id: "evaluator" })],
      owners: new Map([["p-1", "owner"]]),
    });
    const r = await enqueueWebhook(
      "evaluation.report_ready",
      "p-1",
      { evaluation_id: "e", project_id: "p-1", report_id: "r", kind: "full", svi_total: 110, via: "credits" },
      { store, userIds: ["evaluator"], projectEndpoints: false },
    );
    expect(r.endpoints).toEqual(["evaluator-user"]);
  });

  it("no subscribers → 0 rows; unknown event / no store / throwing store → 0 and never throws", async () => {
    const store = memoryWebhookStore({ owners: new Map([["p-1", "owner"]]) });
    const payload = { project_id: "p-1", evidence_id: "ev", category: "financial", label: "x.pdf", content_type: "application/pdf", size_bytes: 1, sha256: "abc" };
    expect((await enqueueWebhook("evidence.uploaded", "p-1", payload, { store })).queued).toBe(0);
    expect(store.deliveries).toHaveLength(0);
    expect((await enqueueWebhook("nope" as never, "p-1", payload as never, { store })).queued).toBe(0);
    expect((await enqueueWebhook("evidence.uploaded", "p-1", payload, { store: null })).queued).toBe(0);
    const broken = { ...store, listActiveEndpointsFor: async () => { throw new Error("boom"); } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await enqueueWebhook("evidence.uploaded", "p-1", payload, { store: broken })).queued).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
