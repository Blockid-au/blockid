// Colocated tests for the migration-audit SQL parser.
//
// We test `extractDeclaredObjects` — the pure part — against hand-crafted SQL
// fixtures covering the shapes the real migrations actually use: bare
// `CREATE TABLE`, `IF NOT EXISTS`, `public.` prefixes, `CREATE OR REPLACE
// VIEW`, `CREATE FUNCTION`, DDL nested inside comments, and data-only
// migrations (ALTER + INSERT only). The live-DB round trip is intentionally
// not tested here — that would flake in any environment without the Supabase
// container, and the audit runner delegates to the parser + a thin batched
// psql shim.

import { describe, expect, it } from 'vitest'
import { extractDeclaredObjects, stripSqlComments } from './audit-migrations.mjs'

describe('stripSqlComments', () => {
  it('removes line comments', () => {
    const out = stripSqlComments('SELECT 1; -- trailing comment\nSELECT 2;')
    expect(out).not.toMatch(/trailing comment/)
    expect(out).toMatch(/SELECT 2/)
  })
  it('removes block comments across lines', () => {
    const out = stripSqlComments('/* header\n   block */\nCREATE TABLE t (id int);')
    expect(out).not.toMatch(/header/)
    expect(out).toMatch(/CREATE TABLE t/)
  })
})

describe('extractDeclaredObjects — tables', () => {
  it('picks up a bare CREATE TABLE', () => {
    const d = extractDeclaredObjects('CREATE TABLE leads (id uuid);')
    expect(d.tables).toEqual(['leads'])
    expect(d.isDataOnly).toBe(false)
  })
  it('picks up IF NOT EXISTS with public. prefix', () => {
    const d = extractDeclaredObjects(
      'create table if not exists public.data_room_documents (id uuid);',
    )
    expect(d.tables).toEqual(['data_room_documents'])
  })
  it('picks up multiple tables in one migration', () => {
    const sql = `
      create table if not exists a (id int);
      CREATE TABLE b (id int);
      create table if not exists public.c (id int);
    `
    const d = extractDeclaredObjects(sql)
    expect(d.tables).toEqual(['a', 'b', 'c'])
  })
  it('handles quoted identifiers', () => {
    const d = extractDeclaredObjects('CREATE TABLE "MixedCase" (id int);')
    expect(d.tables).toEqual(['mixedcase'])
  })
  it('handles TEMPORARY and UNLOGGED variants', () => {
    const d = extractDeclaredObjects(`
      CREATE UNLOGGED TABLE u (id int);
      CREATE TEMPORARY TABLE t (id int);
    `)
    expect(d.tables.sort()).toEqual(['t', 'u'])
  })
})

describe('extractDeclaredObjects — views', () => {
  it('picks up CREATE OR REPLACE VIEW', () => {
    const d = extractDeclaredObjects('create or replace view v_mrr_active as select 1;')
    expect(d.views).toEqual(['v_mrr_active'])
    expect(d.tables).toEqual([])
  })
  it('picks up MATERIALIZED VIEW', () => {
    const d = extractDeclaredObjects('CREATE MATERIALIZED VIEW public.mv AS SELECT 1;')
    expect(d.views).toEqual(['mv'])
  })
  it('does not confuse CREATE VIEW with CREATE TABLE', () => {
    const d = extractDeclaredObjects('create or replace view v as select 1;')
    expect(d.tables).toEqual([])
  })
})

describe('extractDeclaredObjects — functions', () => {
  it('picks up CREATE OR REPLACE FUNCTION', () => {
    const d = extractDeclaredObjects(
      'create or replace function pick_lifecycle_due(p_limit int) returns table(x int) as $$ select 1 $$ language sql;',
    )
    expect(d.functions).toEqual(['pick_lifecycle_due'])
  })
  it('picks up multiple functions', () => {
    const sql = `
      create or replace function f1() returns int as $$ select 1 $$ language sql;
      create function public.f2(a int, b int) returns int as $$ select a+b $$ language sql;
    `
    const d = extractDeclaredObjects(sql)
    expect(d.functions.sort()).toEqual(['f1', 'f2'])
  })
})

describe('extractDeclaredObjects — data-only and edge cases', () => {
  it('flags comment-only files as data-only', () => {
    const d = extractDeclaredObjects('-- just a comment\n/* nothing else */\n')
    expect(d.isDataOnly).toBe(true)
    expect(d.tables).toEqual([])
    expect(d.views).toEqual([])
    expect(d.functions).toEqual([])
  })
  it('flags INSERT ... ON CONFLICT seed migrations as data-only', () => {
    const sql = `
      INSERT INTO kb_valuation_knowhow (slug, title, summary)
      VALUES ('a', 'A', 's')
      ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title;
    `
    const d = extractDeclaredObjects(sql)
    expect(d.isDataOnly).toBe(true)
  })
  it('flags ALTER TABLE ADD COLUMN migrations as data-only', () => {
    const sql = `
      ALTER TABLE data_rooms
        ADD COLUMN IF NOT EXISTS completeness_score int DEFAULT 0,
        ADD COLUMN IF NOT EXISTS drive_folder_id text;
    `
    const d = extractDeclaredObjects(sql)
    expect(d.isDataOnly).toBe(true)
    expect(d.tables).toEqual([])
  })
  it('ignores DDL inside comments', () => {
    const sql = `
      -- CREATE TABLE ghost (id int);
      /* CREATE TABLE also_ghost (id int); */
      CREATE TABLE real (id int);
    `
    const d = extractDeclaredObjects(sql)
    expect(d.tables).toEqual(['real'])
  })
  it('is tolerant of mixed case and extra whitespace', () => {
    const d = extractDeclaredObjects('CrEaTe   TaBlE    iF   nOt   ExIsTs    weird_case  ( id int );')
    expect(d.tables).toEqual(['weird_case'])
  })
})

describe('extractDeclaredObjects — mixed migration', () => {
  it('captures tables + views + functions in one file', () => {
    const sql = `
      CREATE TABLE IF NOT EXISTS public.tbl (id int);
      CREATE OR REPLACE VIEW public.v AS SELECT 1;
      CREATE OR REPLACE FUNCTION public.fn(a int) RETURNS int AS $$ SELECT a $$ LANGUAGE sql;
    `
    const d = extractDeclaredObjects(sql)
    expect(d.tables).toEqual(['tbl'])
    expect(d.views).toEqual(['v'])
    expect(d.functions).toEqual(['fn'])
    expect(d.isDataOnly).toBe(false)
  })
})
