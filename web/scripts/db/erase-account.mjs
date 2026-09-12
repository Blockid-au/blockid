#!/usr/bin/env node
// scripts/db/erase-account.mjs — operator path for account erasure (S24-B).
//
// Runs the `erase_account(p_user_id, p_dry_run)` RPC (migration 0348) over
// `docker exec supabase-db psql` — the DB half of src/lib/privacy/erase-account.ts.
// Use it for QA / test accounts and for privacy@ requests when the app is
// not the right tool; for an account with a Stripe customer prefer the admin
// route (POST /api/admin/account/erase) which also cancels subscriptions,
// detaches payment methods and writes the HMAC-signed audit row.
//
// Usage (from web/):
//   node scripts/db/erase-account.mjs --email <e> --dry-run       # per-table counts, no writes
//   node scripts/db/erase-account.mjs --email <e> --write         # erase (DB only)
//   node scripts/db/erase-account.mjs --user <uuid> --write
//   … --write --allow-stripe-customer   # required when stripe_customer_id is set
//   … --json                            # raw RPC report only
//
// Exit codes: 0 ok · 1 error · 2 user not found · 3 migration 0348 not applied
// · 4 refused (Stripe customer present without --allow-stripe-customer)
//
// A --write run appends one JSON line to content/reports/erasure-history.jsonl
// (gitignored) with the counts only — never the email.

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..", "..");
const HISTORY = path.join(WEB_DIR, "content", "reports", "erasure-history.jsonl");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
};

export function runPsql(sql, { role = "postgres" } = {}) {
  const common = { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 };
  if (process.env.PSQL) return execFileSync("sh", ["-c", `${process.env.PSQL} -At -v ON_ERROR_STOP=1`], common);
  if (process.env.PGURL) return execFileSync("psql", [process.env.PGURL, "-At", "-v", "ON_ERROR_STOP=1"], common);
  const container = process.env.SUPABASE_DB_CONTAINER || "supabase-db";
  return execFileSync("docker", ["exec", "-i", container, "psql", "-U", role, "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], common);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export function resolveUser({ email, userId }, psql = runPsql) {
  const where = userId ? `id = ${q(userId)}::uuid` : `email = ${q(email.trim().toLowerCase())}`;
  const out = psql(`select json_build_object('id', id, 'stripe_customer_id', stripe_customer_id, 'erased_at', erased_at, 'deletion_requested_at', deletion_requested_at) from public.app_users where ${where} limit 1;`).trim();
  return out ? JSON.parse(out) : null;
}

export function migrationApplied(psql = runPsql) {
  return psql("select to_regprocedure('public.erase_account(uuid, boolean)') is not null;").trim() === "t";
}

export function runErase(userId, dryRun, psql = runPsql) {
  const out = psql(`select public.erase_account(${q(userId)}::uuid, ${dryRun ? "true" : "false"});`).trim();
  return JSON.parse(out);
}

/** Human summary of the RPC report — counts only. */
export function summarise(report) {
  const touched = report.steps.filter((s) => s.rows > 0).map((s) => `${s.table}.${s.column} ${s.mode}${s.opts ? `(${s.opts})` : ""} ×${s.rows}`);
  return {
    dry_run: report.dry_run,
    user_id: report.user_id,
    already_erased: report.already_erased,
    tombstone: report.anon_email,
    totals: report.totals,
    tables_touched: report.tables_touched,
    skipped: report.skipped,
    storage_objects: (report.storage_paths?.dataroom ?? []).length,
    stripe_customer: Boolean(report.stripe_customer_id),
    touched,
  };
}

function main() {
  const email = opt("--email");
  const userId = opt("--user");
  const write = flag("--write");
  const dry = flag("--dry-run") || !write;
  if (write && flag("--dry-run")) throw new Error("pass either --dry-run or --write");
  if (!email && !userId) throw new Error("--email <address> or --user <uuid> required");
  if (userId && !UUID_RE.test(userId)) throw new Error("--user must be a uuid");

  if (!migrationApplied()) {
    console.error("erase_account(uuid, boolean) is not in the database — apply supabase/migrations/0348_erase_account.sql first (scripts/db/apply-migration.sh).");
    process.exit(3);
  }
  const user = resolveUser({ email, userId });
  if (!user) {
    console.error(`no app_users row for ${email ?? userId}`);
    process.exit(2);
  }
  if (write && user.stripe_customer_id && !flag("--allow-stripe-customer")) {
    console.error(
      `refusing --write: this account has a Stripe customer. Use POST /api/admin/account/erase (cancels subscriptions + detaches payment methods) or re-run with --allow-stripe-customer after doing that in Stripe.`,
    );
    process.exit(4);
  }

  const report = runErase(user.id, dry);
  if (flag("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const s = summarise(report);
    console.log(`${dry ? "DRY RUN" : "ERASED"} ${s.user_id}${s.already_erased ? " (already a tombstone)" : ""}`);
    console.log(`  tombstone : ${s.tombstone}`);
    console.log(`  totals    : delete ${s.totals.delete} · anonymise ${s.totals.anonymise} · detach ${s.totals.detach} · project-detach ${s.totals.detach_project} · extras ${s.totals.extras}`);
    console.log(`  tables    : ${s.tables_touched} touched, ${s.skipped} skipped (missing), ${s.storage_objects} storage object(s), stripe customer: ${s.stripe_customer ? "YES" : "no"}`);
    for (const t of s.touched) console.log(`    - ${t}`);
    if (dry) console.log("\nnothing written. Re-run with --write to erase.");
  }

  if (!dry) {
    try {
      mkdirSync(path.dirname(HISTORY), { recursive: true });
      appendFileSync(HISTORY, JSON.stringify({ ts: new Date().toISOString(), actor: "script", user_id: user.id, totals: report.totals, tables_touched: report.tables_touched, skipped: report.skipped }) + "\n");
    } catch {
      /* history is best effort */
    }
    console.error(
      "note: the DB path writes no HMAC-signed audit_events row and does not touch Stripe; content/reports/erasure-history.jsonl has the counts. Prefer POST /api/admin/account/erase for production users.",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(e?.stderr?.toString?.() || e?.message || e);
    process.exit(1);
  }
}

export { HISTORY };
