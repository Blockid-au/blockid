#!/usr/bin/env node
// scripts/ga4-register-dimensions.mjs — register BlockID's GA4 custom
// dimensions (S23-B). Idempotent: lists the property's custom dimensions
// and creates only the ones missing from the declarative list in
// src/lib/analytics/ga4-dimensions.ts (never edits or archives anything).
//
//   node scripts/ga4-register-dimensions.mjs              # dry-run (default): list + diff
//   node scripts/ga4-register-dimensions.mjs --apply      # create the missing dimensions
//   node scripts/ga4-register-dimensions.mjs --json       # machine-readable result
//   node scripts/ga4-register-dimensions.mjs --env-file=/path/.env   # read another .env (worktrees)
//
// Env (read from web/.env, exported vars win): GA4_PROPERTY_ID (numeric),
// GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY (or
// GOOGLE_APPLICATION_CREDENTIALS_JSON). Scope: analytics.edit.
//
// Exit codes: 0 ok · 1 error (network / create failure) · 2 blocked — the
// Admin API is disabled in GCP project 990415480608 or the service account
// lacks Editor on the property; the two operator steps are printed.
//
// The registration logic lives in src/lib/analytics/ga4-admin.ts (shared
// with the admin route). It is loaded through tsx's register API — the
// scripts/docs/render-unlock-matrix.mjs pattern — so this stays a plain
// `node` invocation with no build step and no tsx CLI on PATH. The
// declarative list (ga4-dimensions.ts) has no relative imports, so Node's
// own type stripping loads it directly.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GA4_CUSTOM_DIMENSIONS } from "../src/lib/analytics/ga4-dimensions.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");

/** Load registerCustomDimensions from src/ via tsx (resolves extensionless .ts imports). */
export async function loadRegister() {
  const { register: registerEsm } = await import("tsx/esm/api");
  const { register: registerCjs } = await import("tsx/cjs/api");
  process.env.TSX_TSCONFIG_PATH ??= resolve(WEB_DIR, "tsconfig.json");
  const unregisterCjs = registerCjs();
  const unregisterEsm = registerEsm({ tsconfig: process.env.TSX_TSCONFIG_PATH });
  try {
    const mod = await import("../src/lib/analytics/ga4-admin.ts");
    return mod.registerCustomDimensions ?? mod.default?.registerCustomDimensions;
  } finally {
    await unregisterEsm();
    unregisterCjs();
  }
}

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_BLOCKED = 2;

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
  if (flags.has("--apply") && flags.has("--dry-run")) throw new Error("--apply and --dry-run are mutually exclusive");
  const envFile = argv.find((a) => a.startsWith("--env-file="))?.slice("--env-file=".length) || null;
  return {
    dryRun: !flags.has("--apply"),
    json: flags.has("--json"),
    help: flags.has("--help") || flags.has("-h"),
    envFile,
  };
}

export function formatResult(result) {
  const lines = [];
  const mode = result.dryRun ? "DRY-RUN" : "APPLY";
  lines.push(`GA4 custom dimensions — ${mode} on ${result.property ?? "(no property)"} as ${result.serviceAccount ?? "(no service account)"}`);
  lines.push(`  wanted   : ${GA4_CUSTOM_DIMENSIONS.map((d) => d.parameterName).join(", ")}`);
  if (result.blocked) {
    lines.push(`  BLOCKED  : ${result.blocked.reason} — ${result.blocked.message}`);
    lines.push("");
    lines.push("Operator steps (the service account cannot do these itself):");
    for (const step of result.blocked.steps) lines.push(`  ${step}`);
    return lines.join("\n");
  }
  lines.push(`  existing : ${result.existing.length ? result.existing.join(", ") : "(none)"}`);
  if (result.dryRun) lines.push(`  to create: ${result.missing.length ? result.missing.join(", ") : "(none — nothing to do)"}`);
  else {
    lines.push(`  created  : ${result.created.length ? result.created.join(", ") : "(none)"}`);
    if (result.missing.length) lines.push(`  FAILED   : ${result.missing.join(", ")}`);
  }
  if (result.unmanaged.length) lines.push(`  unmanaged: ${result.unmanaged.join(", ")} (left untouched)`);
  if (result.error) lines.push(`  error    : ${result.error}`);
  if (result.dryRun && result.missing.length) lines.push("\nRe-run with --apply to create the missing dimensions.");
  return lines.join("\n");
}

export function exitCodeFor(result) {
  if (result.blocked) return EXIT_BLOCKED;
  return result.ok ? EXIT_OK : EXIT_ERROR;
}

/**
 * Run the CLI. `deps.register` is injectable for tests; returns the exit code
 * instead of calling process.exit so the test harness can assert it.
 */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const out = deps.stdout ?? ((s) => process.stdout.write(`${s}\n`));
  const err = deps.stderr ?? ((s) => process.stderr.write(`${s}\n`));
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    err(e.message);
    return EXIT_ERROR;
  }
  if (args.help) {
    out("usage: node scripts/ga4-register-dimensions.mjs [--apply] [--json] [--env-file=<path>]\n  default is a dry-run (list + diff). Exit 2 = blocked (operator steps printed).");
    return EXIT_OK;
  }
  const env = deps.env ?? loadEnv(args.envFile ? resolve(args.envFile) : undefined);
  const register = deps.register ?? (await loadRegister());
  const result = await register({ dryRun: args.dryRun, env });
  out(args.json ? JSON.stringify(result, null, 2) : formatResult(result));
  return exitCodeFor(result);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`ga4-register-dimensions: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
      process.exit(EXIT_ERROR);
    },
  );
}
