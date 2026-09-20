#!/usr/bin/env node
// G19-S47 — restructure a STORED Trusted Business Report without a new AI run.
//
//   node --env-file=.env scripts/report/restructure-stored.mjs --snapshot <uuid> [--force] [--dry-run]
//
// Loads `svi_snapshots.report_v2`, rebuilds `executive.strengths / gaps`
// from the criterion cards (S44) and `executive.structured` from the stored
// CEO thesis (S47 `structureExecutive` — chapters / valuation / phase / plan
// when the text has no structure), validates the document and writes it
// back. Idempotent: an already-structured row is left untouched (use
// `--force` to rebuild). Never triggers the pipeline.
//
// Used for the BlockID showcase after S47 (snapshot
// ba680de6-f1db-4027-b37c-1003c47d97cb) so the new layout shows without a
// fresh run. Verify: `report_v2->'executive'->'structured'` in psql.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { makeSupabaseRestructureDb, restructureStoredReport } from "./restructure-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..", "..");

function loadEnv() {
  const env = {};
  const envPath = resolve(WEB_DIR, ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string" && v !== "") env[k] = v;
  return env;
}

const ARGS = process.argv.slice(2);
const argValue = (flag) => {
  const i = ARGS.indexOf(flag);
  return i === -1 ? null : (ARGS[i + 1] ?? null);
};

/** tsx-load the pure report-v2 modules (same hook chain as run-self-analysis.mjs). */
async function loadLib() {
  const nodeModule = await import("node:module");
  const { hooks } = await import("../lib/server-only-hook.mjs");
  nodeModule.registerHooks(hooks);
  const { register: registerTsxCjs } = await import("tsx/cjs/api");
  process.env.TSX_TSCONFIG_PATH ??= resolve(WEB_DIR, "tsconfig.json");
  registerTsxCjs();
  const require = nodeModule.createRequire(import.meta.url);
  const es = require("../../src/lib/report-v2/executive-structure.ts");
  const adapter = require("../../src/lib/report-v2/adapter.ts");
  const schema = require("../../src/lib/report-v2/schema.ts");
  return {
    structureExecutive: es.structureExecutive,
    hasValidExecutiveStructured: es.hasValidExecutiveStructured,
    executiveFromChapters: adapter.executiveFromChapters,
    assertReportV2: schema.assertReportV2,
  };
}

const snapshotId = argValue("--snapshot");
if (!snapshotId) {
  console.error("usage: node --env-file=.env scripts/report/restructure-stored.mjs --snapshot <uuid> [--force] [--dry-run]");
  process.exit(2);
}
const ENV = loadEnv();
let SUPABASE_URL = ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL;
if (SUPABASE_URL?.includes("supabase-kong")) SUPABASE_URL = SUPABASE_URL.replace("supabase-kong", "localhost");
const SUPABASE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY || ENV.SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — nothing to do.");
  process.exit(2);
}
process.env.SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;

const lib = await loadLib();
const db = makeSupabaseRestructureDb(createClient(SUPABASE_URL, SUPABASE_KEY));
const result = await restructureStoredReport({ db, lib, snapshotId, force: ARGS.includes("--force"), dryRun: ARGS.includes("--dry-run"), log: (l) => console.log(l) });
console.log(JSON.stringify({ snapshotId: result.snapshotId, found: result.found, changed: result.changed, changes: result.changes, written: result.written }));
process.exit(result.found ? 0 : 1);
