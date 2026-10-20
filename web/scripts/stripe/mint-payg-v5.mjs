#!/usr/bin/env node
// mint-payg-v5.mjs — idempotently mint the six Pricing v5 pay-as-you-go
// Stripe Products + one-time Prices (G35 P1, docs/pricing-v5-plan.md §6.2).
//
//   node scripts/stripe/mint-payg-v5.mjs --dry-run              # print the plan, no API calls, no key needed
//   node scripts/stripe/mint-payg-v5.mjs                        # TEST mode (default): STRIPE_TEST_SECRET_KEY, must be sk_test_
//   node scripts/stripe/mint-payg-v5.mjs --mode live --confirm-live            # LIVE: STRIPE_SECRET_KEY, must be sk_live_
//   node scripts/stripe/mint-payg-v5.mjs --mode live --confirm-live --archive-legacy
//        # LIVE only, separate explicit flag: archive (active:false) the old A$3
//        # Prices named by STRIPE_PRICE_TRUST_REPORT_5AUD / _ONE_CLICK_REPORT /
//        # _FUNDING_REPORT — never deletes; only after every v5 Price resolved.
//
// Guarantees:
//   - Products are found by `metadata.sku` (products.list + filter — strongly
//     consistent, unlike the eventually-consistent search API, so a quick
//     re-run can never duplicate). Missing → create Product + Price.
//   - Prices: `currency:'aud'`, `tax_behavior:'inclusive'` (amounts are
//     GST-inclusive), `unit_amount`, metadata `{sku, pricing_version:'v5'}`.
//     An existing active Price at the right amount is reused; one at a
//     different amount / tax_behavior is REPORTED as drift and never mutated
//     (Stripe Prices are immutable; the fix is a founder decision).
//   - Never deletes anything; never edits a Price amount; idempotency keys on
//     every create.
//   - Prints `ENV_VAR=price_id` lines for web/.env + web/.env.runtime. Never
//     prints a secret key.
//
// The SKU table below mirrors src/lib/pricing/v5-payg.ts (this plain-node
// script cannot import TS); mint-payg-v5.test.mjs pins the two equal.
//
// Exit codes: 0 ok · 1 drift / blocked / archive refused · 2 bad flags or key.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = path.resolve(HERE, "..", "..");

export const PRICING_VERSION = "v5";

/** Mirrors PAYG_SKUS in src/lib/pricing/v5-payg.ts (amounts in AUD cents, GST-inclusive). */
export const V5_MINT_SKUS = Object.freeze([
  { sku: "report_snapshot", productName: "BlockID Report — Snapshot", amountCents: 1900, envVar: "STRIPE_PRICE_REPORT_SNAPSHOT" },
  { sku: "report_full", productName: "BlockID Report — Full", amountCents: 4900, envVar: "STRIPE_PRICE_REPORT_FULL" },
  { sku: "report_verified", productName: "BlockID Report — Verified", amountCents: 14900, envVar: "STRIPE_PRICE_REPORT_VERIFIED" },
  { sku: "upgrade_snapshot_full", productName: "BlockID Report — Upgrade Snapshot to Full", amountCents: 3000, envVar: "STRIPE_PRICE_UPGRADE_SNAPSHOT_FULL" },
  { sku: "upgrade_full_verified", productName: "BlockID Report — Upgrade Full to Verified", amountCents: 10000, envVar: "STRIPE_PRICE_UPGRADE_FULL_VERIFIED" },
  { sku: "report_funding", productName: "BlockID Money Finder report", amountCents: 1900, envVar: "STRIPE_PRICE_REPORT_FUNDING" },
]);

/** The legacy A$3 one-off Prices `--archive-legacy` may archive (env var names, never ids). */
export const LEGACY_ARCHIVE_ENV_VARS = Object.freeze([
  "STRIPE_PRICE_TRUST_REPORT_5AUD",
  "STRIPE_PRICE_ONE_CLICK_REPORT",
  "STRIPE_PRICE_FUNDING_REPORT",
]);
export const LEGACY_AMOUNT_CENTS = 300;

const USAGE = `Usage: node scripts/stripe/mint-payg-v5.mjs [--dry-run] [--mode test|live] [--confirm-live] [--archive-legacy]
  --mode test        default; key = STRIPE_TEST_SECRET_KEY (must start sk_test_)
  --mode live        key = STRIPE_SECRET_KEY (must start sk_live_); requires --confirm-live
  --dry-run          print the plan; no Stripe API calls, no key needed
  --archive-legacy   live only: archive (active:false) the old A$3 Prices after v5 resolves`;

// ─── Flags + key ─────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = { mode: "test", confirmLive: false, dryRun: false, archiveLegacy: false, help: false, error: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--mode") opts.mode = argv[++i] ?? "";
    else if (a.startsWith("--mode=")) opts.mode = a.slice("--mode=".length);
    else if (a === "--confirm-live") opts.confirmLive = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--archive-legacy") opts.archiveLegacy = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else return { ...opts, error: `Unknown argument: ${a}` };
  }
  if (opts.mode !== "test" && opts.mode !== "live") return { ...opts, error: `--mode must be "test" or "live" (got "${opts.mode}")` };
  if (opts.mode === "live" && !opts.confirmLive) return { ...opts, error: "--mode live requires --confirm-live (founder-approved live mint only)" };
  if (opts.confirmLive && opts.mode !== "live") return { ...opts, error: "--confirm-live only makes sense with --mode live" };
  if (opts.archiveLegacy && opts.mode !== "live") return { ...opts, error: "--archive-legacy is live-only: use --mode live --confirm-live --archive-legacy" };
  return opts;
}

/** Pick + vet the secret key for the mode. Test mode NEVER falls back to STRIPE_SECRET_KEY. */
export function resolveSecretKey({ mode, env }) {
  if (mode === "test") {
    const key = String(env.STRIPE_TEST_SECRET_KEY ?? "").trim();
    if (!key) {
      return { ok: false, error: "STRIPE_TEST_SECRET_KEY is not set — add a Stripe test-mode secret (sk_test_…) to web/.env. Test mode never uses STRIPE_SECRET_KEY." };
    }
    if (!key.startsWith("sk_test_")) {
      return { ok: false, error: "STRIPE_TEST_SECRET_KEY is not a test-mode secret key (must start with sk_test_) — refusing to run." };
    }
    return { ok: true, key };
  }
  const key = String(env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key.startsWith("sk_live_")) {
    return { ok: false, error: "--mode live requires STRIPE_SECRET_KEY to be a live secret key (sk_live_…) — refusing to run." };
  }
  return { ok: true, key };
}

/** process.env over web/.env.runtime over web/.env (minimal parser, no dotenv). */
export function loadEnv({ webDir = WEB_DIR, processEnv = process.env } = {}) {
  const merged = {};
  for (const f of [".env", ".env.runtime"]) {
    const file = path.join(webDir, f);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      merged[m[1]] = v;
    }
  }
  for (const [k, v] of Object.entries(processEnv)) if (v !== undefined && v !== "") merged[k] = v;
  return merged;
}

// ─── Stripe reads ────────────────────────────────────────────────────────────

async function listAll(listFn, params = {}) {
  const out = [];
  let startingAfter;
  for (let page = 0; page < 100; page += 1) {
    const res = await listFn({ ...params, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    const data = res?.data ?? [];
    out.push(...data);
    if (!res?.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  }
  return out;
}

/** Every Product (active + archived) grouped by metadata.sku. */
export async function indexProductsBySku(stripe) {
  const bySku = new Map();
  for (const p of await listAll((q) => stripe.products.list(q))) {
    const sku = p?.metadata?.sku;
    if (!sku) continue;
    if (!bySku.has(sku)) bySku.set(sku, []);
    bySku.get(sku).push(p);
  }
  return bySku;
}

function priceMatches(price, spec) {
  return (
    price.active === true &&
    price.type === "one_time" &&
    !price.recurring &&
    String(price.currency).toLowerCase() === "aud" &&
    price.unit_amount === spec.amountCents &&
    price.tax_behavior === "inclusive"
  );
}

function describePrice(p) {
  const kind = p.type === "recurring" ? `recurring/${p.recurring?.interval ?? "?"}` : "one_time";
  return `${String(p.currency).toUpperCase()} ${p.unit_amount}¢ ${kind} tax=${p.tax_behavior ?? "unspecified"}`;
}

/**
 * Decide what to do for one SKU. Pure given the Stripe reads.
 * action: exists | create_product_and_price | create_price | drift | blocked
 */
export function planSku(spec, products, pricesForProduct) {
  if (products.length > 1) {
    return { spec, action: "blocked", problems: [`${products.length} Products carry metadata.sku=${spec.sku} — merge/archive the extras in the Dashboard first`] };
  }
  if (products.length === 0) return { spec, action: "create_product_and_price", problems: [] };
  const product = products[0];
  if (product.active === false) {
    return { spec, action: "blocked", productId: product.id, problems: [`Product for ${spec.sku} is archived — reactivate it in the Dashboard (this script never un-archives)`] };
  }
  const active = (pricesForProduct ?? []).filter((p) => p.active === true);
  const match = active.find((p) => priceMatches(p, spec));
  if (match) {
    const extras = active.filter((p) => p.id !== match.id);
    return {
      spec,
      action: "exists",
      productId: product.id,
      priceId: match.id,
      problems: extras.length ? [`note: ${extras.length} other active Price(s) on this Product: ${extras.map(describePrice).join("; ")}`] : [],
    };
  }
  if (active.length > 0) {
    return {
      spec,
      action: "drift",
      productId: product.id,
      problems: active.map((p) => `active Price ${describePrice(p)} ≠ expected AUD ${spec.amountCents}¢ one_time tax=inclusive — not mutated`),
    };
  }
  return { spec, action: "create_price", productId: product.id, problems: [] };
}

// ─── Stripe writes ───────────────────────────────────────────────────────────

function idemKey(mode, ...parts) {
  return ["blockid-mint-payg-v5", mode, ...parts].join(":");
}

async function createProduct(stripe, spec, mode) {
  return stripe.products.create(
    { name: spec.productName, metadata: { sku: spec.sku, pricing_version: PRICING_VERSION } },
    { idempotencyKey: idemKey(mode, "product", spec.sku) },
  );
}

async function createPrice(stripe, spec, productId, mode) {
  return stripe.prices.create(
    {
      product: productId,
      currency: "aud",
      unit_amount: spec.amountCents,
      tax_behavior: "inclusive",
      nickname: `${spec.sku} (${PRICING_VERSION})`,
      metadata: { sku: spec.sku, pricing_version: PRICING_VERSION },
    },
    { idempotencyKey: idemKey(mode, "price", spec.sku, productId, String(spec.amountCents)) },
  );
}

/** Archive (active:false) the legacy A$3 Prices named by env. Never deletes. */
export async function archiveLegacyPrices(stripe, env) {
  const results = [];
  for (const envVar of LEGACY_ARCHIVE_ENV_VARS) {
    const id = String(env[envVar] ?? "").trim();
    if (!id) {
      results.push({ envVar, action: "skipped", reason: "env var unset" });
      continue;
    }
    let price;
    try {
      price = await stripe.prices.retrieve(id);
    } catch (err) {
      results.push({ envVar, action: "refused", reason: `lookup failed: ${String(err?.message ?? err).replace(/price_[A-Za-z0-9]+/g, "price_…")}` });
      continue;
    }
    if (price.active === false) {
      results.push({ envVar, action: "already_archived" });
      continue;
    }
    if (price.unit_amount !== LEGACY_AMOUNT_CENTS || String(price.currency).toLowerCase() !== "aud" || price.type !== "one_time") {
      results.push({ envVar, action: "refused", reason: `not the legacy A$3 one-off Price (${describePrice(price)}) — left untouched` });
      continue;
    }
    await stripe.prices.update(id, { active: false });
    results.push({ envVar, action: "archived" });
  }
  return results;
}

// ─── Orchestration ───────────────────────────────────────────────────────────

/**
 * Run the mint. Returns the process exit code. Every dependency is injectable
 * for tests: `env` (already merged), `stripeFactory(key)`, `log(line)`.
 */
export async function run({ argv = [], env = {}, stripeFactory = null, log = (s) => console.log(s) } = {}) {
  const opts = parseArgs(argv);
  if (opts.help) {
    log(USAGE);
    return 0;
  }
  if (opts.error) {
    log(`✗ ${opts.error}`);
    log(USAGE);
    return 2;
  }

  const banner = opts.mode === "live" ? "LIVE MODE" : "TEST MODE";
  log(`[mint-payg-v5] ${banner}${opts.dryRun ? " · DRY RUN (no Stripe API calls)" : ""}${opts.archiveLegacy ? " · archive legacy A$3" : ""}`);

  if (opts.dryRun) {
    for (const spec of V5_MINT_SKUS) {
      log(`  · ${spec.sku.padEnd(22)} A$${(spec.amountCents / 100).toFixed(2).padStart(7)} → find Product metadata.sku=${spec.sku}; create "${spec.productName}" if missing; ensure one-time AUD Price ${spec.amountCents}¢ tax_behavior=inclusive metadata {sku, pricing_version:${PRICING_VERSION}}; print ${spec.envVar}=…`);
    }
    if (opts.archiveLegacy) {
      for (const envVar of LEGACY_ARCHIVE_ENV_VARS) log(`  · would archive (active:false) the A$3 Price named by ${envVar} — never deleted`);
    }
    log("[mint-payg-v5] dry run complete — nothing was sent to Stripe.");
    return 0;
  }

  const keyRes = resolveSecretKey({ mode: opts.mode, env });
  if (!keyRes.ok) {
    log(`✗ ${keyRes.error}`);
    return 2;
  }

  let stripe;
  if (stripeFactory) stripe = stripeFactory(keyRes.key);
  else {
    const { default: Stripe } = await import("stripe");
    stripe = new Stripe(keyRes.key);
  }

  const bySku = await indexProductsBySku(stripe);
  const results = [];
  for (const spec of V5_MINT_SKUS) {
    const products = bySku.get(spec.sku) ?? [];
    let prices = [];
    if (products.length === 1 && products[0].active !== false) {
      prices = await listAll((q) => stripe.prices.list(q), { product: products[0].id });
    }
    const plan = planSku(spec, products, prices);
    if (plan.action === "create_product_and_price") {
      const product = await createProduct(stripe, spec, opts.mode);
      const price = await createPrice(stripe, spec, product.id, opts.mode);
      results.push({ ...plan, action: "created", productId: product.id, priceId: price.id });
    } else if (plan.action === "create_price") {
      const price = await createPrice(stripe, spec, plan.productId, opts.mode);
      results.push({ ...plan, action: "created", priceId: price.id });
    } else {
      results.push(plan);
    }
  }

  for (const r of results) {
    const flag = r.action === "exists" ? "=" : r.action === "created" ? "+" : "✗";
    log(`  ${flag} ${r.spec.sku.padEnd(22)} ${r.action}${r.problems?.length ? ` — ${r.problems.join("; ")}` : ""}`);
  }

  const failed = results.filter((r) => r.action === "drift" || r.action === "blocked");
  const resolved = results.filter((r) => r.priceId);
  if (resolved.length > 0) {
    log(`\n# ${banner} — paste into web/.env and web/.env.runtime:`);
    for (const r of resolved) log(`${r.spec.envVar}=${r.priceId}`);
  }

  let archiveFailed = false;
  if (opts.archiveLegacy) {
    if (failed.length > 0) {
      log(`\n✗ --archive-legacy skipped: ${failed.length} v5 SKU(s) not resolved — the A$3 Prices stay active until every v5 Price exists.`);
      archiveFailed = true;
    } else {
      log("\n# Archiving legacy A$3 Prices (active:false, never deleted):");
      for (const a of await archiveLegacyPrices(stripe, env)) {
        log(`  ${a.action === "archived" ? "-" : a.action === "refused" ? "✗" : "·"} ${a.envVar} ${a.action}${a.reason ? ` — ${a.reason}` : ""}`);
        if (a.action === "refused") archiveFailed = true;
      }
    }
  }

  if (failed.length > 0) log(`\n✗ ${failed.length} SKU(s) need a founder decision (drift / blocked) — nothing was mutated for them.`);
  return failed.length > 0 || archiveFailed ? 1 : 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const code = await run({ argv: process.argv.slice(2), env: loadEnv() });
  process.exit(code);
}
