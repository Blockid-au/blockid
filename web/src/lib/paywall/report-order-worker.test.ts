/**
 * report-order-worker.test.ts — queue-drain worker.
 *
 * Colocated per Stage 3 Batch A sub-task A2. Covers the three critical
 * branches:
 *   1. Success — queue row lands 'done', report_orders → READY.
 *   2. Transient retry — queue row goes back to 'queued', retry_count++.
 *   3. Permanent fail — queue row lands 'failed', report_orders → FAILED.
 *
 * Uses a hand-rolled Supabase double so the tests never touch a real
 * database or the `@supabase/supabase-js` builder chain. The double
 * records every `update()` call keyed by table so assertions can
 * inspect the resulting patch payload directly.
 */

import { describe, it, expect, vi } from "vitest";
import {
  processNextQueuedOrder,
  MAX_RETRIES,
  type MinimalSupabase,
  type QueueRow,
  type GenerateResult,
} from "./report-order-worker";

// ─────────────────────────────────────────────────────────────────────────────
// Test double — a Supabase-shaped mock that records writes per table
// ─────────────────────────────────────────────────────────────────────────────

interface UpdateCall {
  patch: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
}

interface FakeState {
  queueRow: QueueRow | null;
  updates: Record<string, UpdateCall[]>;
  claimSelectReturnsRow?: boolean;
}

function makeSupabase(state: FakeState): MinimalSupabase {
  return {
    from(table: string) {
      const updatesForTable = (state.updates[table] ??= []);
      return {
        select(_cols: string) {
          // The worker only uses select() on the queue table.
          const chain = {
            eq(_col: string, _val: unknown) {
              return {
                order(_c: string, _o: { ascending: boolean }) {
                  return {
                    limit(_n: number) {
                      return {
                        async maybeSingle() {
                          return { data: state.queueRow, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          const call: UpdateCall = { patch, filters: [] };
          updatesForTable.push(call);
          const builder = {
            eq(col: string, val: unknown) {
              call.filters.push({ col, val });
              return {
                eq(col2: string, val2: unknown) {
                  call.filters.push({ col: col2, val: val2 });
                  return {
                    select(_cols: string) {
                      return {
                        async maybeSingle() {
                          // Simulate the guarded claim UPDATE — the
                          // caller wants to know whether a row was
                          // claimed. When `claimSelectReturnsRow` is
                          // undefined we default to `true` (row won).
                          const won =
                            state.claimSelectReturnsRow !== false;
                          return {
                            data: won ? { id: "queue-1" } : null,
                            error: null,
                          };
                        },
                      };
                    },
                    then(res: (v: unknown) => unknown) {
                      // Fallback: single-eq update chain (no select).
                      return res({ data: null, error: null });
                    },
                  };
                },
                select(_cols: string) {
                  return {
                    async maybeSingle() {
                      return { data: { id: "x" }, error: null };
                    },
                  };
                },
                // Awaitable path — some update chains are awaited
                // without a trailing .select(); promisify the builder
                // so `await patch.eq(...)` resolves cleanly.
                then(res: (v: unknown) => unknown) {
                  return res({ data: null, error: null });
                },
              };
            },
          };
          return builder as never;
        },
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────────────────────

function queuedRow(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: "queue-1",
    order_id: "order-1",
    business_id: "biz-1",
    status: "queued",
    retry_count: 0,
    enqueued_at: "2026-07-30T00:00:00Z",
    started_at: null,
    finished_at: null,
    error_reason: null,
    ...overrides,
  };
}

const FIXED_NOW = new Date("2026-07-30T12:34:56.000Z");
const now = () => FIXED_NOW;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("processNextQueuedOrder — empty queue", () => {
  it("returns { processed: false } when no queued row exists", async () => {
    const state: FakeState = { queueRow: null, updates: {} };
    const supabase = makeSupabase(state);
    const gen = vi.fn<() => Promise<GenerateResult>>();

    const out = await processNextQueuedOrder({
      supabase,
      generateReport: gen,
      now,
    });

    expect(out).toEqual({ processed: false });
    expect(gen).not.toHaveBeenCalled();
    // The `from(table)` call in the double lazily initialises the array,
    // so we assert on length rather than existence.
    expect(state.updates.report_generation_queue ?? []).toEqual([]);
  });

  it("returns { processed: false } when supabase is unavailable", async () => {
    const gen = vi.fn();
    // Pass `null` as supabase and stub getSupabaseAdmin implicitly by
    // leaving the module-level singleton alone — the worker checks
    // truthiness and short-circuits.
    const out = await processNextQueuedOrder({
      supabase: null as unknown as MinimalSupabase,
      generateReport: gen as unknown as (args: {
        orderId: string;
        businessId: string;
      }) => Promise<GenerateResult>,
      now,
    });

    // Depending on runtime env the fallback may fetch getSupabaseAdmin()
    // — accept either 'processed: false' outcome (empty queue or no-db).
    expect(out.processed).toBe(false);
  });
});

describe("processNextQueuedOrder — success path", () => {
  it("marks queue done and advances report_orders to READY", async () => {
    const state: FakeState = { queueRow: queuedRow(), updates: {} };
    const supabase = makeSupabase(state);
    const gen = vi
      .fn<() => Promise<GenerateResult>>()
      .mockResolvedValue({ ok: true, reportId: "rpt-abc" });

    const out = await processNextQueuedOrder({
      supabase,
      generateReport: gen as unknown as (args: {
        orderId: string;
        businessId: string;
      }) => Promise<GenerateResult>,
      now,
    });

    expect(gen).toHaveBeenCalledWith({
      orderId: "order-1",
      businessId: "biz-1",
    });
    expect(out).toEqual({
      processed: true,
      orderId: "order-1",
      status: "done",
    });

    // Assert the claim UPDATE + the terminal "done" UPDATE both ran.
    const queueWrites = state.updates.report_generation_queue ?? [];
    expect(queueWrites.length).toBeGreaterThanOrEqual(2);
    expect(queueWrites[0]?.patch).toMatchObject({ status: "running" });
    const doneWrite = queueWrites.find((w) => w.patch.status === "done");
    expect(doneWrite).toBeDefined();
    expect(doneWrite?.patch).toMatchObject({
      status: "done",
      finished_at: FIXED_NOW.toISOString(),
      error_reason: null,
    });

    // report_orders should land on READY via nextState(GENERATING, generation_succeeded).
    const orderWrites = state.updates.report_orders ?? [];
    expect(orderWrites).toHaveLength(1);
    expect(orderWrites[0]?.patch).toMatchObject({
      status: "READY",
      report_id: "rpt-abc",
      generated_at: FIXED_NOW.toISOString(),
    });
    expect(orderWrites[0]?.filters).toEqual([
      { col: "id", val: "order-1" },
    ]);
  });
});

describe("processNextQueuedOrder — transient retry path", () => {
  it("re-queues with retry_count+1 when generator returns transient failure", async () => {
    const state: FakeState = {
      queueRow: queuedRow({ retry_count: 1 }),
      updates: {},
    };
    const supabase = makeSupabase(state);
    const gen = vi.fn<() => Promise<GenerateResult>>().mockResolvedValue({
      ok: false,
      transient: true,
      reason: "AI timeout",
    });

    const out = await processNextQueuedOrder({
      supabase,
      generateReport: gen as unknown as (args: {
        orderId: string;
        businessId: string;
      }) => Promise<GenerateResult>,
      now,
    });

    expect(out).toEqual({
      processed: true,
      orderId: "order-1",
      status: "requeued",
      reason: "AI timeout",
    });

    const queueWrites = state.updates.report_generation_queue ?? [];
    const requeueWrite = queueWrites.find(
      (w) => w.patch.status === "queued" && w.patch.retry_count === 2,
    );
    expect(requeueWrite).toBeDefined();
    expect(requeueWrite?.patch).toMatchObject({
      status: "queued",
      started_at: null,
      retry_count: 2,
      error_reason: "AI timeout",
    });

    // report_orders must NOT transition on a retry — it stays PAID/GENERATING.
    expect(state.updates.report_orders).toBeUndefined();
  });

  it("also treats thrown exceptions as transient (bounded by MAX_RETRIES)", async () => {
    const state: FakeState = {
      queueRow: queuedRow({ retry_count: 0 }),
      updates: {},
    };
    const supabase = makeSupabase(state);
    const gen = vi.fn().mockRejectedValue(new Error("network blip"));

    const out = await processNextQueuedOrder({
      supabase,
      generateReport: gen as unknown as (args: {
        orderId: string;
        businessId: string;
      }) => Promise<GenerateResult>,
      now,
    });

    expect(out.status).toBe("requeued");
    expect(out.reason).toBe("network blip");
  });
});

describe("processNextQueuedOrder — permanent fail path", () => {
  it("marks queue failed once retry_count reaches MAX_RETRIES", async () => {
    const state: FakeState = {
      queueRow: queuedRow({ retry_count: MAX_RETRIES - 1 }),
      updates: {},
    };
    const supabase = makeSupabase(state);
    const gen = vi.fn<() => Promise<GenerateResult>>().mockResolvedValue({
      ok: false,
      transient: true,
      reason: "still timing out",
    });

    const out = await processNextQueuedOrder({
      supabase,
      generateReport: gen as unknown as (args: {
        orderId: string;
        businessId: string;
      }) => Promise<GenerateResult>,
      now,
    });

    expect(out).toEqual({
      processed: true,
      orderId: "order-1",
      status: "failed",
      reason: "still timing out",
    });

    const queueWrites = state.updates.report_generation_queue ?? [];
    const failedWrite = queueWrites.find((w) => w.patch.status === "failed");
    expect(failedWrite).toBeDefined();
    expect(failedWrite?.patch).toMatchObject({
      status: "failed",
      retry_count: MAX_RETRIES,
      error_reason: "still timing out",
      finished_at: FIXED_NOW.toISOString(),
    });

    // report_orders should transition GENERATING → FAILED.
    const orderWrites = state.updates.report_orders ?? [];
    expect(orderWrites).toHaveLength(1);
    expect(orderWrites[0]?.patch).toMatchObject({
      status: "FAILED",
      failure_reason: "still timing out",
      retry_count: MAX_RETRIES,
    });
  });

  it("marks queue failed immediately when generator flags transient:false", async () => {
    const state: FakeState = { queueRow: queuedRow(), updates: {} };
    const supabase = makeSupabase(state);
    const gen = vi.fn<() => Promise<GenerateResult>>().mockResolvedValue({
      ok: false,
      transient: false,
      reason: "invalid business_id",
    });

    const out = await processNextQueuedOrder({
      supabase,
      generateReport: gen as unknown as (args: {
        orderId: string;
        businessId: string;
      }) => Promise<GenerateResult>,
      now,
    });

    expect(out.status).toBe("failed");
    expect(out.reason).toBe("invalid business_id");

    const queueWrites = state.updates.report_generation_queue ?? [];
    const failedWrite = queueWrites.find((w) => w.patch.status === "failed");
    expect(failedWrite?.patch.retry_count).toBe(1);

    const orderWrites = state.updates.report_orders ?? [];
    expect(orderWrites[0]?.patch.status).toBe("FAILED");
  });

  it("truncates a huge error_reason to stay under 500 chars", async () => {
    const huge = "x".repeat(2000);
    const state: FakeState = { queueRow: queuedRow(), updates: {} };
    const supabase = makeSupabase(state);
    const gen = vi.fn<() => Promise<GenerateResult>>().mockResolvedValue({
      ok: false,
      transient: false,
      reason: huge,
    });

    await processNextQueuedOrder({
      supabase,
      generateReport: gen as unknown as (args: {
        orderId: string;
        businessId: string;
      }) => Promise<GenerateResult>,
      now,
    });

    const queueWrites = state.updates.report_generation_queue ?? [];
    const failedWrite = queueWrites.find((w) => w.patch.status === "failed");
    const reason = failedWrite?.patch.error_reason as string;
    expect(reason.length).toBeLessThanOrEqual(500);
  });
});
