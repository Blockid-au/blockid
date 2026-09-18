// G15-R2 — /api/status.queues: the four backlogs that turn into founder
// complaints when they silently grow. Four cheap `count` / `head: true`
// queries through the Supabase admin client (never a row body):
//
//   email_queued           svi_snapshots.report_email_queued_at set, sent_at null
//                          (lib/svi/email-queue.ts — the 5-min sweep's backlog)
//   email_failed_24h       failures reported by the report-email-sweep cron in
//                          the last 24 h (cron-health.jsonl detail.failed[] —
//                          the table has no failure column; a failing row is
//                          re-queued, so the cron detail is the only record)
//   webhook_failed_24h     webhook_deliveries status failed|dead created in 24 h
//   report_orders_pending  report_orders in PAYMENT_PENDING|PAID|GENERATING
//
// Every field is null when the client is missing, the table/column is not
// migrated yet, or the query errors. Never throws.

import { getSupabaseAdmin } from "@/lib/supabase";
import { readJsonlTail, withinLast } from "./jsonl";

export type Queues = {
  email_queued: number | null;
  email_failed_24h: number | null;
  webhook_failed_24h: number | null;
  report_orders_pending: number | null;
};

export const REPORT_ORDERS_PENDING_STATUSES = ["PAYMENT_PENDING", "PAID", "GENERATING"];
export const WEBHOOK_FAILED_STATUSES = ["failed", "dead"];

/** Minimal PostgREST surface used here — lets the tests stub the client without the SDK types. */
export interface CountDb {
  from(table: string): {
    select(cols: string, opts: { count: "exact"; head: true }): CountChain;
  };
}
export interface CountChain extends PromiseLike<{ count: number | null; error: { message: string } | null }> {
  not(col: string, op: string, v: unknown): CountChain;
  is(col: string, v: null): CountChain;
  in(col: string, v: string[]): CountChain;
  gte(col: string, v: string): CountChain;
}

async function count(build: () => CountChain): Promise<number | null> {
  try {
    const { count: n, error } = await build();
    if (error) return null;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

type CronRow = { ts?: unknown; endpoint?: unknown; detail?: unknown };

/** Pure reducer over cron-health rows — exported for tests. */
export function emailFailedFromCron(rows: CronRow[], now: number): number | null {
  let seen = false;
  let failed = 0;
  for (const r of rows) {
    if (r.endpoint !== "report-email-sweep" || !withinLast(r.ts, 24 * 60 * 60 * 1000, now)) continue;
    seen = true;
    if (typeof r.detail !== "string") continue;
    try {
      const d = JSON.parse(r.detail) as { failed?: unknown };
      if (Array.isArray(d.failed)) failed += d.failed.length;
    } catch {
      // detail is free text on failure rows — count nothing
    }
  }
  return seen ? failed : null;
}

export async function readQueues(
  root: string = process.cwd(),
  now: number = Date.now(),
  deps: { db?: CountDb | null } = {},
): Promise<Queues> {
  const db = deps.db === undefined ? (getSupabaseAdmin() as unknown as CountDb | null) : deps.db;
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const cronRows = await readJsonlTail<CronRow>(root, "cron-health.jsonl", 2000).catch(() => [] as CronRow[]);
  const email_failed_24h = emailFailedFromCron(cronRows, now);
  if (!db) return { email_queued: null, email_failed_24h, webhook_failed_24h: null, report_orders_pending: null };
  const [email_queued, webhook_failed_24h, report_orders_pending] = await Promise.all([
    count(() => db.from("svi_snapshots").select("id", { count: "exact", head: true }).not("report_email_queued_at", "is", null).is("report_email_sent_at", null)),
    count(() => db.from("webhook_deliveries").select("id", { count: "exact", head: true }).in("status", WEBHOOK_FAILED_STATUSES).gte("created_at", since)),
    count(() => db.from("report_orders").select("id", { count: "exact", head: true }).in("status", REPORT_ORDERS_PENDING_STATUSES)),
  ]);
  return { email_queued, email_failed_24h, webhook_failed_24h, report_orders_pending };
}
