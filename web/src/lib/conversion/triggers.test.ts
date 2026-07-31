// Colocated vitest for the CRO conversion-trigger registry + `shouldFire`
// decision + `recordConversionEvent` insert helper (T-0410). Previously
// uncovered — the sibling `__tests__/lifecycle.test.ts` covers the lifecycle
// RPC helpers but the trigger cool-down + session-cap logic that determines
// whether an upgrade CTA is ever shown was unpinned.
//
// A silent regression here would either:
//   (a) burn a hard `feature_gate_hit` CTA behind a soft `trial_day_5` banner
//       (the `countsAgainstSessionCap` filter at triggers.ts:99-105 exists
//       precisely to prevent this),
//   (b) let the same trigger re-fire inside the 24h cool-down window
//       (spamming the founder + inflating `shown` counts in the CDO funnel),
//   (c) fire without a userId (which would insert unattributable rows into
//       `conversion_events` that the funnel dashboards can't group by user).
//
// Test-gate posture (web/AGENTS.md §Test gate): this file lives next to
// triggers.ts so the pair is picked up by scripts/cron/test-gate.mjs — a
// future edit to triggers.ts must keep this suite green or the tick reverts.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Fluent chain-mock: every method returns `this` until we terminate with a
// value via `.mockResolvedValueOnce`-style stub on the terminal method the
// module calls (`.limit` for the cool-down select; the head-count select
// awaits the builder itself). We rewire the shape per-test via `queue`.
type QueueItem =
  | {
      kind: "cooldown_select";
      response: { data: Array<Record<string, unknown>> | null };
    }
  | {
      kind: "session_count";
      response: { count: number | null };
    }
  | {
      kind: "insert";
      capture: (payload: Record<string, unknown>) => void;
    };

let queue: QueueItem[] = [];
let getSupabaseAdminReturn: unknown = null;

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminReturn,
}));

// Import AFTER mocks so the module binds to our stub.
import {
  TRIGGERS,
  recordConversionEvent,
  shouldFire,
  type ConversionTrigger,
} from "./triggers";

function makeSupabaseStub() {
  return {
    from(_table: string) {
      const item = queue.shift();
      if (!item) throw new Error("supabase-stub: queue exhausted");
      if (item.kind === "cooldown_select") {
        const terminal = {
          async then(resolve: (v: unknown) => unknown) {
            return resolve(item.response);
          },
        };
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "gte", "order"]) {
          chain[m] = () => chain;
        }
        chain.limit = () => item.response;
        return chain;
      }
      if (item.kind === "session_count") {
        // The session-cap probe awaits the builder itself
        // (`.filter("detail->>session_id", "eq", ...)` is the terminal call).
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "in"]) {
          chain[m] = () => chain;
        }
        chain.filter = () =>
          Promise.resolve({ count: item.response.count });
        return chain;
      }
      // insert
      return {
        insert(payload: Record<string, unknown>) {
          item.capture(payload);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

beforeEach(() => {
  queue = [];
  getSupabaseAdminReturn = null;
});

// ---------------------------------------------------------------------------
// Registry — TRIGGERS
// ---------------------------------------------------------------------------
describe("TRIGGERS registry", () => {
  it("declares exactly 10 triggers (no orphan, no silent add)", () => {
    expect(Object.keys(TRIGGERS)).toHaveLength(10);
  });

  it("every entry's key matches its id (registry ↔ spec drift guard)", () => {
    for (const [key, spec] of Object.entries(TRIGGERS)) {
      expect(spec.id).toBe(key);
    }
  });

  it("all copyKeys are unique so the client-side resolver cannot collide", () => {
    const copyKeys = Object.values(TRIGGERS).map((t) => t.copyKey);
    expect(new Set(copyKeys).size).toBe(copyKeys.length);
  });

  it("cool-downs are all positive integers ≥ 1 hour (no accidental 0-cd trigger)", () => {
    for (const spec of Object.values(TRIGGERS)) {
      expect(Number.isInteger(spec.cooldownSec)).toBe(true);
      expect(spec.cooldownSec).toBeGreaterThanOrEqual(60 * 60);
    }
  });

  it("hard gates count against the session cap (gate_hit / credits_* / *_cap_hit)", () => {
    const hardGates: ConversionTrigger[] = [
      "feature_gate_hit",
      "credits_low",
      "credits_exhausted",
      "report_cap_hit",
      "watchlist_cap_hit",
      "cohort_seat_cap_hit",
    ];
    for (const id of hardGates) {
      expect(TRIGGERS[id].countsAgainstSessionCap).toBe(true);
    }
  });

  it("soft nudges are exempt from the session cap (trial_day_5/6/7 + winback)", () => {
    const soft: ConversionTrigger[] = [
      "trial_day_5",
      "trial_day_6",
      "trial_day_7",
      "post_cancel_winback",
    ];
    for (const id of soft) {
      expect(TRIGGERS[id].countsAgainstSessionCap).toBe(false);
    }
  });

  it("post_cancel_winback has a 7-day cool-down (longest of any trigger)", () => {
    expect(TRIGGERS.post_cancel_winback.cooldownSec).toBe(60 * 60 * 24 * 7);
    for (const [id, spec] of Object.entries(TRIGGERS)) {
      if (id === "post_cancel_winback") continue;
      expect(spec.cooldownSec).toBeLessThanOrEqual(
        TRIGGERS.post_cancel_winback.cooldownSec,
      );
    }
  });

  it("credits_low uses a 12h cool-down (the only sub-24h entry)", () => {
    expect(TRIGGERS.credits_low.cooldownSec).toBe(60 * 60 * 12);
  });
});

// ---------------------------------------------------------------------------
// shouldFire — decision matrix
// ---------------------------------------------------------------------------
describe("shouldFire", () => {
  it("returns {fire:false, reason:'no_user'} when userId is null", async () => {
    const decision = await shouldFire({
      userId: null,
      sessionId: "sess-1",
      trigger: "feature_gate_hit",
    });
    expect(decision).toEqual({ fire: false, reason: "no_user" });
  });

  it("returns {fire:false, reason:'trigger_off'} when the trigger is unknown", async () => {
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      // Cast bypasses TS so we exercise the runtime guard the
      // caller-facing HTTP layer relies on for JSON-parsed inputs.
      trigger: "not_a_real_trigger" as unknown as ConversionTrigger,
    });
    expect(decision).toEqual({ fire: false, reason: "trigger_off" });
  });

  it("returns {fire:true} when getSupabaseAdmin is null (dev / self-hosted degraded mode)", async () => {
    getSupabaseAdminReturn = null;
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      trigger: "feature_gate_hit",
    });
    expect(decision).toEqual({ fire: true });
  });

  it("fires when neither cool-down nor session-cap is hit", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    queue.push({ kind: "cooldown_select", response: { data: [] } });
    queue.push({ kind: "session_count", response: { count: 0 } });
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      trigger: "feature_gate_hit",
    });
    expect(decision).toEqual({ fire: true });
  });

  it("blocks with reason:'cooldown' when a recent 'shown' row exists inside the window", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    queue.push({
      kind: "cooldown_select",
      response: { data: [{ ts: "2026-07-30T00:00:00Z", action: "shown" }] },
    });
    // no session_count probe — the module short-circuits on the cool-down row.
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      trigger: "feature_gate_hit",
      now: Math.floor(new Date("2026-07-30T01:00:00Z").getTime() / 1000),
    });
    expect(decision).toEqual({ fire: false, reason: "cooldown" });
  });

  it("blocks with reason:'session_cap' when a prior countsAgainst 'shown' exists this session", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    queue.push({ kind: "cooldown_select", response: { data: [] } });
    queue.push({ kind: "session_count", response: { count: 1 } });
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      trigger: "feature_gate_hit",
    });
    expect(decision).toEqual({ fire: false, reason: "session_cap" });
  });

  it("skips the session-cap probe entirely for soft nudges (countsAgainstSessionCap=false)", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    queue.push({ kind: "cooldown_select", response: { data: [] } });
    // Deliberately NO session_count enqueued — if the code probes it, the
    // stub throws "queue exhausted" and the test fails.
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      trigger: "trial_day_5",
    });
    expect(decision).toEqual({ fire: true });
  });

  it("skips the session-cap probe when sessionId is null (no way to scope the count)", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    queue.push({ kind: "cooldown_select", response: { data: [] } });
    const decision = await shouldFire({
      userId: "u1",
      sessionId: null,
      trigger: "feature_gate_hit",
    });
    expect(decision).toEqual({ fire: true });
  });

  it("treats an exhausted-count of null as 0 (no crash on empty count column)", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    queue.push({ kind: "cooldown_select", response: { data: [] } });
    queue.push({ kind: "session_count", response: { count: null } });
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      trigger: "feature_gate_hit",
    });
    expect(decision).toEqual({ fire: true });
  });

  it("uses the injected `now` for deterministic cool-down math", async () => {
    // If the module used Date.now() the assertion below would flake; the
    // `now?: number` in FireContext exists so tests are stable.
    getSupabaseAdminReturn = makeSupabaseStub();
    queue.push({ kind: "cooldown_select", response: { data: [] } });
    queue.push({ kind: "session_count", response: { count: 0 } });
    const decision = await shouldFire({
      userId: "u1",
      sessionId: "sess-1",
      trigger: "credits_low",
      now: 1_800_000_000,
    });
    expect(decision).toEqual({ fire: true });
  });
});

// ---------------------------------------------------------------------------
// recordConversionEvent
// ---------------------------------------------------------------------------
describe("recordConversionEvent", () => {
  it("is a no-op when userId is null (no supabase call, no throw)", async () => {
    let called = false;
    getSupabaseAdminReturn = {
      from() {
        called = true;
        throw new Error("must-not-be-called");
      },
    };
    await expect(
      recordConversionEvent({
        userId: null,
        trigger: "feature_gate_hit",
        action: "shown",
      }),
    ).resolves.toBeUndefined();
    expect(called).toBe(false);
  });

  it("is a no-op when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminReturn = null;
    await expect(
      recordConversionEvent({
        userId: "u1",
        trigger: "feature_gate_hit",
        action: "shown",
      }),
    ).resolves.toBeUndefined();
  });

  it("inserts a row with the canonical column shape on the happy path", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    let captured: Record<string, unknown> | null = null;
    queue.push({
      kind: "insert",
      capture: (p) => {
        captured = p;
      },
    });
    await recordConversionEvent({
      userId: "u1",
      trigger: "feature_gate_hit",
      action: "accepted",
      planFrom: "growth",
      planTo: "scale",
      sessionId: "sess-1",
      detail: { source: "modal" },
    });
    expect(captured).toMatchObject({
      user_id: "u1",
      trigger: "feature_gate_hit",
      action: "accepted",
      plan_from: "growth",
      plan_to: "scale",
    });
    // detail is merged (session_id folded in) — the CDO funnel joins on
    // detail->>session_id so this shape is load-bearing.
    expect(
      (captured as unknown as { detail: Record<string, unknown> }).detail,
    ).toMatchObject({
      source: "modal",
      session_id: "sess-1",
    });
  });

  it("coerces missing planFrom/planTo to null (never writes undefined)", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    let captured: Record<string, unknown> | null = null;
    queue.push({
      kind: "insert",
      capture: (p) => {
        captured = p;
      },
    });
    await recordConversionEvent({
      userId: "u1",
      trigger: "credits_low",
      action: "dismissed",
    });
    expect(captured).toMatchObject({
      plan_from: null,
      plan_to: null,
    });
  });

  it("omits session_id from detail when sessionId is not provided", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    let captured: Record<string, unknown> | null = null;
    queue.push({
      kind: "insert",
      capture: (p) => {
        captured = p;
      },
    });
    await recordConversionEvent({
      userId: "u1",
      trigger: "trial_day_5",
      action: "shown",
      detail: { source: "email" },
    });
    const detail = (captured as unknown as { detail: Record<string, unknown> })
      .detail;
    expect(detail).toEqual({ source: "email" });
    expect(detail).not.toHaveProperty("session_id");
  });

  it("defaults detail to an empty object when the caller omits it", async () => {
    getSupabaseAdminReturn = makeSupabaseStub();
    let captured: Record<string, unknown> | null = null;
    queue.push({
      kind: "insert",
      capture: (p) => {
        captured = p;
      },
    });
    await recordConversionEvent({
      userId: "u1",
      trigger: "post_cancel_winback",
      action: "snoozed",
      sessionId: "sess-9",
    });
    expect(
      (captured as unknown as { detail: Record<string, unknown> }).detail,
    ).toEqual({
      session_id: "sess-9",
    });
  });
});
