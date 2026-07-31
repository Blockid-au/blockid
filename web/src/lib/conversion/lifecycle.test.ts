// Colocated vitest for the drip-campaign lifecycle state machine.
//
// `lifecycle.ts` ships four surfaces:
//
//   1. `startLifecycle(userId, now?)` — upserts a fresh day0 row, preserving
//      any pre-existing history array so re-entering users don't lose prior
//      touchpoints. Reads `lifecycle_state.history` via
//      `.select("history").eq("user_id", …).maybeSingle()`, then writes via
//      `.upsert({...}, { onConflict: "user_id" })`.
//   2. `advance(userId, from, now?)` — resolves the next step via NEXT[from];
//      terminal (`done`) short-circuits without touching the DB; every other
//      transition calls the `advance_lifecycle` RPC and either returns the
//      RPC-supplied step (string) or falls back to NEXT[from].next. RPC
//      transport errors are re-thrown (previously swallowed → stuck rows).
//   3. `stopLifecycle(userId, now?)` — hard-cancel; upserts current_step=done
//      + next_send_at=null; no history read/append.
//   4. `loadDue(limit?, _now?)` — thin wrapper over the `pick_lifecycle_due`
//      RPC that already reserves rows via FOR UPDATE SKIP LOCKED. Normalises
//      the response to LifecycleRow[]: forces next_send_at=null (the row is
//      already reserved), coerces non-array history → [].
//
// Uses a chain-shape fake `SupabaseClient` covering the four call shapes the
// module reaches for, with per-call failure/data injection through `state`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── module mocks (must precede the import under test) ──────────────────

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? adminClient : null),
}));

// ─── fake Supabase client ───────────────────────────────────────────────

interface SelectCapture {
  table: string;
  cols: string;
  eqCol: string;
  eqVal: unknown;
}

interface UpsertCapture {
  table: string;
  payload: Record<string, unknown>;
  options: Record<string, unknown>;
}

interface RpcCapture {
  name: string;
  args: Record<string, unknown>;
}

interface FakeState {
  adminConfigured: boolean;
  selectHistory: unknown; // returned as data.history on the maybeSingle() call
  selectReturnsNullData: boolean; // force `data: null` from maybeSingle()
  advanceRpcData: unknown; // resolved value of the advance_lifecycle RPC
  advanceRpcError: { message: string } | null;
  pickRpcData: unknown; // resolved value of the pick_lifecycle_due RPC
  pickRpcReturnsNull: boolean; // force `data: null` on pick_lifecycle_due
  selectCaptures: SelectCapture[];
  upsertCaptures: UpsertCapture[];
  rpcCaptures: RpcCapture[];
}

const state: FakeState = {
  adminConfigured: true,
  selectHistory: [],
  selectReturnsNullData: false,
  advanceRpcData: null,
  advanceRpcError: null,
  pickRpcData: [],
  pickRpcReturnsNull: false,
  selectCaptures: [],
  upsertCaptures: [],
  rpcCaptures: [],
};

const adminClient = {
  from(table: string) {
    return {
      select(cols: string) {
        return {
          eq(col: string, val: unknown) {
            return {
              maybeSingle: async () => {
                state.selectCaptures.push({ table, cols, eqCol: col, eqVal: val });
                if (state.selectReturnsNullData) return { data: null, error: null };
                return { data: { history: state.selectHistory }, error: null };
              },
            };
          },
        };
      },
      upsert(payload: Record<string, unknown>, options: Record<string, unknown>) {
        state.upsertCaptures.push({ table, payload, options });
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
  rpc(name: string, args: Record<string, unknown>) {
    state.rpcCaptures.push({ name, args });
    if (name === "advance_lifecycle") {
      return Promise.resolve({ data: state.advanceRpcData, error: state.advanceRpcError });
    }
    if (name === "pick_lifecycle_due") {
      return Promise.resolve({
        data: state.pickRpcReturnsNull ? null : state.pickRpcData,
        error: null,
      });
    }
    throw new Error(`unexpected rpc: ${name}`);
  },
};

// ─── import under test (must follow the mocks) ──────────────────────────

import {
  LIFECYCLE_STEPS,
  advance,
  loadDue,
  startLifecycle,
  stopLifecycle,
  type LifecycleStep,
} from "./lifecycle";

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  state.adminConfigured = true;
  state.selectHistory = [];
  state.selectReturnsNullData = false;
  state.advanceRpcData = null;
  state.advanceRpcError = null;
  state.pickRpcData = [];
  state.pickRpcReturnsNull = false;
  state.selectCaptures = [];
  state.upsertCaptures = [];
  state.rpcCaptures = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── LIFECYCLE_STEPS constant ───────────────────────────────────────────

describe("LIFECYCLE_STEPS registry", () => {
  it("exports the exact ordered chain the cron drip depends on", () => {
    // Downstream RPCs (migration 0081) key on these string literals; a silent
    // rename here breaks every historic lifecycle_state row.
    expect(LIFECYCLE_STEPS).toEqual([
      "day0",
      "day3",
      "day5",
      "day6",
      "day7",
      "day14",
      "winback",
      "done",
    ]);
  });

  it("has done as the terminal step (last element)", () => {
    expect(LIFECYCLE_STEPS[LIFECYCLE_STEPS.length - 1]).toBe("done");
  });
});

// ─── startLifecycle ─────────────────────────────────────────────────────

describe("startLifecycle", () => {
  it("no-ops silently when the admin client is not configured", async () => {
    state.adminConfigured = false;
    await expect(startLifecycle("user_1")).resolves.toBeUndefined();
    expect(state.selectCaptures).toHaveLength(0);
    expect(state.upsertCaptures).toHaveLength(0);
  });

  it("reads existing history from lifecycle_state keyed by user_id", async () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    await startLifecycle("user_read", now);
    expect(state.selectCaptures).toEqual([
      { table: "lifecycle_state", cols: "history", eqCol: "user_id", eqVal: "user_read" },
    ]);
  });

  it("upserts current_step=day0 with next_send_at=now for immediate send", async () => {
    const now = new Date("2026-07-01T12:00:00.000Z");
    await startLifecycle("user_start", now);
    expect(state.upsertCaptures).toHaveLength(1);
    const cap = state.upsertCaptures[0];
    expect(cap.table).toBe("lifecycle_state");
    expect(cap.options).toEqual({ onConflict: "user_id" });
    expect(cap.payload).toMatchObject({
      user_id: "user_start",
      current_step: "day0",
      next_send_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
  });

  it("preserves an existing history array on re-entry (second product line)", async () => {
    const priorHistory = [
      { step: "day0", ts: "2025-01-01T00:00:00.000Z" },
      { step: "day3", ts: "2025-01-04T00:00:00.000Z" },
    ];
    state.selectHistory = priorHistory;
    await startLifecycle("user_reentry", new Date("2026-07-01T00:00:00.000Z"));
    expect(state.upsertCaptures[0].payload.history).toEqual(priorHistory);
  });

  it("coerces a non-array history value to [] (defensive against schema drift)", async () => {
    state.selectHistory = { corrupt: true };
    await startLifecycle("user_bad_history");
    expect(state.upsertCaptures[0].payload.history).toEqual([]);
  });

  it("uses [] when the row does not exist (maybeSingle returns null data)", async () => {
    state.selectReturnsNullData = true;
    await startLifecycle("user_new");
    expect(state.upsertCaptures[0].payload.history).toEqual([]);
  });

  it("defaults now to the current Date when caller omits it", async () => {
    const before = Date.now();
    await startLifecycle("user_default_now");
    const after = Date.now();
    const written = new Date(state.upsertCaptures[0].payload.next_send_at as string).getTime();
    expect(written).toBeGreaterThanOrEqual(before);
    expect(written).toBeLessThanOrEqual(after);
  });
});

// ─── advance ────────────────────────────────────────────────────────────

describe("advance", () => {
  it("short-circuits on the terminal 'done' step without touching the DB", async () => {
    const result = await advance("user_done", "done");
    expect(result).toBe("done");
    expect(state.rpcCaptures).toHaveLength(0);
  });

  it("returns the fallback next step when the admin client is not configured", async () => {
    state.adminConfigured = false;
    const result = await advance("user_1", "day0");
    expect(result).toBe("day3");
    expect(state.rpcCaptures).toHaveLength(0);
  });

  it("invokes the advance_lifecycle RPC with user, from, next, next_send_at", async () => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    await advance("user_rpc", "day0", now);
    expect(state.rpcCaptures).toEqual([
      {
        name: "advance_lifecycle",
        args: {
          p_user: "user_rpc",
          p_from: "day0",
          p_next: "day3",
          p_next_send_at: new Date(now.getTime() + 3 * DAY).toISOString(),
        },
      },
    ]);
  });

  it("returns the RPC-resolved next step when the RPC data is a string", async () => {
    state.advanceRpcData = "day5";
    const result = await advance("user_str", "day3");
    expect(result).toBe("day5");
  });

  it("falls back to NEXT[from].next when the RPC returns non-string data (null row)", async () => {
    state.advanceRpcData = null;
    const result = await advance("user_null", "day5");
    expect(result).toBe("day6");
  });

  it("throws when the RPC surfaces a transport error (must not silently drop)", async () => {
    state.advanceRpcError = { message: "connection reset" };
    await expect(advance("user_err", "day0")).rejects.toThrow(
      "advance_lifecycle rpc failed: connection reset",
    );
  });

  it.each([
    ["day0", "day3", 3 * DAY],
    ["day3", "day5", 2 * DAY],
    ["day5", "day6", 1 * DAY],
    ["day6", "day7", 1 * DAY],
    ["day7", "day14", 7 * DAY],
    ["day14", "winback", 14 * DAY],
    ["winback", "done", 30 * DAY],
  ] as const)("transitions %s → %s with delay %d ms", async (from, expectedNext, delayMs) => {
    const now = new Date("2026-07-01T00:00:00.000Z");
    const result = await advance("u", from as LifecycleStep, now);
    expect(result).toBe(expectedNext);
    const rpc = state.rpcCaptures.at(-1)!;
    expect(rpc.args.p_next).toBe(expectedNext);
    expect(rpc.args.p_next_send_at).toBe(
      new Date(now.getTime() + delayMs).toISOString(),
    );
  });

  it("defaults now to the current Date when the caller omits it", async () => {
    const before = Date.now();
    await advance("u_now", "day0");
    const after = Date.now();
    const stamp = new Date(state.rpcCaptures[0].args.p_next_send_at as string).getTime();
    // day0 → day3 delay is 3d
    expect(stamp).toBeGreaterThanOrEqual(before + 3 * DAY);
    expect(stamp).toBeLessThanOrEqual(after + 3 * DAY);
  });
});

// ─── stopLifecycle ──────────────────────────────────────────────────────

describe("stopLifecycle", () => {
  it("no-ops silently when the admin client is not configured", async () => {
    state.adminConfigured = false;
    await expect(stopLifecycle("user_x")).resolves.toBeUndefined();
    expect(state.upsertCaptures).toHaveLength(0);
  });

  it("upserts current_step=done and clears next_send_at", async () => {
    const now = new Date("2026-07-01T09:00:00.000Z");
    await stopLifecycle("user_stop", now);
    expect(state.upsertCaptures).toHaveLength(1);
    const cap = state.upsertCaptures[0];
    expect(cap.table).toBe("lifecycle_state");
    expect(cap.options).toEqual({ onConflict: "user_id" });
    expect(cap.payload).toEqual({
      user_id: "user_stop",
      current_step: "done",
      next_send_at: null,
      updated_at: now.toISOString(),
    });
  });

  it("does not read history (hard-cancel skips the append round-trip)", async () => {
    await stopLifecycle("user_stop_2");
    expect(state.selectCaptures).toHaveLength(0);
  });
});

// ─── loadDue ────────────────────────────────────────────────────────────

describe("loadDue", () => {
  it("returns [] when the admin client is not configured", async () => {
    state.adminConfigured = false;
    await expect(loadDue()).resolves.toEqual([]);
    expect(state.rpcCaptures).toHaveLength(0);
  });

  it("invokes pick_lifecycle_due with the default limit of 100", async () => {
    await loadDue();
    expect(state.rpcCaptures).toEqual([
      { name: "pick_lifecycle_due", args: { p_limit: 100 } },
    ]);
  });

  it("passes the caller-supplied limit through to the RPC", async () => {
    await loadDue(25);
    expect(state.rpcCaptures[0].args).toEqual({ p_limit: 25 });
  });

  it("returns [] when the RPC resolves data=null", async () => {
    state.pickRpcReturnsNull = true;
    await expect(loadDue()).resolves.toEqual([]);
  });

  it("returns [] when the RPC resolves data=[] (nothing due)", async () => {
    state.pickRpcData = [];
    await expect(loadDue()).resolves.toEqual([]);
  });

  it("maps picked rows and forces next_send_at=null (row already reserved)", async () => {
    state.pickRpcData = [
      {
        user_id: "u1",
        current_step: "day0",
        history: [{ step: "day0", ts: "2026-06-01T00:00:00.000Z" }],
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    ];
    const rows = await loadDue();
    expect(rows).toEqual([
      {
        user_id: "u1",
        current_step: "day0",
        next_send_at: null,
        updated_at: "2026-07-01T00:00:00.000Z",
        history: [{ step: "day0", ts: "2026-06-01T00:00:00.000Z" }],
      },
    ]);
  });

  it("coerces non-array history to [] per row (defensive against schema drift)", async () => {
    state.pickRpcData = [
      { user_id: "u2", current_step: "day3", history: null, updated_at: "t" },
      { user_id: "u3", current_step: "day5", history: "junk", updated_at: "t" },
      { user_id: "u4", current_step: "day7", history: { bad: 1 }, updated_at: "t" },
    ];
    const rows = await loadDue();
    expect(rows.map((r) => r.history)).toEqual([[], [], []]);
  });

  it("preserves current_step=null on rows that have never sent (fresh insert)", async () => {
    state.pickRpcData = [
      { user_id: "u_null", current_step: null, history: [], updated_at: "t" },
    ];
    const rows = await loadDue();
    expect(rows[0].current_step).toBeNull();
  });
});
