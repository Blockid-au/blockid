// S20-B — webhook dispatcher. Runs from /api/cron/webhook-dispatch every
// 5 minutes (DEFAULT_BATCH = 25 deliveries per tick, MAX_BATCH = 50) and
// from the endpoint test button (one synchronous `ping`).
//
// Per delivery:
//   1. lease   — `claim()` is a conditional UPDATE (status queued|failed AND
//                lease free) so an overlapping tick never sends the same
//                row twice; the lease (LEASE_MS) outlives the 8 s timeout.
//   2. gate    — project-level endpoint whose creator is no longer the
//                project's owner or an accepted admin (one batched
//                membership read per tick) → endpoint deactivated
//                (`creator_not_member`, owner notified) and the delivery
//                `dead:creator_not_member` (S20-B review P1 — a revoked
//                member must not keep receiving project data); endpoint
//                inactive → `dead:endpoint_disabled`; owner's plan no longer
//                unlocks webhooks → `dead:plan_lapsed`; sealed secret cannot
//                be opened (key missing / rotated, legacy `obf:` row with a
//                key set) → endpoint deactivated (`secret_unreadable`) and
//                `dead:secret_unreadable`. None of these count as a
//                failure. URL refused by the S8-C SSRF guard (https only,
//                no private / internal hosts, every resolved address public)
//                → a failure like any other (`ssrf_refused:<reason>`) so a
//                DNS record that later goes public is retried, but an
//                endpoint pointing inside the network dies on the ladder.
//   3. send    — POST JSON, 8 s AbortController timeout, `redirect: "manual"`
//                (a 3xx is a failure — redirects are never followed, so the
//                SSRF check on the original host is the only host reached).
//                The socket is PINNED to the addresses the SSRF check
//                validated (lib/security/pinned-fetch.ts, S20-B review
//                P2-3) so a short-TTL record cannot flip to a private
//                address between the check and the connect.
//                Headers: Content-Type, User-Agent, X-BlockID-Event,
//                X-BlockID-Delivery (idempotency), X-BlockID-Signature
//                (t=<ts>,v1=<hmac>). 2xx = delivered; anything else fails.
//   4. ladder  — attempt n fails → next_attempt_at = now + RETRY_DELAYS_MS[n-1]
//                (1 m / 10 m / 1 h / 6 h); after MAX_ATTEMPTS (5) → `dead`.
//   5. health  — endpoint.failure_count resets on success, increments on
//                failure — ATOMICALLY, through the 0340 RPCs
//                (`webhook_endpoint_record_failure` / `_success`: the
//                increment, the auto-disable at MAX_CONSECUTIVE_FAILURES
//                (20) and the "did this call flip it" flag are one SQL
//                statement, so overlapping ticks cannot lose an update —
//                S20-B review P2). While the RPCs are not deployed the
//                store returns null and the old read-modify-write path
//                runs. When an endpoint is disabled ONE `webhook_disabled`
//                in-app notification is written for its owner (dedupe key
//                = endpoint id, 24 h throttle — lib/webhooks/notify.ts).
//
// `dryRun` lists what the tick would send and writes nothing. `fetch` and
// `checkUrl` are injectable so the tests never touch the network.

import { randomUUID } from "node:crypto";
import { checkOutboundUrl, type OutboundUrlOptions } from "@/lib/security/outbound-url";
import { pinnedFetch } from "@/lib/security/pinned-fetch";
import { buildSignatureHeader, DELIVERY_HEADER, EVENT_HEADER, nowSec, openSecret, SIGNATURE_HEADER } from "./sign";
import { buildEnvelope, usersAllowedWebhooks, type PingPayload } from "./registry";
import { notifyEndpointDisabled, type DisabledNotifier } from "./notify";
import { AUTO_DISABLED_REASON, MAX_CONSECUTIVE_FAILURES, supabaseWebhookStore, type DeliveryRow, type EndpointRow, type WebhookStore } from "./store";

export { MAX_CONSECUTIVE_FAILURES };

export const DELIVERY_TIMEOUT_MS = 8_000;
export const LEASE_MS = 2 * 60_000;
export const RETRY_DELAYS_MS: readonly number[] = Object.freeze([60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000]);
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Deliveries per tick by default — 25 × 8 s worst case = 200 s, inside the 5 min cron period. */
export const DEFAULT_BATCH = 25;
/** Hard cap a caller may raise `limit` to (manual catch-up). */
export const MAX_BATCH = 50;
export const USER_AGENT = "BlockID-Webhooks/1.0 (+https://blockid.au/docs#webhooks)";
export const CREATOR_NOT_MEMBER = "creator_not_member";
export const SECRET_UNREADABLE = "secret_unreadable";

export type DeliveryOutcome =
  | { ok: true; status: number; durationMs: number }
  | { ok: false; status: number | null; error: string; durationMs: number };

/** `addresses` = what the SSRF check resolved; the default fetch pins the socket to them. */
export type FetchLike = (url: string, init: RequestInit, addresses: readonly string[]) => Promise<Response>;

export type UrlCheck = { ok: true; addresses?: readonly string[] } | { ok: false; reason: string };

export interface DispatchDeps {
  store?: WebhookStore | null;
  fetch?: FetchLike;
  /** SSRF check seam (defaults to the S8-C guard with real DNS). */
  checkUrl?: (url: string) => Promise<UrlCheck>;
  /** In-app notification writer (defaults to lib/webhooks/notify). */
  notify?: DisabledNotifier;
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

async function defaultCheckUrl(url: string, opts: OutboundUrlOptions = {}): Promise<UrlCheck> {
  if (!isHttpsUrl(url)) return { ok: false, reason: "https_required" };
  const res = await checkOutboundUrl(url, opts);
  return res.ok ? { ok: true, addresses: res.addresses } : { ok: false, reason: res.reason };
}

/** Validate a subscriber URL at creation time (same rules as at send time). */
export async function validateEndpointUrl(url: string, opts: OutboundUrlOptions = {}): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof url !== "string" || url.length > 2048) return { ok: false, reason: "invalid_url" };
  const res = await defaultCheckUrl(url, opts);
  return res.ok ? { ok: true } : res;
}

/** Default transport: undici fetch on a dispatcher pinned to the checked addresses. */
const defaultFetch: FetchLike = (url, init, addresses) => pinnedFetch(url, init, addresses);

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
  const addresses = check.addresses ?? [];

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
    const res = await (deps.fetch ?? defaultFetch)(
      endpoint.url,
      {
        method: "POST",
        headers,
        body,
        redirect: "manual",
        signal: controller.signal,
      },
      addresses,
    );
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
    // undici wraps connect errors (incl. the pinned lookup's refusal) as
    // TypeError("fetch failed", { cause }) — keep the cause, it is the story.
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    return fail(truncate(`network:${err instanceof Error ? err.message : String(err)}${cause}`));
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

/**
 * Apply one attempt's outcome to the delivery + endpoint rows. Exported for
 * the test route (ping) which sends synchronously but books the same way.
 */
export async function recordOutcome(
  store: WebhookStore,
  endpoint: EndpointRow,
  delivery: Pick<DeliveryRow, "id" | "attempts">,
  outcome: DeliveryOutcome,
  opts: { now: Date; singleShot?: boolean; notify: DisabledNotifier; countTowardsHealth?: boolean },
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
    if (health) {
      // Atomic reset (0340 RPC); plain update until the migration is applied.
      if (!(await store.recordSuccess(endpoint.id))) await store.updateEndpoint(endpoint.id, { failure_count: 0, last_success_at: nowIso });
      endpoint.failure_count = 0;
    } else {
      await store.updateEndpoint(endpoint.id, { last_success_at: nowIso });
    }
    endpoint.last_success_at = nowIso;
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
    disabled = await bookFailure(store, endpoint, nowIso);
    if (disabled) {
      await opts.notify({ userId: endpoint.user_id, projectId: endpoint.project_id, endpointId: endpoint.id, url: endpoint.url, reason: "auto_disabled" });
    }
  } else {
    await store.updateEndpoint(endpoint.id, { last_failure_at: nowIso });
  }
  endpoint.last_failure_at = nowIso;
  return { status, next_attempt_at: next, disabled };
}

/**
 * failure_count + 1 and auto-disable at MAX_CONSECUTIVE_FAILURES. The 0340
 * RPC does it in one statement and reports whether THIS call flipped
 * `active`; before the migration is applied (`recordFailure` → null) the
 * pre-0340 read-modify-write runs — same semantics, lost-update prone.
 * Returns true when the endpoint was disabled by this call.
 */
async function bookFailure(store: WebhookStore, endpoint: EndpointRow, nowIso: string): Promise<boolean> {
  const atomic = await store.recordFailure(endpoint.id);
  if (atomic) {
    endpoint.failure_count = atomic.failure_count;
    if (!atomic.active) {
      endpoint.active = false;
      if (atomic.disabled) endpoint.disabled_reason = AUTO_DISABLED_REASON;
    }
    return atomic.disabled;
  }
  const failures = endpoint.failure_count + 1;
  endpoint.failure_count = failures;
  if (failures >= MAX_CONSECUTIVE_FAILURES && endpoint.active) {
    endpoint.active = false;
    endpoint.disabled_reason = AUTO_DISABLED_REASON;
    await store.updateEndpoint(endpoint.id, { failure_count: failures, last_failure_at: nowIso, active: false, disabled_reason: AUTO_DISABLED_REASON });
    return true;
  }
  await store.updateEndpoint(endpoint.id, { failure_count: failures, last_failure_at: nowIso });
  return false;
}

/**
 * P1 — which of the tick's PROJECT-level endpoints have a creator who is no
 * longer the project's owner or an accepted admin. One `projects` read +
 * one `project_members` read for the whole batch. Value = the project
 * owner to notify (null when the project row is gone).
 */
export async function lostCreatorEndpoints(store: WebhookStore, endpoints: readonly EndpointRow[]): Promise<Map<string, string | null>> {
  const lost = new Map<string, string | null>();
  const projectLevel = endpoints.filter((e) => e.project_id);
  if (!projectLevel.length) return lost;
  const projectIds = projectLevel.map((e) => e.project_id as string);
  const owners = await store.projectOwnerIds(projectIds);
  const admins = await store.projectAdminMemberships(projectIds, projectLevel.map((e) => e.user_id));
  for (const e of projectLevel) {
    const pid = e.project_id as string;
    const owner = owners.get(pid) ?? null;
    if (owner === e.user_id || admins.has(`${pid}:${e.user_id}`)) continue;
    lost.set(e.id, owner);
  }
  return lost;
}

/**
 * One dispatcher tick. Never throws — a store error is reported in
 * `summary.error` so cron-health can see it.
 */
export async function dispatchDue(opts: { limit?: number; dryRun?: boolean } = {}, deps: DispatchDeps = {}): Promise<DispatchSummary> {
  const limit = Math.max(1, Math.min(MAX_BATCH, opts.limit ?? DEFAULT_BATCH));
  const dry = Boolean(opts.dryRun);
  const summary: DispatchSummary = { ok: true, dry, claimed: 0, delivered: 0, failed: 0, dead: 0, skipped: 0, disabled_endpoints: [], results: [] };
  const now = deps.now ?? (() => new Date());
  const store = deps.store === undefined ? supabaseWebhookStore() : deps.store;
  if (!store) return { ...summary, ok: false, error: "supabase_unavailable" };
  const notify = deps.notify ?? notifyEndpointDisabled;

  try {
    const due = await store.listDue(now(), limit);
    if (!due.length) return summary;

    const endpoints = new Map<string, EndpointRow>();
    for (const e of await store.getEndpoints(due.map((d) => d.endpoint_id))) endpoints.set(e.id, e);
    const allowedUsers = await usersAllowedWebhooks(store, [...endpoints.values()].map((e) => e.user_id));
    const lostCreator = dry ? new Map<string, string | null>() : await lostCreatorEndpoints(store, [...endpoints.values()]);

    /** Park the delivery + switch the endpoint off for a non-retryable reason (no failure counted). */
    const parkAndDisable = async (d: DeliveryRow, endpoint: EndpointRow, reason: "creator_not_member" | "secret_unreadable", recipient: string | null) => {
      await store.updateDelivery(d.id, { status: "dead", locked_until: null, last_error: reason });
      if (endpoint.active || endpoint.disabled_reason !== reason) {
        const wasActive = endpoint.active;
        endpoint.active = false;
        endpoint.disabled_reason = reason;
        await store.updateEndpoint(endpoint.id, { active: false, disabled_reason: reason });
        if (wasActive) {
          summary.disabled_endpoints.push(endpoint.id);
          if (recipient) await notify({ userId: recipient, projectId: endpoint.project_id, endpointId: endpoint.id, url: endpoint.url, reason });
        }
      }
      summary.dead++;
      summary.results.push({ id: d.id, endpoint_id: d.endpoint_id, event: d.event, outcome: "dead", error: reason });
    };

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

      if (endpoint && lostCreator.has(endpoint.id)) {
        // P1: the creator lost owner/admin standing on the project — the
        // channel closes now, whatever `active` says.
        await parkAndDisable(d, endpoint, CREATOR_NOT_MEMBER, lostCreator.get(endpoint.id) ?? null);
        continue;
      }
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
      if (!openSecret(endpoint.secret_enc, deps.env)) {
        // Fail closed: nothing can be signed, so nothing is sent — and the
        // endpoint is switched off so the owner sees why (delete + recreate).
        await parkAndDisable(d, endpoint, SECRET_UNREADABLE, endpoint.user_id);
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
