/**
 * report-queue.fixture.ts — in-memory PostgREST double for the paid-order
 * queue worker (report-order-worker.ts) and the drain cron route.
 *
 * Unlike a recorder, it evaluates `eq` / `is` / `lt` filters against real
 * rows and applies UPDATE patches, so conditional-update claims, fenced
 * writes and reclaim races behave like the database: a guard that no
 * longer matches writes zero rows.
 *
 * Test-only. `missingLease: true` makes any query touching the 0472 lease
 * columns fail the way PostgREST does before the migration is applied.
 */

import type { MinimalSupabase, QueueQuery } from "./report-order-worker";

export type FakeRow = Record<string, unknown>;

export interface FakeUpdateCall {
  patch: FakeRow;
  /** eq filters as { col, val }; other operators carry `op`. */
  filters: Array<{ col: string; val: unknown; op?: "is" | "lt" }>;
  /** Rows the guarded UPDATE actually changed. */
  matched: number;
}

type Filter = { op: "eq" | "is" | "lt"; col: string; val: unknown };
type Result = { data: unknown; error: unknown; count?: number | null };

const LEASE_COLUMNS = ["claim_token", "attempts", "heartbeat_at"];

function cmpLt(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return false;
  const da = Date.parse(String(a));
  const db = Date.parse(String(b));
  if (Number.isFinite(da) && Number.isFinite(db)) return da < db;
  return String(a) < String(b);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Timestamps compare as instants, like timestamptz.
  if (typeof a === "string" && typeof b === "string") {
    const da = Date.parse(a);
    const db = Date.parse(b);
    return Number.isFinite(da) && Number.isFinite(db) && /T/.test(a) && /T/.test(b) && da === db;
  }
  return false;
}

export class FakeQueueDb {
  readonly tables: Record<string, FakeRow[]>;
  readonly updates: Record<string, FakeUpdateCall[]> = {};
  missingLease = false;
  /** Called right before an UPDATE is applied — lets a test race it. */
  beforeUpdate?: (table: string, patch: FakeRow, filters: Filter[]) => void;

  constructor(tables: Record<string, FakeRow[]>) {
    this.tables = tables;
  }

  rows(table: string): FakeRow[] {
    return (this.tables[table] ??= []);
  }

  row(table: string, id: string): FakeRow | undefined {
    return this.rows(table).find((r) => r.id === id);
  }

  updatesFor(table: string): FakeUpdateCall[] {
    return this.updates[table] ?? [];
  }

  client(): MinimalSupabase {
    return {
      from: (table: string) => ({
        select: (cols: string, opts?: { count?: string; head?: boolean }) =>
          new FakeQuery(this, table, "select", cols, null, opts),
        update: (patch: FakeRow) => new FakeQuery(this, table, "update", "", patch),
      }),
    } as MinimalSupabase;
  }

  /** @internal */
  execute(q: FakeQuery): Result {
    if (this.missingLease) {
      const touchesLease =
        LEASE_COLUMNS.some((c) => q.cols.includes(c)) ||
        (q.patch && LEASE_COLUMNS.some((c) => c in q.patch!)) ||
        q.filters.some((f) => LEASE_COLUMNS.includes(f.col));
      if (touchesLease) {
        return q.kind === "select"
          ? { data: null, error: { code: "42703", message: "column report_generation_queue.claim_token does not exist" } }
          : { data: null, error: { code: "PGRST204", message: "Could not find the 'claim_token' column of 'report_generation_queue' in the schema cache" } };
      }
    }

    const matches = (r: FakeRow) =>
      q.filters.every((f) => {
        if (f.op === "eq") return sameValue(r[f.col], f.val);
        if (f.op === "is") return r[f.col] === null || r[f.col] === undefined;
        return cmpLt(r[f.col], f.val);
      });

    if (q.kind === "update") {
      this.beforeUpdate?.(q.table, q.patch!, q.filters);
      const hit = this.rows(q.table).filter(matches);
      for (const r of hit) Object.assign(r, q.patch);
      (this.updates[q.table] ??= []).push({
        patch: q.patch!,
        filters: q.filters.map((f) => (f.op === "eq" ? { col: f.col, val: f.val } : { col: f.col, val: f.val, op: f.op })),
        matched: hit.length,
      });
      const data = q.returning ? hit.map((r) => ({ id: r.id })) : null;
      return { data, error: null };
    }

    let hit = this.rows(q.table).filter(matches);
    if (q.orderBy) {
      const { col, ascending } = q.orderBy;
      hit = [...hit].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const lt = cmpLt(av, bv);
        return (lt ? -1 : 1) * (ascending ? 1 : -1);
      });
    }
    if (q.limitN !== null) hit = hit.slice(0, q.limitN);
    if (q.opts?.head) return { data: null, error: null, count: hit.length };
    return { data: hit.map((r) => ({ ...r })), error: null, count: q.opts?.count ? hit.length : null };
  }
}

class FakeQuery implements QueueQuery {
  filters: Filter[] = [];
  orderBy: { col: string; ascending: boolean } | null = null;
  limitN: number | null = null;
  returning = false;

  constructor(
    private readonly db: FakeQueueDb,
    readonly table: string,
    readonly kind: "select" | "update",
    public cols: string,
    readonly patch: FakeRow | null,
    readonly opts?: { count?: string; head?: boolean },
  ) {}

  eq(col: string, val: unknown): QueueQuery {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  is(col: string, _val: null): QueueQuery {
    this.filters.push({ op: "is", col, val: null });
    return this;
  }
  lt(col: string, val: string): QueueQuery {
    this.filters.push({ op: "lt", col, val });
    return this;
  }
  order(col: string, opts: { ascending: boolean }): QueueQuery {
    this.orderBy = { col, ascending: opts.ascending };
    return this;
  }
  limit(n: number): QueueQuery {
    this.limitN = n;
    return this;
  }
  select(cols: string): QueueQuery {
    if (this.kind === "update") this.returning = true;
    else this.cols = cols;
    return this;
  }
  maybeSingle(): PromiseLike<{ data: FakeRow | null; error: unknown }> {
    const res = this.db.execute(this);
    if (res.error) return Promise.resolve({ data: null, error: res.error });
    const list = (res.data as FakeRow[] | null) ?? [];
    return Promise.resolve({ data: list[0] ?? null, error: null });
  }
  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.db.execute(this)).then(onfulfilled, onrejected);
  }
}

/** A queued report_generation_queue row with the 0472 lease columns. */
export function queueRow(overrides: FakeRow = {}): FakeRow {
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
    claim_token: null,
    attempts: 0,
    heartbeat_at: null,
    ...overrides,
  };
}

/** A report_orders row in PAID (the status an enqueued order sits in). */
export function orderRow(overrides: FakeRow = {}): FakeRow {
  return { id: "order-1", status: "PAID", ...overrides };
}
