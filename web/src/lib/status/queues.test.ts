// G15-R2 — /api/status.queues (lib/status/queues.ts): four head-count
// queries, nulls when the admin client is missing or a table is not migrated,
// email failures taken from the report-email-sweep cron detail.

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { emailFailedFromCron, readQueues, type CountChain, type CountDb } from "./queues";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

const NOW = Date.parse("2026-09-18T06:00:00.000Z");

type Q = { table: string; cols: string; opts: unknown; filters: Array<[string, ...unknown[]]> };

function fakeDb(counts: Record<string, number | Error>, log: Q[] = []): CountDb {
  return {
    from(table: string) {
      return {
        select(cols: string, opts: { count: "exact"; head: true }) {
          const q: Q = { table, cols, opts, filters: [] };
          log.push(q);
          const chain: CountChain = {
            not: (c, o, v) => (q.filters.push(["not", c, o, v]), chain),
            is: (c, v) => (q.filters.push(["is", c, v]), chain),
            in: (c, v) => (q.filters.push(["in", c, v]), chain),
            gte: (c, v) => (q.filters.push(["gte", c, v]), chain),
            then(resolve) {
              const r = counts[table];
              if (r instanceof Error) return Promise.resolve({ count: null, error: { message: r.message } }).then(resolve);
              return Promise.resolve({ count: typeof r === "number" ? r : null, error: null }).then(resolve);
            },
          };
          return chain;
        },
      };
    },
  };
}

function rootWithCron(rows: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "q-"));
  mkdirSync(join(dir, "content", "reports"), { recursive: true });
  writeFileSync(join(dir, "content", "reports", "cron-health.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return dir;
}

describe("emailFailedFromCron", () => {
  it("sums detail.failed[] of report-email-sweep rows in 24 h; null when the sweep never ran", () => {
    const ts = new Date(NOW - 60_000).toISOString();
    expect(emailFailedFromCron([], NOW)).toBeNull();
    expect(
      emailFailedFromCron(
        [
          { ts, endpoint: "report-email-sweep", status: "ok", detail: JSON.stringify({ failed: [{ id: "a" }, { id: "b" }] }) },
          { ts, endpoint: "report-email-sweep", status: "fail", detail: "Unauthorized" },
          { ts, endpoint: "agent-guardian", status: "ok", detail: JSON.stringify({ failed: [1, 2, 3] }) },
          { ts: "2026-09-10T00:00:00Z", endpoint: "report-email-sweep", status: "ok", detail: JSON.stringify({ failed: [1] }) },
        ],
        NOW,
      ),
    ).toBe(2);
  });
});

describe("readQueues", () => {
  it("no admin client → all null except the cron-derived email failures", async () => {
    const root = rootWithCron([{ ts: new Date(NOW).toISOString(), endpoint: "report-email-sweep", status: "ok", detail: JSON.stringify({ failed: [] }) }]);
    expect(await readQueues(root, NOW)).toEqual({ email_queued: null, email_failed_24h: 0, webhook_failed_24h: null, report_orders_pending: null });
    expect(await readQueues(mkdtempSync(join(tmpdir(), "q-")), NOW, { db: null })).toEqual({ email_queued: null, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: null });
  });
  it("issues head-count queries with the documented filters and maps errors to null", async () => {
    const log: Q[] = [];
    const db = fakeDb({ svi_snapshots: 3, webhook_deliveries: new Error("relation does not exist"), report_orders: 1 }, log);
    const out = await readQueues(mkdtempSync(join(tmpdir(), "q-")), NOW, { db });
    expect(out).toEqual({ email_queued: 3, email_failed_24h: null, webhook_failed_24h: null, report_orders_pending: 1 });
    expect(log.map((q) => q.table)).toEqual(["svi_snapshots", "webhook_deliveries", "report_orders"]);
    expect(log.every((q) => q.cols === "id" && JSON.stringify(q.opts) === JSON.stringify({ count: "exact", head: true }))).toBe(true);
    expect(log[0].filters).toEqual([
      ["not", "report_email_queued_at", "is", null],
      ["is", "report_email_sent_at", null],
    ]);
    expect(log[1].filters).toEqual([
      ["in", "status", ["failed", "dead"]],
      ["gte", "created_at", new Date(NOW - 24 * 60 * 60 * 1000).toISOString()],
    ]);
    expect(log[2].filters).toEqual([["in", "status", ["PAYMENT_PENDING", "PAID", "GENERATING"]]]);
  });
});
