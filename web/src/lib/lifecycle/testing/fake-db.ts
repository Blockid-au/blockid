// Test double for the Supabase query builder used by the G34-BT4 lifecycle
// tests: in-memory tables, the filters the lifecycle code uses (eq, gt, gte,
// lt, lte, in, is, not-is, a two-term `or`, JSON paths `a->b->>c`), count
// heads, inserts and updates (recorded), and per-table forced errors.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export interface FakeDb {
  tables: Record<string, Row[]>;
  inserts: Array<{ table: string; rows: Row[] }>;
  updates: Array<{ table: string; patch: Row }>;
  /** Tables whose every query answers `{ error }`. */
  failing: Set<string>;
  from(table: string): unknown;
}

function get(r: Row, path: string): unknown {
  const parts = path.split(/->>?/);
  let v: unknown = r;
  for (const p of parts) {
    if (v === null || v === undefined || typeof v !== "object") return undefined;
    v = (v as Row)[p];
  }
  return v;
}

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function orFilter(expr: string): Filter {
  const terms = expr.split(",").map((t) => {
    const [col, op, ...rest] = t.split(".");
    const val = rest.join(".");
    return (r: Row) => {
      const v = get(r, col);
      if (op === "is" && val === "null") return v === null || v === undefined;
      if (op === "eq") return String(v) === val;
      if (op === "lt") return v !== null && v !== undefined && cmp(v, val) < 0;
      if (op === "gt") return v !== null && v !== undefined && cmp(v, val) > 0;
      return false;
    };
  });
  return (r) => terms.some((t) => t(r));
}

/** Column defaults applied on insert, like the real tables' DEFAULTs. */
const DEFAULTS: Record<string, Row> = {
  email_drips: { status: "pending", sent_at: null },
};

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables,
    inserts: [],
    updates: [],
    failing: new Set(),
    from(table: string) {
      const filters: Filter[] = [];
      let mode: "select" | "insert" | "update" = "select";
      let head = false;
      let limitN: number | null = null;
      let order: { col: string; asc: boolean } | null = null;
      let patch: Row = {};
      let insertRows: Row[] = [];
      const rows = () => {
        let out = (db.tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (order) {
          const o = order;
          out = [...out].sort((a, b) => (o.asc ? 1 : -1) * cmp(get(a, o.col), get(b, o.col)));
        }
        if (limitN !== null) out = out.slice(0, limitN);
        return out;
      };
      const settle = () => {
        if (db.failing.has(table)) return { data: null, error: { message: `${table} unavailable` }, count: null };
        if (mode === "insert") {
          db.inserts.push({ table, rows: insertRows });
          (db.tables[table] ??= []).push(...insertRows);
          return { data: insertRows, error: null };
        }
        if (mode === "update") {
          const hit = rows();
          for (const r of hit) Object.assign(r, patch);
          db.updates.push({ table, patch });
          return { data: hit, error: null };
        }
        const data = rows();
        return head ? { data: null, error: null, count: data.length } : { data, error: null, count: data.length };
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select(_cols?: string, opts?: { head?: boolean }) {
          if (opts?.head) head = true;
          return chain;
        },
        insert(r: Row | Row[]) {
          mode = "insert";
          insertRows = (Array.isArray(r) ? r : [r]).map((x) => ({ ...(DEFAULTS[table] ?? {}), ...x }));
          return chain;
        },
        update(p: Row) {
          mode = "update";
          patch = p;
          return chain;
        },
        eq: (c: string, v: unknown) => (filters.push((r) => get(r, c) === v), chain),
        gt: (c: string, v: unknown) => (filters.push((r) => get(r, c) != null && cmp(get(r, c), v) > 0), chain),
        gte: (c: string, v: unknown) => (filters.push((r) => get(r, c) != null && cmp(get(r, c), v) >= 0), chain),
        lt: (c: string, v: unknown) => (filters.push((r) => get(r, c) != null && cmp(get(r, c), v) < 0), chain),
        lte: (c: string, v: unknown) => (filters.push((r) => get(r, c) != null && cmp(get(r, c), v) <= 0), chain),
        in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(get(r, c))), chain),
        is: (c: string, v: unknown) => (filters.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)), chain),
        not: (c: string, op: string, v: unknown) =>
          (filters.push((r) => (op === "is" ? (v === null ? get(r, c) != null : get(r, c) !== v) : true)), chain),
        or: (expr: string) => (filters.push(orFilter(expr)), chain),
        order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), chain),
        limit: (n: number) => ((limitN = n), chain),
        maybeSingle: () => {
          const res = settle();
          return Promise.resolve({ data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error });
        },
        single: () => chain.maybeSingle(),
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return Promise.resolve(settle()).then(onF, onR);
        },
      };
      return chain;
    },
  };
  return db;
}
