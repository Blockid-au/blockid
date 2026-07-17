#!/usr/bin/env node
/**
 * stripe-mock-webhook.mjs
 *
 * HMAC-signed synthetic Stripe webhook event generator for QA.
 *
 * Usage:
 *   node web/scripts/stripe-mock-webhook.mjs \
 *     --event trial_will_end \
 *     --user qa-founder-3 \
 *     --at "T+7d"
 *
 * Flags:
 *   --event <name>   One of the shortcuts below (or a full Stripe event type).
 *   --user  <slug>   QA user slug (e.g. qa-founder-3). Used to derive
 *                    deterministic cus_* / sub_* ids without a DB lookup.
 *   --at    <off>    Time offset from now, e.g. T+7d, T-1d, T+3h, T-15m.
 *   --url   <url>    Override target (default http://localhost:3000/api/stripe/webhook).
 *   --plan  <slug>   Optional plan slug (default founder_growth).
 *   --amount <cents> Optional invoice/subscription unit amount (default 4900).
 *   --help           Print this help and exit 0.
 *
 * Event shortcuts:
 *   trial_will_end   -> customer.subscription.trial_will_end
 *   updated          -> customer.subscription.updated
 *   deleted          -> customer.subscription.deleted
 *   setup_succeeded  -> setup_intent.succeeded
 *   payment_failed   -> invoice.payment_failed
 *
 * Signature:
 *   Stripe-Signature: t=<epoch>,v1=<hex hmac_sha256(t + "." + payload, secret)>
 *   Secret read from STRIPE_WEBHOOK_SECRET.
 *
 * Reference: https://stripe.com/docs/webhooks/signatures
 */

import { createHmac, randomUUID, createHash } from "node:crypto";
import { argv, env, exit, stdout, stderr } from "node:process";

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function arg(name, fallback) {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
}

function hasFlag(name) {
  return argv.includes(`--${name}`);
}

if (hasFlag("help") || hasFlag("h")) {
  stdout.write(
    [
      "stripe-mock-webhook — sign + POST a synthetic Stripe webhook event.",
      "",
      "Usage:",
      "  node web/scripts/stripe-mock-webhook.mjs --event <name> --user <qa-slug> [--at T+7d] [--url ...]",
      "",
      "Event shortcuts:",
      "  trial_will_end    customer.subscription.trial_will_end",
      "  updated           customer.subscription.updated",
      "  deleted           customer.subscription.deleted",
      "  setup_succeeded   setup_intent.succeeded",
      "  payment_failed    invoice.payment_failed",
      "",
      "Env:",
      "  STRIPE_WEBHOOK_SECRET   Required (whsec_...). Must match the server.",
      "",
      "Example:",
      '  node web/scripts/stripe-mock-webhook.mjs --event trial_will_end \\',
      '    --user qa-founder-3 --at "T+7d"',
      "",
    ].join("\n"),
  );
  exit(0);
}

const EVENT_ALIASES = {
  trial_will_end: "customer.subscription.trial_will_end",
  updated: "customer.subscription.updated",
  deleted: "customer.subscription.deleted",
  setup_succeeded: "setup_intent.succeeded",
  payment_failed: "invoice.payment_failed",
};

const rawEvent = arg("event");
const userSlug = arg("user", "qa-founder-1");
const offset = arg("at", "T+0d");
const url = arg("url", "http://localhost:3000/api/stripe/webhook");
const planSlug = arg("plan", "founder_growth");
const amount = Number(arg("amount", "4900"));
const secret = env.STRIPE_WEBHOOK_SECRET;

if (!rawEvent) {
  stderr.write("error: --event is required. See --help.\n");
  exit(2);
}
if (!secret) {
  stderr.write("error: STRIPE_WEBHOOK_SECRET is not set.\n");
  exit(2);
}

const eventType = EVENT_ALIASES[rawEvent] ?? rawEvent;
const SUPPORTED = new Set([
  "customer.subscription.trial_will_end",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "setup_intent.succeeded",
  "invoice.payment_failed",
]);
if (!SUPPORTED.has(eventType)) {
  stderr.write(`error: unsupported event "${eventType}".\n`);
  stderr.write(`supported: ${Array.from(SUPPORTED).join(", ")}\n`);
  exit(2);
}

// ---------------------------------------------------------------------------
// Deterministic id derivation from QA user slug
// ---------------------------------------------------------------------------

function slugHash(slug, prefix) {
  const h = createHash("sha1").update(slug).digest("hex").slice(0, 16);
  return `${prefix}_test_${h}`;
}

const email = userSlug.includes("@") ? userSlug : `${userSlug}@blockid.au`;
const customerId = slugHash(userSlug, "cus");
const subscriptionId = slugHash(`${userSlug}:sub`, "sub");
const priceId = `price_test_${planSlug}`;

// ---------------------------------------------------------------------------
// Time offset parsing (T+7d, T-15m, T+3h, T+0d)
// ---------------------------------------------------------------------------

function offsetToUnix(off) {
  const now = Math.floor(Date.now() / 1000);
  const m = /^T([+-])(\d+)([dhm])$/.exec(off);
  if (!m) return now;
  const sign = m[1] === "+" ? 1 : -1;
  const n = Number(m[2]);
  const unit = m[3] === "d" ? 86_400 : m[3] === "h" ? 3600 : 60;
  return now + sign * n * unit;
}

const eventTs = offsetToUnix(offset);
const eventId = `evt_test_${randomUUID().replace(/-/g, "").slice(0, 24)}`;

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

function subscriptionObject(overrides = {}) {
  return {
    id: subscriptionId,
    object: "subscription",
    customer: customerId,
    status: "trialing",
    trial_start: eventTs - 7 * 86_400,
    trial_end: eventTs,
    current_period_start: eventTs,
    current_period_end: eventTs + 30 * 86_400,
    cancel_at_period_end: false,
    items: {
      object: "list",
      data: [
        {
          id: `si_test_${randomUUID().slice(0, 8)}`,
          object: "subscription_item",
          price: {
            id: priceId,
            object: "price",
            unit_amount: amount,
            currency: "aud",
            recurring: { interval: "month" },
          },
          quantity: 1,
        },
      ],
    },
    metadata: { qa_user: userSlug, qa_email: email },
    ...overrides,
  };
}

const BUILDERS = {
  "customer.subscription.trial_will_end": () => subscriptionObject(),
  "customer.subscription.updated": () =>
    subscriptionObject({ status: "active" }),
  "customer.subscription.deleted": () =>
    subscriptionObject({
      status: "canceled",
      canceled_at: eventTs,
      ended_at: eventTs,
    }),
  "setup_intent.succeeded": () => ({
    id: `seti_test_${randomUUID().slice(0, 12)}`,
    object: "setup_intent",
    customer: customerId,
    status: "succeeded",
    payment_method: `pm_test_${randomUUID().slice(0, 12)}`,
    usage: "off_session",
    metadata: { qa_user: userSlug, qa_email: email },
  }),
  "invoice.payment_failed": () => ({
    id: `in_test_${randomUUID().slice(0, 12)}`,
    object: "invoice",
    customer: customerId,
    subscription: subscriptionId,
    amount_due: amount,
    amount_paid: 0,
    attempt_count: 1,
    next_payment_attempt: eventTs + 3 * 86_400,
    status: "open",
    paid: false,
    metadata: { qa_user: userSlug, qa_email: email },
  }),
};

const dataObject = BUILDERS[eventType]();

// ---------------------------------------------------------------------------
// Envelope + signature
// ---------------------------------------------------------------------------

const event = {
  id: eventId,
  object: "event",
  api_version: "2024-06-20",
  created: eventTs,
  type: eventType,
  livemode: false,
  data: { object: dataObject },
  request: { id: null, idempotency_key: null },
};

const body = JSON.stringify(event);
const timestamp = eventTs.toString();
const signedPayload = `${timestamp}.${body}`;
const v1 = createHmac("sha256", secret).update(signedPayload).digest("hex");
const stripeSignature = `t=${timestamp},v1=${v1}`;

// ---------------------------------------------------------------------------
// POST + reporting
// ---------------------------------------------------------------------------

stdout.write(
  `POST ${url}\n  event=${eventType}\n  user=${userSlug} (${customerId} / ${subscriptionId})\n  at=${offset} (ts=${timestamp})\n`,
);

const resp = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Stripe-Signature": stripeSignature,
    "User-Agent": "blockid-qa-stripe-mock/1.0",
  },
  body,
});

const text = await resp.text();
stdout.write(`-> ${resp.status} ${resp.statusText}\n`);
if (text) stdout.write(text + (text.endsWith("\n") ? "" : "\n"));

if (!resp.ok) {
  stderr.write(`fail: non-2xx response (${resp.status})\n`);
  exit(1);
}
exit(0);
