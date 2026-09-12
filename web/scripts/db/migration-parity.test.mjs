// Colocated vitest for scripts/db/migration-parity.mjs (release QA-2 P0).
//
// Pins the tolerant SQL parser that the parity audit and the ledger backfill
// depend on. Regressions this guards against:
//   - a `;` inside a policy name, string literal or $$ body splitting a statement;
//   - ADD COLUMN guarded inside a DO $$ … IF NOT EXISTS … THEN … END IF $$ block
//     (the 20260814_tech_analyses.sql / projects.github_url shape) going unseen;
//   - comments inside plpgsql bodies swallowing the rest of the block;
//   - DROP POLICY IF EXISTS + CREATE POLICY in the same file reported as a
//     "should be absent" failure;
//   - superseded objects (dropped by a later file) reported as missing;
//   - the four statuses and the waiver/deferred paths of auditMigrations().

import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { auditMigrations, parseMigration, splitStatements, summarise } from "./migration-parity.mjs";

const keys = (sql) => parseMigration(sql).objects.map((o) => o.key);

describe("splitStatements", () => {
  it("does not split on ; inside strings, quoted identifiers or $$ bodies", () => {
    const sql = `create policy "a; b" on t using (x = 'y;z');
create function f() returns void as $$ begin perform 1; perform 2; end $$ language plpgsql;
-- comment; with semicolon
select 1;`;
    const out = splitStatements(sql);
    expect(out).toHaveLength(3);
    expect(out[0]).toContain(`"a; b"`);
    expect(out[1]).toContain("perform 1; perform 2;");
  });
  it("strips -- comments inside dollar-quoted bodies so a later recursion sees the statements", () => {
    const sql = `DO $$ BEGIN
  -- ── 1. seed ──────────────
  insert into t (a) values (1);
END $$;`;
    const r = parseMigration(sql);
    expect(r.dataOps).toBe(1);
  });
});

describe("parseMigration — object extraction", () => {
  it("CREATE TABLE → table + column keys (constraints skipped)", () => {
    expect(keys(`CREATE TABLE IF NOT EXISTS public.t (id uuid PRIMARY KEY, name text NOT NULL, CONSTRAINT t_chk CHECK (true), UNIQUE (name));`)).toEqual([
      "table.public.t",
      "column.public.t.id",
      "column.public.t.name",
    ]);
  });
  it("ALTER TABLE ADD COLUMN (multi-clause) and ENABLE RLS", () => {
    expect(keys(`alter table email_preferences add column if not exists a text, add column b int; alter table x enable row level security;`)).toEqual([
      "column.public.email_preferences.a",
      "column.public.email_preferences.b",
      "rls.public.x",
    ]);
  });
  it("sees ADD COLUMN guarded inside a DO block (projects.github_url shape)", () => {
    const sql = `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'github_url') THEN
    ALTER TABLE projects ADD COLUMN github_url TEXT;
  END IF;
END $$;`;
    expect(keys(sql)).toEqual(["column.public.projects.github_url"]);
  });
  it("indexes, functions, triggers, policies, types, enum values, extensions, views", () => {
    const sql = `
create unique index concurrently if not exists i1 on public.t (a);
create or replace function public.fn(a int) returns int as $$ select 1 $$ language sql;
create trigger trg before update on t for each row execute function fn();
create policy "P 1" on public.t for select using (true);
create type mood as enum ('sad', 'ok');
alter type mood add value if not exists 'happy';
create extension if not exists pgcrypto;
create or replace view v as select 1;`;
    expect(keys(sql)).toEqual([
      "index.public.i1",
      "function.public.fn",
      "trigger.public.t.trg",
      "policy.public.t.P 1",
      "type.public.mood",
      "enum.public.mood.sad",
      "enum.public.mood.ok",
      "enum.public.mood.happy",
      "extension.pgcrypto",
      "view.public.v",
    ]);
  });
  it("classifies data-only files as dataOps with no objects", () => {
    const r = parseMigration(`insert into plans (id) values ('x') on conflict do nothing; update plans set a = 1 where id = 'x';`);
    expect(r.objects).toHaveLength(0);
    expect(r.dataOps).toBe(2);
  });
  it("records DROPs separately", () => {
    const r = parseMigration(`drop table if exists public.old; alter table t drop column if exists c; drop policy if exists p on t;`);
    expect(r.objects).toHaveLength(0);
    expect(r.drops.map((d) => d.key)).toEqual(["table.public.old", "column.public.t.c", "policy.public.t.p"]);
  });
  it("function bodies are opaque (a CREATE TABLE inside a function is not an object)", () => {
    expect(keys(`create or replace function f() returns void as $$ begin create temp table x (a int); end $$ language plpgsql;`)).toEqual([
      "function.public.f",
    ]);
  });
});

function fakeCatalog(present) {
  const S = (kind) => new Set(present.filter((k) => k.startsWith(kind + ".")));
  return {
    tables: S("table"),
    views: S("view"),
    sequences: S("sequence"),
    rls: S("rls"),
    columns: S("column"),
    indexes: S("index"),
    functions: S("function"),
    triggers: S("trigger"),
    policies: S("policy"),
    types: S("type"),
    enums: S("enum"),
    constraints: S("constraint"),
    extensions: S("extension"),
    schemas: S("schema"),
    ledger: new Set(),
  };
}

function migDir(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "parity-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(dir, name), sql);
  return dir;
}

describe("auditMigrations — statuses", () => {
  const dir = migDir({
    "0001_a.sql": "create table t (id uuid primary key, a text);",
    "0002_b.sql": "alter table t add column if not exists b text; create index if not exists t_b on t (b);",
    "0003_c.sql": "create table u (id uuid);",
    "0004_seed.sql": "insert into t (id) values ('x') on conflict do nothing;",
    "0005_drop.sql": "drop table if exists u;",
    "0006_pol.sql": "drop policy if exists p on t; create policy p on t for select using (true);",
  });
  const catalog = fakeCatalog(["table.public.t", "column.public.t.id", "column.public.t.a", "column.public.t.b", "policy.public.t.p"]);
  const results = auditMigrations({ dir, catalog, exceptions: new Map() });
  const byFile = Object.fromEntries(results.map((r) => [r.file, r]));

  it("applied / partial / unparsed / superseded", () => {
    expect(byFile["0001_a.sql"].status).toBe("applied");
    expect(byFile["0002_b.sql"].status).toBe("partial");
    expect(byFile["0002_b.sql"].missing).toEqual(["index t_b on t"]);
    expect(byFile["0004_seed.sql"].status).toBe("unparsed");
    expect(byFile["0004_seed.sql"].note).toBe("data-only");
  });
  it("a table dropped by a later file supersedes the earlier CREATE (not 'missing')", () => {
    expect(byFile["0003_c.sql"].status).toBe("applied");
    expect(byFile["0003_c.sql"].superseded[0]).toContain("dropped by 0005_drop.sql");
    expect(byFile["0005_drop.sql"].status).toBe("applied"); // u is absent → drop verified
  });
  it("DROP POLICY IF EXISTS + CREATE POLICY in the same file is verified by the CREATE only", () => {
    expect(byFile["0006_pol.sql"].status).toBe("applied");
  });
  it("summarise counts", () => {
    expect(summarise(results)).toMatchObject({ total: 6, applied: 4, partial: 1, missing: 0, unparsed: 1, data_only: 1 });
  });
});

describe("auditMigrations — waivers and deferred", () => {
  const dir = migDir({
    "0010_x.sql": "create table x (id uuid, gone text);",
    "0011_big.sql": "create table y (id uuid);",
  });
  const catalog = fakeCatalog(["table.public.x", "column.public.x.id"]);
  it("waived objects are excluded from the verdict but reported", () => {
    const exceptions = new Map([["0010_x.sql", { reason: "gone was removed by hand", patterns: [/^column\.public\.x\.gone$/], deferred: false }]]);
    const [r] = auditMigrations({ dir, catalog, exceptions, only: "0010" });
    expect(r.status).toBe("applied");
    expect(r.waived).toEqual(["column x.gone"]);
    expect(r.waiver_reason).toBe("gone was removed by hand");
  });
  it("deferred files stay 'missing' but are flagged and excluded from --strict", () => {
    const exceptions = new Map([["0011_big.sql", { reason: "later", patterns: [], deferred: true }]]);
    const [r] = auditMigrations({ dir, catalog, exceptions, only: "0011" });
    expect(r.status).toBe("missing");
    expect(r.deferred).toBe(true);
    expect(summarise([r])).toMatchObject({ missing: 1, deferred: 1 });
  });
});
