#!/usr/bin/env node
/**
 * seed-pilot-prices.mjs — mint the two BlockID Cohort Validation Pilot prices
 * (G21 P0-C, founder decision F-2). Founder-run only; NEVER executed by a
 * deploy, a cron or an agent.
 *
 * The seed for the rest of the ladder is scripts/seed-stripe.mjs, driven by
 * plans.csv → stripe-seed.json. The pilot SKUs deliberately have NO plans.csv
 * row (they are one-off purchases fulfilled by `pilot_orders`, not a plan a
 * user can be on), so this script carries them instead — same product /
 * price shape, same GST-inclusive rule, dry-run by default.
 *
 *   node scripts/stripe/seed-pilot-prices.mjs            # dry run — prints what it would mint
 *   node scripts/stripe/seed-pilot-prices.mjs --live     # creates the prices in live mode
 *   node scripts/stripe/seed-pilot-prices.mjs --live --test-mode   # uses STRIPE_SECRET_KEY_TEST
 *
 * After a live run, set the printed env var NAMES to the printed price ids in
 * web/.env.production and restart — checkout starts answering with a Stripe
 * URL without a deploy. This file never writes to the database and never
 * touches `plans`.
 */

import Stripe from "stripe";
import { argv, env, exit } from "node:process";

const args = new Set(argv.slice(2));
const LIVE = args.has("--live");
const TEST_MODE = args.has("--test-mode");

/** Mirrors web/src/lib/pricing/pilot-skus.ts — keep the two in step (pilot-skus.test.ts pins the amounts). */
const PILOT_SKUS = [
  { plan_id: "cohort_pilot_25", product_name: "Cohort Validation Pilot (up to 25 applicants)", env_var: "STRIPE_PRICE_COHORT_PILOT_25", amount_cents: 150000 },
  { plan_id: "cohort_pilot_50", product_name: "Cohort Validation Pilot (up to 50 applicants)", env_var: "STRIPE_PRICE_COHORT_PILOT_50", amount_cents: 250000 },
];

function pickStripeKey() {
  if (TEST_MODE && env.STRIPE_SECRET_KEY_TEST) return env.STRIPE_SECRET_KEY_TEST;
  if (!env.STRIPE_SECRET_KEY) {
    console.error("[seed-pilot-prices] STRIPE_SECRET_KEY missing in env");
    exit(1);
  }
  return env.STRIPE_SECRET_KEY;
}

async function ensureProduct(stripe, sku) {
  const existing = await stripe.products.search({ query: `metadata['plan_id']:'${sku.plan_id}'`, limit: 1 });
  if (existing.data[0]) return existing.data[0];
  if (!LIVE) return { id: `prod_dry_${sku.plan_id}` };
  return stripe.products.create({
    name: `BlockID ${sku.product_name}`,
    metadata: { plan_id: sku.plan_id, segment: "accelerator", kind: "cohort_pilot" },
    active: true,
  });
}

async function ensurePrice(stripe, product, sku) {
  const existing = await stripe.prices.search({
    query: `metadata['plan_id']:'${sku.plan_id}' AND metadata['interval']:'once' AND active:'true'`,
    limit: 1,
  });
  if (existing.data[0] && existing.data[0].unit_amount === sku.amount_cents) return existing.data[0];
  if (!LIVE) return { id: `price_dry_${sku.plan_id}` };
  // GST-inclusive: the advertised A$ figure is what Stripe charges; Stripe Tax
  // splits net + GST on the invoice (plans-v2.ts GST rule).
  return stripe.prices.create({
    product: product.id,
    unit_amount: sku.amount_cents,
    currency: "aud",
    tax_behavior: "inclusive",
    metadata: { plan_id: sku.plan_id, interval: "once" },
  });
}

async function main() {
  console.log(`[seed-pilot-prices] mode=${LIVE ? "LIVE" : "dry-run"} test=${TEST_MODE}`);
  const stripe = new Stripe(pickStripeKey(), { apiVersion: "2024-04-10" });
  for (const sku of PILOT_SKUS) {
    const already = env[sku.env_var];
    if (already) {
      console.log(`  ~ ${sku.env_var} already set — skipping ${sku.plan_id}`);
      continue;
    }
    const product = await ensureProduct(stripe, sku);
    const price = await ensurePrice(stripe, product, sku);
    console.log(`  ${LIVE ? "+" : "[dry]"} ${sku.plan_id} A$${(sku.amount_cents / 100).toLocaleString("en-AU")} one-off inclusive → set ${sku.env_var}=${price.id}`);
  }
  console.log("[seed-pilot-prices] done — set the env vars above, restart the app, then run scripts/stripe-price-audit.mjs");
}

main().catch((e) => {
  console.error("[seed-pilot-prices] fatal", e);
  exit(1);
});
