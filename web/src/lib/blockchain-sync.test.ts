// P9-blockchain-sync-lib-test — colocated vitest for `web/src/lib/blockchain-sync.ts`,
// the server-only sync engine that fronts every optional on-chain equity mirror
// (mint / transfer / vest / dividend). Off-chain Supabase stays the source of
// truth; this module decides which queued events flow to the wallet layer, how
// they retry, and how the four `sync_state` values (off / on / paused /
// catching_up) transition. A silent regression here either (a) processes events
// against the wrong config (double-mints), (b) leaks `pending_events` counters
// out of sync with the queue table, or (c) traps a founder in `catching_up`
// forever — none of which the founder-facing dashboard tile can detect until
// the on-chain balance stops matching the cap-table print.
//
// Fully mocks `@/lib/supabase` with a small in-process Supabase-shaped fake
// covering the six chain shapes the module uses:
//
//   • `.from().select("*").eq().maybeSingle()`               — getSyncConfig
//   • `.from().upsert(row, { onConflict })`                  — upsertSyncConfig
//   • `.from().insert(row).select("id").single()`            — queueSyncEvent
//   • `.rpc(name, args)`                                     — pending_events bump
//   • `.from().select("*").eq().eq().order().order().limit()` — processSyncQueue
//   • `.from().update({...}).eq()`                            — status transitions
//   • `.from().select("*", { count, head: true }).eq().eq()` — count queries
//
// The chain object is thenable so `await chain` resolves the result. Each
// terminal shape is dispatched through `state` so a test can inject:
//
//   • per-table `selectResult` / `insertResult` / `upsertResult` / `updateResult`
//   • conditional `updateReject` keyed on the awaited payload (drives the
//     retry / max-retries branch in processSyncQueue without needing a fake
//     wallet call — a rejected "mark as synced" update falls into the same
//     catch)
//   • rpc-throw injection (queueSyncEvent must swallow rpc errors — the
//     pending counter is advisory, not a blocker)
//
// All console.error / console.log calls in the module are silenced per-test so
// the vitest output stays readable.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── State the fake reads from ─────────────────────────────────────────────

interface CallCapture {
  op: string;
  table?: string;
  payload?: unknown;
  opts?: unknown;
  eq?: Array<{ col: string; val: unknown }>;
  order?: Array<{ col: string; ascending: boolean }>;
  limit?: number;
  cols?: string;
  countOpts?: { count?: string; head?: boolean };
}

interface FakeState {
  adminConfigured: boolean;
  calls: CallCapture[];
  rpcCalls: Array<{ name: string; args: unknown }>;
  rpcThrows: boolean;
  // Per-table terminal results.
  selectResults: Map<string, { data: unknown; error: unknown }>;
  maybeSingleResults: Map<string, { data: unknown; error: unknown }>;
  insertSelectSingleResults: Map<string, { data: unknown; error: unknown }>;
  upsertResults: Map<string, { data: unknown; error: unknown }>;
  updateResults: Map<string, { data: unknown; error: unknown }>;
  // count("exact", head:true) results — keyed by `${table}::${statusEqValue}` if
  // an `eq("status", …)` was applied, otherwise by table alone.
  countResults: Map<string, { count: number; error: unknown }>;
  // Conditional update rejection: if the awaited update payload matches this
  // predicate, the awaited chain rejects — drives the catch branch inside
  // processSyncQueue without needing to mock the private executeOnChainTx.
  updateRejectPredicate:
    | ((table: string, payload: Record<string, unknown>, eqs: Array<{ col: string; val: unknown }>) => boolean)
    | null;
}

const state: FakeState = createState();

function createState(): FakeState {
  return {
    adminConfigured: true,
    calls: [],
    rpcCalls: [],
    rpcThrows: false,
    selectResults: new Map(),
    maybeSingleResults: new Map(),
    insertSelectSingleResults: new Map(),
    upsertResults: new Map(),
    updateResults: new Map(),
    countResults: new Map(),
    updateRejectPredicate: null,
  };
}

function resetState(): void {
  const fresh = createState();
  Object.assign(state, fresh);
}

// ─── Fake Supabase chain ───────────────────────────────────────────────────

type ChainResult = { data?: unknown; error?: unknown; count?: number };

interface Chain {
  select(cols: string, opts?: { count?: string; head?: boolean }): Chain;
  insert(payload: unknown): Chain;
  upsert(payload: unknown, opts?: unknown): Chain;
  update(payload: unknown): Chain;
  eq(col: string, val: unknown): Chain;
  order(col: string, opts: { ascending: boolean }): Chain;
  limit(n: number): Chain;
  single(): Chain;
  maybeSingle(): Chain;
  then<TResult1 = ChainResult, TResult2 = never>(
    onfulfilled?: ((value: ChainResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}

function fromTable(table: string): Chain {
  const cap: CallCapture = { op: "from", table, eq: [], order: [] };
  state.calls.push(cap);

  let terminal: "select" | "insertSelectSingle" | "upsert" | "update" | "count" | "maybeSingle" =
    "select";
  let insertPayload: unknown = undefined;
  let updatePayload: Record<string, unknown> | undefined = undefined;
  let upsertPayload: unknown = undefined;
  let upsertOpts: unknown = undefined;
  let insertingThenSelectingSingle = false;

  const resolveResult = async (): Promise<{ data?: unknown; error?: unknown; count?: number }> => {
    if (terminal === "maybeSingle") {
      const key = table;
      const res = state.maybeSingleResults.get(key) ?? { data: null, error: null };
      return { data: res.data ?? null, error: res.error ?? null };
    }
    if (terminal === "count") {
      // Key the count on table + eq("status", value) so processSyncQueue's
      // "remaining pending" and getSyncQueueStatus's tri-count can differ.
      const statusEq = cap.eq?.find((e) => e.col === "status");
      const key = statusEq ? `${table}::${String(statusEq.val)}` : table;
      const res = state.countResults.get(key) ?? { count: 0, error: null };
      return { count: res.count, error: res.error, data: null };
    }
    if (terminal === "insertSelectSingle") {
      const res = state.insertSelectSingleResults.get(table) ?? {
        data: { id: "generated-id" },
        error: null,
      };
      return res;
    }
    if (terminal === "upsert") {
      const res = state.upsertResults.get(table) ?? { data: null, error: null };
      return res;
    }
    if (terminal === "update") {
      if (state.updateRejectPredicate && updatePayload) {
        if (state.updateRejectPredicate(table, updatePayload, cap.eq ?? [])) {
          throw new Error("update-reject");
        }
      }
      const res = state.updateResults.get(table) ?? { data: null, error: null };
      return res;
    }
    // Default select (non-count).
    const res = state.selectResults.get(table) ?? { data: [], error: null };
    return res;
  };

  const chain: Chain = {
    select(cols: string, opts?: { count?: string; head?: boolean }) {
      cap.cols = cols;
      if (opts && opts.head === true) {
        terminal = "count";
        cap.countOpts = opts;
        cap.op = "select-count";
      } else if (insertingThenSelectingSingle) {
        // .insert(...).select("id").single() shape
        terminal = "insertSelectSingle";
        cap.op = "insert-select-single";
      } else {
        terminal = "select";
        cap.op = "select";
      }
      return chain;
    },
    insert(payload: unknown) {
      insertPayload = payload;
      insertingThenSelectingSingle = true;
      cap.op = "insert";
      cap.payload = insertPayload;
      return chain;
    },
    upsert(payload: unknown, opts?: unknown) {
      upsertPayload = payload;
      upsertOpts = opts;
      terminal = "upsert";
      cap.op = "upsert";
      cap.payload = upsertPayload;
      cap.opts = upsertOpts;
      return chain;
    },
    update(payload: unknown) {
      updatePayload = payload as Record<string, unknown>;
      terminal = "update";
      cap.op = "update";
      cap.payload = updatePayload;
      return chain;
    },
    eq(col: string, val: unknown) {
      cap.eq!.push({ col, val });
      return chain;
    },
    order(col: string, opts: { ascending: boolean }) {
      cap.order!.push({ col, ascending: opts.ascending });
      return chain;
    },
    limit(n: number) {
      cap.limit = n;
      return chain;
    },
    single() {
      // .single() only appears after .insert(...).select("id") in this module.
      terminal = "insertSelectSingle";
      return chain;
    },
    maybeSingle() {
      terminal = "maybeSingle";
      return chain;
    },
    then(onfulfilled, onrejected) {
      return resolveResult().then(onfulfilled, onrejected);
    },
  };
  return chain;
}

function fakeAdmin() {
  return {
    from(table: string): Chain {
      return fromTable(table);
    },
    async rpc(name: string, args: unknown) {
      state.rpcCalls.push({ name, args });
      if (state.rpcThrows) throw new Error("rpc-boom");
      return { data: null, error: null };
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? fakeAdmin() : null),
}));

// ─── Silence console noise from the module under test ──────────────────────

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetState();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
  vi.useRealTimers();
});

// Late import — the module reads `getSupabaseAdmin()` per call, so importing
// after `vi.mock` is registered ensures the mock is in place.
import {
  getSyncConfig,
  upsertSyncConfig,
  queueSyncEvent,
  toggleSync,
  processSyncQueue,
  getSyncQueueStatus,
} from "./blockchain-sync";

// ─── getSyncConfig ─────────────────────────────────────────────────────────

describe("getSyncConfig", () => {
  it("[1] returns null when Supabase is not configured", async () => {
    state.adminConfigured = false;
    const out = await getSyncConfig("acct-1");
    expect(out).toBeNull();
    // The module must short-circuit before issuing a query.
    expect(state.calls).toEqual([]);
  });

  it("[2] returns null when maybeSingle returns no row", async () => {
    state.maybeSingleResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await getSyncConfig("acct-2");
    expect(out).toBeNull();
  });

  it("[3] maps the DB row (snake_case) to the SyncConfig shape (camelCase) verbatim", async () => {
    state.maybeSingleResults.set("blockchain_sync_config", {
      data: {
        id: "cfg-1",
        account_id: "acct-3",
        sync_enabled: true,
        sync_state: "catching_up",
        token_address: "0xabc",
        token_symbol: "EQT",
        token_name: "Equity Token",
        last_sync_at: "2026-08-01T00:00:00Z",
        last_sync_block: 42,
        pending_events: 7,
        auto_sync_transfers: true,
      },
      error: null,
    });
    const out = await getSyncConfig("acct-3");
    expect(out).toEqual({
      id: "cfg-1",
      accountId: "acct-3",
      syncEnabled: true,
      syncState: "catching_up",
      tokenAddress: "0xabc",
      tokenSymbol: "EQT",
      tokenName: "Equity Token",
      lastSyncAt: "2026-08-01T00:00:00Z",
      lastSyncBlock: 42,
      pendingEvents: 7,
      autoSyncTransfers: true,
    });
  });

  it("[4] queries blockchain_sync_config with select('*') filtered by account_id + maybeSingle()", async () => {
    state.maybeSingleResults.set("blockchain_sync_config", { data: null, error: null });
    await getSyncConfig("acct-4");
    const call = state.calls.find((c) => c.table === "blockchain_sync_config");
    expect(call).toBeDefined();
    expect(call?.cols).toBe("*");
    expect(call?.eq).toEqual([{ col: "account_id", val: "acct-4" }]);
  });
});

// ─── upsertSyncConfig ──────────────────────────────────────────────────────

describe("upsertSyncConfig", () => {
  it("[5] returns {ok:false} when Supabase is not configured (no upsert issued)", async () => {
    state.adminConfigured = false;
    const out = await upsertSyncConfig("acct-5", { syncEnabled: true });
    expect(out).toEqual({ ok: false });
    expect(state.calls).toEqual([]);
  });

  it("[6] returns {ok:true} on a successful upsert against blockchain_sync_config", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await upsertSyncConfig("acct-6", { syncEnabled: true });
    expect(out).toEqual({ ok: true });
    const call = state.calls[0];
    expect(call?.op).toBe("upsert");
    expect(call?.table).toBe("blockchain_sync_config");
  });

  it("[7] always seeds account_id + updated_at, even when the caller passes an empty updates object", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    const before = Date.now();
    await upsertSyncConfig("acct-7", {});
    const after = Date.now();
    const payload = state.calls[0]?.payload as Record<string, unknown>;
    expect(payload.account_id).toBe("acct-7");
    expect(typeof payload.updated_at).toBe("string");
    const ts = Date.parse(payload.updated_at as string);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
    // The empty updates object must not leak `undefined` columns into the row.
    expect(Object.keys(payload).sort()).toEqual(["account_id", "updated_at"]);
  });

  it("[8] maps every camelCase field in `updates` to its snake_case column (no undefined leaks)", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    await upsertSyncConfig("acct-8", {
      syncEnabled: false,
      syncState: "paused",
      tokenAddress: "0xdead",
      tokenSymbol: "ZEQ",
      tokenName: "Zero Equity",
      lastSyncAt: "2026-08-01T01:02:03Z",
      lastSyncBlock: 99,
      autoSyncTransfers: true,
    });
    const payload = state.calls[0]?.payload as Record<string, unknown>;
    expect(payload).toMatchObject({
      account_id: "acct-8",
      sync_enabled: false,
      sync_state: "paused",
      token_address: "0xdead",
      token_symbol: "ZEQ",
      token_name: "Zero Equity",
      last_sync_at: "2026-08-01T01:02:03Z",
      last_sync_block: 99,
      auto_sync_transfers: true,
    });
    // pending_events is not writable via upsertSyncConfig — it's advisory,
    // maintained by the queue path. Pin that it never appears.
    expect(payload).not.toHaveProperty("pending_events");
  });

  it("[9] passes { onConflict: 'account_id' } so the upsert is idempotent per account", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    await upsertSyncConfig("acct-9", { syncEnabled: true });
    expect(state.calls[0]?.opts).toEqual({ onConflict: "account_id" });
  });

  it("[10] returns {ok:false} on an upsert error and logs to console.error", async () => {
    state.upsertResults.set("blockchain_sync_config", {
      data: null,
      error: { message: "constraint fail" },
    });
    const out = await upsertSyncConfig("acct-10", { syncEnabled: true });
    expect(out).toEqual({ ok: false });
    expect(errorSpy).toHaveBeenCalled();
    const firstArg = errorSpy.mock.calls[0]?.[0];
    expect(String(firstArg)).toContain("[blockchain-sync] upsert config failed");
  });
});

// ─── queueSyncEvent ────────────────────────────────────────────────────────

describe("queueSyncEvent", () => {
  it("[11] returns {ok:false} when Supabase is not configured", async () => {
    state.adminConfigured = false;
    const out = await queueSyncEvent("acct-11", "mint", { to: "0xabc", amount: 100 });
    expect(out).toEqual({ ok: false });
    expect(state.rpcCalls).toEqual([]);
  });

  it("[12] returns {ok:false} on insert error and does NOT bump pending_events", async () => {
    state.insertSelectSingleResults.set("blockchain_sync_queue", {
      data: null,
      error: { message: "unique violation" },
    });
    const out = await queueSyncEvent("acct-12", "transfer", { from: "a", to: "b" });
    expect(out).toEqual({ ok: false });
    expect(state.rpcCalls).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("[13] returns {ok:true, eventId} on success and bumps pending_events via RPC", async () => {
    state.insertSelectSingleResults.set("blockchain_sync_queue", {
      data: { id: "evt-42" },
      error: null,
    });
    const out = await queueSyncEvent("acct-13", "dividend_declare", { amount: 1000 }, 5);
    expect(out).toEqual({ ok: true, eventId: "evt-42" });

    // The insert payload must pin the queue contract (retry_count=0, max=3, status='pending').
    const insertCall = state.calls.find((c) => c.table === "blockchain_sync_queue");
    expect(insertCall?.table).toBe("blockchain_sync_queue");
    expect(insertCall?.payload).toEqual({
      account_id: "acct-13",
      event_type: "dividend_declare",
      payload: { amount: 1000 },
      priority: 5,
      status: "pending",
      retry_count: 0,
      max_retries: 3,
    });

    expect(state.rpcCalls).toEqual([
      { name: "increment_pending_events", args: { p_account_id: "acct-13" } },
    ]);
  });

  it("[14] defaults priority to 0 when the caller omits it", async () => {
    state.insertSelectSingleResults.set("blockchain_sync_queue", {
      data: { id: "evt-1" },
      error: null,
    });
    await queueSyncEvent("acct-14", "mint", { to: "0x", amount: 1 });
    // .insert(...).select("id").single() flattens to a single capture whose
    // `op` reflects the final terminal ("insert-select-single"); the insert
    // payload was recorded on the same capture earlier in the chain.
    const insertCall = state.calls.find((c) => c.table === "blockchain_sync_queue");
    expect((insertCall?.payload as Record<string, unknown>).priority).toBe(0);
  });

  it("[15] swallows an RPC failure so the queue insert still reports success (pending counter is advisory)", async () => {
    state.insertSelectSingleResults.set("blockchain_sync_queue", {
      data: { id: "evt-99" },
      error: null,
    });
    state.rpcThrows = true;
    const out = await queueSyncEvent("acct-15", "burn", { amount: 10 });
    expect(out).toEqual({ ok: true, eventId: "evt-99" });
    expect(state.rpcCalls).toHaveLength(1);
  });
});

// ─── toggleSync ────────────────────────────────────────────────────────────

describe("toggleSync", () => {
  it("[16] action='enable' → newState='on' with syncEnabled=true", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await toggleSync("acct-16", "enable");
    expect(out).toEqual({ ok: true, newState: "on" });
    const payload = state.calls[0]?.payload as Record<string, unknown>;
    expect(payload.sync_enabled).toBe(true);
    expect(payload.sync_state).toBe("on");
  });

  it("[17] action='disable' → newState='off' with syncEnabled=false", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await toggleSync("acct-17", "disable");
    expect(out).toEqual({ ok: true, newState: "off" });
    const payload = state.calls[0]?.payload as Record<string, unknown>;
    expect(payload.sync_enabled).toBe(false);
    expect(payload.sync_state).toBe("off");
  });

  it("[18] action='pause' → newState='paused' with syncEnabled=false (queue keeps filling but nothing drains)", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await toggleSync("acct-18", "pause");
    expect(out).toEqual({ ok: true, newState: "paused" });
    const payload = state.calls[0]?.payload as Record<string, unknown>;
    expect(payload.sync_enabled).toBe(false);
    expect(payload.sync_state).toBe("paused");
  });

  it("[19] action='catch_up' → newState='catching_up' with syncEnabled=true", async () => {
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await toggleSync("acct-19", "catch_up");
    expect(out).toEqual({ ok: true, newState: "catching_up" });
    const payload = state.calls[0]?.payload as Record<string, unknown>;
    expect(payload.sync_enabled).toBe(true);
    expect(payload.sync_state).toBe("catching_up");
  });

  it("[20] propagates a failed upsert as {ok:false} while still reporting the intended newState", async () => {
    state.upsertResults.set("blockchain_sync_config", {
      data: null,
      error: { message: "boom" },
    });
    const out = await toggleSync("acct-20", "enable");
    expect(out).toEqual({ ok: false, newState: "on" });
  });
});

// ─── processSyncQueue ──────────────────────────────────────────────────────

function seedConfig(overrides: Partial<{
  syncEnabled: boolean;
  syncState: string;
  tokenAddress: string | null;
  pendingEvents: number;
}> = {}): void {
  state.maybeSingleResults.set("blockchain_sync_config", {
    data: {
      id: "cfg",
      account_id: "acct",
      sync_enabled: overrides.syncEnabled ?? true,
      sync_state: overrides.syncState ?? "on",
      // Use `in` — `??` would swap an explicit null with the default and hide
      // the "no token deployed yet" branch under test in [24].
      token_address: "tokenAddress" in overrides ? overrides.tokenAddress ?? null : "0xtoken",
      token_symbol: "EQT",
      token_name: "Equity",
      last_sync_at: null,
      last_sync_block: null,
      pending_events: overrides.pendingEvents ?? 0,
      auto_sync_transfers: false,
    },
    error: null,
  });
}

describe("processSyncQueue", () => {
  it("[21] returns all-zeroes when Supabase is not configured", async () => {
    state.adminConfigured = false;
    const out = await processSyncQueue("acct-21");
    expect(out).toEqual({ processed: 0, synced: 0, failed: 0, remaining: 0 });
  });

  it("[22] returns all-zeroes when no sync config exists for the account (never touches the queue)", async () => {
    state.maybeSingleResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await processSyncQueue("acct-22");
    expect(out).toEqual({ processed: 0, synced: 0, failed: 0, remaining: 0 });
    // Should only have queried the config table.
    expect(state.calls.filter((c) => c.table === "blockchain_sync_queue")).toHaveLength(0);
  });

  it("[23] no-ops when syncEnabled=false OR syncState='off' (paused config drains nothing)", async () => {
    seedConfig({ syncEnabled: false, syncState: "paused" });
    const out = await processSyncQueue("acct-23");
    expect(out).toEqual({ processed: 0, synced: 0, failed: 0, remaining: 0 });
    expect(state.calls.filter((c) => c.table === "blockchain_sync_queue")).toHaveLength(0);
  });

  it("[24] returns remaining=pendingEvents (surfacing backlog) when the config has no tokenAddress yet", async () => {
    seedConfig({ tokenAddress: null, pendingEvents: 3 });
    const out = await processSyncQueue("acct-24");
    expect(out).toEqual({ processed: 0, synced: 0, failed: 0, remaining: 3 });
    // Must not attempt to load the queue rows without a token.
    expect(state.calls.some((c) => c.op === "select" && c.table === "blockchain_sync_queue")).toBe(
      false,
    );
  });

  it("[25] transitions catching_up → on when the queue is empty on entry", async () => {
    seedConfig({ syncState: "catching_up" });
    state.selectResults.set("blockchain_sync_queue", { data: [], error: null });
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    const out = await processSyncQueue("acct-25");
    expect(out).toEqual({ processed: 0, synced: 0, failed: 0, remaining: 0 });
    // The upsert that flips the state to 'on' must have fired.
    const flipUpsert = state.calls.find(
      (c) =>
        c.op === "upsert" &&
        c.table === "blockchain_sync_config" &&
        (c.payload as Record<string, unknown>).sync_state === "on",
    );
    expect(flipUpsert).toBeDefined();
  });

  it("[26] processes a batch of pending events (marks them synced, updates lastSyncAt + pendingEvents)", async () => {
    seedConfig({ syncState: "on" });
    state.selectResults.set("blockchain_sync_queue", {
      data: [
        { id: "e1", account_id: "acct-26", event_type: "mint", payload: { to: "0x1", amount: 1 }, retry_count: 0, max_retries: 3 },
        { id: "e2", account_id: "acct-26", event_type: "transfer", payload: { from: "0x1", to: "0x2" }, retry_count: 0, max_retries: 3 },
      ],
      error: null,
    });
    state.updateResults.set("blockchain_sync_queue", { data: null, error: null });
    state.countResults.set("blockchain_sync_queue::pending", { count: 0, error: null });
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });

    const out = await processSyncQueue("acct-26");
    expect(out).toEqual({ processed: 2, synced: 2, failed: 0, remaining: 0 });

    // Every event must have been marked processing THEN synced (2 updates each).
    const updates = state.calls.filter(
      (c) => c.op === "update" && c.table === "blockchain_sync_queue",
    );
    expect(updates).toHaveLength(4);
    const syncedUpdates = updates.filter(
      (c) => (c.payload as Record<string, unknown>).status === "synced",
    );
    expect(syncedUpdates).toHaveLength(2);
    // Every "synced" update must carry a tx_hash + processed_at.
    for (const u of syncedUpdates) {
      const p = u.payload as Record<string, unknown>;
      expect(typeof p.tx_hash).toBe("string");
      expect((p.tx_hash as string).startsWith("0x")).toBe(true);
      expect(typeof p.processed_at).toBe("string");
    }

    // A final upsert must stamp lastSyncAt. Note that `pendingEvents` is
    // passed into upsertSyncConfig on this path but is silently dropped —
    // the helper's field-mapping switch has no `pendingEvents` case, so
    // the advisory counter never actually lands via this route. Pin that
    // drop-on-the-floor behaviour so a future edit that starts persisting
    // pending_events (which callers already expect) surfaces here.
    const finalUpsert = state.calls.findLast?.(
      (c) => c.op === "upsert" && c.table === "blockchain_sync_config",
    );
    expect(finalUpsert).toBeDefined();
    const p = finalUpsert!.payload as Record<string, unknown>;
    expect(typeof p.last_sync_at).toBe("string");
    expect(p).not.toHaveProperty("pending_events");
  });

  it("[27] treats a failed 'mark as synced' update as an event failure, retrying (not final-failing) when retry_count < max_retries", async () => {
    seedConfig({ syncState: "on" });
    state.selectResults.set("blockchain_sync_queue", {
      data: [
        { id: "e1", account_id: "acct-27", event_type: "mint", payload: {}, retry_count: 0, max_retries: 3 },
      ],
      error: null,
    });
    state.updateResults.set("blockchain_sync_queue", { data: null, error: null });
    state.countResults.set("blockchain_sync_queue::pending", { count: 1, error: null });
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    // Reject only the "mark as synced" update; the initial "mark as processing"
    // update passes because it has no tx_hash key.
    state.updateRejectPredicate = (_t, payload) => payload.status === "synced";

    const out = await processSyncQueue("acct-27");
    // processed=1 (one event walked the pipeline), synced=0 (its finalising
    // update rejected), failed=0 (retry_count 0→1, < max 3, so status returned
    // to 'pending' — NOT counted as failed).
    expect(out).toEqual({ processed: 1, synced: 0, failed: 0, remaining: 1 });

    // Walk the update calls: first processing (no status field or 'processing'),
    // then the reject, then a retry-write with status='pending' + retry_count=1.
    const updates = state.calls.filter(
      (c) => c.op === "update" && c.table === "blockchain_sync_queue",
    );
    const retryUpdate = updates.find(
      (c) => (c.payload as Record<string, unknown>).status === "pending",
    );
    expect(retryUpdate).toBeDefined();
    const p = retryUpdate!.payload as Record<string, unknown>;
    expect(p.retry_count).toBe(1);
    expect(typeof p.error_message).toBe("string");
  });

  it("[28] marks an event 'failed' (and counts it) once retry_count reaches max_retries", async () => {
    seedConfig({ syncState: "on" });
    state.selectResults.set("blockchain_sync_queue", {
      data: [
        // Already retried twice; the next failure pushes it to max_retries=3 → 'failed'.
        { id: "e1", account_id: "acct-28", event_type: "mint", payload: {}, retry_count: 2, max_retries: 3 },
      ],
      error: null,
    });
    state.updateResults.set("blockchain_sync_queue", { data: null, error: null });
    state.countResults.set("blockchain_sync_queue::pending", { count: 0, error: null });
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });
    state.updateRejectPredicate = (_t, payload) => payload.status === "synced";

    const out = await processSyncQueue("acct-28");
    expect(out).toEqual({ processed: 1, synced: 0, failed: 1, remaining: 0 });

    const updates = state.calls.filter(
      (c) => c.op === "update" && c.table === "blockchain_sync_queue",
    );
    const failUpdate = updates.find(
      (c) => (c.payload as Record<string, unknown>).status === "failed",
    );
    expect(failUpdate).toBeDefined();
    expect((failUpdate!.payload as Record<string, unknown>).retry_count).toBe(3);
  });

  it("[29] transitions catching_up → on once the queue is fully drained (post-processing count===0)", async () => {
    seedConfig({ syncState: "catching_up" });
    state.selectResults.set("blockchain_sync_queue", {
      data: [
        { id: "e1", account_id: "acct-29", event_type: "mint", payload: {}, retry_count: 0, max_retries: 3 },
      ],
      error: null,
    });
    state.updateResults.set("blockchain_sync_queue", { data: null, error: null });
    state.countResults.set("blockchain_sync_queue::pending", { count: 0, error: null });
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });

    const out = await processSyncQueue("acct-29");
    expect(out.synced).toBe(1);

    // At least two upserts: (a) the lastSyncAt + pendingEvents stamp, (b) the
    // syncState → 'on' flip (fired only when catching_up AND count===0).
    const flip = state.calls.find(
      (c) =>
        c.op === "upsert" &&
        c.table === "blockchain_sync_config" &&
        (c.payload as Record<string, unknown>).sync_state === "on",
    );
    expect(flip).toBeDefined();
  });

  it("[30] orders the queue pull by priority DESC then created_at ASC and limits to 20 (batch size)", async () => {
    seedConfig({ syncState: "on" });
    state.selectResults.set("blockchain_sync_queue", { data: [], error: null });
    state.upsertResults.set("blockchain_sync_config", { data: null, error: null });

    await processSyncQueue("acct-30");
    const queueSelect = state.calls.find(
      (c) => c.op === "select" && c.table === "blockchain_sync_queue",
    );
    expect(queueSelect).toBeDefined();
    expect(queueSelect?.order).toEqual([
      { col: "priority", ascending: false },
      { col: "created_at", ascending: true },
    ]);
    expect(queueSelect?.limit).toBe(20);
    // The eq chain must scope to this account and status=pending.
    expect(queueSelect?.eq).toEqual(
      expect.arrayContaining([
        { col: "account_id", val: "acct-30" },
        { col: "status", val: "pending" },
      ]),
    );
  });
});

// ─── getSyncQueueStatus ────────────────────────────────────────────────────

describe("getSyncQueueStatus", () => {
  it("[31] returns an empty snapshot when Supabase is not configured", async () => {
    state.adminConfigured = false;
    const out = await getSyncQueueStatus("acct-31");
    expect(out).toEqual({ pending: 0, synced: 0, failed: 0, recentEvents: [] });
  });

  it("[32] returns per-status counts + recent events (limit 10, ordered by created_at DESC)", async () => {
    state.countResults.set("blockchain_sync_queue::pending", { count: 4, error: null });
    state.countResults.set("blockchain_sync_queue::synced", { count: 12, error: null });
    state.countResults.set("blockchain_sync_queue::failed", { count: 1, error: null });
    const recent = [
      { id: "r1", account_id: "acct-32", event_type: "mint", payload: {}, priority: 0, status: "synced", tx_hash: null, error_message: null, retry_count: 0, max_retries: 3, created_at: "2026-08-01T00:00:00Z", processed_at: null },
    ];
    state.selectResults.set("blockchain_sync_queue", { data: recent, error: null });

    const out = await getSyncQueueStatus("acct-32");
    expect(out.pending).toBe(4);
    expect(out.synced).toBe(12);
    expect(out.failed).toBe(1);
    expect(out.recentEvents).toEqual(recent);

    // Verify the recent-events select shape: order by created_at DESC, limit 10.
    const recentSelect = state.calls.find(
      (c) => c.op === "select" && c.table === "blockchain_sync_queue",
    );
    expect(recentSelect?.order).toEqual([{ col: "created_at", ascending: false }]);
    expect(recentSelect?.limit).toBe(10);
  });

  it("[33] coalesces missing counts and missing recent-events data to safe defaults (0 / [])", async () => {
    // No countResults / selectResults seeded — the fake defaults to
    // {count:0} and {data:[]}, mirroring an empty-table read.
    const out = await getSyncQueueStatus("acct-33");
    expect(out).toEqual({ pending: 0, synced: 0, failed: 0, recentEvents: [] });
  });
});
