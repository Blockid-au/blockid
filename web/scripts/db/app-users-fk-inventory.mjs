#!/usr/bin/env node
// scripts/db/app-users-fk-inventory.mjs — every foreign key that references
// public.app_users(id), its ON DELETE action, and (optionally) how many rows
// a given user id holds in each referencing table (S24-B, 2026-09-12).
//
// Why: `DELETE FROM app_users` is impossible in production — 124 FKs point
// at app_users, ~14 with NO ACTION, 6 RESTRICT, and several `ON DELETE SET
// NULL` cascades land on append-only ledgers. The privacy erasure routine
// (src/lib/privacy/erase-account.ts + migration 0348 `erase_account()`)
// therefore never deletes the app_users row: it walks the classification in
// src/lib/privacy/erasure-map.ts instead. This script is how that map is
// kept honest — `--fixture` rewrites the JSON the map test parses.
//
// Usage (from web/):
//   node scripts/db/app-users-fk-inventory.mjs                 # table of FKs
//   node scripts/db/app-users-fk-inventory.mjs --user <uuid>   # + row counts
//   node scripts/db/app-users-fk-inventory.mjs --email <e>     # resolve id first
//   node scripts/db/app-users-fk-inventory.mjs --json          # machine output
//   node scripts/db/app-users-fk-inventory.mjs --fixture       # rewrite
//       src/lib/privacy/__fixtures__/app_users_fks.json from the live catalog
//   node scripts/db/app-users-fk-inventory.mjs --check         # exit 1 when the
//       live catalog differs from the committed fixture (drift guard)
//
// DB access mirrors migration-parity.mjs: `docker exec supabase-db psql`
// (override with PSQL="psql ..." or PGURL=postgres://...). Read-only.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..", "..");
const FIXTURE = path.join(WEB_DIR, "src", "lib", "privacy", "__fixtures__", "app_users_fks.json");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const FK_SQL = `
select json_agg(row_to_json(t) order by t.table_name, t.column_name) from (
  select
    c.conname as constraint_name,
    r.relname as table_name,
    a.attname as column_name,
    case c.confdeltype
      when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
      when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as on_delete,
    a.attnotnull as not_null
  from pg_constraint c
  join pg_class r on r.oid = c.conrelid
  join pg_namespace n on n.oid = r.relnamespace
  join pg_class fr on fr.oid = c.confrelid
  join pg_namespace fn on fn.oid = fr.relnamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f' and n.nspname = 'public'
    and fr.relname = 'app_users' and fn.nspname = 'public'
) t;`;

export function runPsql(sql, { role = "postgres" } = {}) {
  const common = { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  if (process.env.PSQL) return execFileSync("sh", ["-c", `${process.env.PSQL} -At -v ON_ERROR_STOP=1`], common);
  if (process.env.PGURL) return execFileSync("psql", [process.env.PGURL, "-At", "-v", "ON_ERROR_STOP=1"], common);
  const container = process.env.SUPABASE_DB_CONTAINER || "supabase-db";
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", role, "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], common);
}

/** Normalise a raw catalog row to the fixture shape. */
export function toFixtureRow(r) {
  return { constraint: r.constraint_name, table: r.table_name, column: r.column_name, on_delete: r.on_delete, not_null: Boolean(r.not_null) };
}

export function loadLiveFks() {
  const raw = runPsql(FK_SQL).trim();
  const rows = raw ? JSON.parse(raw) : [];
  return rows.map(toFixtureRow);
}

/** Build the `select count(*) ...` batch for one user id, one line per FK. */
export function countSql(fks, userId) {
  if (!UUID_RE.test(userId)) throw new Error("user id must be a uuid");
  const parts = fks.map(
    (f) =>
      `select '${f.table}' as t, '${f.column}' as c, count(*)::int as n from public."${f.table.replace(/"/g, '""')}" where "${f.column.replace(/"/g, '""')}" = '${userId}'::uuid`,
  );
  return `select json_agg(row_to_json(x)) from (${parts.join("\nunion all\n")}) x;`;
}

export function resolveUserId(email) {
  const safe = email.trim().toLowerCase().replace(/'/g, "''");
  const out = runPsql(`select id from public.app_users where email = '${safe}' limit 1;`).trim();
  return UUID_RE.test(out) ? out : null;
}

export function summarise(fks) {
  const by = {};
  for (const f of fks) by[f.on_delete] = (by[f.on_delete] ?? 0) + 1;
  return { total: fks.length, by_on_delete: by, tables: new Set(fks.map((f) => f.table)).size };
}

/** Compare live vs fixture: returns { added, removed, changed } keyed by table.column. */
export function diffFks(live, fixture) {
  const key = (f) => `${f.table}.${f.column}`;
  const a = new Map(live.map((f) => [key(f), f]));
  const b = new Map(fixture.map((f) => [key(f), f]));
  const added = [...a.keys()].filter((k) => !b.has(k));
  const removed = [...b.keys()].filter((k) => !a.has(k));
  const changed = [...a.keys()].filter((k) => b.has(k) && (a.get(k).on_delete !== b.get(k).on_delete || a.get(k).not_null !== b.get(k).not_null));
  return { added, removed, changed };
}

function main() {
  const json = flag("--json");
  const live = loadLiveFks();

  if (flag("--fixture")) {
    const out = {
      dumped_at: new Date().toISOString().slice(0, 10),
      source: "pg_constraint (contype=f) on production supabase-db, confrelid = public.app_users; regenerate with `node scripts/db/app-users-fk-inventory.mjs --json --fixture`",
      referenced: "public.app_users(id)",
      count: live.length,
      fks: live,
    };
    writeFileSync(FIXTURE, JSON.stringify(out, null, 2) + "\n");
    console.log(`fixture written: ${path.relative(WEB_DIR, FIXTURE)} (${live.length} FKs)`);
    return;
  }

  if (flag("--check")) {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")).fks;
    const d = diffFks(live, fixture);
    const drift = d.added.length + d.removed.length + d.changed.length;
    console.log(JSON.stringify({ ok: drift === 0, live: live.length, fixture: fixture.length, ...d }, null, 2));
    if (drift) {
      console.error("FK drift vs fixture — run with --fixture and update src/lib/privacy/erasure-map.ts");
      process.exit(1);
    }
    return;
  }

  let userId = opt("--user");
  const email = opt("--email");
  if (!userId && email) {
    userId = resolveUserId(email);
    if (!userId) {
      console.error(`no app_users row for ${email}`);
      process.exit(2);
    }
  }

  let counts = null;
  if (userId) {
    const raw = runPsql(countSql(live, userId)).trim();
    const rows = raw ? JSON.parse(raw) : [];
    counts = new Map(rows.map((r) => [`${r.t}.${r.c}`, r.n]));
  }

  const rows = live.map((f) => ({ ...f, rows: counts ? counts.get(`${f.table}.${f.column}`) ?? 0 : undefined }));
  if (json) {
    console.log(JSON.stringify({ user_id: userId ?? null, summary: summarise(live), fks: rows }, null, 2));
    return;
  }
  const w = Math.max(...rows.map((r) => `${r.table}.${r.column}`.length));
  console.log(`${"fk".padEnd(w)}  ${"on_delete".padEnd(10)} nn  ${userId ? "rows" : ""}`);
  for (const r of rows) {
    console.log(`${`${r.table}.${r.column}`.padEnd(w)}  ${r.on_delete.padEnd(10)} ${r.not_null ? "NN" : "  "}  ${userId ? r.rows : ""}`);
  }
  const s = summarise(live);
  console.log(`\n${s.total} FKs across ${s.tables} tables — ${Object.entries(s.by_on_delete).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
  if (userId) console.log(`user ${userId}: ${rows.reduce((n, r) => n + (r.rows ?? 0), 0)} referencing rows`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e?.stderr?.toString?.() || e?.message || e);
    process.exit(1);
  }
}
