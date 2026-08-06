// GET /api/health/stripe
//
// Verifies that at least one Stripe webhook endpoint pointing at
// `blockid.au/api/stripe/webhook` is (a) enabled and (b) subscribed to every
// event our webhook handler relies on. Added after the 2026-08-06 ops-level
// incident where the endpoint was missing `checkout.session.completed`, which
// silently broke entitlement grants for a paying customer (zenya@zenyatech.com.au).
//
// Behaviour:
//   - Returns 200 with { ok: true } when the required events are all present.
//   - Returns 200 with { ok: false, missing_events: [...] } when misconfigured.
//     We deliberately DO NOT throw / 500 — this endpoint is polled by uptime
//     monitors, and a hard failure would be routed to on-call as a downtime
//     event. Instead we log ERROR so Sentry / log aggregation picks it up as a
//     configuration alert.
//   - Returns 503 only when Stripe itself is unreachable / not configured.

import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Every event type our webhook handler branches on. Keep in sync with
// web/src/app/api/stripe/webhook/route.ts — the tests assert this list matches
// the switch arms.
export const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
] as const;

const WEBHOOK_URL_MATCH = /blockid\.au\/api\/stripe\/webhook/i;

type StripeHealthResponse = {
  ok: boolean;
  configured: boolean;
  endpoint_url?: string;
  endpoint_status?: string;
  enabled_events?: string[];
  missing_events?: string[];
  extra_events?: string[];
  error?: string;
};

export async function GET(): Promise<Response> {
  if (!isStripeConfigured()) {
    const body: StripeHealthResponse = { ok: false, configured: false, error: "STRIPE_SECRET_KEY missing" };
    return NextResponse.json(body, { status: 503, headers: { "cache-control": "no-store" } });
  }

  const stripe = getStripe();
  if (!stripe) {
    const body: StripeHealthResponse = { ok: false, configured: false, error: "Stripe client unavailable" };
    return NextResponse.json(body, { status: 503, headers: { "cache-control": "no-store" } });
  }

  try {
    const list = await stripe.webhookEndpoints.list({ limit: 100 });
    const match = list.data.find((e) => WEBHOOK_URL_MATCH.test(e.url ?? ""));

    if (!match) {
      const body: StripeHealthResponse = {
        ok: false,
        configured: true,
        error: "No Stripe webhook endpoint matches blockid.au/api/stripe/webhook",
        missing_events: [...REQUIRED_WEBHOOK_EVENTS],
      };
      console.error("[blockid:health:stripe] no matching webhook endpoint configured", body);
      return NextResponse.json(body, { status: 200, headers: { "cache-control": "no-store" } });
    }

    const enabled = new Set(match.enabled_events ?? []);
    // "*" enables everything on the account.
    const wildcard = enabled.has("*");
    const missing = wildcard
      ? []
      : REQUIRED_WEBHOOK_EVENTS.filter((ev) => !enabled.has(ev));
    const extra = wildcard
      ? []
      : (match.enabled_events ?? []).filter(
          (ev) => !(REQUIRED_WEBHOOK_EVENTS as readonly string[]).includes(ev),
        );

    const disabledStatus = match.status && match.status !== "enabled";
    const ok = missing.length === 0 && !disabledStatus;

    const body: StripeHealthResponse = {
      ok,
      configured: true,
      endpoint_url: match.url,
      endpoint_status: match.status ?? "unknown",
      enabled_events: match.enabled_events ?? [],
      missing_events: missing,
      extra_events: extra,
    };

    if (!ok) {
      // Loud log so Sentry / log aggregation picks this up as a config drift.
      console.error(
        "[blockid:health:stripe] webhook endpoint misconfigured",
        JSON.stringify({
          endpoint_url: match.url,
          endpoint_status: match.status,
          missing_events: missing,
        }),
      );
    }

    return NextResponse.json(body, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = (err as Error).message;
    const body: StripeHealthResponse = { ok: false, configured: true, error: message };
    console.error("[blockid:health:stripe] failed to list webhookEndpoints", message);
    return NextResponse.json(body, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
