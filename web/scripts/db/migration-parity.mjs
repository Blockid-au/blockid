#!/usr/bin/env node
// scripts/db/migration-parity.mjs — schema parity audit (release QA-2 P0).
//
// There is no automatic migration runner on this stack (migrations are applied
// by hand, see web/AGENTS.md → "DB migrations"). This script answers the
// question "which migration files in web/supabase/migrations/ are actually
// reflected in the production database?" without needing a ledger:
//
//   1. Parse every *.sql file with a tolerant regex parser and collect the
//      objects it creates / alters (tables + their columns, ADD COLUMN, indexes,
//      functions, triggers, policies, views, types + enum values, extensions,
//      ENABLE ROW LEVEL SECURITY, constraints; DROP TABLE / DROP COLUMN as
//      "expect absent").
//   2. Pull the live catalog (information_schema / pg_catalog) in ONE psql call
//      via `docker exec supabase-db` (override with PSQL="psql ..." or
//      PGURL=postgres://...).
//   3. Classify each migration:
//        applied     every parsed object present
//        partial     some objects present, some missing   (lists them)
//        missing     no parsed object present
//        unparsed    no recognisable DDL (pure data updates / seeds / grants)
//      Objects a LATER migration deliberately dropped are ignored
//      ("superseded") so 0302_drop_unused_entitlements_table does not turn
//      0075 into a false partial. DROP TABLE/COLUMN/… are themselves checked
//      as "expect absent". Known, documented drift (a migration re-defined
//      by a later file, a stub we refuse to apply) is waived per object in
//      scripts/db/parity-exceptions.json — waivers are always printed.
//
// Usage:
//   node scripts/db/migration-parity.mjs            # human table
//   node scripts/db/migration-parity.mjs --json     # machine output
//   node scripts/db/migration-parity.mjs --only 2026 --verbose
//   node scripts/db/migration-parity.mjs --dir path/to/migrations
//
// Exit code: 0 always (audit tool) unless --strict, then 1 when any
// migration is missing/partial.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..", "..");

// ───────────────────────── CLI ─────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const JSON_OUT = flag("--json");
const VERBOSE = flag("--verbose") || flag("-v");
const STRICT = flag("--strict");
const ONLY = opt("--only", "");
const MIG_DIR = path.resolve(opt("--dir", path.join(WEB_DIR, "supabase", "migrations")));
const EXCEPTIONS_FILE = path.resolve(opt("--exceptions", path.join(__dirname, "parity-exceptions.json")));

/** { "<file>": { reason, ignore: ["column.public.data_rooms.*", …] } } */
export function loadExceptions(file = EXCEPTIONS_FILE) {
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    const out = new Map();
    for (const [f, v] of Object.entries(j)) {
      if (f.startsWith("_")) continue;
      const pats = (v.ignore ?? []).map((g) => new RegExp("^" + g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
      out.set(f, { reason: v.reason ?? "", patterns: pats, deferred: v.deferred === true });
    }
    return out;
  } catch {
    return new Map();
  }
}

// ───────────────────────── SQL tokeniser ─────────────────────────
/**
 * Strip comments and split into top-level statements. Tracks '...', "...",
 * $tag$...$tag$ and -- / block comments so a `;` inside a string, a policy
 * name or a function body never splits a statement. Returns statements with
 * whitespace collapsed. Dollar-quoted bodies are preserved verbatim in the
 * statement text so callers can look inside DO blocks.
 */
/** Remove -- and block comments, respecting '…' strings. */
export function stripComments(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    if (c === "-" && c2 === "-") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (text[j] === "'" && text[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (text[j] === "'") break;
        j++;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export function splitStatements(sql) {
  const out = [];
  let cur = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    const c2 = sql[i + 1];
    // line comment
    if (c === "-" && c2 === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    // block comment
    if (c === "/" && c2 === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    // single-quoted string (with '' escapes)
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // double-quoted identifier
    if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      const j = end < 0 ? n : end;
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // dollar quote
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const j = end < 0 ? n : end + tag.length;
        // plpgsql bodies carry their own -- comments; strip them now because
        // the statement's whitespace is collapsed below and a comment would
        // otherwise swallow the rest of the body when we recurse into it.
        cur += tag + stripComments(sql.slice(i + tag.length, Math.max(i + tag.length, j - tag.length))) + (end < 0 ? "" : tag);
        i = j;
        continue;
      }
    }
    if (c === ";") {
      const s = cur.replace(/\s+/g, " ").trim();
      if (s) out.push(s);
      cur = "";
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  const s = cur.replace(/\s+/g, " ").trim();
  if (s) out.push(s);
  return out;
}

// ───────────────────────── identifier helpers ─────────────────────────
const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = `(${IDENT})(?:\\s*\\.\\s*(${IDENT}))?`;

function unq(s) {
  if (!s) return s;
  return s.startsWith('"') ? s.slice(1, -1) : s.toLowerCase();
}
function qual(a, b) {
  // (schema, name) from a QNAME match; default schema public
  if (b) return { schema: unq(a), name: unq(b) };
  return { schema: "public", name: unq(a) };
}
function key(...parts) {
  return parts.join(".");
}

// ───────────────────────── DDL parser ─────────────────────────
const COLUMN_STOPWORDS = new Set([
  "constraint",
  "primary",
  "unique",
  "foreign",
  "check",
  "like",
  "exclude",
]);

function parseCreateTableColumns(stmt) {
  // Extract the outermost parenthesised body after the table name.
  const open = stmt.indexOf("(");
  if (open < 0) return [];
  let depth = 0;
  let close = -1;
  for (let i = open; i < stmt.length; i++) {
    if (stmt[i] === "(") depth++;
    else if (stmt[i] === ")") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) return [];
  const body = stmt.slice(open + 1, close);
  // split on top-level commas
  const items = [];
  depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      items.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) items.push(cur.trim());
  const cols = [];
  for (const it of items) {
    const m = new RegExp(`^(${IDENT})\\s`).exec(it + " ");
    if (!m) continue;
    const name = unq(m[1]);
    if (COLUMN_STOPWORDS.has(name)) continue;
    cols.push(name);
  }
  return cols;
}

/**
 * Parse one migration file → { objects: [...], drops: [...], dataOps: n, ddlOps: n }
 * object = { kind, key, desc } ; kinds: table, view, column, index, function,
 * trigger, policy, type, enum_value, extension, schema, sequence, rls, constraint
 */
export function parseMigration(sql) {
  const objects = new Map();
  const drops = new Map();
  let dataOps = 0;
  let ddlOps = 0;
  const add = (kind, k, desc) => {
    if (!objects.has(k)) objects.set(k, { kind, key: k, desc });
  };
  const drop = (kind, k, desc) => {
    if (!drops.has(k)) drops.set(k, { kind, key: k, desc });
  };

  const stmts = splitStatements(sql);
  const queue = [...stmts];
  while (queue.length) {
    let s = queue.shift();
    // plpgsql scaffolding inside DO blocks: strip DECLARE…BEGIN, BEGIN,
    // IF … THEN, ELSIF … THEN, ELSE, END IF, LOOP heads so the wrapped
    // statement is matched on its own.
    for (let prev = null; prev !== s; ) {
      prev = s;
      s = s
        .replace(/^declare\b[\s\S]*?\bbegin\s+/i, "")
        .replace(/^begin\s+/i, "")
        .replace(/^(?:els)?if\b[\s\S]*?\bthen\s+/i, "")
        .replace(/^else\s+/i, "")
        .replace(/^end\s+(?:if|loop)\s*/i, "")
        .replace(/^end\s*$/i, "")
        .replace(/^(?:for(?:each)?|while)\b[\s\S]*?\bloop\s+/i, "")
        .replace(/^loop\s+/i, "")
        .trim();
    }
    if (!s) continue;
    if (/^(execute|perform|raise|return|exit|continue)\b/i.test(s)) {
      // Dynamic SQL — cannot verify statically. Count as DDL if it looks like it.
      if (/\b(create|alter|drop|grant|revoke)\b/i.test(s)) ddlOps++;
      else if (/\b(insert|update|delete)\b/i.test(s)) dataOps++;
      continue;
    }
    const lower = s.toLowerCase();

    // DO $$ ... $$ — look inside (this is where ADD COLUMN guards live).
    let m = /^do\s+(\$[A-Za-z0-9_]*\$)([\s\S]*)\1/i.exec(s);
    if (m) {
      for (const inner of splitStatements(m[2])) queue.push(inner);
      continue;
    }

    // CREATE [OR REPLACE] FUNCTION name( — record, then drop the body so
    // statements inside it aren't mistaken for schema objects.
    m = new RegExp(`^create\\s+(?:or\\s+replace\\s+)?function\\s+${QNAME}\\s*\\(`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      add("function", key("function", q.schema, q.name), `function ${q.schema}.${q.name}()`);
      ddlOps++;
      continue;
    }
    if (/^(create|alter)\s+(?:or\s+replace\s+)?(procedure|aggregate)\b/i.test(s)) {
      ddlOps++;
      continue;
    }

    // CREATE TABLE
    m = new RegExp(`^create\\s+(?:(temp|temporary|unlogged)\\s+)?table\\s+(?:if\\s+not\\s+exists\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      if (m[1] && /temp/i.test(m[1])) continue;
      const q = qual(m[2], m[3]);
      ddlOps++;
      add("table", key("table", q.schema, q.name), `table ${q.schema}.${q.name}`);
      for (const col of parseCreateTableColumns(s)) {
        add("column", key("column", q.schema, q.name, col), `column ${q.name}.${col}`);
      }
      continue;
    }

    // CREATE [OR REPLACE] [MATERIALIZED] VIEW
    m = new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:(materialized)\\s+)?view\\s+(?:if\\s+not\\s+exists\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[2], m[3]);
      ddlOps++;
      add("view", key("view", q.schema, q.name), `${m[1] ? "materialized " : ""}view ${q.schema}.${q.name}`);
      continue;
    }

    // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] name ON table
    m = new RegExp(`^create\\s+(?:unique\\s+)?index\\s+(?:concurrently\\s+)?(?:if\\s+not\\s+exists\\s+)?(${IDENT})\\s+on\\s+(?:only\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[2], m[3]);
      ddlOps++;
      add("index", key("index", q.schema, unq(m[1])), `index ${unq(m[1])} on ${q.name}`);
      continue;
    }
    if (/^create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?on\b/i.test(s)) {
      ddlOps++; // unnamed index — cannot verify by name
      continue;
    }

    // CREATE [OR REPLACE] TRIGGER name ... ON table
    m = new RegExp(`^create\\s+(?:or\\s+replace\\s+)?(?:constraint\\s+)?trigger\\s+(${IDENT})\\s[\\s\\S]*?\\son\\s+${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[2], m[3]);
      ddlOps++;
      add("trigger", key("trigger", q.schema, q.name, unq(m[1])), `trigger ${unq(m[1])} on ${q.name}`);
      continue;
    }

    // CREATE POLICY name ON table
    m = new RegExp(`^create\\s+policy\\s+(${IDENT})\\s+on\\s+(?:only\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[2], m[3]);
      ddlOps++;
      add("policy", key("policy", q.schema, q.name, unq(m[1])), `policy "${unq(m[1])}" on ${q.name}`);
      continue;
    }

    // CREATE TYPE name AS ENUM ('a','b')
    m = new RegExp(`^create\\s+type\\s+${QNAME}\\s+as\\s+enum\\s*\\(([^)]*)\\)`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      ddlOps++;
      add("type", key("type", q.schema, q.name), `type ${q.name}`);
      for (const v of m[3].matchAll(/'((?:[^']|'')*)'/g)) {
        add("enum_value", key("enum", q.schema, q.name, v[1]), `enum ${q.name}.'${v[1]}'`);
      }
      continue;
    }
    m = new RegExp(`^create\\s+(?:domain|type)\\s+${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      ddlOps++;
      add("type", key("type", q.schema, q.name), `type ${q.name}`);
      continue;
    }
    // ALTER TYPE name ADD VALUE [IF NOT EXISTS] 'x'
    m = new RegExp(`^alter\\s+type\\s+${QNAME}\\s+add\\s+value\\s+(?:if\\s+not\\s+exists\\s+)?'((?:[^']|'')*)'`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      ddlOps++;
      add("enum_value", key("enum", q.schema, q.name, m[3]), `enum ${q.name}.'${m[3]}'`);
      continue;
    }

    // CREATE EXTENSION / SCHEMA / SEQUENCE
    m = new RegExp(`^create\\s+extension\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})`, "i").exec(s);
    if (m) {
      ddlOps++;
      add("extension", key("extension", unq(m[1])), `extension ${unq(m[1])}`);
      continue;
    }
    m = new RegExp(`^create\\s+schema\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})`, "i").exec(s);
    if (m) {
      ddlOps++;
      add("schema", key("schema", unq(m[1])), `schema ${unq(m[1])}`);
      continue;
    }
    m = new RegExp(`^create\\s+sequence\\s+(?:if\\s+not\\s+exists\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      ddlOps++;
      add("sequence", key("sequence", q.schema, q.name), `sequence ${q.name}`);
      continue;
    }

    // ALTER TABLE … (may be embedded after IF … THEN inside a DO block)
    m = new RegExp(`\\balter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${QNAME}\\s+([\\s\\S]*)$`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      const rest = m[3];
      ddlOps++;
      // split actions on top-level commas
      const actions = [];
      let depth = 0;
      let cur = "";
      for (const ch of rest) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          actions.push(cur.trim());
          cur = "";
        } else cur += ch;
      }
      if (cur.trim()) actions.push(cur.trim());
      for (const a of actions) {
        let am;
        if ((am = new RegExp(`^add\\s+(?:column\\s+)?(?:if\\s+not\\s+exists\\s+)?(${IDENT})`, "i").exec(a)) && !/^add\s+constraint/i.test(a) && !/^add\s+(primary|unique|foreign|check|exclude)\b/i.test(a)) {
          add("column", key("column", q.schema, q.name, unq(am[1])), `column ${q.name}.${unq(am[1])}`);
        } else if ((am = new RegExp(`^add\\s+constraint\\s+(?:if\\s+not\\s+exists\\s+)?(${IDENT})`, "i").exec(a))) {
          add("constraint", key("constraint", q.schema, q.name, unq(am[1])), `constraint ${unq(am[1])} on ${q.name}`);
        } else if (/^enable\s+row\s+level\s+security/i.test(a)) {
          add("rls", key("rls", q.schema, q.name), `RLS enabled on ${q.name}`);
        } else if ((am = new RegExp(`^rename\\s+(?:column\\s+)?(${IDENT})\\s+to\\s+(${IDENT})`, "i").exec(a))) {
          add("column", key("column", q.schema, q.name, unq(am[2])), `column ${q.name}.${unq(am[2])} (renamed)`);
          drop("column", key("column", q.schema, q.name, unq(am[1])), `column ${q.name}.${unq(am[1])} (renamed away)`);
        } else if ((am = new RegExp(`^drop\\s+(?:column\\s+)?(?:if\\s+exists\\s+)?(${IDENT})`, "i").exec(a)) && !/^drop\s+constraint/i.test(a)) {
          drop("column", key("column", q.schema, q.name, unq(am[1])), `column ${q.name}.${unq(am[1])} dropped`);
        } else if ((am = new RegExp(`^drop\\s+constraint\\s+(?:if\\s+exists\\s+)?(${IDENT})`, "i").exec(a))) {
          drop("constraint", key("constraint", q.schema, q.name, unq(am[1])), `constraint ${unq(am[1])} dropped`);
        }
        // ALTER COLUMN … SET DEFAULT / TYPE etc: not verifiable cheaply → ignore
      }
      continue;
    }

    // DROP TABLE / VIEW / INDEX / POLICY / TRIGGER / FUNCTION / TYPE
    m = new RegExp(`^drop\\s+(?:materialized\\s+)?(table|view)\\s+(?:if\\s+exists\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[2], m[3]);
      ddlOps++;
      drop(m[1].toLowerCase(), key(m[1].toLowerCase(), q.schema, q.name), `${m[1].toLowerCase()} ${q.name} dropped`);
      continue;
    }
    m = new RegExp(`^drop\\s+index\\s+(?:concurrently\\s+)?(?:if\\s+exists\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      ddlOps++;
      drop("index", key("index", q.schema, q.name), `index ${q.name} dropped`);
      continue;
    }
    m = new RegExp(`^drop\\s+policy\\s+(?:if\\s+exists\\s+)?(${IDENT})\\s+on\\s+${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[2], m[3]);
      ddlOps++;
      drop("policy", key("policy", q.schema, q.name, unq(m[1])), `policy "${unq(m[1])}" on ${q.name} dropped`);
      continue;
    }
    m = new RegExp(`^drop\\s+trigger\\s+(?:if\\s+exists\\s+)?(${IDENT})\\s+on\\s+${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[2], m[3]);
      ddlOps++;
      drop("trigger", key("trigger", q.schema, q.name, unq(m[1])), `trigger ${unq(m[1])} on ${q.name} dropped`);
      continue;
    }
    m = new RegExp(`^drop\\s+function\\s+(?:if\\s+exists\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      ddlOps++;
      drop("function", key("function", q.schema, q.name), `function ${q.name} dropped`);
      continue;
    }
    m = new RegExp(`^drop\\s+type\\s+(?:if\\s+exists\\s+)?${QNAME}`, "i").exec(s);
    if (m) {
      const q = qual(m[1], m[2]);
      ddlOps++;
      drop("type", key("type", q.schema, q.name), `type ${q.name} dropped`);
      continue;
    }

    // Other DDL we acknowledge but do not verify.
    if (/^(alter\s+(function|view|sequence|policy|index|type|default\s+privileges|schema|role)|comment\s+on|grant|revoke|refresh\s+materialized|security\s+label|create\s+(rule|cast))\b/i.test(lower)) {
      ddlOps++;
      continue;
    }
    // Data ops.
    if (/^(insert\s+into|update\s|delete\s+from|truncate|with\s|select\s|perform\s)/i.test(lower)) {
      dataOps++;
      continue;
    }
    // begin/commit/set/notify/if/raise/end — control noise.
  }
  return { objects: [...objects.values()], drops: [...drops.values()], dataOps, ddlOps };
}

// ───────────────────────── live catalog ─────────────────────────
const CATALOG_SQL = `
select json_build_object(
  'tables', (select coalesce(json_agg(json_build_object('s', n.nspname, 'n', c.relname, 'k', c.relkind, 'rls', c.relrowsecurity)), '[]'::json)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where c.relkind in ('r','p','v','m','f','S') and n.nspname not in ('pg_catalog','information_schema','pg_toast')),
  'columns', (select coalesce(json_agg(json_build_object('s', table_schema, 'n', table_name, 'c', column_name)), '[]'::json)
             from information_schema.columns where table_schema not in ('pg_catalog','information_schema')),
  'indexes', (select coalesce(json_agg(json_build_object('s', schemaname, 'n', indexname)), '[]'::json) from pg_indexes),
  'functions', (select coalesce(json_agg(distinct jsonb_build_object('s', n.nspname, 'n', p.proname)), '[]'::json)
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname not in ('pg_catalog','information_schema')),
  'triggers', (select coalesce(json_agg(json_build_object('s', n.nspname, 't', c.relname, 'n', t.tgname)), '[]'::json)
             from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
             where not t.tgisinternal),
  'policies', (select coalesce(json_agg(json_build_object('s', schemaname, 't', tablename, 'n', policyname)), '[]'::json) from pg_policies),
  'types', (select coalesce(json_agg(json_build_object('s', n.nspname, 'n', t.typname)), '[]'::json)
             from pg_type t join pg_namespace n on n.oid = t.typnamespace
             where t.typtype in ('e','d','c','r') and n.nspname not in ('pg_catalog','information_schema','pg_toast')),
  'enums', (select coalesce(json_agg(json_build_object('s', n.nspname, 'n', t.typname, 'v', e.enumlabel)), '[]'::json)
             from pg_enum e join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace),
  'constraints', (select coalesce(json_agg(json_build_object('s', n.nspname, 't', c.relname, 'n', k.conname)), '[]'::json)
             from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace),
  'extensions', (select coalesce(json_agg(extname), '[]'::json) from pg_extension),
  'schemas', (select coalesce(json_agg(nspname), '[]'::json) from pg_namespace)
)`;



export function runPsql(sql, { role = "postgres" } = {}) {
  if (process.env.PSQL) {
    return execFileSync("sh", ["-c", `${process.env.PSQL} -At`], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  }
  if (process.env.PGURL) {
    return execFileSync("psql", [process.env.PGURL, "-At", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  }
  const container = process.env.SUPABASE_DB_CONTAINER || "supabase-db";
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", role, "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function loadCatalog() {
  const raw = runPsql(CATALOG_SQL).trim();
  const j = JSON.parse(raw);
  let ledger = [];
  try {
    const exists = runPsql("select to_regclass('public.schema_migrations') is not null").trim() === "t";
    if (exists) ledger = JSON.parse(runPsql("select coalesce(json_agg(filename), '[]'::json)::text from public.schema_migrations").trim());
  } catch {
    ledger = [];
  }
  j.ledger = ledger;
  const S = (arr, fn) => new Set(arr.map(fn));
  return {
    tables: S(j.tables.filter((t) => "rpf".includes(t.k)), (t) => key("table", t.s, t.n)),
    views: S(j.tables.filter((t) => "vm".includes(t.k)), (t) => key("view", t.s, t.n)),
    sequences: S(j.tables.filter((t) => t.k === "S"), (t) => key("sequence", t.s, t.n)),
    rls: S(j.tables.filter((t) => t.rls), (t) => key("rls", t.s, t.n)),
    columns: S(j.columns, (c) => key("column", c.s, c.n, c.c)),
    indexes: S(j.indexes, (i) => key("index", i.s, i.n)),
    functions: S(j.functions, (f) => key("function", f.s, f.n)),
    triggers: S(j.triggers, (t) => key("trigger", t.s, t.t, t.n)),
    policies: S(j.policies, (p) => key("policy", p.s, p.t, p.n)),
    types: S(j.types, (t) => key("type", t.s, t.n)),
    enums: S(j.enums, (e) => key("enum", e.s, e.n, e.v)),
    constraints: S(j.constraints, (c) => key("constraint", c.s, c.t, c.n)),
    extensions: S(j.extensions, (e) => key("extension", e)),
    schemas: S(j.schemas, (s) => key("schema", s)),
    ledger: new Set(j.ledger),
  };
}

function present(cat, obj) {
  switch (obj.kind) {
    case "table":
      return cat.tables.has(obj.key) || cat.views.has(obj.key.replace(/^table\./, "view."));
    case "view":
      return cat.views.has(obj.key) || cat.tables.has(obj.key.replace(/^view\./, "table."));
    case "column":
      return cat.columns.has(obj.key);
    case "index":
      return cat.indexes.has(obj.key);
    case "function":
      return cat.functions.has(obj.key);
    case "trigger":
      return cat.triggers.has(obj.key);
    case "policy":
      return cat.policies.has(obj.key);
    case "type":
      return cat.types.has(obj.key);
    case "enum_value":
      return cat.enums.has(obj.key);
    case "constraint":
      return cat.constraints.has(obj.key);
    case "extension":
      return cat.extensions.has(obj.key);
    case "schema":
      return cat.schemas.has(obj.key);
    case "sequence":
      return cat.sequences.has(obj.key);
    case "rls":
      return cat.rls.has(obj.key);
    default:
      return true;
  }
}

// ───────────────────────── audit ─────────────────────────
export function listMigrationFiles(dir = MIG_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

export function auditMigrations({ dir = MIG_DIR, catalog, only = "", exceptions = loadExceptions() } = {}) {
  const files = listMigrationFiles(dir);
  const parsed = files.map((f) => {
    const sql = readFileSync(path.join(dir, f), "utf8");
    return { file: f, sha256: createHash("sha256").update(sql).digest("hex"), ...parseMigration(sql) };
  });

  // Objects dropped by a LATER migration are superseded, not missing.
  // A key dropped by file at index j supersedes the same key created by any
  // file with index < j (later re-creation, index > j, is checked normally).
  const dropIndex = new Map(); // key → max index of a file that drops it
  parsed.forEach((p, idx) => {
    for (const d of p.drops) dropIndex.set(d.key, Math.max(dropIndex.get(d.key) ?? -1, idx));
  });
  // A table dropped supersedes all its columns / policies / indexes-by-table too.
  const droppedTables = [...dropIndex.keys()].filter((k) => k.startsWith("table."));

  const results = parsed.map((p, idx) => {
    const checks = [];
    const waiver = exceptions.get(p.file);
    const waived = [];
    for (const o of p.objects) {
      if (waiver && waiver.patterns.some((re) => re.test(o.key))) {
        waived.push(o.desc);
        continue;
      }
      let supersededBy = null;
      const dj = dropIndex.get(o.key);
      if (dj !== undefined && dj > idx) supersededBy = parsed[dj].file;
      if (!supersededBy) {
        for (const t of droppedTables) {
          const tj = dropIndex.get(t);
          const tbl = t.slice("table.".length); // schema.name
          const inTable = (o.kind === "column" || o.kind === "policy" || o.kind === "trigger" || o.kind === "constraint" || o.kind === "rls") && o.key.split(".").slice(1, 3).join(".") === tbl;
          if (tj > idx && inTable) supersededBy = parsed[tj].file;
        }
      }
      checks.push({ ...o, present: present(catalog, o), supersededBy });
    }
    // DROP … statements: verified as "object is absent" (unless a later file
    // re-creates it, in which case that later file's check is authoritative).
    for (const d of p.drops) {
      const recreatedLater = parsed.some((q, j) => j >= idx && q.objects.some((o) => o.key === d.key));
      if (recreatedLater) continue;
      checks.push({ ...d, desc: d.desc, present: !present(catalog, d), supersededBy: null });
    }
    const active = checks.filter((c) => !c.supersededBy);
    const missing = active.filter((c) => !c.present);
    const presentN = active.length - missing.length;
    let status;
    let note = "";
    if (active.length === 0) {
      status = "unparsed";
      note = p.dataOps > 0 && p.ddlOps === 0 ? "data-only" : p.ddlOps > 0 ? "ddl-unverifiable" : "no-statements";
    } else if (missing.length === 0) status = "applied";
    else if (presentN === 0) status = "missing";
    else status = "partial";
    // A migration whose every object was dropped later is effectively applied.
    if (active.length === 0 && checks.length > 0) {
      status = "applied";
      note = "all objects superseded";
    }
    if (active.length === 0 && waived.length > 0 && checks.length === 0) {
      status = "applied";
      note = "all objects waived";
    }
    const deferred = waiver?.deferred === true && status !== "applied";
    if (deferred) note = "deferred";
    return {
      file: p.file,
      sha256: p.sha256,
      status,
      note,
      deferred,
      waived,
      waiver_reason: waiver?.reason ?? "",
      objects: active.length,
      present: presentN,
      missing: missing.map((m) => m.desc),
      missingKeys: missing.map((m) => m.key),
      superseded: checks.filter((c) => c.supersededBy).map((c) => `${c.desc} (dropped by ${c.supersededBy})`),
      dataOps: p.dataOps,
      ddlOps: p.ddlOps,
      inLedger: catalog.ledger.has(p.file),
    };
  });
  return only ? results.filter((r) => r.file.includes(only)) : results;
}

export function summarise(results) {
  const counts = { applied: 0, partial: 0, missing: 0, unparsed: 0, deferred: 0, data_only: 0, ddl_unverifiable: 0, waived_files: 0, waived_objects: 0 };
  for (const r of results) {
    counts[r.status]++;
    if (r.deferred) counts.deferred++;
    if (r.note === "data-only") counts.data_only++;
    if (r.note === "ddl-unverifiable") counts.ddl_unverifiable++;
    if (r.waived.length) {
      counts.waived_files++;
      counts.waived_objects += r.waived.length;
    }
  }
  return { total: results.length, ...counts };
}

// ───────────────────────── main ─────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  let catalog;
  try {
    catalog = loadCatalog();
  } catch (e) {
    console.error("[migration-parity] cannot read live catalog:", e.message);
    process.exit(2);
  }
  const results = auditMigrations({ dir: MIG_DIR, catalog, only: ONLY });
  const summary = summarise(results);
  if (JSON_OUT) {
    console.log(JSON.stringify({ generated_at: new Date().toISOString(), dir: MIG_DIR, summary, migrations: results }, null, 2));
  } else {
    const pad = (s, n) => String(s).padEnd(n);
    console.log(pad("STATUS", 9) + pad("OBJ", 8) + pad("LEDGER", 7) + "FILE");
    for (const r of results) {
      if (!VERBOSE && r.status === "applied" && !r.waived.length) continue;
      console.log(pad(r.status, 9) + pad(`${r.present}/${r.objects}`, 8) + pad(r.inLedger ? "yes" : "no", 7) + r.file + (r.note ? `  (${r.note})` : ""));
      if (r.status === "partial" || r.status === "missing") {
        for (const m of r.missing) console.log("           - missing: " + m);
      }
      if (r.deferred) console.log(`           ! deferred: ${r.waiver_reason}`);
      else if (r.waived.length) console.log(`           ! waived ${r.waived.length} object(s): ${r.waiver_reason}`);
      if (VERBOSE) for (const w of r.waived) console.log("           ! waived: " + w);
      if (VERBOSE) for (const s of r.superseded) console.log("           ~ superseded: " + s);
    }
    console.log("");
    console.log(`Total ${summary.total}: applied ${summary.applied}, partial ${summary.partial}, missing ${summary.missing} (${summary.deferred} deferred), unparsed ${summary.unparsed} (${summary.data_only} data-only, ${summary.ddl_unverifiable} ddl-unverifiable); ${summary.waived_objects} waived object(s) in ${summary.waived_files} file(s)` + (VERBOSE ? "" : "  (use --verbose to list applied)"));
  }
  if (STRICT && (summary.partial > 0 || summary.missing - summary.deferred > 0)) process.exit(1);
}
