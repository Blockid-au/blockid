/**
 * report-order-worker.test.ts — queue-drain worker.
 *
 * Colocated per Stage 3 Batch A sub-task A2. Covers:
 *   1. Success — queue row lands 'done', report_orders → READY.
 *   2. Transient retry — queue row goes back to 'queued', retry_count++.
 *   3. Permanent fail — queue row lands 'failed', report_orders → FAILED
 *      (+ §8.8 refund hook).
 *   4. O08 lease — atomic claim (race), heartbeat, reclaim after expiry,
 *      attempt cap → FAILED + refund, stale worker's late write rejected,
 *      and graceful fallback while migration 0472 is not applied.
 *
 * Uses the in-memory FakeQueueDb (report-queue.fixture.ts): filters are
 * evaluated against real rows, so a guard that no longer matches writes
 * zero rows exactly as Postgres would.
 */

import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  processNextQueuedOrder,
  reclaimExpiredOrders,
  isLeaseExpired,
  __resetLeaseModeForTests,
  MAX_RETRIES,
  LEASE_EXPIRY_MS,
  LEASE_REPROBE_MS,
  RECLAIM_MIN_AGE_MS,
  RECLAIM_HARD_CEILING_MS,
  type MinimalSupabase,
  type GenerateResult,
  type GenerateInput,
} from "./report-order-worker";
import { FakeQueueDb, orderRow, queueRow, type FakeRow } from "./report-queue.fixture";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_NOW = new Date("2026-07-30T12:34:56.000Z");
const now = () => FIXED_NOW;

type Gen = (input: GenerateInput) => Promise<GenerateResult>;
type RefundFn = (input: { orderId: string; reason: string }) => Promise<void>;

function seed(queue: FakeRow | null = queueRow(), order: FakeRow | null = orderRow()): FakeQueueDb {
  return new FakeQueueDb({
    report_generation_queue: queue ? [queue] : [],
    report_orders: order ? [order] : [],
  });
}

function genOk(reportId = "rpt-abc") {
  return vi.fn<Gen>().mockResolvedValue({ ok: true, reportId });
}

function genFail(transient: boolean, reason: string) {
  return vi.fn<Gen>().mockResolvedValue({ ok: false, transient, reason });
}

/** A clock the test can move. */
function clock(start: Date = FIXED_NOW) {
  let t = start.getTime();
  return {
    now: () => new Date(t),
    advance(ms: number) {
      t += ms;
    },
    iso: () => new Date(t).toISOString(),
  };
}

const minutes = (n: number) => n * 60_000;
const ago = (ms: number) => new Date(FIXED_NOW.getTime() - ms).toISOString();

beforeEach(() => {
  __resetLeaseModeForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-O08 behaviour (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

describe("processNextQueuedOrder — empty queue", () => {
  it("returns { processed: false } when no queued row exists", async () => {
    const db = seed(null);
    const gen = vi.fn<Gen>();

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(out).toEqual({ processed: false });
    expect(gen).not.toHaveBeenCalled();
    expect(db.updatesFor("report_generation_queue")).toEqual([]);
  });

  it("returns { processed: false } when supabase is unavailable", async () => {
    const gen = vi.fn<Gen>();
    const out = await processNextQueuedOrder({
      supabase: null as unknown as MinimalSupabase,
      generateReport: gen,
      now,
    });
    // Depending on runtime env the fallback may fetch getSupabaseAdmin()
    // — accept either 'processed: false' outcome (empty queue or no-db).
    expect(out.processed).toBe(false);
  });
});

describe("processNextQueuedOrder — success path", () => {
  it("marks queue done and advances report_orders to READY", async () => {
    const db = seed();
    const gen = genOk();

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(gen).toHaveBeenCalledWith({ orderId: "order-1", businessId: "biz-1" });
    expect(out).toEqual({ processed: true, orderId: "order-1", status: "done" });

    const queueWrites = db.updatesFor("report_generation_queue");
    expect(queueWrites.length).toBeGreaterThanOrEqual(2);
    expect(queueWrites[0]?.patch).toMatchObject({ status: "running" });
    const doneWrite = queueWrites.find((w) => w.patch.status === "done");
    expect(doneWrite?.patch).toMatchObject({
      status: "done",
      finished_at: FIXED_NOW.toISOString(),
      error_reason: null,
    });
    expect(doneWrite?.matched).toBe(1);

    const orderWrites = db.updatesFor("report_orders");
    expect(orderWrites).toHaveLength(1);
    expect(orderWrites[0]?.patch).toMatchObject({
      status: "READY",
      report_id: "rpt-abc",
      generated_at: FIXED_NOW.toISOString(),
    });
    expect(orderWrites[0]?.filters).toEqual([{ col: "id", val: "order-1" }]);
    expect(db.row("report_orders", "order-1")?.status).toBe("READY");
  });
});

describe("processNextQueuedOrder — transient retry path", () => {
  it("re-queues with retry_count+1 when generator returns transient failure", async () => {
    const db = seed(queueRow({ retry_count: 1, attempts: 1 }));
    const gen = genFail(true, "AI timeout");

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(out).toEqual({
      processed: true,
      orderId: "order-1",
      status: "requeued",
      reason: "AI timeout",
    });

    const requeueWrite = db
      .updatesFor("report_generation_queue")
      .find((w) => w.patch.status === "queued" && w.patch.retry_count === 2);
    expect(requeueWrite?.patch).toMatchObject({
      status: "queued",
      started_at: null,
      retry_count: 2,
      error_reason: "AI timeout",
      claim_token: null,
      heartbeat_at: null,
    });
    // The row is claimable again, with the claim counted.
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "queued", attempts: 2 });

    // report_orders must NOT transition on a retry — it stays PAID.
    expect(db.updates.report_orders).toBeUndefined();
  });

  it("also treats thrown exceptions as transient (bounded by MAX_RETRIES)", async () => {
    const db = seed();
    const gen = vi.fn<Gen>().mockRejectedValue(new Error("network blip"));

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(out.status).toBe("requeued");
    expect(out.reason).toBe("network blip");
  });
});

describe("processNextQueuedOrder — permanent fail path", () => {
  it("marks queue failed once retry_count reaches MAX_RETRIES", async () => {
    const db = seed(queueRow({ retry_count: MAX_RETRIES - 1, attempts: MAX_RETRIES - 1 }));
    const gen = genFail(true, "still timing out");

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(out).toEqual({
      processed: true,
      orderId: "order-1",
      status: "failed",
      reason: "still timing out",
    });

    const failedWrite = db.updatesFor("report_generation_queue").find((w) => w.patch.status === "failed");
    expect(failedWrite?.patch).toMatchObject({
      status: "failed",
      retry_count: MAX_RETRIES,
      error_reason: "still timing out",
      finished_at: FIXED_NOW.toISOString(),
    });

    const orderWrites = db.updatesFor("report_orders");
    expect(orderWrites).toHaveLength(1);
    expect(orderWrites[0]?.patch).toMatchObject({
      status: "FAILED",
      failure_reason: "still timing out",
      retry_count: MAX_RETRIES,
    });
  });

  it("marks queue failed immediately when generator flags transient:false", async () => {
    const db = seed();
    const gen = genFail(false, "invalid business_id");

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(out.status).toBe("failed");
    expect(out.reason).toBe("invalid business_id");
    const failedWrite = db.updatesFor("report_generation_queue").find((w) => w.patch.status === "failed");
    expect(failedWrite?.patch.retry_count).toBe(1);
    expect(db.updatesFor("report_orders")[0]?.patch.status).toBe("FAILED");
  });

  it("invokes the refund hook once the order is FAILED (§8.8)", async () => {
    const db = seed(queueRow({ retry_count: MAX_RETRIES - 1 }));
    const gen = genFail(true, "still timing out");
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, refundOrder, now });

    expect(refundOrder).toHaveBeenCalledTimes(1);
    expect(refundOrder).toHaveBeenCalledWith({ orderId: "order-1", reason: "still timing out" });
    expect(out.status).toBe("failed");
    expect(out.refunded).toBe(true);
    // The refund must run AFTER report_orders lands on FAILED.
    expect(db.updatesFor("report_orders")[0]?.patch.status).toBe("FAILED");
  });

  it("keeps the order FAILED (not thrown) when the refund hook rejects", async () => {
    const db = seed();
    const gen = genFail(false, "invalid business_id");
    const refundOrder = vi.fn<RefundFn>().mockRejectedValue(new Error("stripe down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, refundOrder, now });

    expect(out.status).toBe("failed");
    expect(out.refunded).toBe(false);
    expect(db.updatesFor("report_orders")[0]?.patch.status).toBe("FAILED");
  });

  it("does NOT refund on a transient retry — the order is still in flight", async () => {
    const db = seed();
    const gen = genFail(true, "AI timeout");
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, refundOrder, now });

    expect(out.status).toBe("requeued");
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it("does NOT refund on the success path", async () => {
    const db = seed();
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);

    await processNextQueuedOrder({ supabase: db.client(), generateReport: genOk(), refundOrder, now });

    expect(refundOrder).not.toHaveBeenCalled();
  });

  it("truncates a huge error_reason to stay under 500 chars", async () => {
    const db = seed();
    const gen = genFail(false, "x".repeat(2000));

    await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    const failedWrite = db.updatesFor("report_generation_queue").find((w) => w.patch.status === "failed");
    expect((failedWrite?.patch.error_reason as string).length).toBeLessThanOrEqual(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O08 — lease: claim, heartbeat, fencing
// ─────────────────────────────────────────────────────────────────────────────

describe("O08 lease — atomic claim", () => {
  it("stamps claim token, claim time, heartbeat and attempts+1 in one conditional update", async () => {
    const db = seed(queueRow({ attempts: 1, retry_count: 1 }));
    let seen: FakeRow | undefined;
    const gen = vi.fn<Gen>().mockImplementation(async () => {
      seen = { ...db.row("report_generation_queue", "queue-1") };
      return { ok: true, reportId: "rpt-abc" };
    });

    await processNextQueuedOrder({
      supabase: db.client(),
      generateReport: gen,
      now,
      newClaimToken: () => "tok-A",
    });

    expect(seen).toMatchObject({
      status: "running",
      claim_token: "tok-A",
      attempts: 2,
      started_at: FIXED_NOW.toISOString(),
      heartbeat_at: FIXED_NOW.toISOString(),
    });
    const claimWrite = db.updatesFor("report_generation_queue")[0];
    expect(claimWrite?.filters).toEqual([
      { col: "id", val: "queue-1" },
      { col: "status", val: "queued" },
      { col: "attempts", val: 1 },
    ]);
    // The terminal write is fenced on the token.
    const doneWrite = db.updatesFor("report_generation_queue").find((w) => w.patch.status === "done");
    expect(doneWrite?.filters).toEqual([
      { col: "id", val: "queue-1" },
      { col: "status", val: "running" },
      { col: "claim_token", val: "tok-A" },
    ]);
  });

  it("claim race: a worker whose conditional update loses never runs the generator", async () => {
    const db = seed();
    // Another worker claims the row between our SELECT and our UPDATE.
    let raced = false;
    db.beforeUpdate = (table, patch) => {
      if (raced || table !== "report_generation_queue" || patch.status !== "running") return;
      raced = true;
      Object.assign(db.row("report_generation_queue", "queue-1")!, {
        status: "running",
        attempts: 1,
        claim_token: "tok-OTHER",
      });
    };
    const gen = vi.fn<Gen>();

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(out).toEqual({ processed: false });
    expect(gen).not.toHaveBeenCalled();
    expect(db.updatesFor("report_generation_queue")[0]?.matched).toBe(0);
    expect(db.row("report_generation_queue", "queue-1")?.claim_token).toBe("tok-OTHER");
  });

  it("claim race: two concurrent workers → exactly one generates, one READY write", async () => {
    const db = seed();
    const gen = genOk();
    let n = 0;
    const deps = {
      supabase: db.client(),
      generateReport: gen,
      now,
      newClaimToken: () => `tok-${(n += 1)}`,
    };

    const [a, b] = await Promise.all([processNextQueuedOrder(deps), processNextQueuedOrder(deps)]);

    expect(gen).toHaveBeenCalledTimes(1);
    expect([a.processed, b.processed].sort()).toEqual([false, true]);
    expect(db.updatesFor("report_orders")).toHaveLength(1);
    expect(db.row("report_generation_queue", "queue-1")?.attempts).toBe(1);
  });

  it("falls through to the next oldest queued row after losing the first", async () => {
    const db = new FakeQueueDb({
      report_generation_queue: [
        queueRow({ id: "q-old", order_id: "order-old", enqueued_at: "2026-07-30T00:00:00Z" }),
        queueRow({ id: "q-new", order_id: "order-new", enqueued_at: "2026-07-30T01:00:00Z" }),
      ],
      report_orders: [orderRow({ id: "order-old" }), orderRow({ id: "order-new" })],
    });
    let raced = false;
    db.beforeUpdate = (table, patch) => {
      if (raced || table !== "report_generation_queue" || patch.status !== "running") return;
      raced = true;
      Object.assign(db.row("report_generation_queue", "q-old")!, { status: "running", attempts: 1, claim_token: "x" });
    };
    const gen = genOk();

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now });

    expect(out.orderId).toBe("order-new");
    expect(gen).toHaveBeenCalledWith({ orderId: "order-new", businessId: "biz-1" });
  });
});

describe("O08 lease — heartbeat", () => {
  it("refreshes heartbeat_at (fenced on the token) while the generator runs, and stops after", async () => {
    const db = seed();
    const c = clock();
    const gen = vi.fn<Gen>().mockImplementation(async () => {
      for (let i = 0; i < 6; i += 1) {
        c.advance(1_000);
        await new Promise((r) => setTimeout(r, 10));
      }
      return { ok: true, reportId: "rpt-abc" };
    });

    await processNextQueuedOrder({
      supabase: db.client(),
      generateReport: gen,
      now: c.now,
      heartbeatEveryMs: 5,
      newClaimToken: () => "tok-A",
    });

    const beats = () => db.updatesFor("report_generation_queue").filter((w) => "heartbeat_at" in w.patch && !("status" in w.patch));
    const during = beats().length;
    expect(during).toBeGreaterThan(0);
    expect(beats()[0]?.filters).toEqual([
      { col: "id", val: "queue-1" },
      { col: "status", val: "running" },
      { col: "claim_token", val: "tok-A" },
    ]);
    // heartbeat_at moved past the claim time.
    const claimedAt = FIXED_NOW.getTime();
    expect(Date.parse(String(db.row("report_generation_queue", "queue-1")?.heartbeat_at))).toBeGreaterThan(claimedAt);

    // Interval cleared in `finally` — no beats after the run.
    await new Promise((r) => setTimeout(r, 40));
    expect(beats().length).toBe(during);
  });

  it("stops the interval even when the generator throws", async () => {
    const db = seed();
    const gen = vi.fn<Gen>().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      throw new Error("boom");
    });

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now, heartbeatEveryMs: 5 });
    expect(out.status).toBe("requeued");

    const count = db.updatesFor("report_generation_queue").length;
    await new Promise((r) => setTimeout(r, 40));
    expect(db.updatesFor("report_generation_queue").length).toBe(count);
  });
});

describe("O08 lease — stale worker write rejected", () => {
  it("a worker reclaimed mid-run cannot deliver: its late READY is discarded", async () => {
    const db = seed();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const c = clock();
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);

    // Worker A claims, then its origin "freezes" for 20 min. Meanwhile the
    // drain sweep reclaims and worker B claims + delivers.
    const genA = vi.fn<Gen>().mockImplementation(async () => {
      c.advance(minutes(20));
      const sweep = await reclaimExpiredOrders({ supabase: db.client(), now: c.now, refundOrder });
      expect(sweep.reclaimed.map((r) => r.action)).toEqual(["requeued"]);
      const b = await processNextQueuedOrder({
        supabase: db.client(),
        generateReport: genOk("rpt-B"),
        now: c.now,
        newClaimToken: () => "tok-B",
      });
      expect(b.status).toBe("done");
      return { ok: true, reportId: "rpt-A" };
    });

    const a = await processNextQueuedOrder({
      supabase: db.client(),
      generateReport: genA,
      now: c.now,
      newClaimToken: () => "tok-A",
    });

    expect(a).toEqual({ processed: true, orderId: "order-1", status: "stale", reason: "lease_lost" });
    // Exactly one delivery — B's.
    const orderWrites = db.updatesFor("report_orders");
    expect(orderWrites).toHaveLength(1);
    expect(orderWrites[0]?.patch.report_id).toBe("rpt-B");
    expect(db.row("report_orders", "order-1")).toMatchObject({ status: "READY", report_id: "rpt-B" });
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "done", claim_token: "tok-B", attempts: 2 });
    expect(refundOrder).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("a reclaimed worker's late permanent failure neither fails nor refunds the order", async () => {
    const db = seed();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);
    const gen = vi.fn<Gen>().mockImplementation(async () => {
      // Someone else now holds the lease.
      Object.assign(db.row("report_generation_queue", "queue-1")!, { claim_token: "tok-NEW", attempts: 2 });
      return { ok: false, transient: false, reason: "bad input" };
    });

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, refundOrder, now });

    expect(out.status).toBe("stale");
    expect(db.updates.report_orders).toBeUndefined();
    expect(refundOrder).not.toHaveBeenCalled();
    expect(db.row("report_generation_queue", "queue-1")?.status).toBe("running");
  });

  it("the heartbeat notices a lost lease and stops beating", async () => {
    const db = seed();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const gen = vi.fn<Gen>().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 12));
      Object.assign(db.row("report_generation_queue", "queue-1")!, { claim_token: "tok-NEW" });
      await new Promise((r) => setTimeout(r, 40));
      return { ok: true, reportId: "rpt-A" };
    });

    const out = await processNextQueuedOrder({
      supabase: db.client(),
      generateReport: gen,
      now,
      heartbeatEveryMs: 5,
      newClaimToken: () => "tok-A",
    });

    expect(out.status).toBe("stale");
    const beats = db.updatesFor("report_generation_queue").filter((w) => "heartbeat_at" in w.patch && !("status" in w.patch));
    // Exactly one zero-row beat after the takeover, then silence.
    expect(beats.filter((b) => b.matched === 0)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O08 — reclaim sweep
// ─────────────────────────────────────────────────────────────────────────────

describe("isLeaseExpired", () => {
  const base = { status: "running" as const };

  it("never reclaims a claim younger than the pipeline budget window", () => {
    expect(isLeaseExpired({ ...base, started_at: ago(RECLAIM_MIN_AGE_MS - 1), heartbeat_at: null }, FIXED_NOW)).toBe(false);
  });

  it("keeps an old claim whose heartbeat is fresh", () => {
    expect(isLeaseExpired({ ...base, started_at: ago(minutes(30)), heartbeat_at: ago(minutes(1)) }, FIXED_NOW)).toBe(false);
  });

  it("expires an old claim with no heartbeat for longer than the lease", () => {
    expect(isLeaseExpired({ ...base, started_at: ago(minutes(30)), heartbeat_at: ago(LEASE_EXPIRY_MS + 1) }, FIXED_NOW)).toBe(true);
  });

  it("expires a legacy claim (no heartbeat column value) on age alone", () => {
    expect(isLeaseExpired({ ...base, started_at: ago(minutes(16)), heartbeat_at: null }, FIXED_NOW)).toBe(true);
    expect(isLeaseExpired({ ...base, started_at: null, heartbeat_at: null }, FIXED_NOW)).toBe(true);
  });

  it("expires a still-heartbeating claim past the hard ceiling", () => {
    expect(isLeaseExpired({ ...base, started_at: ago(RECLAIM_HARD_CEILING_MS), heartbeat_at: ago(1_000) }, FIXED_NOW)).toBe(true);
  });

  it("ignores rows that are not running", () => {
    expect(isLeaseExpired({ status: "queued", started_at: null, heartbeat_at: null }, FIXED_NOW)).toBe(false);
  });
});

function expiredRunning(overrides: FakeRow = {}): FakeRow {
  return queueRow({
    status: "running",
    started_at: ago(minutes(20)),
    heartbeat_at: ago(minutes(12)),
    claim_token: "tok-DEAD",
    attempts: 1,
    retry_count: 0,
    ...overrides,
  });
}

describe("reclaimExpiredOrders", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("re-queues an expired lease and the next claim retries it", async () => {
    const db = seed(expiredRunning());
    const refundOrder = vi.fn<RefundFn>();

    const res = await reclaimExpiredOrders({ supabase: db.client(), now, refundOrder });

    expect(res.checked).toBe(1);
    expect(res.reclaimed).toEqual([
      expect.objectContaining({ orderId: "order-1", action: "requeued", attempts: 1 }),
    ]);
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({
      status: "queued",
      started_at: null,
      heartbeat_at: null,
      claim_token: null,
      retry_count: 1,
      attempts: 1,
    });
    expect(String(db.row("report_generation_queue", "queue-1")?.error_reason)).toMatch(/^worker_lost/);
    // Fenced on the dead worker's token + attempts + still-stale heartbeat.
    const w = db.updatesFor("report_generation_queue")[0];
    expect(w?.filters).toEqual(
      expect.arrayContaining([
        { col: "status", val: "running" },
        { col: "attempts", val: 1 },
        { col: "claim_token", val: "tok-DEAD" },
        expect.objectContaining({ col: "heartbeat_at", op: "lt" }),
      ]),
    );
    expect(refundOrder).not.toHaveBeenCalled();
    expect(db.updates.report_orders).toBeUndefined();

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: genOk(), now });
    expect(out.status).toBe("done");
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "done", attempts: 2 });
    expect(db.row("report_orders", "order-1")?.status).toBe("READY");
  });

  it("leaves a live (heartbeating) or young claim alone", async () => {
    const db = new FakeQueueDb({
      report_generation_queue: [
        expiredRunning({ id: "q-live", order_id: "o-live", heartbeat_at: ago(minutes(1)) }),
        expiredRunning({ id: "q-young", order_id: "o-young", started_at: ago(minutes(5)), heartbeat_at: ago(minutes(5)) }),
      ],
      report_orders: [orderRow({ id: "o-live" }), orderRow({ id: "o-young" })],
    });

    const res = await reclaimExpiredOrders({ supabase: db.client(), now });

    expect(res).toEqual({ checked: 2, reclaimed: [] });
    expect(db.updates.report_generation_queue).toBeUndefined();
  });

  it("attempt cap: the last allowed attempt dying → queue failed, order FAILED, refund path runs once", async () => {
    const db = seed(expiredRunning({ retry_count: MAX_RETRIES - 1, attempts: MAX_RETRIES }));
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);

    const res = await reclaimExpiredOrders({ supabase: db.client(), now, refundOrder });

    expect(res.reclaimed).toEqual([
      expect.objectContaining({ action: "failed", refunded: true, attempts: MAX_RETRIES }),
    ]);
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({
      status: "failed",
      retry_count: MAX_RETRIES,
      finished_at: FIXED_NOW.toISOString(),
    });
    const orderWrites = db.updatesFor("report_orders");
    expect(orderWrites).toHaveLength(1);
    expect(orderWrites[0]?.patch).toMatchObject({ status: "FAILED", retry_count: MAX_RETRIES });
    expect(String(orderWrites[0]?.patch.failure_reason)).toMatch(/^worker_lost/);
    expect(refundOrder).toHaveBeenCalledTimes(1);
    expect(refundOrder).toHaveBeenCalledWith({ orderId: "order-1", reason: expect.stringMatching(/^worker_lost/) });
  });

  it("attempt cap also holds on `attempts` if retry_count lagged", async () => {
    const db = seed(expiredRunning({ retry_count: 0, attempts: MAX_RETRIES }));
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);

    const res = await reclaimExpiredOrders({ supabase: db.client(), now, refundOrder });

    expect(res.reclaimed[0]?.action).toBe("failed");
    expect(refundOrder).toHaveBeenCalledTimes(1);
  });

  it("full lifecycle: three dead workers in a row → refunded exactly once", async () => {
    const db = seed();
    const c = clock();
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);
    const actions: string[] = [];

    for (let i = 0; i < MAX_RETRIES; i += 1) {
      // A worker claims, then its process dies (the generator never
      // returns, so this promise never settles — not awaited on purpose).
      void processNextQueuedOrder({
        supabase: db.client(),
        now: c.now,
        heartbeatEveryMs: 3_600_000,
        generateReport: () => new Promise<GenerateResult>(() => undefined),
      });
      // Let the claim land.
      await new Promise((r) => setTimeout(r, 0));
      expect(db.row("report_generation_queue", "queue-1")?.status).toBe("running");
      c.advance(minutes(20));
      const res = await reclaimExpiredOrders({ supabase: db.client(), now: c.now, refundOrder });
      actions.push(...res.reclaimed.map((r) => r.action));
    }

    expect(actions).toEqual(["requeued", "requeued", "failed"]);
    expect(refundOrder).toHaveBeenCalledTimes(1);
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "failed", attempts: MAX_RETRIES });
    // Nothing left to claim.
    const again = await processNextQueuedOrder({ supabase: db.client(), now: c.now, generateReport: genOk() });
    expect(again).toEqual({ processed: false });
  });

  it("two concurrent sweeps: one wins, the other loses the race — one refund", async () => {
    const db = seed(expiredRunning({ retry_count: MAX_RETRIES - 1, attempts: MAX_RETRIES }));
    const refundOrder = vi.fn<RefundFn>().mockResolvedValue(undefined);

    const [a, b] = await Promise.all([
      reclaimExpiredOrders({ supabase: db.client(), now, refundOrder }),
      reclaimExpiredOrders({ supabase: db.client(), now, refundOrder }),
    ]);

    const actions = [...a.reclaimed, ...b.reclaimed].map((r) => r.action).sort();
    expect(actions).toEqual(["failed", "lost_race"]);
    expect(refundOrder).toHaveBeenCalledTimes(1);
    expect(db.updatesFor("report_orders")).toHaveLength(1);
  });

  it("a heartbeat landing between the sweep's read and write wins (lost_race)", async () => {
    const db = seed(expiredRunning());
    db.beforeUpdate = (table, patch) => {
      if (table === "report_generation_queue" && patch.status === "queued") {
        db.row("report_generation_queue", "queue-1")!.heartbeat_at = FIXED_NOW.toISOString();
      }
    };

    const res = await reclaimExpiredOrders({ supabase: db.client(), now });

    expect(res.reclaimed[0]?.action).toBe("lost_race");
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "running", claim_token: "tok-DEAD" });
  });

  it("an order already delivered is closed, never regenerated or refunded", async () => {
    const db = seed(expiredRunning(), orderRow({ status: "READY" }));
    const refundOrder = vi.fn<RefundFn>();

    const res = await reclaimExpiredOrders({ supabase: db.client(), now, refundOrder });

    expect(res.reclaimed[0]).toMatchObject({ action: "closed", reason: "reclaim_order_already_READY" });
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "done", error_reason: null });
    expect(refundOrder).not.toHaveBeenCalled();
    expect(db.updates.report_orders).toBeUndefined();
  });

  it("an order already REFUNDED is closed as failed without a second refund", async () => {
    const db = seed(expiredRunning({ retry_count: MAX_RETRIES - 1 }), orderRow({ status: "REFUNDED" }));
    const refundOrder = vi.fn<RefundFn>();

    const res = await reclaimExpiredOrders({ supabase: db.client(), now, refundOrder });

    expect(res.reclaimed[0]?.action).toBe("closed");
    expect(db.row("report_generation_queue", "queue-1")?.status).toBe("failed");
    expect(refundOrder).not.toHaveBeenCalled();
  });

  it("reclaims a legacy-claimed row (NULL token/heartbeat) fenced on claim_token IS NULL", async () => {
    const db = seed(expiredRunning({ claim_token: null, heartbeat_at: null, attempts: 0 }));

    const res = await reclaimExpiredOrders({ supabase: db.client(), now });

    expect(res.reclaimed[0]?.action).toBe("requeued");
    expect(db.updatesFor("report_generation_queue")[0]?.filters).toEqual(
      expect.arrayContaining([
        { col: "claim_token", val: null, op: "is" },
        { col: "heartbeat_at", val: null, op: "is" },
      ]),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O08 — migration 0472 not applied yet
// ─────────────────────────────────────────────────────────────────────────────

describe("O08 lease — lease columns missing (0472 not applied)", () => {
  function legacyDb(): FakeQueueDb {
    const db = new FakeQueueDb({
      report_generation_queue: [
        {
          id: "queue-1",
          order_id: "order-1",
          business_id: "biz-1",
          status: "queued",
          retry_count: 0,
          enqueued_at: "2026-07-30T00:00:00Z",
          started_at: null,
          finished_at: null,
          error_reason: null,
        },
      ],
      report_orders: [orderRow()],
    });
    db.missingLease = true;
    return db;
  }

  it("keeps the pre-O08 claim + unfenced writes and logs the pending migration once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = legacyDb();

    const out = await processNextQueuedOrder({ supabase: db.client(), generateReport: genOk(), now });

    expect(out).toEqual({ processed: true, orderId: "order-1", status: "done" });
    const writes = db.updatesFor("report_generation_queue").filter((w) => w.matched > 0);
    expect(writes[0]?.patch).toEqual({ status: "running", started_at: FIXED_NOW.toISOString() });
    expect(writes[0]?.filters).toEqual([
      { col: "id", val: "queue-1" },
      { col: "status", val: "queued" },
    ]);
    expect(writes[1]?.filters).toEqual([{ col: "id", val: "queue-1" }]);
    expect(db.row("report_orders", "order-1")?.status).toBe("READY");

    // Second tick + a sweep: no second warning, reclaim is a no-op.
    db.rows("report_generation_queue").push({ ...db.row("report_generation_queue", "queue-1")!, id: "queue-2", status: "queued" });
    await processNextQueuedOrder({ supabase: db.client(), generateReport: genOk(), now });
    const sweep = await reclaimExpiredOrders({ supabase: db.client(), now });
    expect(sweep).toEqual({ checked: 0, reclaimed: [], skipped: "lease_columns_missing" });

    const pending = warn.mock.calls.filter((c) => String(c[0]).includes("lease_migration_pending"));
    expect(pending).toHaveLength(1);
  });

  it("reclaim sweep alone detects the missing columns and skips", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = legacyDb();
    db.row("report_generation_queue", "queue-1")!.status = "running";

    const sweep = await reclaimExpiredOrders({ supabase: db.client(), now });

    expect(sweep.skipped).toBe("lease_columns_missing");
    expect(db.row("report_generation_queue", "queue-1")?.status).toBe("running");
  });

  it("re-probes after LEASE_REPROBE_MS and switches to the lease once 0472 lands", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = legacyDb();
    const c = clock();
    const gen = vi.fn<Gen>().mockResolvedValue({ ok: false, transient: true, reason: "AI timeout" });

    await processNextQueuedOrder({ supabase: db.client(), generateReport: gen, now: c.now });
    // Migration applied: rows now carry the columns.
    db.missingLease = false;
    Object.assign(db.row("report_generation_queue", "queue-1")!, { attempts: 0, claim_token: null, heartbeat_at: null });

    // Inside the re-probe window the cached "missing" still applies.
    c.advance(LEASE_REPROBE_MS - 1);
    expect((await reclaimExpiredOrders({ supabase: db.client(), now: c.now })).skipped).toBe("lease_columns_missing");

    c.advance(1);
    await processNextQueuedOrder({
      supabase: db.client(),
      generateReport: genOk(),
      now: c.now,
      newClaimToken: () => "tok-new",
    });
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "done", claim_token: "tok-new", attempts: 1 });
  });
});
