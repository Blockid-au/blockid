#!/usr/bin/env node
// Seed au_grants + au_programs (migration 0311_au_funding.sql) from the
// research seed files:
//   web/content/data/grants-au.seed.json   → au_grants   (56 rows)
//   web/content/data/programs-au.seed.json → au_programs (199 rows)
//
// Idempotent — upserts on the text primary key (ON CONFLICT (id) DO UPDATE
// via supabase-js `upsert`), so a wiped DB rebuilds and a re-run after a seed
// edit updates in place. The `data-sources-registry` row (name
// `__data_sources__`) is upserted too, with exclude_from_matching=true, so
// the refresh cron can read its source list from the same table.
//
// Mapping (incl. city → capital derivation, G11-5) lives in
// src/lib/funding/seed-map.ts and is unit-tested there; Node ≥ 22.18 strips
// the types at import time, so no build step is needed.
//
// Usage (from web/):
//   node scripts/seed-au-funding.mjs            # upsert both tables
//   node scripts/seed-au-funding.mjs --dry-run  # map + validate only, no DB
//   node scripts/seed-au-funding.mjs --only=grants|programs
//
// Requires SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY
// in web/.env (or the environment). T0239 / G11 sprint S2.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { mapGrantSeeds, mapProgramSeeds } from "../src/lib/funding/seed-map.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY = (args.find((a) => a.startsWith("--only=")) ?? "").split("=")[1] || "all";
const BATCH = 50;

function loadEnv() {
  const envPath = resolve(WEB_DIR, ".env");
  const fileEnv = existsSync(envPath)
    ? Object.fromEntries(
        readFileSync(envPath, "utf8")
          .split("\n")
          .map((l) => l.match(/^([A-Z0-9_]+)=(.*)/))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
      )
    : {};
  return { ...fileEnv, ...process.env };
}

function readSeed(rel) {
  return JSON.parse(readFileSync(resolve(WEB_DIR, rel), "utf8"));
}

const grantsSeed = readSeed("content/data/grants-au.seed.json");
const programsSeed = readSeed("content/data/programs-au.seed.json");

const grants = ONLY === "programs" ? [] : mapGrantSeeds(grantsSeed.grants);
const programs = ONLY === "grants" ? [] : mapProgramSeeds(programsSeed.programs);

const capitals = programs.reduce((acc, p) => {
  acc[p.capital] = (acc[p.capital] ?? 0) + 1;
  return acc;
}, {});
const excluded = grants.filter((g) => g.exclude_from_matching).map((g) => g.id);

console.log(`Seed version: grants ${grantsSeed.version ?? "?"} · programs ${programsSeed.version ?? "?"}`);
console.log(`Mapped ${grants.length} grants (${excluded.length} excluded from matching: ${excluded.join(", ") || "-"})`);
console.log(`Mapped ${programs.length} programs by capital: ${JSON.stringify(capitals)}`);

if (DRY_RUN) {
  console.log("--dry-run: no database writes.");
  process.exit(0);
}

const env = loadEnv();
const rawUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!rawUrl || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — set them in web/.env or the environment.");
  process.exit(1);
}
const url = rawUrl.replace("supabase-kong", "localhost");
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function upsertAll(table, rows) {
  let ok = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: "id" });
    if (!error) {
      ok += chunk.length;
      continue;
    }
    // Retry the chunk row-by-row so one bad row reports its id instead of
    // hiding the other 49.
    for (const row of chunk) {
      const { error: rowErr } = await supabase.from(table).upsert(row, { onConflict: "id" });
      if (rowErr) {
        failed++;
        console.error(`  ${table} UPSERT FAIL ${row.id}: ${rowErr.message}`);
      } else {
        ok++;
      }
    }
  }
  return { ok, failed };
}

let exitCode = 0;
for (const [table, rows] of [
  ["au_grants", grants],
  ["au_programs", programs],
]) {
  if (rows.length === 0) continue;
  const { ok, failed } = await upsertAll(table, rows);
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  console.log(`${table}: upserted ${ok} · failed ${failed} · table now holds ${error ? "?" : count} rows`);
  if (failed > 0) exitCode = 1;
}

process.exit(exitCode);
