// G36 tick 3 — the live-QA teardown's in-flight batch drain (lib/inflight.ts):
// QA-only scoping, queued → cancelled, running → bounded wait, never throws.
import { describe, expect, it, vi } from "vitest";
import { BATCH_ITEMS_EXIST_SQL, DRAIN_POLL_MS, DRAIN_TIMEOUT_MS, QA_TEARDOWN_CANCELLED, drainInFlightBatchItems, drainSql, parseDrainLine } from "./inflight";

const QA = "qa-live-20261125-1628@blockid.au";
const QA_EVAL = "qa-live-evaluator-20261125-1628@blockid.au";

/** A fake psql: answers the existence probe, then one drain line per poll. */
function fakeRun(lines: string[], exists = "t") {
  const sqls: string[] = [];
  const run = vi.fn((sql: string) => {
    sqls.push(sql);
    if (sql === BATCH_ITEMS_EXIST_SQL) return `${exists}\n`;
    const next = lines.shift();
    if (next === undefined) throw new Error("unexpected extra poll");
    if (next === "THROW") throw new Error("psql: connection refused");
    return `${next}\n`;
  });
  return { run, sqls };
}

/** Virtual clock: sleep advances it. */
function clock() {
  let t = 0;
  return { now: () => t, sleep: vi.fn(async (ms: number) => { t += ms; }) };
}

describe("drainSql", () => {
  it("is scoped to the run's QA addresses (re-checked in SQL) and only flips queued items", () => {
    const sql = drainSql([QA, QA_EVAL, QA]);
    expect(sql).toContain(`email in ('${QA}', '${QA_EVAL}')`);
    expect(sql).toContain("email ~ '^qa-live-(member-|evaluator-)?[0-9]{8}-[0-9]{4}@blockid\\.au$'");
    expect(sql).toContain(`set status = 'failed', error = '${QA_TEARDOWN_CANCELLED}'`);
    expect(sql).toMatch(/where id in \(select id from targets where status = 'queued'\)\s+and status = 'queued'/);
    // batches owned by the QA accounts OR items scoring a QA-owned project
    expect(sql).toContain("b.user_id in (select id from qa) or p.user_id in (select id from qa)");
    expect(sql.trim().startsWith("with qa as")).toBe(true); // data-modifying CTE must be top level
  });

  it("refuses any non-QA address", () => {
    expect(() => drainSql(["founder@startup.com.au"])).toThrow(/not a live-QA address/);
    expect(() => drainSql([QA, "x'; drop table app_users; --@blockid.au"])).toThrow(/not a live-QA address/);
    expect(() => drainSql([])).toThrow(/no QA addresses/);
  });

  it("parseDrainLine reads `<cancelled>|<running>` from psql -At output", () => {
    expect(parseDrainLine("2|1\n")).toEqual([2, 1]);
    expect(parseDrainLine("ERROR: x")).toBeNull();
  });
});

describe("drainInFlightBatchItems", () => {
  it("cancels queued items and returns at once when nothing is running", async () => {
    const { run } = fakeRun(["1|0"]);
    const c = clock();
    const r = await drainInFlightBatchItems([QA, QA_EVAL], { run, ...c });
    expect(r).toMatchObject({ ok: true, cancelled: 1, running: 0, polls: 1 });
    expect(c.sleep).not.toHaveBeenCalled();
  });

  it("waits for a running item to finish (re-cancelling anything put back to queued)", async () => {
    const { run } = fakeRun(["1|1", "1|1", "0|0"]);
    const c = clock();
    const r = await drainInFlightBatchItems([QA], { run, ...c });
    expect(r).toMatchObject({ ok: true, cancelled: 2, running: 0, polls: 3, waitedMs: 2 * DRAIN_POLL_MS });
    expect(c.sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the bound (≤ 2 min by default) and reports what is still running — never throws", async () => {
    const lines = Array.from({ length: 100 }, () => "0|1");
    const { run } = fakeRun(lines);
    const c = clock();
    const r = await drainInFlightBatchItems([QA], { run, ...c });
    expect(r.ok).toBe(false);
    expect(r.running).toBe(1);
    expect(r.waitedMs).toBeLessThanOrEqual(DRAIN_TIMEOUT_MS);
    expect(r.polls).toBe(DRAIN_TIMEOUT_MS / DRAIN_POLL_MS + 1); // t = 0, 5 s, …, 120 s
    expect(r.waitedMs).toBe(DRAIN_TIMEOUT_MS);
    expect(r.detail).toMatch(/still running .* erasing anyway/);
  });

  it("is a no-op when the batch tables are absent", async () => {
    const { run, sqls } = fakeRun([], "f");
    const r = await drainInFlightBatchItems([QA], { run, ...clock() });
    expect(r).toMatchObject({ ok: true, polls: 0 });
    expect(sqls).toEqual([BATCH_ITEMS_EXIST_SQL]);
  });

  it("reports (does not throw) a psql failure or unreadable output, and a refused address", async () => {
    expect(await drainInFlightBatchItems([QA], { run: fakeRun(["THROW"]).run, ...clock() })).toMatchObject({ ok: false, detail: expect.stringMatching(/drain query failed/) });
    expect(await drainInFlightBatchItems([QA], { run: fakeRun(["garbage"]).run, ...clock() })).toMatchObject({ ok: false, detail: expect.stringMatching(/unreadable/) });
    const run = vi.fn(() => "t");
    expect(await drainInFlightBatchItems(["someone@else.com"], { run, ...clock() })).toMatchObject({ ok: false, polls: 0 });
    expect(run).not.toHaveBeenCalled();
  });
});
