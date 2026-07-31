#!/usr/bin/env node
// audit-migrations.mjs
// -----------------------------------------------------------------------------
// Audit which migrations in web/supabase/migrations/*.sql have actually been
// applied to the live self-hosted Supabase Postgres container.
//
// There is no schema-migration ledger table on this host — migrations are
// applied by hand per project memory `reference_db_migrations`. That's how
// 0062_data_room_professional.sql sat unapplied for months. This script
// closes that ergonomics gap: it parses each migration for the top-level
// objects it declares (tables / views / functions), asks the live DB whether
// each of those exists, and produces three buckets:
//
//   applied     — every declared object exists
//   partial     — some exist, some don't (worth investigating)
//   missing     — none exist
//   data-only   — no top-level objects declared (INSERTs / ALTERs / GRANTs
//                 only) — presence check is not applicable
//   parse_fail  — parser could not classify (recorded, not dropped)
//
// Output:
//   web/content/reports/migration-audit.jsonl   append-only, one line per run
//   web/content/reports/migration-audit-<date>.md  human-readable snapshot
//
// Usage:
//   node scripts/db/audit-migrations.mjs
//   node scripts/db/audit-migrations.mjs --no-markdown        # JSONL only
//   node scripts/db/audit-migrations.mjs --markdown-date 2026-07-31
//
// Env overrides:
//   PG_CONTAINER   docker container name (default: supabase-db)
//   PG_USER        psql user            (default: postgres)
//   PG_DB          psql database        (default: postgres)
//   MIG_DIR        migrations directory (default: web/supabase/migrations)
//   OUT_JSONL      jsonl output         (default: web/content/reports/migration-audit.jsonl)
//   REPORTS_DIR    dir for md snapshot  (default: web/content/reports)
// -----------------------------------------------------------------------------

import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')

// ---------------------------------------------------------------------------
// SQL parser — pure. Exported for colocated tests.
// ---------------------------------------------------------------------------

/**
 * Strip SQL comments so `CREATE TABLE ...` inside a comment doesn't get picked
 * up by the object regexes. Handles line comments (`-- ...`) and block
 * comments (`/* ... *​/`). Not string-aware (a `--` inside a text literal
 * would strip the rest of the line) but the migrations here don't put
 * comment tokens inside strings that also contain DDL, and being over-eager
 * only shrinks the search space.
 */
export function stripSqlComments(sql) {
  // Block comments — non-greedy.
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Line comments — to end of line.
  out = out.replace(/--[^\n]*/g, ' ')
  return out
}

/** Normalise a parsed identifier: strip quotes, lower-case, strip leading `public.`. */
function normaliseName(raw) {
  if (!raw) return null
  let n = raw.trim()
  // Strip surrounding quotes on each part of a qualified name.
  n = n
    .split('.')
    .map((part) => part.replace(/^"(.*)"$/, '$1'))
    .join('.')
  // Drop schema if it's `public`. Any other schema (auth, storage, …) stays
  // qualified — we don't want to claim we own an object in another schema.
  if (n.toLowerCase().startsWith('public.')) n = n.slice('public.'.length)
  return n.toLowerCase()
}

/**
 * Extract the top-level objects a migration declares. Returns:
 *   { tables: string[], views: string[], functions: string[], isDataOnly: boolean }
 *
 * `isDataOnly` is true when the migration declares no tables/views/functions
 * — typically pure INSERTs, ALTER TABLE ADD COLUMNs, GRANTs, or seed rows.
 * The audit skips presence checks for these (they cannot go "missing" in the
 * way a table can — their effect is column-level or row-level).
 */
export function extractDeclaredObjects(sql) {
  const stripped = stripSqlComments(sql)

  // Identifier regex — a bare word OR a double-quoted identifier, optionally
  // qualified with a schema (`schema.name` or `"schema"."name"`).
  const IDENT = String.raw`(?:"[^"]+"|[a-zA-Z_][a-zA-Z0-9_]*)`
  const QUAL = `(?:${IDENT}\\s*\\.\\s*)?${IDENT}`

  const tables = new Set()
  const views = new Set()
  const functions = new Set()

  // CREATE [GLOBAL|LOCAL] [TEMP|TEMPORARY|UNLOGGED] TABLE [IF NOT EXISTS] name
  const tableRe = new RegExp(
    String.raw`\bcreate\s+(?:global\s+|local\s+)?(?:temp(?:orary)?\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?(${QUAL})`,
    'gi',
  )
  for (const m of stripped.matchAll(tableRe)) {
    const n = normaliseName(m[1])
    if (n) tables.add(n)
  }

  // CREATE [OR REPLACE] [MATERIALIZED] [RECURSIVE] VIEW [IF NOT EXISTS] name
  const viewRe = new RegExp(
    String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+|recursive\s+)?view\s+(?:if\s+not\s+exists\s+)?(${QUAL})`,
    'gi',
  )
  for (const m of stripped.matchAll(viewRe)) {
    const n = normaliseName(m[1])
    if (n) views.add(n)
  }

  // CREATE [OR REPLACE] FUNCTION name (         <- open paren starts arg list
  // We stop at `(` — we don't want the signature, just the name.
  const funcRe = new RegExp(
    String.raw`\bcreate\s+(?:or\s+replace\s+)?function\s+(${QUAL})\s*\(`,
    'gi',
  )
  for (const m of stripped.matchAll(funcRe)) {
    const n = normaliseName(m[1])
    if (n) functions.add(n)
  }

  const isDataOnly =
    tables.size === 0 && views.size === 0 && functions.size === 0

  return {
    tables: [...tables].sort(),
    views: [...views].sort(),
    functions: [...functions].sort(),
    isDataOnly,
  }
}

// ---------------------------------------------------------------------------
// Live DB probes
// ---------------------------------------------------------------------------

function psql(container, user, db, sql) {
  const res = spawnSync(
    'docker',
    ['exec', container, 'psql', '-U', user, '-d', db, '-A', '-t', '-F', '|', '-c', sql],
    { encoding: 'utf8' },
  )
  if (res.status !== 0) {
    const err = (res.stderr || '').trim() || `psql exit ${res.status}`
    throw new Error(err)
  }
  return (res.stdout || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/** Return the subset of `names` that exist as public tables. */
function fetchExistingTables(container, user, db, names) {
  if (names.length === 0) return new Set()
  const listSql = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  const rows = psql(
    container,
    user,
    db,
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN (${listSql});`,
  )
  return new Set(rows.map((r) => r.toLowerCase()))
}

function fetchExistingViews(container, user, db, names) {
  if (names.length === 0) return new Set()
  const listSql = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  // pg_views covers regular views; matviews live in pg_matviews.
  const rows = psql(
    container,
    user,
    db,
    `SELECT viewname FROM pg_views WHERE schemaname='public' AND viewname IN (${listSql})
     UNION ALL
     SELECT matviewname FROM pg_matviews WHERE schemaname='public' AND matviewname IN (${listSql});`,
  )
  return new Set(rows.map((r) => r.toLowerCase()))
}

function fetchExistingFunctions(container, user, db, names) {
  if (names.length === 0) return new Set()
  const listSql = names.map((n) => `'${n.replace(/'/g, "''")}'`).join(',')
  const rows = psql(
    container,
    user,
    db,
    `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname IN (${listSql});`,
  )
  return new Set(rows.map((r) => r.toLowerCase()))
}

// ---------------------------------------------------------------------------
// Audit runner
// ---------------------------------------------------------------------------

function classify(declared, existingTables, existingViews, existingFunctions) {
  if (declared.isDataOnly) return { bucket: 'data-only', hits: 0, total: 0 }
  const items = [
    ...declared.tables.map((n) => ({ n, exists: existingTables.has(n) })),
    ...declared.views.map((n) => ({ n, exists: existingViews.has(n) })),
    ...declared.functions.map((n) => ({ n, exists: existingFunctions.has(n) })),
  ]
  const hits = items.filter((i) => i.exists).length
  const total = items.length
  let bucket = 'missing'
  if (hits === total) bucket = 'applied'
  else if (hits > 0) bucket = 'partial'
  return { bucket, hits, total, items }
}

export async function runAudit({
  container = process.env.PG_CONTAINER || 'supabase-db',
  user = process.env.PG_USER || 'postgres',
  db = process.env.PG_DB || 'postgres',
  migDir = process.env.MIG_DIR || join(REPO_ROOT, 'web', 'supabase', 'migrations'),
} = {}) {
  const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()

  // Parse first — collect all declared names for batched DB queries.
  const parsed = []
  const allTables = new Set()
  const allViews = new Set()
  const allFunctions = new Set()

  for (const file of files) {
    const full = join(migDir, file)
    let sql = ''
    try {
      sql = readFileSync(full, 'utf8')
    } catch (err) {
      parsed.push({ file, error: `read: ${err.message}`, declared: null })
      continue
    }
    let declared
    try {
      declared = extractDeclaredObjects(sql)
    } catch (err) {
      parsed.push({ file, error: `parse: ${err.message}`, declared: null })
      continue
    }
    parsed.push({ file, declared, error: null })
    declared.tables.forEach((n) => allTables.add(n))
    declared.views.forEach((n) => allViews.add(n))
    declared.functions.forEach((n) => allFunctions.add(n))
  }

  // One DB round-trip per object type.
  const existingTables = fetchExistingTables(container, user, db, [...allTables])
  const existingViews = fetchExistingViews(container, user, db, [...allViews])
  const existingFunctions = fetchExistingFunctions(container, user, db, [...allFunctions])

  // Bucket every migration.
  const results = []
  const counts = { total: 0, applied: 0, partial: 0, missing: 0, data_only: 0, parse_failed: 0 }
  const missingIds = []
  const partialIds = []

  for (const p of parsed) {
    counts.total += 1
    if (p.error) {
      counts.parse_failed += 1
      results.push({ file: p.file, bucket: 'parse_failed', error: p.error })
      continue
    }
    const c = classify(p.declared, existingTables, existingViews, existingFunctions)
    if (c.bucket === 'applied') counts.applied += 1
    else if (c.bucket === 'partial') counts.partial += 1
    else if (c.bucket === 'missing') counts.missing += 1
    else if (c.bucket === 'data-only') counts.data_only += 1

    if (c.bucket === 'missing') missingIds.push(p.file)
    if (c.bucket === 'partial') partialIds.push(p.file)

    results.push({
      file: p.file,
      bucket: c.bucket,
      declared: p.declared,
      hits: c.hits,
      total: c.total,
      items: c.items || [],
    })
  }

  return { container, counts, results, missingIds, partialIds }
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function renderMarkdown(audit, dateStr) {
  const lines = []
  lines.push(`# Migration audit — ${dateStr}`)
  lines.push('')
  lines.push(`Container probed: \`${audit.container}\``)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  const c = audit.counts
  lines.push(`| bucket | count |`)
  lines.push(`| --- | ---: |`)
  lines.push(`| total | ${c.total} |`)
  lines.push(`| applied | ${c.applied} |`)
  lines.push(`| partial | ${c.partial} |`)
  lines.push(`| missing | ${c.missing} |`)
  lines.push(`| data-only | ${c.data_only} |`)
  lines.push(`| parse_failed | ${c.parse_failed} |`)
  lines.push('')

  const renderItems = (r) => {
    const bits = []
    for (const it of r.items || []) {
      bits.push(`  - ${it.exists ? 'ok ' : 'MISS'} \`${it.n}\``)
    }
    return bits.join('\n')
  }

  lines.push('## Missing migrations')
  lines.push('')
  const missing = audit.results.filter((r) => r.bucket === 'missing')
  if (missing.length === 0) lines.push('_none_')
  for (const r of missing) {
    lines.push(`### ${r.file}`)
    lines.push('')
    if (r.declared.tables.length) lines.push(`- declared tables: ${r.declared.tables.map((n) => `\`${n}\``).join(', ')}`)
    if (r.declared.views.length) lines.push(`- declared views: ${r.declared.views.map((n) => `\`${n}\``).join(', ')}`)
    if (r.declared.functions.length) lines.push(`- declared functions: ${r.declared.functions.map((n) => `\`${n}\``).join(', ')}`)
    const items = renderItems(r)
    if (items) lines.push('', items)
    lines.push('')
  }

  lines.push('## Partial migrations')
  lines.push('')
  const partial = audit.results.filter((r) => r.bucket === 'partial')
  if (partial.length === 0) lines.push('_none_')
  for (const r of partial) {
    lines.push(`### ${r.file} — ${r.hits}/${r.total}`)
    lines.push('')
    const items = renderItems(r)
    if (items) lines.push(items)
    lines.push('')
  }

  lines.push('## Parse failures')
  lines.push('')
  const failed = audit.results.filter((r) => r.bucket === 'parse_failed')
  if (failed.length === 0) lines.push('_none_')
  for (const r of failed) {
    lines.push(`- \`${r.file}\` — ${r.error}`)
  }
  lines.push('')

  lines.push('## Applied (headline)')
  lines.push('')
  lines.push(`${audit.counts.applied} migrations verified applied. See JSONL for the full manifest.`)
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const noMarkdown = args.includes('--no-markdown')
  const dateArgIdx = args.indexOf('--markdown-date')
  const dateStr = dateArgIdx >= 0 ? args[dateArgIdx + 1] : new Date().toISOString().slice(0, 10)

  const outJsonl = process.env.OUT_JSONL || join(REPO_ROOT, 'web', 'content', 'reports', 'migration-audit.jsonl')
  const reportsDir = process.env.REPORTS_DIR || join(REPO_ROOT, 'web', 'content', 'reports')

  const audit = await runAudit()

  // JSONL line — compact summary. Full detail goes in the markdown.
  const line = {
    ts: new Date().toISOString(),
    container: audit.container,
    counts: audit.counts,
    missing: audit.missingIds,
    partial: audit.partialIds,
  }
  mkdirSync(dirname(outJsonl), { recursive: true })
  appendFileSync(outJsonl, JSON.stringify(line) + '\n', 'utf8')

  if (!noMarkdown) {
    mkdirSync(reportsDir, { recursive: true })
    const mdPath = join(reportsDir, `migration-audit-${dateStr}.md`)
    writeFileSync(mdPath, renderMarkdown(audit, dateStr), 'utf8')
    console.log(`wrote ${mdPath}`)
  }

  console.log(`appended summary to ${outJsonl}`)
  console.log(JSON.stringify(line))
}

// Run when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || err.message)
    process.exit(1)
  })
}
