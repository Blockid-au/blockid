// Schema-migration ledger signal for /api/status (release QA-2 P0).
//
// Migrations on this stack are applied by hand (scripts/db/apply-migration.sh)
// and recorded in public.schema_migrations (0345). This module answers, for
// the public status board, "is every migration file applied?":
//
//   ok            every file in the manifest is in the ledger
//   pending:<n>   n files are not in the ledger (and not deferred)
//   unknown       manifest missing, DB not configured / unreachable, or the
//                 ledger table does not exist yet
//
// Two inputs:
//   * content/reports/schema-migrations.json — the manifest written by
//     scripts/db/migration-status.mjs --write (apply-migration.sh runs it).
//     The release bundle ships content/ but not supabase/migrations/, so the
//     route cannot list the SQL files itself; the manifest carries the
//     filenames plus the `deferred` set (parity-exceptions.json).
//   * live ledger rows via the service-role client (filename only).
//
// Public-safe: the word never names a file, table or host. Cached 5 min per
// process so the 30 s-CDN-cached status route is not a DB hammer.

import { promises as fs } from "node:fs";
import path from "node:path";
import { getSupabaseAdmin } from "@/lib/supabase";

export const SCHEMA_MIGRATIONS_MANIFEST = path.join("content", "reports", "schema-migrations.json");
export const SCHEMA_MIGRATIONS_TTL_MS = 5 * 60 * 1000;

export type SchemaMigrationsStatus = "ok" | `pending:${number}` | "unknown";

export interface SchemaMigrationsManifest {
  generated_at?: string;
  files?: string[];
  deferred?: string[];
}

/** Pure classifier — exported for tests. */
export function classifySchemaMigrations(
  manifest: SchemaMigrationsManifest | null,
  ledgerFilenames: string[] | null,
): SchemaMigrationsStatus {
  if (!manifest || !Array.isArray(manifest.files) || ledgerFilenames === null) return "unknown";
  const deferred = new Set(Array.isArray(manifest.deferred) ? manifest.deferred : []);
  const applied = new Set(ledgerFilenames);
  let pending = 0;
  for (const f of manifest.files) {
    if (typeof f !== "string") continue;
    if (deferred.has(f) || applied.has(f)) continue;
    pending += 1;
  }
  return pending === 0 ? "ok" : `pending:${pending}`;
}

let cache: { value: SchemaMigrationsStatus; at: number } | null = null;

export function _resetSchemaMigrationsCache(): void {
  cache = null;
}

async function readManifest(root: string): Promise<SchemaMigrationsManifest | null> {
  try {
    const raw = await fs.readFile(path.join(root, SCHEMA_MIGRATIONS_MANIFEST), "utf8");
    const j = JSON.parse(raw) as SchemaMigrationsManifest;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

async function readLedgerFilenames(): Promise<string[] | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  try {
    const { data, error } = await db.from("schema_migrations").select("filename").limit(5000);
    if (error) return null; // table absent (0345 not applied), PostgREST cache stale, etc.
    return (data ?? []).map((r) => String((r as { filename: string }).filename));
  } catch {
    return null;
  }
}

export async function readSchemaMigrationsStatus(
  root: string = process.cwd(),
  opts: { now?: number; force?: boolean } = {},
): Promise<SchemaMigrationsStatus> {
  const now = opts.now ?? Date.now();
  if (!opts.force && cache && now - cache.at < SCHEMA_MIGRATIONS_TTL_MS) return cache.value;
  const [manifest, ledger] = await Promise.all([readManifest(root), readLedgerFilenames()]);
  const value = classifySchemaMigrations(manifest, ledger);
  // Do not cache "unknown" — a transient DB blip should clear on the next poll.
  if (value !== "unknown") cache = { value, at: now };
  return value;
}
