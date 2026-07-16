#!/usr/bin/env node
/**
 * Stripe webhook mock harness.
 *
 * Signs synthetic events with STRIPE_WEBHOOK_SECRET and POSTs them to
 * http://localhost:3000/api/stripe/webhook so local test-clock flows
 * (trial_will_end, trial_end, dunning, cancel) can be exercised without
 * a real Stripe account.
 *
 * Usage:
 *   node scripts/stripe-mock-webhook.mjs --type checkout.session.completed \
 *        --customer cus_test_123 --sub sub_test_456
 *   node scripts/stripe-mock-webhook.mjs --type customer.subscription.updated \
 *        --sub sub_test_456 --status active --at T+7d
 *
 * Supported --type values:
 *   checkout.session.completed
 *   customer.subscription.trial_will_end
 *   customer.subscription.updated        (needs --status)
 *   invoice.paid
 *   invoice.payment_failed
 *
 * Env:
 *   STRIPE_WEBHOOK_SECRET   Required. Must match server config.
 *   WEBHOOK_URL             Optional, defaults to http://localhost:3000/api/stripe/webhook.
 */

import { createHmac, randomUUID } from "node:crypto";
import { argv, env, exit } from "node:process";

function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i > -1 ? argv[i + 1] : fallback;
}

const type = arg("type");
const customer = arg("customer", "cus_test_qa");
const subscription = arg("sub", "sub_test_qa");
const status = arg("status", "trialing");
const priceId = arg("price", "price_test_founder_growth");
const atOffset = arg("at", "T+0d"); // e.g. T+7d, T-1d
const url = env.WEBHOOK_URL ?? "http://localhost:3000/api/stripe/webhook";
const secret = env.STRIPE_WEBHOOK_SECRET;

if (!type) {
  console.error("Missing --type. See --help.");
  exit(2);
}
if (!secret) {
  console.error("Missing STRIPE_WEBHOOK_SECRET");
  exit(2);
}

// Parse T+7d / T-3d style offsets to a unix timestamp.
function offsetToUnix(off) {
  const m = /^T([+-])(\d+)([dhm])$/.exec(off);
  const now = Math.floor(Date.now() / 1000);
  if (!m) return now;
  const sign = m[1] === "+" ? 1 : -1;
  const n = Number(m[2]);
  const unit = m[3] === "d" ? 86_400 : m[3] === "h" ? 3600 : 60;
  return now + sign * n * unit;
}

const eventTs = offsetToUnix(atOffset);
const eventId = `evt_test_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

function subObj(overrides = {}) {
  return {
    id: subscription,
    object: "subscription",
    customer,
    status,
    trial_start: eventTs - 7 * 86_400,
    trial_end: eventTs,
    current_period_start: eventTs,
    current_period_end: eventTs + 30 * 86_400,
    items: {
      data: [
        { id: `si_${randomUUID().slice(0, 8)}`, price: { id: priceId, unit_amount: 4900 } },
      ],
    },
    cancel_at_period_end: false,
    ...overrides,
  };
}

const payloads = {
  "checkout.session.completed": () => ({
    id: `cs_test_${randomUUID().slice(0, 12)}`,
    object: "checkout.session",
    customer,
    subscription,
    mode: "subscription",
    payment_status: "paid",
    metadata: { qa: "true" },
  }),
  "customer.subscription.trial_will_end": () => subObj(),
  "customer.subscription.updated": () => subObj({ status }),
  "invoice.paid": () => ({
    id: `in_test_${randomUUID().slice(0, 12)}`,
    object: "invoice",
    customer,
    subscription,
    amount_paid: 4900,
    status: "paid",
    paid: true,
  }),
  "invoice.payment_failed": () => ({
    id: `in_test_${randomUUID().slice(0, 12)}`,
    object: "invoice",
    customer,
    subscription,
    amount_due: 4900,
    status: "open",
    attempt_count: 1,
    next_payment_attempt: eventTs + 3 * 86_400,
  }),
};

const build = payloads[type];
if (!build) {
  console.error(`Unsupported --type ${type}`);
  exit(2);
}

const event = {
  id: eventId,
  object: "event",
  api_version: "2024-06-20",
  created: eventTs,
  type,
  livemode: false,
  data: { object: build() },
};

const body = JSON.stringify(event);
const timestamp = eventTs.toString();
const signedPayload = `${timestamp}.${body}`;
const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
const sigHeader = `t=${timestamp},v1=${v1}`;

const resp = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "stripe-signature": sigHeader,
    "user-agent": "blockid-qa-mock/1.0",
  },
  body,
});

const text = await resp.text();
console.log(`POST ${url} type=${type} at=${atOffset} -> ${resp.status}`);
if (text) console.log(text);
if (!resp.ok) exit(1);
