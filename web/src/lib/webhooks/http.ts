// S20-B — shared bits for the /api/webhooks routes: caller resolution,
// the endpoint access rule, input validation and the JSON shapes the UI
// consumes (secrets never leave this module except ONCE on create).
//
// Access rule for an existing endpoint (`loadEndpointForCaller`):
//   * user-level endpoint (project_id NULL)  → its creator only
//   * project-level endpoint                 → its creator, or any admin+
//                                              member of that project
//                                              (`assertProjectAccess`)
//   anything else → 404 (a non-member must not learn the row exists).
//
// Creating a project-level endpoint requires admin+ on that project
// (`assertProjectScope(user, project_id, "admin")`); a user-level endpoint
// only needs the plan gate (`canUseWebhooks`).

import { NextResponse } from "next/server";
import { assertProjectAccess } from "@/lib/projects";
import { isProjectAccessError, projectAccessResponse } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { isWebhookEvent, WEBHOOK_EVENTS, type WebhookEvent } from "./registry";
import type { DeliveryRow, EndpointRow, WebhookStore } from "./store";

export const MAX_ENDPOINTS_PER_SCOPE = 10;
export const MAX_DESCRIPTION_CHARS = 200;

export interface PublicEndpoint {
  id: string;
  project_id: string | null;
  url: string;
  description: string | null;
  events: WebhookEvent[];
  active: boolean;
  failure_count: number;
  disabled_reason: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicDelivery {
  id: string;
  event: string;
  status: DeliveryRow["status"];
  attempts: number;
  next_attempt_at: string | null;
  response_status: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

/** Row → JSON for the browser. `secret_hash` / `secret_enc` never leave the server. */
export function publicEndpoint(row: EndpointRow): PublicEndpoint {
  return {
    id: row.id,
    project_id: row.project_id ?? null,
    url: row.url,
    description: row.description ?? null,
    events: (row.events ?? []).filter(isWebhookEvent),
    active: Boolean(row.active),
    failure_count: row.failure_count ?? 0,
    disabled_reason: row.disabled_reason ?? null,
    last_success_at: row.last_success_at ?? null,
    last_failure_at: row.last_failure_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Row → JSON. The payload is the subscriber's own data but the list stays light — ids + status only. */
export function publicDelivery(row: DeliveryRow): PublicDelivery {
  return {
    id: row.id,
    event: row.event,
    status: row.status,
    attempts: row.attempts ?? 0,
    next_attempt_at: row.status === "failed" || row.status === "queued" ? (row.next_attempt_at ?? null) : null,
    response_status: row.response_status ?? null,
    last_error: row.last_error ?? null,
    created_at: row.created_at,
    delivered_at: row.delivered_at ?? null,
  };
}

export type EventsInput = { ok: true; events: WebhookEvent[] } | { ok: false; error: string };

/** `events` must be a non-empty array of known event names (deduped, catalogue order). */
export function parseEventsInput(v: unknown): EventsInput {
  if (!Array.isArray(v) || v.length === 0) return { ok: false, error: "events_required" };
  const set = new Set<string>();
  for (const e of v) {
    if (!isWebhookEvent(e)) return { ok: false, error: `unknown_event:${typeof e === "string" ? e.slice(0, 40) : typeof e}` };
    set.add(e);
  }
  return { ok: true, events: WEBHOOK_EVENTS.filter((e) => set.has(e)) };
}

export function parseDescription(v: unknown): { ok: true; description: string | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") return { ok: true, description: null };
  if (typeof v !== "string") return { ok: false, error: "invalid_description" };
  const trimmed = v.trim();
  if (trimmed.length > MAX_DESCRIPTION_CHARS) return { ok: false, error: "description_too_long" };
  return { ok: true, description: trimmed || null };
}

export function badRequest(error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, error, ...extra }, { status: 400 });
}

export function notFound(): NextResponse {
  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

/**
 * Load an endpoint the caller may manage, or the response to return
 * instead (404 for missing / not-yours / non-member, 403 for an under-
 * ranked member, 503 when Supabase is down).
 */
export async function loadEndpointForCaller(
  store: WebhookStore,
  user: { id: string },
  endpointId: string,
): Promise<{ endpoint: EndpointRow; denied: null } | { endpoint: null; denied: NextResponse }> {
  if (!isUuid(endpointId)) return { endpoint: null, denied: notFound() };
  const endpoint = await store.getEndpoint(endpointId);
  if (!endpoint) return { endpoint: null, denied: notFound() };
  if (endpoint.user_id === user.id) return { endpoint, denied: null };
  if (!endpoint.project_id) return { endpoint: null, denied: notFound() };
  try {
    await assertProjectAccess(user.id, endpoint.project_id, "admin");
    return { endpoint, denied: null };
  } catch (err) {
    if (isProjectAccessError(err)) {
      // A non-member sees 404 (not_found); an editor/viewer member sees 403.
      return { endpoint: null, denied: err.code === "forbidden" ? projectAccessResponse(err)! : notFound() };
    }
    throw err;
  }
}
