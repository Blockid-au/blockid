// S18-A — minimal chainable Supabase stub for route tests.
//
//   const sb = fakeSupabase({ svi_accounts: [{ id: "acct-1" }] });
//   sb.from("svi_accounts").select("id").eq("email", e).maybeSingle()
//     → { data: rows[0], error: null }
//   await sb.from("x").select("*").eq(...)   → { data: rows, error: null, count }
//
// Every filter/modifier call is recorded in `sb.calls` as
// `{ table, op, args }` so a test can pin the data key a route used
// (`.eq("email", "owner@x.test")`, `.eq("account_id", ...)`) without
// hand-writing a chain per table. Writes (insert/update/upsert/delete)
// resolve with `{ data: payload, error: null }` and are recorded too.

export interface SbCall {
  table: string;
  op: string;
  args: unknown[];
}

type Rows = Record<string, unknown>[];

export interface FakeSupabase {
  from: (table: string) => unknown;
  rpc: (...args: unknown[]) => Promise<{ data: unknown; error: null }>;
  calls: SbCall[];
  rows: Record<string, Rows>;
  /** calls on `table` with op `op` */
  find: (table: string, op: string) => SbCall[];
  /** true when `.eq(col, value)` was applied on `table` */
  hasEq: (table: string, col: string, value: unknown) => boolean;
}

const TERMINALS = new Set(["maybeSingle", "single", "then", "catch", "finally"]);
const WRITES = new Set(["insert", "update", "upsert", "delete"]);

export function fakeSupabase(rows: Record<string, Rows> = {}): FakeSupabase {
  const calls: SbCall[] = [];
  const store: Record<string, Rows> = { ...rows };

  function chain(table: string, opts: { head?: boolean; count?: boolean; write?: unknown } = {}) {
    const result = () => {
      const data = store[table] ?? [];
      if (opts.write !== undefined) return { data: opts.write, error: null, count: null };
      return {
        data: opts.head ? null : data,
        error: null,
        count: opts.count ? data.length : null,
      };
    };
    const single = () => {
      const data = store[table] ?? [];
      const row = opts.write !== undefined
        ? (Array.isArray(opts.write) ? opts.write[0] : opts.write)
        : data[0] ?? null;
      return Promise.resolve({ data: row, error: null });
    };
    const target: Record<string, unknown> = {};
    const proxy: unknown = new Proxy(target, {
      get(_t, prop: string) {
        if (prop === "then") {
          const p = Promise.resolve(result());
          return p.then.bind(p);
        }
        if (prop === "catch" || prop === "finally") {
          const p = Promise.resolve(result());
          return (p as unknown as Record<string, (...a: unknown[]) => unknown>)[prop].bind(p);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return () => {
            calls.push({ table, op: prop, args: [] });
            return single();
          };
        }
        if (TERMINALS.has(prop)) return undefined;
        return (...args: unknown[]) => {
          calls.push({ table, op: prop, args });
          if (prop === "select" && args[1] && typeof args[1] === "object") {
            const o = args[1] as { head?: boolean; count?: string };
            return chain(table, { ...opts, head: o.head, count: Boolean(o.count) });
          }
          if (WRITES.has(prop)) {
            return chain(table, { ...opts, write: prop === "delete" ? [] : (args[0] ?? []) });
          }
          return proxy;
        };
      },
    });
    return proxy;
  }

  return {
    from: (table: string) => chain(table),
    rpc: async (...args: unknown[]) => {
      calls.push({ table: "rpc", op: "rpc", args });
      return { data: null, error: null };
    },
    calls,
    rows: store,
    find: (table, op) => calls.filter((c) => c.table === table && c.op === op),
    hasEq: (table, col, value) =>
      calls.some((c) => c.table === table && c.op === "eq" && c.args[0] === col && c.args[1] === value),
  };
}
