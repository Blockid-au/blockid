// Test-only in-memory stand-in for the slice of the supabase-js query builder
// lib/verified-review/* uses (select / eq / in / gte / contains / order /
// limit / maybeSingle / single / update / insert / upsert). Not imported by
// app code. Rows are plain objects; `select` ignores the column list unless a
// column is listed in `missingColumns` (→ 42703, like a pending migration).

type Row = Record<string, unknown>;
type Op = "select" | "update" | "insert" | "upsert";

export interface FakeDbOptions {
  tables?: Record<string, Row[]>;
  /** table → columns that "do not exist" (select / update mentioning them → 42703). */
  missingColumns?: Record<string, string[]>;
  /** table → op → error returned for that op. */
  failOn?: Record<string, Partial<Record<Op, { code?: string; message: string }>>>;
  /** unique keys per table for insert / upsert conflicts (e.g. report_review_claims: ["review_id","claim_ref"]). */
  unique?: Record<string, string[]>;
}

export interface FakeDb {
  from: (table: string) => unknown;
  tables: Record<string, Row[]>;
  calls: Array<{ table: string; op: Op; filters: Array<[string, string, unknown]>; patch?: unknown }>;
}

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

export function fakeDb(opts: FakeDbOptions = {}): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(opts.tables ?? {})) tables[k] = v.map((r) => ({ ...r }));
  const calls: FakeDb["calls"] = [];

  function builder(table: string) {
    let op: Op = "select";
    let patch: Row | Row[] | null = null;
    let cols = "";
    let returning = false;
    let single: "maybe" | "one" | null = null;
    const filters: Array<[string, string, unknown]> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;
    let onConflict: string | null = null;

    const rows = () => (tables[table] ??= []);
    const match = (r: Row) =>
      filters.every(([kind, col, v]) => {
        if (kind === "eq") return r[col] === v;
        if (kind === "in") return (v as unknown[]).includes(r[col]);
        if (kind === "gte") return String(r[col] ?? "") >= String(v);
        if (kind === "contains") return Object.entries(v as Row).every(([k, x]) => (r[col] as Row | undefined)?.[k] === x);
        if (kind === "is") return r[col] === v;
        return true;
      });
    const missing = (text: string) => (opts.missingColumns?.[table] ?? []).some((c) => new RegExp(`\\b${c}\\b`).test(text));

    async function run(): Promise<{ data: unknown; error: unknown }> {
      calls.push({ table, op, filters: [...filters], patch: patch ?? undefined });
      const fail = opts.failOn?.[table]?.[op];
      if (fail) return { data: null, error: fail };
      if (op === "select") {
        if (missing(cols)) return { data: null, error: { code: "42703", message: `column does not exist (${table})` } };
        let out = rows().filter(match);
        if (orderBy) {
          const { col, asc } = orderBy;
          out = [...out].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? (asc ? -1 : 1) : String(a[col] ?? "") > String(b[col] ?? "") ? (asc ? 1 : -1) : 0));
        }
        if (limit !== null) out = out.slice(0, limit);
        out = out.map((r) => ({ ...r }));
        if (single) {
          if (single === "one" && out.length !== 1) return { data: null, error: { code: "PGRST116", message: "not single" } };
          return { data: out[0] ?? null, error: null };
        }
        return { data: out, error: null };
      }
      if (op === "update") {
        if (missing(Object.keys(patch as Row).join(" "))) return { data: null, error: { code: "42703", message: "column does not exist" } };
        const hit = rows().filter(match);
        for (const r of hit) Object.assign(r, patch);
        const out = hit.map((r) => ({ ...r }));
        if (single) return { data: out[0] ?? null, error: null };
        return { data: returning ? out : null, error: null };
      }
      // insert / upsert
      const list = (Array.isArray(patch) ? patch : [patch]) as Row[];
      const keys = onConflict ? onConflict.split(",").map((s) => s.trim()) : (opts.unique?.[table] ?? null);
      const inserted: Row[] = [];
      for (const raw of list) {
        const r: Row = { id: raw.id ?? newId(), created_at: new Date().toISOString(), ...raw };
        if (keys) {
          const dup = rows().find((x) => keys.every((k) => x[k] === r[k]));
          if (dup) {
            if (op === "upsert") {
              Object.assign(dup, raw);
              inserted.push({ ...dup });
              continue;
            }
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
        }
        rows().push(r);
        inserted.push({ ...r });
      }
      if (single) return { data: inserted[0] ?? null, error: null };
      return { data: returning ? inserted : null, error: null };
    }

    const b: Record<string, unknown> = {
      select(c?: string) {
        if (op === "select") cols = c ?? "*";
        else returning = true;
        return b;
      },
      eq(col: string, v: unknown) {
        filters.push(["eq", col, v]);
        return b;
      },
      in(col: string, v: unknown[]) {
        filters.push(["in", col, v]);
        return b;
      },
      gte(col: string, v: unknown) {
        filters.push(["gte", col, v]);
        return b;
      },
      is(col: string, v: unknown) {
        filters.push(["is", col, v]);
        return b;
      },
      contains(col: string, v: Row) {
        filters.push(["contains", col, v]);
        return b;
      },
      order(col: string, o?: { ascending?: boolean }) {
        orderBy = { col, asc: o?.ascending !== false };
        return b;
      },
      limit(n: number) {
        limit = n;
        return b;
      },
      maybeSingle() {
        single = "maybe";
        return run();
      },
      single() {
        single = "one";
        return run();
      },
      update(p: Row) {
        op = "update";
        patch = p;
        return b;
      },
      insert(p: Row | Row[]) {
        op = "insert";
        patch = p;
        return b;
      },
      upsert(p: Row | Row[], o?: { onConflict?: string }) {
        op = "upsert";
        patch = p;
        onConflict = o?.onConflict ?? null;
        return b;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return run().then(resolve, reject);
      },
    };
    return b;
  }

  return { from: (t: string) => builder(t), tables, calls };
}
