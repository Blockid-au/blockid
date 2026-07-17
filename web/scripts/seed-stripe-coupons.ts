#!/usr/bin/env node
/**
 * Seed Stripe coupons — T-0416.
 *
 * Idempotent seeder for two winback / save-offer coupons used by the
 * lifecycle mailer and Stripe cancel flow. Safe to re-run: existing
 * coupon IDs are detected and skipped; only missing ones are created.
 * Never overwrites existing coupons.
 *
 * Env:
 *   STRIPE_SECRET_KEY               (required — bail with clear error if missing)
 *   STRIPE_PRODUCT_ID_STARTER       (optional — restricts DOWNGRADE_STARTER50
 *                                    to a single product; if unset the coupon
 *                                    applies to all products, with a warning)
 *
 * Flags:
 *   --dry-run   List intended actions without touching Stripe.
 *
 * Owner: CFO agent (retention track).
 */

import Stripe from "stripe";
import { argv, env, exit } from "node:process";

interface CouponSpec {
  id: string;
  percent_off: number;
  duration: "repeating";
  duration_in_months: number;
  max_redemptions?: number;
  applies_to?: { products: string[] };
  metadata: Record<string, string>;
}

const args = new Set(argv.slice(2));
const DRY_RUN = args.has("--dry-run");

function pickStripeKey(): string {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[seed-stripe-coupons] STRIPE_SECRET_KEY missing in env");
    exit(1);
  }
  return key;
}

function buildSpecs(): CouponSpec[] {
  const specs: CouponSpec[] = [
    {
      id: "COMEBACK30",
      percent_off: 30,
      duration: "repeating",
      duration_in_months: 3,
      max_redemptions: 1000,
      metadata: { purpose: "winback", added_by: "T-0416" },
    },
  ];

  const starterProduct = env.STRIPE_PRODUCT_ID_STARTER;
  const downgrade: CouponSpec = {
    id: "DOWNGRADE_STARTER50",
    percent_off: 50,
    duration: "repeating",
    duration_in_months: 3,
    metadata: { purpose: "save_offer_too_expensive", added_by: "T-0416" },
  };
  if (starterProduct) {
    downgrade.applies_to = { products: [starterProduct] };
  } else {
    console.warn(
      "[seed-stripe-coupons] STRIPE_PRODUCT_ID_STARTER missing — DOWNGRADE_STARTER50 will apply to ALL products",
    );
  }
  specs.push(downgrade);
  return specs;
}

async function existingIds(stripe: Stripe): Promise<Set<string>> {
  const found = new Set<string>();
  const page = await stripe.coupons.list({ limit: 100 });
  for (const c of page.data) {
    if (c.id) found.add(c.id);
  }
  return found;
}

async function ensureCoupon(
  stripe: Stripe,
  spec: CouponSpec,
  existing: Set<string>,
): Promise<void> {
  if (existing.has(spec.id)) {
    console.log(`[skip] ${spec.id} — already exists`);
    return;
  }
  if (DRY_RUN) {
    console.log(
      `[dry] would create ${spec.id} (${spec.percent_off}% off, ${spec.duration_in_months}mo)`,
    );
    return;
  }
  const params: Stripe.CouponCreateParams = {
    id: spec.id,
    percent_off: spec.percent_off,
    duration: spec.duration,
    duration_in_months: spec.duration_in_months,
    metadata: spec.metadata,
  };
  if (spec.max_redemptions !== undefined) {
    params.max_redemptions = spec.max_redemptions;
  }
  if (spec.applies_to) {
    params.applies_to = spec.applies_to;
  }
  const created = await stripe.coupons.create(params);
  console.log(`[create] ${spec.id} → ${created.id}`);
}

async function main(): Promise<void> {
  const key = pickStripeKey();
  const stripe = new Stripe(key, { typescript: true });

  console.log(
    `[seed-stripe-coupons] mode=${DRY_RUN ? "dry-run" : "LIVE"}`,
  );

  const specs = buildSpecs();
  const existing = DRY_RUN ? new Set<string>() : await existingIds(stripe);
  if (!DRY_RUN) {
    console.log(`[seed-stripe-coupons] ${existing.size} existing coupons detected`);
  }

  for (const spec of specs) {
    try {
      await ensureCoupon(stripe, spec, existing);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[error] ${spec.id}: ${msg}`);
    }
  }

  console.log(
    "Done — pin these IDs in Stripe dashboard and record in web/src/lib/stripe.ts constants.",
  );
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error("[seed-stripe-coupons] fatal", msg);
  exit(1);
});
