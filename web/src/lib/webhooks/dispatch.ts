// S20-B — webhook dispatcher. Runs from /api/cron/webhook-dispatch every
// 5 minutes (≤ 50 deliveries per tick) and from the endpoint test button
// (one synchronous `ping`).
//
// Per delivery:
//   1. lease   — `claim()` is a conditional UPDATE (status queued|failed AND
//                lease free) so an overlapping tick never sends the same
//                row twice; the lease (LEASE_MS) outlives the 8 s timeout.
//   2. gate    — endpoint inactive → `dead:endpoint_disabled`; owner's plan
//                no longer unlocks webhooks → `dead:plan_lapsed` (no failure
//                counted); URL refused by the S8-C SSRF guard (https only,
//                no private / internal hosts, every resolved address public)
//                → a failure like any other (`ssrf_refused:<reason>`) so a
//                DNS record that later goes public is retried, but an
//                endpoint pointing inside the network dies on the ladder.
//   3. send    — POST JSON, 8 s AbortController timeout, `redirect: "manual"`
//                (a 3xx is a failure — redirects are never followed, so the
//                SSRF check on the original host is the only host reached).
//                Headers: Content-Type, User-Agent, X-BlockID-Event,
//                X-BlockID-Delivery (idempotency), X-BlockID-Signature
//                (t=<ts>,v1=<hmac>). 2xx = delivered; anything else fails.
//   4. ladder  — attempt n fails → next_attempt_at = now + RETRY_DELAYS_MS[n-1]
//                (1 m / 10 m / 1 h / 6 h); after MAX_ATTEMPTS (5) → `dead`.
//   5. health  — endpoint.failure_count resets on success, increments on
//                failure; at MAX_CONSECUTIVE_FAILURES (20) the endpoint is
//                disabled (`active=false`, `disabled_reason`) and ONE
//                `webhook_disabled` in-app notification is written for its
//                owner (dedupe key = endpoint id, 24 h throttle).
//
// `dryRun` lists what the tick would send and writes nothing. `fetch` and
// `checkUrl` are injectable so the tests never touch the network.

import { randomUUID } from "node:crypto";
import { checkOutboundUrl, type OutboundUrlOptions } from "@/lib/security/outbound-url";
import { buildSignatureHeader, DELIVERY_HEADER, EVENT_HEADER, nowSec, openSecret, SIGNATURE_HEADER } from "./sign";
import { buildEnvelope, usersAllowedWebhooks, type PingPayload } from "./registry";
import { supabaseWebhookStore, type DeliveryRow, type EndpointRow, type WebhookStore } from "./store";

export const DELIVERY_TIMEOUT_MS = 8_000;
export const LEASE_MS = 2 * 60_000;
export const RETRY_DELAYS_MS: readonly number[] = Object.freeze([60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000]);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
export const MAX_CONSECUTIVE_FAILURES = 20;
export const DEFAULT_BATCH = 50;
export const USER_AGENT = "BlockID-Webhooks/1.0 (+https://blockid.au/docs#webhooks)";

export type DeliveryOutcome =
  | { ok: true; status: number; durationMs: number }
  | { ok: false; status: number | null; error: string; durationMs: number };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface DispatchDeps {
  store?: WebhookStore | null;
  fetch?: FetchLike;
  /** SSRF check seam (defaults to the S8-C guard with real DNS). */
  checkUrl?: (url: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** In-app notification writer (defaults to lib/notifications). */
  notify?: (args: { userId: string; projectId: string | null; endpointId: string; url: string }) => Promise<void>;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

/** Retry delay after the n-th failed attempt (1-based). Null when the ladder is exhausted. */
export function retryDelayMs(attemptsSoFar: number): number | null {
  if (attemptsSoFar >= MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[attemptsSoFar - 1] ?? null;
}

/** Cheap https-only pre-check — the full guard also resolves DNS. */
export function isHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}

async function defaultCheckUrl(url: string, opts: OutboundUrlOptions = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isHttpsUrl(url)) return { ok: false, reason: "https_required" };
  const res = await checkOutboundUrl(url, opts);
  return res.ok ? { ok: true } : { ok: false, reason: res.reason };
}

/** Validate a subscriber URL at creation time (same rules as at send time). */
export async function validateEndpointUrl(url: string, opts: OutboundUrlOptions = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof url !== "string" || url.length > 2048) return { ok: false, reason: "invalid_url" };
  return defaultCheckUrl(url, opts);
}

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * One HTTP attempt. Signs `body` with the endpoint's secret; never throws.
 */
export async function sendOnce(
  endpoint: Pick<EndpointRow, "url" | "secret_enc">,
  delivery: Pick<DeliveryRow, "id" | "event" | "payload">,
  deps: Pick<DispatchDeps, "fetch" | "checkUrl" | "env"> = {},
): Promise<DeliveryOutcome> {
  const started = Date.now();
  const fail = (error: string, status: number | null = null): DeliveryOutcome => ({ ok: false, status, error, durationMs: Date.now() - started });

  const check = await (deps.checkUrl ?? defaultCheckUrl)(endpoint.url);
  if (!check.ok) return fail(`ssrf_refused:${check.reason}`);

  const secret = openSecret(endpoint.secret_enc, deps.env);
  if (!secret) return fail("secret_unavailable");

  const body = JSON.stringify(delivery.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    [EVENT_HEADER]: delivery.event,
    [DELIVERY_HEADER]: delivery.id,
    [SIGNATURE_HEADER]: buildSignatureHeader(secret, body, nowSec()),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await (deps.fetch ?? fetch)(endpoint.url, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    // Drain without reading into memory — a receiver's body is never stored.
    try {
      await res.body?.cancel();
    } catch {
      // ignore
    }
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, durationMs: Date.now() - started };
    if (res.status >= 300 && res.status < 400) return fail("redirect_not_followed", res.status);
    return fail(`http_${res.status}`, res.status);
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") return fail("timeout");
    return fail(truncate(`network:${err instanceof Error ? err.message : String(err)}`));
  } finally {
    clearTimeout(timer);
  }
}

export interface DispatchSummary {
  ok: boolean;
  dry: boolean;
  claimed: number;
  delivered: number;
  failed: number;
  dead: number;
  skipped: number;
  disabled_endpoints: string[];
  results: Array<{ id: string; endpoint_id: string; event: string; outcome: "delivered" | "failed" | "dead" | "skipped" | "dry"; error?: string; status?: number | null; next_attempt_at?: string | null }>;
  error?: string;
}

async function defaultNotify(args: { userId: string; projectId: string | null; endpointId: string; url: string }): Promise<void> {
  const { insertNotification } = await import("@/lib/notifications");
  let host = args.url;
  try {
    host = new URL(args.url).host;
  } catch {
    // keep raw
  }
  await insertNotification({
    userId: args.userId,
    projectId: args.projectId,
    kind: "webhook_disabled",
    payload: { endpoint_id: args.endpointId, host, failures: MAX_CONSECUTIVE_FAILURES, href: "/workspace/integrations" },
    dedupeKey: `webhook_disabled:${args.endpointId}`,
    throttleMs: 24 * 60 * 60_000,
  });
}

/**
 * Apply one attempt's outcome to the delivery + endpoint rows. Exported for
 * the test route (ping) which sends synchronously but books the same way.
 */
export async function recordOutcome(
  store: WebhookStore,
  endpoint: EndpointRow,
  delivery: Pick<DeliveryRow, "id" | "attempts">,
  outcome: DeliveryOutcome,
  opts: { now: Date; singleShot?: boolean; notify: NonNullable<DispatchDeps["notify"]>; countTowardsHealth?: boolean },
): Promise<{ status: "delivered" | "failed" | "dead"; next_attempt_at: string | null; disabled: boolean }> {
  const attempts = delivery.attempts + 1;
  const nowIso = opts.now.toISOString();
  const health = opts.countTowardsHealth ?? true;
  if (outcome.ok) {
    await store.updateDelivery(delivery.id, {
      status: "delivered",
      attempts,
      locked_until: null,
      response_status: outcome.status,
      last_error: null,
      delivered_at: nowIso,
    });
    if (health) await store.updateEndpoint(endpoint.id, { failure_count: 0, last_success_at: nowIso });
    else await store.updateEndpoint(endpoint.id, { last_success_at: nowIso });
    endpoint.failure_count = health ? 0 : endpoint.failure_count;
    return { status: "delivered", next_attempt_at: null, disabled: false };
  }

  const delay = opts.singleShot ? null : retryDelayMs(attempts);
  const status: "failed" | "dead" = delay === null ? "dead" : "failed";
  const next = delay === null ? null : new Date(opts.now.getTime() + delay).toISOString();
  await store.updateDelivery(delivery.id, {
    status,
    attempts,
    locked_until: null,
    next_attempt_at: next ?? nowIso,
    response_status: outcome.status,
    last_error: truncate(outcome.error),
  });

  let disabled = false;
  if (health) {
    const failures = endpoint.failure_count + 1;
    endpoint.failure_count = failures;
    if (failures >= MAX_CONSECUTIVE_FAILURES && endpoint.active) {
      disabled = true;
      endpoint.active = false;
      await store.updateEndpoint(endpoint.id, {
        failure_count: failures,
        last_failure_at: nowIso,
        active: false,
        disabled_reason: `auto_disabled:${MAX_CONSECUTIVE_FAILURES}_consecutive_failures`,
      });
      try {
        await opts.notify({ userId: endpoint.user_id, projectId: endpoint.project_id, endpointId: endpoint.id, url: endpoint.url });
      } catch (err) {
        console.error("[blockid:webhooks] disable notification failed", { endpoint: endpoint.id, err: String(err) });
      }
    } else {
      await store.updateEndpoint(endpoint.id, { failure_count: failures, last_failure_at: nowIso });
    }
  } else {
    await store.updateEndpoint(endpoint.id, { last_failure_at: nowIso });
  }
  return { status, next_attempt_at: next, disabled };
}

/**
 * One dispatcher tick. Never throws — a store error is reported in
 * `summary.error` so cron-health can see it.
 */
export async function dispatchDue(opts: { limit?: number; dryRun?: boolean } = {}, deps: DispatchDeps = {}): Promise<DispatchSummary> {
  const limit = Math.max(1, Math.min(DEFAULT_BATCH, opts.limit ?? DEFAULT_BATCH));
  const dry = Boolean(opts.dryRun);
  const summary: DispatchSummary = { ok: true, dry, claimed: 0, delivered: 0, failed: 0, dead: 0, skipped: 0, disabled_endpoints: [], results: [] };
  const now = deps.now ?? (() => new Date());
  const store = deps.store === undefined ? supabaseWebhookStore() : deps.store;
  if (!store) return { ...summary, ok: false, error: "supabase_unavailable" };
  const notify = deps.notify ?? defaultNotify;

  try {
    const due = await store.listDue(now(), limit);
    if (!due.length) return summary;

    const endpoints = new Map<string, EndpointRow>();
    for (const e of await store.getEndpoints(due.map((d) => d.endpoint_id))) endpoints.set(e.id, e);
    const allowedUsers = await usersAllowedWebhooks(store, [...endpoints.values()].map((e) => e.user_id));

    for (const d of due) {
      const endpoint = endpoints.get(d.endpoint_id);
      const base = { id: d.id, endpoint_id: d.endpoint_id, event: d.event };

      if (dry) {
        summary.results.push({ ...base, outcome: "dry" });
        continue;
      }
      const t = now();
      if (!(await store.claim(d.id, t, LEASE_MS))) {
        summary.skipped++;
        summary.results.push({ ...base, outcome: "skipped", error: "lease_taken" });
        continue;
      }
      summary.claimed++;

      if (!endpoint || !endpoint.active) {
        await store.updateDelivery(d.id, { status: "dead", locked_until: null, last_error: "endpoint_disabled" });
        summary.dead++;
        summary.results.push({ ...base, outcome: "dead", error: "endpoint_disabled" });
        continue;
      }
      if (!allowedUsers.has(endpoint.user_id)) {
        await store.updateDelivery(d.id, { status: "dead", locked_until: null, last_error: "plan_lapsed" });
        summary.dead++;
        summary.results.push({ ...base, outcome: "dead", error: "plan_lapsed" });
        continue;
      }

      const outcome = await sendOnce(endpoint, d, deps);
      const booked = await recordOutcome(store, endpoint, d, outcome, { now: now(), notify });
      if (booked.disabled) summary.disabled_endpoints.push(endpoint.id);
      if (booked.status === "delivered") summary.delivered++;
      else if (booked.status === "failed") summary.failed++;
      else summary.dead++;
      summary.results.push({
        ...base,
        outcome: booked.status,
        error: outcome.ok ? undefined : outcome.error,
        status: outcome.status,
        next_attempt_at: booked.next_attempt_at,
      });
    }
    return summary;
  } catch (err) {
    console.error("[blockid:webhooks] dispatch failed", err);
    return { ...summary, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Test button: send one `ping` synchronously and book it as a single-shot
 * delivery (no retry ladder; health counters untouched so a user testing a
 * half-configured URL cannot disable their own endpoint by clicking).
 */
export async function sendPing(
  store: WebhookStore,
  endpoint: EndpointRow,
  deps: Pick<DispatchDeps, "fetch" | "checkUrl" | "env" | "now"> = {},
): Promise<{ delivery_id: string; outcome: DeliveryOutcome }> {
  const now = (deps.now ?? (() => new Date()))();
  const data: PingPayload = { endpoint_id: endpoint.id, sent_at: now.toISOString() };
  const envelope = buildEnvelope("ping", data, { now });
  const id = randomUUID();
  // Inserted already leased so an overlapping dispatcher tick cannot claim it.
  await store.insertDeliveries([
    {
      id,
      endpoint_id: endpoint.id,
      event: "ping",
      payload: envelope as unknown as Record<string, unknown>,
      status: "queued",
      attempts: 0,
      next_attempt_at: now.toISOString(),
      locked_until: new Date(now.getTime() + LEASE_MS).toISOString(),
    },
  ]);
  const outcome = await sendOnce(endpoint, { id, event: "ping", payload: envelope as unknown as Record<string, unknown> }, deps);
  await recordOutcome(store, endpoint, { id, attempts: 0 }, outcome, { now, singleShot: true, countTowardsHealth: false, notify: async () => undefined });
  return { delivery_id: id, outcome };
}
