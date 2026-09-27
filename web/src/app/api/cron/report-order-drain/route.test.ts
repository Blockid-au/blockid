/**
 * /api/cron/report-order-drain — O08 lease reclaim wiring.
 *
 * Runs the REAL worker (claim / heartbeat / reclaim) against the in-memory
 * FakeQueueDb; only auth, the heavy report generator and the refund module
 * are mocked. Proves the cron reclaims dead leases before draining, routes
 * the attempt cap through the existing refund hook, rejects a stale
 * worker, and keeps today's behaviour while 0472 is not applied.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FakeQueueDb,
  orderRow,
  queueRow,
  type FakeRow,
} from "@/lib/paywall/report-queue.fixture";

const h = vi.hoisted(() => ({
  db: null as unknown as { client(): unknown } | null,
  authorised: true,
  generate: vi.fn(),
  refund: vi.fn(),
}));

vi.mock("@/lib/security/cron-auth", () => ({ isCronAuthorised: () => h.authorised }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (h.db ? h.db.client() : null) }));
vi.mock("@/lib/paywall/report-generator", () => ({
  generateTrustReportForOrder: (...args: unknown[]) => h.generate(...args),
}));
vi.mock("@/lib/paywall/report-refund", () => ({
  refundFailedOrder: (...args: unknown[]) => h.refund(...args),
}));
vi.mock("@/lib/ops/origin-activity", () => ({
  trackOriginWork: (_k: string, fn: () => unknown) => fn(),
}));

import { GET, POST } from "./route";
import { __resetLeaseModeForTests, MAX_RETRIES } from "@/lib/paywall/report-order-worker";

const minutes = (n: number) => n * 60_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function expiredRunning(overrides: FakeRow = {}): FakeRow {
  return queueRow({
    status: "running",
    started_at: ago(minutes(25)),
    heartbeat_at: ago(minutes(20)),
    claim_token: "tok-DEAD",
    attempts: 1,
    retry_count: 0,
    ...overrides,
  });
}

function useDb(queue: FakeRow[], orders: FakeRow[] = [orderRow()]): FakeQueueDb {
  const db = new FakeQueueDb({ report_generation_queue: queue, report_orders: orders });
  h.db = db;
  return db;
}

async function call(method: "GET" | "POST" = "GET") {
  const req = new Request("https://blockid.au/api/cron/report-order-drain", { method });
  const res = await (method === "GET" ? GET(req) : POST(req));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  __resetLeaseModeForTests();
  h.authorised = true;
  h.generate.mockReset().mockResolvedValue({ ok: true, reportId: "rpt-new" });
  h.refund.mockReset().mockResolvedValue({ ok: true, path: "stripe", refundId: "re_1" });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  h.db = null;
});

describe("cron/report-order-drain", () => {
  it("401 without cron auth", async () => {
    h.authorised = false;
    useDb([]);
    const { status } = await call();
    expect(status).toBe(401);
  });

  it("empty queue is a noop", async () => {
    useDb([]);
    const { status, body } = await call("POST");
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, processed: 0, remaining: 0, reclaimed: [], noop: true });
  });

  it("reclaims a dead worker's lease and re-drains the order in the same tick", async () => {
    const db = useDb([expiredRunning()]);

    const { body } = await call();

    expect(body.reclaimed).toEqual([{ orderId: "order-1", action: "requeued", attempts: 1 }]);
    expect(body.processed).toBe(1);
    expect(body.results).toEqual([{ orderId: "order-1", status: "done" }]);
    expect(body.noop).toBeUndefined();
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "done", attempts: 2, retry_count: 1 });
    expect(db.row("report_orders", "order-1")).toMatchObject({ status: "READY", report_id: "rpt-new" });
    expect(h.refund).not.toHaveBeenCalled();
  });

  it("attempt cap: the last attempt's lease expiring fails the order through refundFailedOrder", async () => {
    const db = useDb([expiredRunning({ retry_count: MAX_RETRIES - 1, attempts: MAX_RETRIES })]);

    const { body } = await call();

    expect(body.reclaimed).toEqual([
      { orderId: "order-1", action: "failed", attempts: MAX_RETRIES, refunded: true },
    ]);
    expect(h.refund).toHaveBeenCalledTimes(1);
    expect(h.refund).toHaveBeenCalledWith({ orderId: "order-1", reason: expect.stringMatching(/^worker_lost/) });
    expect(h.generate).not.toHaveBeenCalled();
    expect(db.row("report_generation_queue", "queue-1")?.status).toBe("failed");
    expect(db.updatesFor("report_orders")[0]?.patch).toMatchObject({ status: "FAILED" });
  });

  it("does not touch a running order whose worker still heartbeats", async () => {
    const db = useDb([expiredRunning({ heartbeat_at: ago(minutes(1)) })]);

    const { body } = await call();

    expect(body.reclaimed).toEqual([]);
    expect(body.processed).toBe(0);
    expect(h.generate).not.toHaveBeenCalled();
    expect(db.row("report_generation_queue", "queue-1")).toMatchObject({ status: "running", claim_token: "tok-DEAD" });
  });

  it("a stale worker cannot deliver after its lease was reclaimed", async () => {
    const db = useDb([queueRow()]);
    // This tick's worker "freezes": while it runs, a later sweep reclaims
    // the row and another worker delivers.
    h.generate.mockImplementationOnce(async () => {
      Object.assign(db.row("report_generation_queue", "queue-1")!, {
        claim_token: "tok-OTHER",
        attempts: 2,
      });
      db.row("report_orders", "order-1")!.status = "READY";
      db.row("report_orders", "order-1")!.report_id = "rpt-other";
      return { ok: true, reportId: "rpt-late" };
    });

    const { body } = await call();

    expect(body.results).toEqual([{ orderId: "order-1", status: "stale", reason: "lease_lost" }]);
    expect(db.updates.report_orders).toBeUndefined();
    expect(db.row("report_orders", "order-1")?.report_id).toBe("rpt-other");
  });

  it("drains even if the reclaim sweep throws", async () => {
    const db = useDb([queueRow()]);
    const realClient = db.client.bind(db);
    // getSupabaseAdmin() call order: route probe client, reclaim sweep,
    // worker. Only the sweep's client blows up.
    let calls = 0;
    db.client = () => {
      calls += 1;
      if (calls !== 2) return realClient();
      return { from: () => { throw new Error("pool exhausted"); } } as unknown as ReturnType<FakeQueueDb["client"]>;
    };

    const { status, body } = await call();

    expect(status).toBe(200);
    expect(body.processed).toBe(1);
    expect(body.reclaimed).toEqual([]);
  });

  it("before 0472 is applied: today's behaviour, reclaim skipped, stuck row untouched", async () => {
    const db = useDb([
      {
        id: "q-stuck",
        order_id: "order-1",
        business_id: "biz-1",
        status: "running",
        retry_count: 0,
        enqueued_at: ago(minutes(90)),
        started_at: ago(minutes(80)),
        finished_at: null,
        error_reason: null,
      },
    ]);
    db.missingLease = true;

    const { body } = await call();

    expect(body).toMatchObject({ ok: true, processed: 0, reclaimed: [], reclaimSkipped: "lease_columns_missing", noop: true });
    expect(db.row("report_generation_queue", "q-stuck")?.status).toBe("running");
  });
});
