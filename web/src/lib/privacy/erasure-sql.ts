// Renders the VALUES blocks that migration 0348 (`erase_account()`) walks,
// straight from the erasure map — so the SQL and the TypeScript are the same
// list. `erasure-map.test.ts` re-renders these and asserts the migration file
// contains them verbatim between the BEGIN/END markers; regenerate with:
//
//   npx tsx -e 'import("./src/lib/privacy/erasure-sql.ts").then(m => console.log(m.renderAllBlocks()))'
//
// No `server-only` here: the test imports it and so may a script.

import { ERASURE_MAP, NON_FK_EXTRAS, PROJECT_DETACHES, orderedEntries, type ErasureEntry } from "./erasure-map";

/** Latest migration that (re)creates `erase_account()` from this map — tests read it. */
export const ERASURE_MIGRATION_FILE = "0370_erase_account_sector_multiples_overrides.sql";

export const MAP_BEGIN = "-- BEGIN erasure-map (generated from src/lib/privacy/erasure-map.ts — do not edit by hand)";
export const MAP_END = "-- END erasure-map";
export const DETACH_BEGIN = "-- BEGIN project-detaches (generated from src/lib/privacy/erasure-map.ts)";
export const DETACH_END = "-- END project-detaches";
export const EXTRAS_BEGIN = "-- BEGIN non-fk-extras (generated from src/lib/privacy/erasure-map.ts)";
export const EXTRAS_END = "-- END non-fk-extras";

function lit(s: string | null | undefined): string {
  if (s == null) return "NULL::text";
  return `'${s.replace(/'/g, "''")}'::text`;
}

export function entryOpts(e: ErasureEntry): string | null {
  if (e.immutable) return "immutable";
  if (e.nullRef) return "nullref";
  return null;
}

/** One tuple per FK entry: (ord, tbl, col, mode, opts, scrub). */
export function renderMapBlock(map: readonly ErasureEntry[] = ERASURE_MAP): string {
  const rows = orderedEntries(map).map(
    (e) => `      (${e.order}::int, ${lit(e.table)}, ${lit(e.column)}, ${lit(e.mode)}, ${lit(entryOpts(e))}, ${lit(e.scrub ?? null)})`,
  );
  return `${MAP_BEGIN}\n${rows.join(",\n")}\n${MAP_END}`;
}

/** (tbl, col, parent) tuples nulled for the user's projects / legacy SVI accounts before `projects` is deleted. */
export function renderDetachBlock(): string {
  const rows = PROJECT_DETACHES.map((d) => `      (${lit(d.table)}, ${lit(d.column)}, ${lit(d.parent)})`);
  return `${DETACH_BEGIN}\n${rows.join(",\n")}\n${DETACH_END}`;
}

/** (tbl, col, by, mode, scrub) tuples for tables without an FK. */
export function renderExtrasBlock(): string {
  const rows = NON_FK_EXTRAS.map((x) => `      (${lit(x.table)}, ${lit(x.column)}, ${lit(x.by)}, ${lit(x.mode)}, ${lit(x.scrub ?? null)})`);
  return `${EXTRAS_BEGIN}\n${rows.join(",\n")}\n${EXTRAS_END}`;
}

export function renderAllBlocks(): string {
  return [renderDetachBlock(), renderMapBlock(), renderExtrasBlock()].join("\n\n");
}

/** Extract a generated block (markers included) from migration SQL, or null. */
export function extractBlock(sql: string, begin: string, end: string): string | null {
  const i = sql.indexOf(begin);
  if (i < 0) return null;
  const j = sql.indexOf(end, i);
  if (j < 0) return null;
  return sql.slice(i, j + end.length);
}

/** Parse `(ord, tbl, col, mode, opts, scrub)` tuples back out of a map block. */
export function parseMapBlock(block: string): { order: number; table: string; column: string; mode: string; opts: string | null; scrub: string | null }[] {
  const out: { order: number; table: string; column: string; mode: string; opts: string | null; scrub: string | null }[] = [];
  const re = /\((\d+)::int,\s*'([^']+)'::text,\s*'([^']+)'::text,\s*'([^']+)'::text,\s*(NULL::text|'[^']*'::text),\s*(NULL::text|'(?:[^']|'')*'::text)\)/g;
  for (const m of block.matchAll(re)) {
    const un = (s: string) => (s === "NULL::text" ? null : s.slice(1, -"'::text".length).replace(/''/g, "'"));
    out.push({ order: Number(m[1]), table: m[2], column: m[3], mode: m[4], opts: un(m[5]), scrub: un(m[6]) });
  }
  return out;
}
