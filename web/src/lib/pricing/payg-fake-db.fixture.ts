/**
 * payg-fake-db.fixture.ts — tiny in-memory PostgREST double for the Pricing
 * v5 tests (checkout / fulfilment / refund / worker). Test-only.
 *
 * Evaluates eq / neq / in / is filters against real rows, applies UPDATE
 * patches (guarded updates write zero rows when the guard no longer
 * matches), supports `.select()` after insert / update (RETURNING), head
 * counts, and UNIQUE constraints per table so a duplicate insert fails with
 * 23505 like Postgres.
 */

export type Row = Record<string, unknown>;
type Op = "eq" | "neq" | "in" | "is" | "lt" | "lte" | "gt" | "gte" | "like";
type Filter =
  | { op: Op; col: string; val: unknown; negate?: boolean }
  | { op: "or"; col: ""; val: Filter[]; negate?: boolean };

// PostgREST JSON paths (`metadata->refund->>state`) walk into jsonb columns.
function readCol(r: Row, col: string): unknown {
  if (!col.includes("->")) return r[col];
  const [head, ...keys] = col.split(/->>?/);
  let v: unknown = r[head!];
  for (const k of keys) v = v && typeof v === "object" ? (v as Row)[k] : undefined;
  // `->>` yields text in Postgres (true → 'true', 5 → '5').
  if (/->>[^>]*$/.test(col) && v !== null && v !== undefined) return typeof v === "object" ? JSON.stringify(v) : String(v);
  return v;
}

function cmp(a: unknown, b: unknown): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null; // SQL NULL never compares
  if (typeof a === "number" && typeof b !== "number") b = Number(b);
  if (typeof a === "number") return a - (b as number);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function evalFilter(r: Row, f: Filter): boolean {
  let ok: boolean;
  if (f.op === "or") {
    ok = f.val.some((g) => evalFilter(r, g));
  } else {
    const v = readCol(r, f.col);
    switch (f.op) {
      case "eq": ok = v === f.val; break;
      case "neq": ok = v !== f.val; break;
      case "in": ok = (f.val as unknown[]).includes(v); break;
      case "is": ok = v === null || v === undefined; break;
      case "like": {
        if (v === null || v === undefined) { ok = false; break; }
        const re = new RegExp(`^${String(f.val).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*")}$`);
        ok = re.test(String(v));
        break;
      }
      default: {
        const c = cmp(v, f.val);
        if (c === null) { ok = false; break; }
        ok = f.op === "lt" ? c < 0 : f.op === "lte" ? c <= 0 : f.op === "gt" ? c > 0 : c >= 0;
      }
    }
    // NOT on a NULL comparison stays NULL (false), like SQL — except `not.is.null`.
    if (f.negate && f.op !== "is" && (readCol(r, f.col) === null || readCol(r, f.col) === undefined)) return false;
  }
  return f.negate ? !ok : ok;
}

/** Parse a PostgREST `or=(...)` body: `col.op.value,col.not.op.value,…` (values may be "quoted"). */
function parseOr(expr: string): Filter[] {
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of expr) {
    if (ch === '"') quoted = !quoted;
    if (ch === "," && !quoted) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts.map((p) => {
    const [col, ...rest] = p.split(".");
    let negate = false;
    if (rest[0] === "not") { negate = true; rest.shift(); }
    const op = rest.shift() as Op;
    let raw = rest.join(".");
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    const val: unknown = op === "is" ? null : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
    return { op, col: col!, val, negate };
  });
}
type Result = { data: unknown; error: { code?: string; message?: string } | null; count?: number | null };

export interface FakeDbOptions {
  /** table → list of column sets that must be unique (null values ignored). */
  unique?: Record<string, string[][]>;
  /** Tables whose reads / writes fail (simulate an outage). */
  failing?: string[];
  /** Column defaults applied on insert (like DEFAULT in the DDL). */
  defaults?: Record<string, Row>;
}

let seq = 0;

export class PaygFakeDb {
  readonly tables: Record<string, Row[]>;
  readonly log: Array<{ table: string; kind: string; patch?: Row; filters: Filter[]; matched?: number }> = [];

  constructor(
    tables: Record<string, Row[]> = {},
    private readonly opts: FakeDbOptions = {},
  ) {
    this.tables = tables;
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  row(table: string, id: string): Row | undefined {
    return this.rows(table).find((r) => r.id === id);
  }

  from(table: string) {
    return {
      select: (cols = "*", o?: { count?: string; head?: boolean }) => new FakeQuery(this, table, "select", null, o),
      insert: (payload: Row | Row[]) => new FakeQuery(this, table, "insert", payload),
      update: (patch: Row) => new FakeQuery(this, table, "update", patch),
      delete: () => new FakeQuery(this, table, "delete", null),
      upsert: (payload: Row | Row[]) => new FakeQuery(this, table, "insert", payload),
    };
  }

  /** @internal */
  exec(q: FakeQuery): Result {
    if (this.opts.failing?.includes(q.table)) return { data: null, error: { code: "XX000", message: `${q.table} unavailable` } };
    const match = (r: Row) => q.filters.every((f) => evalFilter(r, f));

    if (q.kind === "insert") {
      const list = (Array.isArray(q.payload) ? q.payload : [q.payload]) as Row[];
      const inserted: Row[] = [];
      for (const p of list) {
        const rowv: Row = { id: p.id ?? `${q.table}-${++seq}`, created_at: new Date(Date.UTC(2026, 9, 20, 0, 0, seq)).toISOString(), ...(this.opts.defaults?.[q.table] ?? {}), ...p };
        for (const cols of this.opts.unique?.[q.table] ?? []) {
          if (cols.some((c) => rowv[c] === null || rowv[c] === undefined)) continue;
          if (this.rows(q.table).some((r) => cols.every((c) => r[c] === rowv[c]))) {
            this.log.push({ table: q.table, kind: "insert_conflict", filters: [] });
            return { data: null, error: { code: "23505", message: `duplicate key on ${q.table}(${cols.join(",")})` } };
          }
        }
        this.rows(q.table).push(rowv);
        inserted.push(rowv);
      }
      this.log.push({ table: q.table, kind: "insert", patch: list[0], filters: [] });
      return { data: q.returning ? inserted.map((r) => ({ ...r })) : null, error: null };
    }

    if (q.kind === "update") {
      const hit = this.rows(q.table).filter(match);
      for (const r of hit) Object.assign(r, q.payload as Row);
      this.log.push({ table: q.table, kind: "update", patch: q.payload as Row, filters: q.filters, matched: hit.length });
      return { data: q.returning ? hit.map((r) => ({ ...r })) : null, error: null };
    }

    if (q.kind === "delete") {
      const keep = this.rows(q.table).filter((r) => !match(r));
      this.tables[q.table] = keep;
      return { data: null, error: null };
    }

    let hit = this.rows(q.table).filter(match);
    if (q.orderBy.length > 0) {
      hit = [...hit].sort((a, b) => {
        for (const { col, ascending, nullsFirst } of q.orderBy) {
          const va = readCol(a, col);
          const vb = readCol(b, col);
          const na = va === null || va === undefined;
          const nb = vb === null || vb === undefined;
          if (na || nb) {
            if (na && nb) continue;
            // Postgres default: NULLS LAST for ASC, NULLS FIRST for DESC.
            const nullFirst = nullsFirst ?? !ascending;
            return na === nullFirst ? -1 : 1;
          }
          const c = String(va) < String(vb) ? -1 : String(va) > String(vb) ? 1 : 0;
          if (c !== 0) return ascending ? c : -c;
        }
        return 0;
      });
    }
    if (q.limitN !== null) hit = hit.slice(0, q.limitN);
    if (q.selectOpts?.head) return { data: null, error: null, count: hit.length };
    return { data: hit.map((r) => ({ ...r })), error: null, count: q.selectOpts?.count ? hit.length : null };
  }
}

class FakeQuery implements PromiseLike<Result> {
  filters: Filter[] = [];
  orderBy: Array<{ col: string; ascending: boolean; nullsFirst?: boolean }> = [];
  limitN: number | null = null;
  returning = false;

  constructor(
    private readonly db: PaygFakeDb,
    readonly table: string,
    readonly kind: "select" | "insert" | "update" | "delete",
    readonly payload: Row | Row[] | null,
    readonly selectOpts?: { count?: string; head?: boolean },
  ) {}

  eq(col: string, val: unknown) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ op: "neq", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ op: "in", col, val });
    return this;
  }
  is(col: string, _val: null) {
    this.filters.push({ op: "is", col, val: null });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ op: "lt", col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ op: "lte", col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ op: "gt", col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ op: "gte", col, val });
    return this;
  }
  /** `.not(col, "is", null)` and friends. */
  not(col: string, op: Op, val: unknown) {
    this.filters.push({ op, col, val: op === "is" ? null : val, negate: true });
    return this;
  }
  /** PostgREST `or` filter string; several `.or()` calls are ANDed, like PostgREST. */
  or(expr: string) {
    this.filters.push({ op: "or", col: "", val: parseOr(expr) });
    return this;
  }
  contains() {
    return this;
  }
  order(col: string, o: { ascending: boolean; nullsFirst?: boolean }) {
    this.orderBy.push({ col, ascending: o.ascending, nullsFirst: o.nullsFirst });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  select() {
    if (this.kind !== "select") this.returning = true;
    return this;
  }
  maybeSingle(): Promise<{ data: Row | null; error: Result["error"] }> {
    const res = this.db.exec(this);
    if (res.error) return Promise.resolve({ data: null, error: res.error });
    const list = (res.data as Row[] | null) ?? [];
    return Promise.resolve({ data: list[0] ?? null, error: null });
  }
  single(): Promise<{ data: Row | null; error: Result["error"] }> {
    const res = this.db.exec(this);
    if (res.error) return Promise.resolve({ data: null, error: res.error });
    const list = (res.data as Row[] | null) ?? [];
    if (list.length !== 1) return Promise.resolve({ data: null, error: { code: "PGRST116", message: "not exactly one row" } });
    return Promise.resolve({ data: list[0], error: null });
  }
  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.db.exec(this)).then(onfulfilled, onrejected);
  }
}

/** Column defaults mirroring 0272 / 0472 (queue) — what a real insert would read back. */
export const PAYG_DEFAULTS: Record<string, Row> = {
  report_generation_queue: { status: "queued", retry_count: 0, attempts: 0, claim_token: null, heartbeat_at: null, started_at: null, finished_at: null, error_reason: null, enqueued_at: "2026-10-20T00:00:00.000Z" },
};

/** UNIQUE constraints mirroring 0270 / 0272 / 0474 / revenue_events. */
export const PAYG_UNIQUE: Record<string, string[][]> = {
  report_orders: [["stripe_session_id"]],
  report_generation_queue: [["order_id"]],
  revenue_events: [["stripe_event_id"]],
};
