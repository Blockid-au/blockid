#!/usr/bin/env node
// scripts/comparables/ingest-public-roundups.mjs — weekly AU comparables
// ingest (G13-W5-R5 / S-R5, spec §C.7 + §F "S-R5").
//
//   node scripts/comparables/ingest-public-roundups.mjs                # dry-run (default): fetch + extract + dedupe, print
//   node scripts/comparables/ingest-public-roundups.mjs --write        # insert the fresh rows as status=pending
//   node scripts/comparables/ingest-public-roundups.mjs --json         # machine-readable summary
//   node scripts/comparables/ingest-public-roundups.mjs --only=asx     # one source (startup-daily | cut-through-venture | asx)
//   node scripts/comparables/ingest-public-roundups.mjs --max=20       # cap rows inserted per run (default 50)
//   node scripts/comparables/ingest-public-roundups.mjs --dotenv=/path/.env
//
// Sources are the allow-list in web/src/lib/valuation/comparables-ingest.ts
// (Cut Through Venture monthly roundups, Startup Daily funding feed, ASX
// announcements) — nothing else is ever fetched. Extraction is regex only
// (no LLM); every row lands as `pending` for /admin/comparables review;
// dedupe is (name_key, round_date), the table's unique index.
//
// The extraction + runner live in that TS module (shared with the cron
// route /api/cron/comparables-ingest, which cron-runner.sh hits weekly).
// This CLI loads it through tsx's register API (the
// web/scripts/ga4-register-dimensions.mjs pattern) with a tiny loader hook
// that maps the `server-only` sentinel to an empty module, so the same
// code runs under plain `node` with no build step.
//
// Env (read from web/.env, exported vars win): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. Dry-run needs neither (it still reads the
// table for the dedupe when both are set).
//
// Exit codes: 0 ok · 1 error (db / loader failure) · 2 usage.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = resolve(__dirname, "..", "..", "web");
export const SOURCE_IDS = ["startup-daily", "cut-through-venture", "asx"];

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;

/** Minimal .env reader (no dotenv dependency); exported process env wins. */
export function loadEnv(envPath = resolve(WEB_DIR, ".env"), processEnv = process.env) {
  const fileEnv = existsSync(envPath)
    ? Object.fromEntries(
        readFileSync(envPath, "utf8")
          .split("\n")
          .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
      )
    : {};
  return { ...fileEnv, ...processEnv };
}

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("-") && !a.includes("=")));
  const opt = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
  if (flags.has("--write") && flags.has("--dry-run")) throw new Error("--write and --dry-run are mutually exclusive");
  const only = opt("only");
  if (only && !SOURCE_IDS.includes(only)) throw new Error(`--only must be one of ${SOURCE_IDS.join(", ")}`);
  const maxRaw = opt("max");
  const max = maxRaw === null ? null : Number(maxRaw);
  if (maxRaw !== null && (!Number.isInteger(max) || max < 1)) throw new Error("--max must be a positive integer");
  return {
    write: flags.has("--write"),
    json: flags.has("--json"),
    help: flags.has("--help") || flags.has("-h"),
    only,
    max,
    envFile: opt("dotenv"),
  };
}

export const USAGE = [
  "usage: node scripts/comparables/ingest-public-roundups.mjs [--write] [--json] [--only=<source>] [--max=<n>] [--dotenv=<path>]",
  "  dry-run by default; --write inserts fresh rows as status=pending for /admin/comparables review",
  `  sources: ${SOURCE_IDS.join(", ")}`,
].join("\n");

/** Load runComparablesIngest from web/src via tsx (with the server-only stub). */
export async function loadRunner() {
  const require = createRequire(resolve(WEB_DIR, "package.json"));
  const { register: registerEsm } = await import(pathToFileURL(require.resolve("tsx/esm/api")).href);
  const { register: registerCjs } = await import(pathToFileURL(require.resolve("tsx/cjs/api")).href);
  const { register: registerHook } = await import("node:module");
  process.env.TSX_TSCONFIG_PATH ??= resolve(WEB_DIR, "tsconfig.json");
  // `server-only` is a Next-only sentinel (next/dist/compiled/server-only);
  // plain node cannot resolve it. The hook maps it to an empty module.
  registerHook(pathToFileURL(resolve(__dirname, "server-only-stub-loader.mjs")).href);
  const unregisterCjs = registerCjs();
  const unregisterEsm = registerEsm({ tsconfig: process.env.TSX_TSCONFIG_PATH });
  try {
    const mod = await import(pathToFileURL(resolve(WEB_DIR, "src/lib/valuation/comparables-ingest.ts")).href);
    return mod.runComparablesIngest ?? mod.default?.runComparablesIngest;
  } finally {
    await unregisterEsm();
    unregisterCjs();
  }
}

/** Service-role Supabase client from web/node_modules, or null when the env is incomplete. */
export function makeDb(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const require = createRequire(resolve(WEB_DIR, "package.json"));
  const { createClient } = require("@supabase/supabase-js");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

export function formatSummary(summary) {
  const lines = [];
  lines.push(`comparables ingest — ${summary.dryRun ? "DRY RUN" : "WRITE"} @ ${summary.ranAt}`);
  for (const s of summary.sources) lines.push(`  ${s.id.padEnd(20)} ${s.status.padEnd(13)} pages=${s.pages} candidates=${s.candidates}${s.error ? ` (${s.error})` : ""}`);
  lines.push(`  candidates=${summary.candidates} duplicates=${summary.duplicates} ${summary.dryRun ? "would insert" : "inserted"}=${summary.dryRun ? summary.rows.length : summary.inserted}`);
  for (const r of summary.rows) lines.push(`    ${r.round_date}  ${r.name}  ${r.stage}  A$${(r.amount_aud ?? 0).toLocaleString("en-AU")}  [${r.sector}]  ${r.source_name}  conf=${r.confidence}`);
  if (!summary.ok) lines.push(`  ERROR ${summary.error ?? "unknown"}`);
  return lines.join("\n");
}

/**
 * CLI entry. `deps.run` (the runner), `deps.loadRunner` and `deps.db` are
 * injectable so the colocated test never loads tsx or touches the network.
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? ((s) => process.stdout.write(`${s}\n`));
  const stderr = deps.stderr ?? ((s) => process.stderr.write(`${s}\n`));
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    stderr(`${err.message}\n${USAGE}`);
    return EXIT_USAGE;
  }
  if (args.help) {
    stdout(USAGE);
    return EXIT_OK;
  }
  const env = deps.env ?? loadEnv(args.envFile ? resolve(args.envFile) : undefined);
  let run;
  try {
    run = deps.run ?? (await (deps.loadRunner ?? loadRunner)());
  } catch (err) {
    stderr(`loader failed: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT_ERROR;
  }
  const db = deps.db !== undefined ? deps.db : makeDb(env);
  if (args.write && !db) {
    stderr("--write needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (web/.env)");
    return EXIT_USAGE;
  }
  const summary = await run({ write: args.write }, { db, only: args.only ? [args.only] : undefined, maxInsert: args.max ?? undefined, fetch: deps.fetch });
  stdout(args.json ? JSON.stringify(summary, null, 2) : formatSummary(summary));
  return summary.ok ? EXIT_OK : EXIT_ERROR;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
      process.exit(EXIT_ERROR);
    },
  );
}
