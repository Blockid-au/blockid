import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// analytics/server — colocated tests for the previously-untested server-side
// event emitter that fronts BOTH sinks the GA4 measurement-plan template
// (P7-ga4-measurement-plan, docs/plans/atlassian-standard-mapping-goal.md §1
// phase 7 P2 gap) pins as investor-verifiable:
//   1. Supabase `analytics_events` — source of truth, hash-idempotent on
//      event_id via the `analytics_events_event_id_uq` index from migration
//      0077, later swept to BigQuery.
//   2. GA4 Measurement Protocol — best-effort mirror grouped by session so
//      the GA4 UI stays populated in real time.
//
// A silent regression here (dropping the `onConflict: event_id` +
// `ignoreDuplicates: true` upsert options, forwarding an unconsented client
// event to GA4, or letting `writeGa4` throw and take down the caller) would
// simultaneously corrupt the analytics_events table AND leak client-side
// events to Google in violation of the deny-first Consent Mode v2 contract
// the sibling `analytics/consent.ts` test suite (P7-consent-lib-test) pins.
// ---------------------------------------------------------------------------

type UpsertOpts = { onConflict?: string; ignoreDuplicates?: boolean };
type UpsertCall = { table: string; rows: Record<string, unknown>[]; opts: UpsertOpts };

type State = {
  admin: "null" | "ok" | "throw" | "error";
  upserts: UpsertCall[];
  upsertError: { message: string } | null;
  fetchCalls: { url: string; body: unknown }[];
  fetchStatus: number;
  fetchThrows: boolean;
};

const state: State = {
  admin: "ok",
  upserts: [],
  upsertError: null,
  fetchCalls: [],
  fetchStatus: 204,
  fetchThrows: false,
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (state.admin === "null") return null;
    if (state.admin === "throw") {
      return {
        from() {
          throw new Error("supabase from() threw");
        },
      };
    }
    return {
      from(table: string) {
        return {
          upsert(rows: Record<string, unknown>[], opts: UpsertOpts) {
            state.upserts.push({ table, rows, opts });
            return Promise.resolve({ error: state.upsertError });
          },
        };
      },
    };
  },
}));

async function loadModule() {
  vi.resetModules();
  return import("./server");
}

function fakeFetch(): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (state.fetchThrows) throw new Error("network down");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    state.fetchCalls.push({ url: String(url), body });
    return new Response("", {
      status: state.fetchStatus,
      statusText: state.fetchStatus === 204 ? "No Content" : "Server Error",
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  state.admin = "ok";
  state.upserts = [];
  state.upsertError = null;
  state.fetchCalls = [];
  state.fetchStatus = 204;
  state.fetchThrows = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("fetch", fakeFetch());
  vi.stubEnv("GA4_MEASUREMENT_ID", "G-TEST");
  vi.stubEnv("GA4_API_SECRET", "secret-abc");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("emitEvent — event shape defaults", () => {
  it("stamps a UUID event_id when not supplied and defaults null user/session + empty params + consent=false + source=server", async () => {
    const mod = await loadModule();
    await mod.emitEvent({ name: "sign_up", params: {} });
    await mod.flush();
    expect(state.upserts).toHaveLength(1);
    const row = state.upserts[0].rows[0];
    expect(row.event_name).toBe("sign_up");
    expect(row.user_id).toBeNull();
    expect(row.session_id).toBeNull();
    expect(row.params).toEqual({});
    expect(row.consent_granted).toBe(false);
    expect(row.source).toBe("server");
    expect(row.event_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("preserves caller-supplied eventId, userId, sessionId, consentGranted, source verbatim", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "purchase",
      params: { plan: "growth", value: 99 },
      userId: "user-123",
      sessionId: "sess-abc",
      eventId: "evt-fixed-1",
      consentGranted: true,
      source: "webhook:stripe",
    });
    await mod.flush();
    const row = state.upserts[0].rows[0];
    expect(row).toMatchObject({
      event_id: "evt-fixed-1",
      event_name: "purchase",
      user_id: "user-123",
      session_id: "sess-abc",
      params: { plan: "growth", value: 99 },
      consent_granted: true,
      source: "webhook:stripe",
    });
  });

  it("coerces undefined params to {} on the queue so the DB never sees undefined", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "page_view",
      params: undefined as unknown as Record<string, unknown>,
    });
    await mod.flush();
    expect(state.upserts[0].rows[0].params).toEqual({});
  });
});

describe("emitEvent — batching + eager flush", () => {
  it("does NOT flush eagerly on a single event (schedules timer, awaits <FLUSH_MAX>)", async () => {
    vi.useFakeTimers();
    const mod = await loadModule();
    await mod.emitEvent({ name: "e1", params: {} });
    expect(state.upserts).toHaveLength(0);
  });

  it("flushes eagerly at exactly FLUSH_MAX=20 events without waiting for the timer", async () => {
    vi.useFakeTimers();
    const mod = await loadModule();
    for (let i = 0; i < 19; i += 1) {
      await mod.emitEvent({ name: `e${i}`, params: {} });
    }
    expect(state.upserts).toHaveLength(0);
    await mod.emitEvent({ name: "e19", params: {} });
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].rows).toHaveLength(20);
  });

  it("flushes after the FLUSH_INTERVAL_MS=5000 timer elapses when the batch never fills", async () => {
    vi.useFakeTimers();
    const mod = await loadModule();
    await mod.emitEvent({ name: "solo", params: {} });
    expect(state.upserts).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].rows[0].event_name).toBe("solo");
  });

  it("timer callback resets so a follow-up event queues a fresh timer (single-shot semantics)", async () => {
    vi.useFakeTimers();
    const mod = await loadModule();
    await mod.emitEvent({ name: "first", params: {} });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.upserts).toHaveLength(1);
    await mod.emitEvent({ name: "second", params: {} });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.upserts).toHaveLength(2);
    expect(state.upserts[1].rows[0].event_name).toBe("second");
  });
});

describe("flush() — idempotency + empty-queue guard", () => {
  it("is a no-op when the queue is empty (no supabase call)", async () => {
    const mod = await loadModule();
    await mod.flush();
    expect(state.upserts).toHaveLength(0);
  });

  it("returns the same in-flight promise for concurrent callers (single-flight semantics)", async () => {
    const mod = await loadModule();
    await mod.emitEvent({ name: "e1", params: {} });
    const p1 = mod.flush();
    const p2 = mod.flush();
    // p2 either returns the in-flight promise OR (raced past the splice) a
    // resolved no-op. Both must settle without error and produce exactly
    // ONE upsert — never two.
    await Promise.all([p1, p2]);
    expect(state.upserts).toHaveLength(1);
  });
});

describe("writeSupabase — sink 1", () => {
  it("upserts into analytics_events with onConflict=event_id + ignoreDuplicates=true", async () => {
    const mod = await loadModule();
    await mod.emitEvent({ name: "e", params: { k: 1 } });
    await mod.flush();
    expect(state.upserts[0].table).toBe("analytics_events");
    expect(state.upserts[0].opts).toEqual({
      onConflict: "event_id",
      ignoreDuplicates: true,
    });
  });

  it("silently skips writeSupabase when getSupabaseAdmin() is null (dev fallback — no throw)", async () => {
    state.admin = "null";
    const mod = await loadModule();
    await mod.emitEvent({ name: "e", params: {} });
    await mod.flush();
    expect(state.upserts).toHaveLength(0);
  });

  it("logs but does NOT throw when the supabase upsert returns { error }", async () => {
    state.upsertError = { message: "duplicate key" };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await loadModule();
    await mod.emitEvent({ name: "e", params: {} });
    await expect(mod.flush()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[analytics.server] supabase insert failed:",
      "duplicate key",
    );
  });

  it("logs but does NOT throw when the supabase client itself throws (catch envelope)", async () => {
    state.admin = "throw";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await loadModule();
    await mod.emitEvent({ name: "e", params: {} });
    await expect(mod.flush()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[analytics.server] supabase threw:",
      "supabase from() threw",
    );
  });

  it("row shape is snake_case (event_id/event_name/user_id/session_id/params/consent_granted/source) — matches migration 0077", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "purchase",
      params: { p: 1 },
      userId: "u",
      sessionId: "s",
      consentGranted: true,
      source: "client",
    });
    await mod.flush();
    const row = state.upserts[0].rows[0];
    expect(Object.keys(row).sort()).toEqual(
      [
        "consent_granted",
        "event_id",
        "event_name",
        "params",
        "session_id",
        "source",
        "user_id",
      ].sort(),
    );
  });
});

describe("writeGa4 — sink 2 (measurement protocol)", () => {
  it("is disabled (no fetch call) when GA4_MEASUREMENT_ID is missing", async () => {
    vi.stubEnv("GA4_MEASUREMENT_ID", "");
    const mod = await loadModule();
    await mod.emitEvent({ name: "e", params: {}, consentGranted: true });
    await mod.flush();
    expect(state.fetchCalls).toHaveLength(0);
  });

  it("is disabled (no fetch call) when GA4_API_SECRET is missing", async () => {
    vi.stubEnv("GA4_API_SECRET", "");
    const mod = await loadModule();
    await mod.emitEvent({ name: "e", params: {}, consentGranted: true });
    await mod.flush();
    expect(state.fetchCalls).toHaveLength(0);
  });

  it("POSTs to the MP endpoint with measurement_id + api_secret URL-encoded", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "sign_up",
      params: { method: "email" },
      sessionId: "sess-1",
      consentGranted: true,
    });
    await mod.flush();
    expect(state.fetchCalls).toHaveLength(1);
    expect(state.fetchCalls[0].url).toBe(
      "https://www.google-analytics.com/mp/collect?measurement_id=G-TEST&api_secret=secret-abc",
    );
  });

  it("body carries client_id (session key), user_id, and events[] with engagement_time_msec=1 injected", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "sign_up",
      params: { method: "email" },
      userId: "user-42",
      sessionId: "sess-42",
      consentGranted: true,
    });
    await mod.flush();
    const body = state.fetchCalls[0].body as {
      client_id: string;
      user_id: string;
      events: { name: string; params: Record<string, unknown> }[];
    };
    expect(body.client_id).toBe("sess-42");
    expect(body.user_id).toBe("user-42");
    expect(body.events).toHaveLength(1);
    expect(body.events[0].name).toBe("sign_up");
    expect(body.events[0].params.method).toBe("email");
    expect(body.events[0].params.engagement_time_msec).toBe(1);
    expect(body.events[0].params.session_id).toBe("sess-42");
  });

  it("groups multiple events by session_id into a single POST per session", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "page_view",
      params: {},
      sessionId: "sess-A",
      consentGranted: true,
    });
    await mod.emitEvent({
      name: "cta_click",
      params: {},
      sessionId: "sess-A",
      consentGranted: true,
    });
    await mod.emitEvent({
      name: "page_view",
      params: {},
      sessionId: "sess-B",
      consentGranted: true,
    });
    await mod.flush();
    expect(state.fetchCalls).toHaveLength(2);
    const bodies = state.fetchCalls
      .map((c) => c.body as { client_id: string; events: unknown[] })
      .sort((a, b) => a.client_id.localeCompare(b.client_id));
    expect(bodies[0].client_id).toBe("sess-A");
    expect(bodies[0].events).toHaveLength(2);
    expect(bodies[1].client_id).toBe("sess-B");
    expect(bodies[1].events).toHaveLength(1);
  });

  it("falls back to user_id when session_id is missing", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "e",
      params: {},
      userId: "user-only",
      consentGranted: true,
    });
    await mod.flush();
    const body = state.fetchCalls[0].body as { client_id: string };
    expect(body.client_id).toBe("user-only");
  });

  it("falls back to `sys-<event_id>` when both session_id and user_id are missing", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "system_tick",
      params: {},
      eventId: "evt-sys-1",
      consentGranted: true,
    });
    await mod.flush();
    const body = state.fetchCalls[0].body as { client_id: string };
    expect(body.client_id).toBe("sys-evt-sys-1");
  });

  it("DROPS unconsented client-source events (consent_granted=false + source='client')", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "page_view",
      params: {},
      sessionId: "s",
      consentGranted: false,
      source: "client",
    });
    await mod.flush();
    // Supabase still receives the row (source-of-truth), but GA4 does not.
    expect(state.upserts).toHaveLength(1);
    expect(state.fetchCalls).toHaveLength(0);
  });

  it("FORWARDS unconsented server-source events (server telemetry is not gated by user consent)", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "cron_tick",
      params: {},
      sessionId: "sys-sess",
      consentGranted: false,
      source: "server",
    });
    await mod.flush();
    expect(state.fetchCalls).toHaveLength(1);
  });

  it("FORWARDS unconsented webhook-source events (Stripe webhook telemetry — not client)", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "checkout_completed",
      params: {},
      sessionId: "sess-1",
      consentGranted: false,
      source: "webhook:stripe",
    });
    await mod.flush();
    expect(state.fetchCalls).toHaveLength(1);
  });

  it("logs but does NOT throw when the GA4 fetch returns a non-2xx response", async () => {
    state.fetchStatus = 500;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await loadModule();
    await mod.emitEvent({
      name: "e",
      params: {},
      sessionId: "s",
      consentGranted: true,
    });
    await expect(mod.flush()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[analytics.server] GA4 MP 500 Server Error",
    );
  });

  it("logs but does NOT throw when the GA4 fetch itself rejects", async () => {
    state.fetchThrows = true;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mod = await loadModule();
    await mod.emitEvent({
      name: "e",
      params: {},
      sessionId: "s",
      consentGranted: true,
    });
    await expect(mod.flush()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[analytics.server] GA4 MP fetch failed:",
      "network down",
    );
  });

  it("omits user_id from the MP body when no event in a group has one (undefined not null)", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "anon",
      params: {},
      sessionId: "anon-sess",
      consentGranted: true,
    });
    await mod.flush();
    const body = state.fetchCalls[0].body as Record<string, unknown>;
    // JSON.stringify drops undefined, so user_id key must be absent.
    expect("user_id" in body).toBe(false);
  });

  it("does NOT inject session_id into GA4 params when the source event has no sessionId", async () => {
    const mod = await loadModule();
    await mod.emitEvent({
      name: "e",
      params: { k: 1 },
      userId: "u-1",
      consentGranted: true,
    });
    await mod.flush();
    const body = state.fetchCalls[0].body as {
      events: { params: Record<string, unknown> }[];
    };
    // engagement_time_msec is always injected; session_id is undefined and
    // JSON.stringify drops it.
    expect(body.events[0].params.engagement_time_msec).toBe(1);
    expect("session_id" in body.events[0].params).toBe(false);
  });
});

describe("both sinks — no cross-sink failure propagation", () => {
  it("a GA4 fetch failure does NOT stop the supabase upsert (Promise.allSettled)", async () => {
    state.fetchThrows = true;
    const mod = await loadModule();
    await mod.emitEvent({
      name: "e",
      params: {},
      sessionId: "s",
      consentGranted: true,
    });
    await mod.flush();
    expect(state.upserts).toHaveLength(1);
  });

  it("a supabase upsert failure does NOT stop the GA4 fetch (Promise.allSettled)", async () => {
    state.upsertError = { message: "boom" };
    const mod = await loadModule();
    await mod.emitEvent({
      name: "e",
      params: {},
      sessionId: "s",
      consentGranted: true,
    });
    await mod.flush();
    expect(state.fetchCalls).toHaveLength(1);
  });
});
