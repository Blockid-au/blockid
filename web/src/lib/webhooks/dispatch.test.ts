// S20-B — dispatcher: lease, signature headers, retry ladder, dead after
// the schedule, auto-disable at 20 consecutive failures (+ notification),
// SSRF refusal, timeout, plan lapse, dry run, ping. S20-B review: creator
// lost project membership (P1), atomic failure counting via the 0340 RPC
// with the pre-migration fallback (P2), 25/tick default, secret_unreadable
// fail-closed (P2).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// The plan re-check falls through to entitlements only for "none" plans —
// keep it deterministic and DB-free here.
vi.mock("@/lib/entitlements", () => ({ getEntitlements: async () => [] }));

import {
  DEFAULT_BATCH,
  DELIVERY_TIMEOUT_MS,
  dispatchDue,
  isHttpsUrl,
  LEASE_MS,
  lostCreatorEndpoints,
  MAX_ATTEMPTS,
  MAX_BATCH,
  MAX_CONSECUTIVE_FAILURES,
  recordOutcome,
  RETRY_DELAYS_MS,
  retryDelayMs,
  sendOnce,
  sendPing,
  validateEndpointUrl,
} from "./dispatch";
import { verifySignature, sealSecret, hashSecret } from "./sign";
import { memoryWebhookStore, type DeliveryRow, type EndpointRow } from "./store";

const SECRET = "whsec_unit";
const ENV = {} as NodeJS.ProcessEnv;

function endpoint(over: Partial<EndpointRow> = {}): EndpointRow {
  return {
    id: "ep-1",
    user_id: "u-growth",
    project_id: "p-1",
    url: "https://hooks.example.com/blockid",
    description: null,
    secret_hash: hashSecret(SECRET),
    secret_enc: sealSecret(SECRET, ENV),
    events: ["svi.rescored"],
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

function delivery(over: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    id: "d-1",
    endpoint_id: "ep-1",
    event: "svi.rescored",
    payload: { id: "evt-1", event: "svi.rescored", created_at: "2026-09-12T00:00:00.000Z", api_version: "2026-09-12", data: { svi_total: 120 } },
    status: "queued",
    attempts: 0,
    next_attempt_at: "2026-09-12T00:00:00.000Z",
    locked_until: null,
    response_status: null,
    last_error: null,
    created_at: "2026-09-12T00:00:00.000Z",
    delivered_at: null,
    ...over,
  };
}

const okCheck = async () => ({ ok: true as const });
const T0 = new Date("2026-09-12T01:00:00.000Z");

function fetchReturning(status: number, capture?: { url?: string; init?: RequestInit }) {
  return async (url: string, init: RequestInit) => {
    if (capture) {
      capture.url = url;
      capture.init = init;
    }
    return new Response(null, { status });
  };
}

describe("constants + helpers", () => {
  it("ladder 1 m / 10 m / 1 h / 6 h, dead after 5 attempts, 8 s timeout, 20 failures", () => {
    expect(RETRY_DELAYS_MS).toEqual([60_000, 600_000, 3_600_000, 21_600_000]);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(4)).toBe(21_600_000);
    expect(retryDelayMs(5)).toBeNull();
    expect(DELIVERY_TIMEOUT_MS).toBe(8_000);
    expect(MAX_CONSECUTIVE_FAILURES).toBe(20);
    expect(LEASE_MS).toBeGreaterThan(DELIVERY_TIMEOUT_MS);
    // P2: 25 × 8 s worst case (200 s) fits inside the 5 min cron period.
    expect(DEFAULT_BATCH).toBe(25);
    expect(MAX_BATCH).toBe(50);
    expect(DEFAULT_BATCH * DELIVERY_TIMEOUT_MS).toBeLessThan(5 * 60_000);
  });
  it("isHttpsUrl: https only, no credentials", () => {
    expect(isHttpsUrl("https://a.example.com/x")).toBe(true);
    expect(isHttpsUrl("http://a.example.com/x")).toBe(false);
    expect(isHttpsUrl("https://user:pw@a.example.com/x")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });
  it("validateEndpointUrl refuses http, private hosts and IP literals (no DNS needed)", async () => {
    expect(await validateEndpointUrl("http://hooks.example.com/x", { skipDns: true })).toEqual({ ok: false, reason: "https_required" });
    expect(await validateEndpointUrl("https://localhost/x", { skipDns: true })).toEqual({ ok: false, reason: "hostname_forbidden" });
    expect(await validateEndpointUrl("https://169.254.169.254/latest", { skipDns: true })).toEqual({ ok: false, reason: "hostname_forbidden" });
    expect(await validateEndpointUrl("https://10.0.0.5/x", { skipDns: true })).toEqual({ ok: false, reason: "hostname_forbidden" });
    expect(await validateEndpointUrl("https://hooks.example.com/x", { resolve: async () => ["10.1.1.1"] })).toEqual({ ok: false, reason: "private_ip" });
    expect(await validateEndpointUrl("https://hooks.example.com/x", { resolve: async () => ["93.184.216.34"] })).toEqual({ ok: true });
    expect(await validateEndpointUrl("x".repeat(3000))).toEqual({ ok: false, reason: "invalid_url" });
  });
});

describe("sendOnce", () => {
  it("POSTs the envelope with X-BlockID-* headers, a verifiable signature, redirect:manual", async () => {
    const cap: { url?: string; init?: RequestInit } = {};
    const out = await sendOnce(endpoint(), delivery(), { fetch: fetchReturning(204, cap), checkUrl: okCheck, env: ENV });
    expect(out).toMatchObject({ ok: true, status: 204 });
    expect(cap.url).toBe("https://hooks.example.com/blockid");
    expect(cap.init?.method).toBe("POST");
    expect(cap.init?.redirect).toBe("manual");
    const h = cap.init?.headers as Record<string, string>;
    expect(h["X-BlockID-Event"]).toBe("svi.rescored");
    expect(h["X-BlockID-Delivery"]).toBe("d-1");
    expect(h["Content-Type"]).toBe("application/json");
    const body = cap.init?.body as string;
    expect(JSON.parse(body).data.svi_total).toBe(120);
    expect(verifySignature(SECRET, h["X-BlockID-Signature"], body).ok).toBe(true);
    expect(verifySignature("whsec_wrong", h["X-BlockID-Signature"], body).ok).toBe(false);
  });

  it("refuses an SSRF-rejected URL before any fetch", async () => {
    const fetchMock = vi.fn();
    const out = await sendOnce(endpoint({ url: "https://10.0.0.1/x" }), delivery(), {
      fetch: fetchMock as never,
      checkUrl: async () => ({ ok: false, reason: "private_ip" }),
      env: ENV,
    });
    expect(out).toMatchObject({ ok: false, error: "ssrf_refused:private_ip", status: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 3xx as a failure (redirects never followed) and 5xx as http_<status>", async () => {
    expect(await sendOnce(endpoint(), delivery(), { fetch: fetchReturning(302), checkUrl: okCheck, env: ENV })).toMatchObject({ ok: false, error: "redirect_not_followed", status: 302 });
    expect(await sendOnce(endpoint(), delivery(), { fetch: fetchReturning(503), checkUrl: okCheck, env: ENV })).toMatchObject({ ok: false, error: "http_503", status: 503 });
  });

  it("times out at DELIVERY_TIMEOUT_MS via the abort signal", async () => {
    vi.useFakeTimers();
    try {
      const slow = (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      const p = sendOnce(endpoint(), delivery(), { fetch: slow, checkUrl: okCheck, env: ENV });
      await vi.advanceTimersByTimeAsync(DELIVERY_TIMEOUT_MS + 5);
      expect(await p).toMatchObject({ ok: false, error: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed when the sealed secret cannot be opened", async () => {
    const fetchMock = vi.fn();
    const out = await sendOnce(endpoint({ secret_enc: "gcm:bad" }), delivery(), { fetch: fetchMock as never, checkUrl: okCheck, env: { WEBHOOK_SECRET_KEY: "k" } as NodeJS.ProcessEnv });
    expect(out).toMatchObject({ ok: false, error: "secret_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("dispatchDue", () => {
  let notify: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    notify = vi.fn(async () => undefined);
  });

  function seeded(deliveries: DeliveryRow[], endpoints: EndpointRow[] = [endpoint()], extra: { owners?: Map<string, string>; adminMemberships?: Set<string>; rpcAvailable?: boolean } = {}) {
    return memoryWebhookStore({
      endpoints,
      deliveries,
      plans: [{ id: "u-growth", plan: "founder_growth", role: "user" }, { id: "u-free", plan: "founder_free", role: "user" }],
      // The default creator (u-growth) owns p-1, so the P1 gate is satisfied.
      owners: extra.owners ?? new Map([["p-1", "u-growth"]]),
      adminMemberships: extra.adminMemberships,
      rpcAvailable: extra.rpcAvailable,
    });
  }

  it("delivers a due row: status delivered, lease cleared, endpoint success stamped", async () => {
    const store = seeded([delivery()]);
    const s = await dispatchDue({}, { store, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(s).toMatchObject({ ok: true, claimed: 1, delivered: 1, failed: 0, dead: 0 });
    const d = store.deliveries[0];
    expect(d.status).toBe("delivered");
    expect(d.attempts).toBe(1);
    expect(d.locked_until).toBeNull();
    expect(d.response_status).toBe(200);
    expect(d.delivered_at).toBe(T0.toISOString());
    expect(store.endpoints[0].last_success_at).toBe(T0.toISOString());
    expect(store.endpoints[0].failure_count).toBe(0);
  });

  it("walks the retry ladder then marks the delivery dead", async () => {
    const store = seeded([delivery()]);
    let now = T0;
    const deps = { store, fetch: fetchReturning(500), checkUrl: okCheck, notify, now: () => now, env: ENV };
    for (let attempt = 1; attempt <= 4; attempt++) {
      const s = await dispatchDue({}, deps);
      expect(s.failed, `attempt ${attempt}`).toBe(1);
      const d = store.deliveries[0];
      expect(d.status).toBe("failed");
      expect(d.attempts).toBe(attempt);
      expect(d.last_error).toBe("http_500");
      expect(Date.parse(d.next_attempt_at) - now.getTime()).toBe(RETRY_DELAYS_MS[attempt - 1]);
      // Not due yet → nothing claimed until the clock reaches next_attempt_at.
      expect((await dispatchDue({}, deps)).claimed).toBe(0);
      now = new Date(Date.parse(d.next_attempt_at));
    }
    const last = await dispatchDue({}, deps);
    expect(last.dead).toBe(1);
    expect(store.deliveries[0].status).toBe("dead");
    expect(store.deliveries[0].attempts).toBe(MAX_ATTEMPTS);
    expect(store.endpoints[0].failure_count).toBe(5);
    expect(store.endpoints[0].active).toBe(true);
  });

  it("auto-disables the endpoint at 20 consecutive failures and notifies once; later rows die as endpoint_disabled", async () => {
    const rows = Array.from({ length: 21 }, (_, i) => delivery({ id: `d-${i}` }));
    const store = seeded(rows, [endpoint({ failure_count: 0 })]);
    const s = await dispatchDue({ limit: 50 }, { store, fetch: fetchReturning(500), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(s.disabled_endpoints).toEqual(["ep-1"]);
    expect(store.endpoints[0].active).toBe(false);
    expect(store.endpoints[0].disabled_reason).toContain("auto_disabled");
    expect(store.endpoints[0].failure_count).toBe(MAX_CONSECUTIVE_FAILURES);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ userId: "u-growth", projectId: "p-1", endpointId: "ep-1", url: "https://hooks.example.com/blockid", reason: "auto_disabled" });
    // 20 failed on the ladder, the 21st never sent: endpoint_disabled → dead.
    expect(s.failed).toBe(20);
    expect(s.dead).toBe(1);
    expect(store.deliveries[20]).toMatchObject({ status: "dead", last_error: "endpoint_disabled" });
  });

  it("a success resets the consecutive counter", async () => {
    const store = seeded([delivery()], [endpoint({ failure_count: 19 })]);
    await dispatchDue({}, { store, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(store.endpoints[0].failure_count).toBe(0);
    expect(store.endpoints[0].active).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it("SSRF-refused URL is booked as a failure on the ladder with the reason", async () => {
    const store = seeded([delivery()], [endpoint({ url: "https://internal.corp.local/x" })]);
    const fetchMock = vi.fn();
    const s = await dispatchDue({}, { store, fetch: fetchMock as never, checkUrl: async () => ({ ok: false, reason: "hostname_forbidden" }), notify, now: () => T0, env: ENV });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.failed).toBe(1);
    expect(store.deliveries[0].last_error).toBe("ssrf_refused:hostname_forbidden");
  });

  it("skips a row whose lease another tick holds", async () => {
    const store = seeded([delivery({ locked_until: new Date(T0.getTime() + 60_000).toISOString() })]);
    const s = await dispatchDue({}, { store, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(s.claimed).toBe(0);
    expect(store.deliveries[0].status).toBe("queued");
    // An expired lease is claimable again.
    store.deliveries[0].locked_until = new Date(T0.getTime() - 1).toISOString();
    const s2 = await dispatchDue({}, { store, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(s2.delivered).toBe(1);
  });

  it("parks deliveries of a lapsed-plan owner as dead:plan_lapsed without counting a failure", async () => {
    const store = seeded([delivery()], [endpoint({ user_id: "u-free" })], { owners: new Map([["p-1", "u-free"]]) });
    const fetchMock = vi.fn();
    const s = await dispatchDue({}, { store, fetch: fetchMock as never, checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.dead).toBe(1);
    expect(store.deliveries[0]).toMatchObject({ status: "dead", last_error: "plan_lapsed" });
    expect(store.endpoints[0].failure_count).toBe(0);
  });

  it("dry run lists due rows and writes nothing", async () => {
    const store = seeded([delivery(), delivery({ id: "d-2" })]);
    const fetchMock = vi.fn();
    const s = await dispatchDue({ dryRun: true }, { store, fetch: fetchMock as never, checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(s.dry).toBe(true);
    expect(s.results.map((r) => r.outcome)).toEqual(["dry", "dry"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.deliveries.every((d) => d.status === "queued" && d.locked_until === null)).toBe(true);
  });

  it("defaults to 25 per tick, caps `limit` at MAX_BATCH (50), and reports supabase_unavailable without a store", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => delivery({ id: `d-${i}` }));
    const store = seeded(rows);
    const deps = { store, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV };
    expect((await dispatchDue({}, deps)).delivered).toBe(25);
    expect((await dispatchDue({ limit: 500 }, deps)).delivered).toBe(35);
    expect((await dispatchDue({}, { store: null })).error).toBe("supabase_unavailable");
  });

  // ── S20-B review P1: creator no longer owner/admin ──────────────────────

  it("P1: a project-level endpoint whose creator is no longer owner/admin dies as creator_not_member, is deactivated, owner notified, no failure counted", async () => {
    // Creator u-agency made the endpoint while an admin; the owner (u-owner) later revoked them.
    const store = seeded([delivery(), delivery({ id: "d-2" })], [endpoint({ user_id: "u-growth", failure_count: 3 })], { owners: new Map([["p-1", "u-owner"]]) });
    const fetchMock = vi.fn();
    const s = await dispatchDue({}, { store, fetch: fetchMock as never, checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.dead).toBe(2);
    expect(s.results.map((r) => r.error)).toEqual(["creator_not_member", "creator_not_member"]);
    expect(store.deliveries.map((d) => d.status)).toEqual(["dead", "dead"]);
    expect(store.deliveries[0].last_error).toBe("creator_not_member");
    expect(store.endpoints[0]).toMatchObject({ active: false, disabled_reason: "creator_not_member", failure_count: 3 });
    expect(s.disabled_endpoints).toEqual(["ep-1"]);
    // ONE notification, to the project OWNER (not the revoked creator).
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ userId: "u-owner", projectId: "p-1", endpointId: "ep-1", url: "https://hooks.example.com/blockid", reason: "creator_not_member" });
  });

  it("P1: an accepted admin member still receives; owner always does; user-level endpoints are not membership-gated", async () => {
    const admin = seeded([delivery()], [endpoint({ user_id: "u-growth" })], { owners: new Map([["p-1", "u-owner"]]), adminMemberships: new Set(["p-1:u-growth"]) });
    expect((await dispatchDue({}, { store: admin, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV })).delivered).toBe(1);
    const userLevel = seeded([delivery()], [endpoint({ project_id: null })], { owners: new Map() });
    expect((await dispatchDue({}, { store: userLevel, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV })).delivered).toBe(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it("lostCreatorEndpoints: one owners read + one memberships read for the batch; editor/viewer/revoked creators are lost", async () => {
    const store = seeded([], [
      endpoint({ id: "ep-owner", user_id: "u-owner" }),
      endpoint({ id: "ep-admin", user_id: "u-admin" }),
      endpoint({ id: "ep-editor", user_id: "u-editor" }),
      endpoint({ id: "ep-user", user_id: "u-anyone", project_id: null }),
    ], { owners: new Map([["p-1", "u-owner"]]), adminMemberships: new Set(["p-1:u-admin"]) });
    const owners = vi.spyOn(store, "projectOwnerIds");
    const admins = vi.spyOn(store, "projectAdminMemberships");
    const lost = await lostCreatorEndpoints(store, store.endpoints);
    expect([...lost.entries()]).toEqual([["ep-editor", "u-owner"]]);
    expect(owners).toHaveBeenCalledTimes(1);
    expect(admins).toHaveBeenCalledTimes(1);
    expect(admins).toHaveBeenCalledWith(["p-1", "p-1", "p-1"], ["u-owner", "u-admin", "u-editor"]);
    // Nothing project-level → no reads at all.
    expect((await lostCreatorEndpoints(store, [store.endpoints[3]])).size).toBe(0);
    expect(owners).toHaveBeenCalledTimes(1);
  });

  // ── S20-B review P2: atomic failure counting ─────────────────────────────

  it("P2: failure bookkeeping goes through the atomic RPC (recordFailure/recordSuccess), never a computed failure_count write", async () => {
    const store = seeded([delivery(), delivery({ id: "d-2" })], [endpoint({ failure_count: 18 })]);
    const update = vi.spyOn(store, "updateEndpoint");
    const fail = vi.spyOn(store, "recordFailure");
    const succeed = vi.spyOn(store, "recordSuccess");
    let status = 500;
    const s = await dispatchDue({}, { store, fetch: async () => new Response(null, { status }), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(s.failed).toBe(2);
    expect(fail).toHaveBeenCalledTimes(2);
    // 18 → 19 → 20: the second call flips the endpoint inside the RPC and reports it.
    expect(await fail.mock.results[0].value).toMatchObject({ failure_count: 19, active: true, disabled: false });
    expect(await fail.mock.results[1].value).toMatchObject({ failure_count: 20, active: false, disabled: true });
    expect(update).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.endpoints[0]).toMatchObject({ active: false, failure_count: 20, disabled_reason: "auto_disabled:20_consecutive_failures" });

    // Re-enabled by the user, then a success resets through the RPC too.
    store.endpoints[0].active = true;
    status = 200;
    await store.insertDeliveries([{ id: "d-3", endpoint_id: "ep-1", event: "svi.rescored", payload: {}, next_attempt_at: T0.toISOString() }]);
    await dispatchDue({}, { store, fetch: async () => new Response(null, { status }), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(succeed).toHaveBeenCalledWith("ep-1");
    expect(store.endpoints[0].failure_count).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("P2: while the 0340 RPCs are missing (null / false) the read-modify-write fallback keeps the same semantics", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => delivery({ id: `d-${i}` }));
    const store = seeded(rows, [endpoint({ failure_count: 0 })], { rpcAvailable: false });
    const update = vi.spyOn(store, "updateEndpoint");
    const s = await dispatchDue({ limit: 50 }, { store, fetch: fetchReturning(500), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(s.failed).toBe(20);
    expect(update).toHaveBeenCalledTimes(20);
    expect(update).toHaveBeenLastCalledWith("ep-1", { failure_count: 20, last_failure_at: T0.toISOString(), active: false, disabled_reason: "auto_disabled:20_consecutive_failures" });
    expect(store.endpoints[0]).toMatchObject({ active: false, failure_count: 20 });
    expect(notify).toHaveBeenCalledTimes(1);
    store.endpoints[0].active = true;
    await store.insertDeliveries([{ id: "d-ok", endpoint_id: "ep-1", event: "svi.rescored", payload: {}, next_attempt_at: T0.toISOString() }]);
    await dispatchDue({}, { store, fetch: fetchReturning(200), checkUrl: okCheck, notify, now: () => T0, env: ENV });
    expect(update).toHaveBeenLastCalledWith("ep-1", { failure_count: 0, last_success_at: T0.toISOString() });
  });
});

describe("recordOutcome / sendPing", () => {
  it("ping is single-shot and never touches the failure counter", async () => {
    const store = memoryWebhookStore({ endpoints: [endpoint({ failure_count: 19 })] });
    const r = await sendPing(store, store.endpoints[0], { fetch: fetchReturning(500), checkUrl: okCheck, env: ENV, now: () => T0 });
    expect(r.outcome.ok).toBe(false);
    const d = store.deliveries.find((x) => x.id === r.delivery_id)!;
    expect(d.event).toBe("ping");
    expect(d.status).toBe("dead");
    expect(d.attempts).toBe(1);
    expect(store.endpoints[0].failure_count).toBe(19);
    expect(store.endpoints[0].active).toBe(true);
    expect(store.endpoints[0].last_failure_at).toBe(T0.toISOString());

    const ok = await sendPing(store, store.endpoints[0], { fetch: fetchReturning(200), checkUrl: okCheck, env: ENV, now: () => T0 });
    expect(ok.outcome.ok).toBe(true);
    expect(store.deliveries.find((x) => x.id === ok.delivery_id)!.status).toBe("delivered");
    expect(store.endpoints[0].failure_count).toBe(19);
  });

  it("recordOutcome singleShot failure → dead immediately", async () => {
    const store = memoryWebhookStore({ endpoints: [endpoint()], deliveries: [delivery()] });
    const r = await recordOutcome(store, store.endpoints[0], { id: "d-1", attempts: 0 }, { ok: false, status: 500, error: "http_500", durationMs: 1 }, { now: T0, singleShot: true, notify: async () => undefined });
    expect(r.status).toBe("dead");
    expect(store.deliveries[0].status).toBe("dead");
  });
});
