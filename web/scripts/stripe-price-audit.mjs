#!/usr/bin/env node
// stripe-price-audit.mjs — weekly Stripe ↔ catalogue drift check (G18-A, 2026-09-19).
//
// For every STRIPE_PRICE_* env var in src/config/pricing/stripe-price-catalogue.json
// (names + amounts only — no ids), resolve the price id from the runtime env
// (process.env, then web/.env, then web/.env.runtime), fetch the Price from
// Stripe READ-ONLY and diff amount / currency / interval / active /
// tax_behavior against the catalogue. Exits 1 on any drift or an unresolvable
// non-legacy var so the weekly cron (crontab.production § G18-A) turns red.
//
// Never prints the secret key or a price id — output names env vars only.
//
//   node scripts/stripe-price-audit.mjs             # live audit, exit 1 on drift
//   node scripts/stripe-price-audit.mjs --dry-run   # no network: catalogue + which vars are set
//   node scripts/stripe-price-audit.mjs --json      # machine-readable summary on stdout
//   --env-dir /path/to/web                          # read .env / .env.runtime from another checkout
//
// Output file: content/reports/stripe-price-audit-latest.json (never in dry-run).

import { readFileSync } from "node:fs";
import path from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import { envVal, sendTelegram, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CATALOGUE = path.join(HERE, "..", "src", "config", "pricing", "stripe-price-catalogue.json");
const OUT = path.join(WEB_DIR, "content", "reports", "stripe-price-audit-latest.json");

const args = new Set(argv.slice(2));
const DRY = args.has("--dry-run");
const JSON_OUT = args.has("--json");
const envDirArg = argv.find((a) => a.startsWith("--env-dir="));
const ENV_DIR = envDirArg ? envDirArg.slice("--env-dir=".length) : WEB_DIR;

const log = (s) => { if (!JSON_OUT) console.log(s); };

/** Read a var without ever echoing it. */
function resolve(key) {
  return envVal(key, process.env, ENV_DIR);
}

/** Stripe `type`/`recurring.interval` → catalogue interval. */
export function stripeInterval(price) {
  if (price.type === "one_time") return "one_off";
  const iv = price.recurring?.interval;
  return iv === "year" ? "year" : iv === "month" ? "month" : `recurring/${iv ?? "?"}`;
}

/** Pure diff of one Stripe Price object against its catalogue row. */
export function diffPrice(expected, price) {
  const problems = [];
  if (price.currency?.toLowerCase() !== "aud") problems.push(`currency ${price.currency}`);
  if (price.unit_amount !== expected.amount_cents) problems.push(`amount ${price.unit_amount} ≠ ${expected.amount_cents}`);
  const iv = stripeInterval(price);
  if (iv !== expected.interval) problems.push(`interval ${iv} ≠ ${expected.interval}`);
  if (Boolean(price.active) !== Boolean(expected.active)) problems.push(`active ${price.active} ≠ ${expected.active}`);
  const tax = price.tax_behavior ?? "unspecified";
  if (tax !== expected.tax_behavior) problems.push(`tax_behavior ${tax} ≠ ${expected.tax_behavior}`);
  return problems;
}

async function fetchPrice(stripe, id) {
  return stripe.prices.retrieve(id);
}

export async function runAudit({ dryRun = DRY, resolveEnv = resolve, stripeFactory = null } = {}) {
  const cat = JSON.parse(readFileSync(CATALOGUE, "utf8"));
  const entries = Object.entries(cat.prices);
  const rows = [];
  let stripe = null;

  if (!dryRun) {
    const key = resolveEnv("STRIPE_SECRET_KEY");
    if (!key) {
      return { ok: false, reason: "STRIPE_SECRET_KEY not resolvable", rows: [], drift: [], missing: [] };
    }
    if (stripeFactory) stripe = stripeFactory(key);
    else {
      const { default: Stripe } = await import("stripe");
      stripe = new Stripe(key, { typescript: false });
    }
  }

  for (const [envVar, expected] of entries) {
    const id = resolveEnv(envVar);
    const row = {
      env_var: envVar,
      plan_id: expected.plan_id,
      expected: `${expected.amount_cents / 100} AUD ${expected.interval} ${expected.active ? "active" : "INACTIVE"} tax=${expected.tax_behavior}`,
      legacy: Boolean(expected.legacy),
      set: Boolean(id),
      status: "unchecked",
      problems: [],
    };
    if (!id) {
      row.status = expected.legacy ? "unset_legacy" : "unset";
    } else if (dryRun) {
      row.status = "set";
    } else {
      try {
        const price = await fetchPrice(stripe, id);
        row.problems = diffPrice(expected, price);
        row.status = row.problems.length ? "drift" : "match";
      } catch (err) {
        row.status = "lookup_failed";
        row.problems = [String(err?.message ?? err).replace(/price_[A-Za-z0-9]+/g, "price_…")];
      }
    }
    rows.push(row);
  }

  const drift = rows.filter((r) => r.status === "drift" || r.status === "lookup_failed");
  const missing = rows.filter((r) => r.status === "unset");
  return {
    ok: drift.length === 0 && missing.length === 0,
    generated_at: new Date().toISOString(),
    audited_catalogue: cat.audited_at,
    dry_run: dryRun,
    counts: {
      total: rows.length,
      match: rows.filter((r) => r.status === "match").length,
      drift: drift.length,
      unset: missing.length,
      unset_legacy: rows.filter((r) => r.status === "unset_legacy").length,
      set: rows.filter((r) => r.status === "set").length,
    },
    drift,
    missing,
    rows,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const result = await runAudit();
  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    log(`[stripe-price-audit] ${DRY ? "DRY RUN — no network" : "live"} · catalogue audited ${result.audited_catalogue ?? "?"}`);
    for (const r of result.rows ?? []) {
      const flag = r.status === "match" ? "✓" : r.status === "set" ? "·" : r.status.startsWith("unset") ? "–" : "✗";
      log(`  ${flag} ${r.env_var.padEnd(40)} ${r.expected}${r.legacy ? "  [legacy]" : ""}${r.problems.length ? `  → ${r.problems.join("; ")}` : r.status.startsWith("unset") ? "  (env var not set)" : ""}`);
    }
    if (result.reason) log(`  ! ${result.reason}`);
    log(`[stripe-price-audit] ${JSON.stringify(result.counts ?? {})}`);
  }
  if (!DRY) {
    try {
      writeJsonAtomic(OUT, { ...result, rows: undefined });
    } catch (err) {
      log(`  ! could not write ${OUT}: ${err?.message ?? err}`);
    }
    if (!result.ok) {
      const lines = [
        `⚠️ Stripe price audit: ${result.drift?.length ?? 0} drift, ${result.missing?.length ?? 0} unset`,
        ...(result.drift ?? []).map((r) => `• ${r.env_var}: ${r.problems.join("; ")}`),
        ...(result.missing ?? []).map((r) => `• ${r.env_var}: not set`),
        result.reason ? `• ${result.reason}` : "",
      ].filter(Boolean);
      await sendTelegram(lines.join("\n"), { dryRun: false });
    }
  }
  exit(result.ok ? 0 : 1);
}
