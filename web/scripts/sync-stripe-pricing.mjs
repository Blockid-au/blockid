#!/usr/bin/env node
// CLI: run the Stripe pricing audit + auto-create new Prices for drifted plans.
//
// Usage:
//   node scripts/sync-stripe-pricing.mjs              # audit only
//   node scripts/sync-stripe-pricing.mjs --fix        # create new Prices for drift
//   node scripts/sync-stripe-pricing.mjs --fix --write-env  # also patch .env in place
//
// Run from web/ dir so .env loads correctly. Uses the same logic as
// lib/stripe-pricing-audit.ts but bypassed through direct Stripe API calls
// (this script is a stand-alone Node binary, not a Next route).
//
// Output: prints per-plan status + (with --fix) the new STRIPE_PRICE_* env
// var lines. With --write-env, replaces the matching lines in .env and
// prints a redeploy reminder.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");
const ENV_PATH = resolve(WEB_DIR, ".env");

// ─── Load .env (minimal parser — no dependency on dotenv) ──────────────────
function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const ENV = loadEnv();
const STRIPE_KEY = ENV.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

if (!STRIPE_KEY) {
  console.error("✗ STRIPE_SECRET_KEY missing in .env");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_KEY, { typescript: false });

// ─── Plan registry (mirrors lib/stripe-pricing-audit.ts) ───────────────────
const PLANS = [
  { planId: "founding50",    label: "Founding 100 (one-off)", configCents: 300,   cadence: "one-off",  envVar: "STRIPE_PRICE_FOUNDING50" },
  { planId: "growth",        label: "Growth — monthly",       configCents: 9900,  cadence: "monthly",  envVar: "STRIPE_PRICE_GROWTH" },
  { planId: "growth_annual", label: "Growth — annual",        configCents: 95000, cadence: "yearly",   envVar: "STRIPE_PRICE_GROWTH_ANNUAL" },
  { planId: "credits_5",     label: "5 credits pack",         configCents: 500,   cadence: "one-off",  envVar: "STRIPE_PRICE_CREDITS_5" },
  { planId: "credits_10",    label: "10 credits pack",        configCents: 900,   cadence: "one-off",  envVar: "STRIPE_PRICE_CREDITS_10" },
  { planId: "credits_25",    label: "25 credits pack",        configCents: 2000,  cadence: "one-off",  envVar: "STRIPE_PRICE_CREDITS_25" },
  { planId: "credits_50",    label: "50 credits pack",        configCents: 1500,  cadence: "one-off",  envVar: "STRIPE_PRICE_CREDITS_50" },
  { planId: "credits_100",   label: "100 credits pack",       configCents: 2500,  cadence: "one-off",  envVar: "STRIPE_PRICE_CREDITS_100" },
];

// ─── Audit + (optionally) fix ──────────────────────────────────────────────
const flags = new Set(process.argv.slice(2));
const FIX = flags.has("--fix");
const WRITE_ENV = flags.has("--write-env");

console.log(`Stripe pricing audit · ${FIX ? "FIX mode" : "read-only"}${WRITE_ENV ? " · will patch .env" : ""}\n`);
console.log(`Plan                                  Expected      Stripe        Status`);
console.log(`────────────────────────────────────────────────────────────────────────────`);

const drifts = [];
const newPrices = [];

for (const plan of PLANS) {
  const expected = `A$${(plan.configCents / 100).toFixed(plan.configCents % 100 === 0 ? 0 : 2)}`;
  const priceId = ENV[plan.envVar] || process.env[plan.envVar];

  if (!priceId) {
    console.log(`${plan.label.padEnd(38)}${expected.padEnd(14)}${"—".padEnd(14)}MISSING_ID`);
    drifts.push({ plan, reason: "missing_id" });
    continue;
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    const actual = `${price.currency.toUpperCase()} ${price.unit_amount}¢`;
    const match = price.unit_amount === plan.configCents && price.currency === "aud" && price.active;
    const status = !price.active ? "ARCHIVED" : (price.unit_amount === plan.configCents && price.currency === "aud") ? "MATCH" : "DRIFT";

    console.log(`${plan.label.padEnd(38)}${expected.padEnd(14)}${actual.padEnd(14)}${status}`);

    if (!match) {
      drifts.push({ plan, reason: status.toLowerCase(), actualCents: price.unit_amount, actualCurrency: price.currency });
    }
  } catch (err) {
    console.log(`${plan.label.padEnd(38)}${expected.padEnd(14)}${"ERROR".padEnd(14)}LOOKUP_FAIL: ${err.message}`);
  }
}

if (drifts.length === 0) {
  console.log(`\n✓ All plans match. No action needed.`);
  process.exit(0);
}

console.log(`\n${drifts.length} drifted plan(s) detected.`);

if (!FIX) {
  console.log(`Run with --fix to create new Stripe Prices.`);
  process.exit(0);
}

// ─── Fix mode: create new Prices ──────────────────────────────────────────
console.log(`\nCreating new Stripe Prices...\n`);

for (const { plan } of drifts) {
  console.log(`→ ${plan.label} (planId=${plan.planId})`);

  // Find or create the parent Product
  let productId = null;
  try {
    const search = await stripe.products.search({
      query: `metadata["blockid_plan_id"]:"${plan.planId}"`,
      limit: 1,
    });
    if (search.data[0]) {
      productId = search.data[0].id;
      console.log(`   Reusing Product ${productId}`);
    }
  } catch {
    // search may not be available — fall through to create
  }

  if (!productId) {
    const product = await stripe.products.create({
      name: plan.label,
      metadata: { blockid_plan_id: plan.planId },
    });
    productId = product.id;
    console.log(`   Created Product ${productId}`);
  }

  const recurring = plan.cadence === "monthly" ? { interval: "month" }
    : plan.cadence === "yearly" ? { interval: "year" }
    : undefined;

  const newPrice = await stripe.prices.create({
    product: productId,
    currency: "aud",
    unit_amount: plan.configCents,
    recurring,
    metadata: { blockid_plan_id: plan.planId, created_by: "sync-stripe-pricing.mjs" },
  });

  console.log(`   ✓ New Price ${newPrice.id} @ A$${plan.configCents / 100}\n`);
  newPrices.push({ envVar: plan.envVar, newId: newPrice.id });
}

console.log(`────────────────────────────────────────────────────────────────────────────`);
console.log(`Env var updates:\n`);
for (const np of newPrices) {
  console.log(`  ${np.envVar}=${np.newId}`);
}

if (WRITE_ENV) {
  console.log(`\nPatching ${ENV_PATH}...`);
  let envText = readFileSync(ENV_PATH, "utf8");
  for (const np of newPrices) {
    const re = new RegExp(`^${np.envVar}=.*$`, "m");
    if (re.test(envText)) {
      envText = envText.replace(re, `${np.envVar}=${np.newId}`);
    } else {
      envText += `\n${np.envVar}=${np.newId}\n`;
    }
  }
  writeFileSync(ENV_PATH, envText);
  console.log(`✓ .env patched.\nRun bash scripts/deploy-live.sh to roll out.`);
}

console.log(`\n[!] After redeploy, archive the old Stripe Prices in the Stripe Dashboard so they stop appearing in reports.`);
