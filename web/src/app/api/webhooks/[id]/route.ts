// PATCH|DELETE /api/webhooks/[id] — manage one outbound webhook endpoint (S20-B).
//
// PATCH  { url?, events?, active?, description? }
//        200 { ok, endpoint }. Re-enabling (`active: true`) resets the
//        consecutive-failure counter and clears `disabled_reason`. A new
//        URL goes through the same SSRF guard as on create (400
//        url_rejected). The signing secret cannot be changed — delete and
//        recreate to rotate. G14-S38: `kind` and `destination_config` are
//        immutable (delete + recreate to change destination). A `slack`
//        endpoint's url may still rotate, but only onto another
//        hooks.slack.com url (400 host_not_allowed); `affinity` / `airtable`
//        derive their url from the sealed config and refuse url at all
//        (400 url_immutable_for_kind).
// DELETE 200 { ok } — cascades the delivery log.
//
// Access (lib/webhooks/http.ts loadEndpointForCaller): user-level → its
// creator; project-level → a CURRENT admin+ member of the project (S20-B
// review P1: creator status alone no longer counts). Anyone else → 404.
//
// PATCH is rate-limited 30/min per user (S20-B review P2-6): a URL change
// costs a DNS resolution, so an unlimited PATCH was a cheap DNS oracle /
// DoS surface next to create (20/h) and test (10/min).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";
import { validateEndpointUrl } from "@/lib/webhooks/dispatch";
import { hostAllowList, isDestinationKind, isHostAllowed } from "@/lib/webhooks/destinations";
import { supabaseWebhookStore, type EndpointPatch } from "@/lib/webhooks/store";
import { badRequest, loadEndpointForCaller, parseDescription, parseEventsInput, publicEndpoint } from "@/lib/webhooks/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function unauth() {
  return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
}
function noDb() {
  return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
}

async function PATCH_handler(request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauth();
  const limited = enforceRateLimit("webhooks-patch", user.id, request, 30, 60 * 1000);
  if (limited) return limited;
  const store = supabaseWebhookStore();
  if (!store) return noDb();

  const { id } = await ctx.params;
  const { endpoint, denied } = await loadEndpointForCaller(store, user, id);
  if (denied) return denied;

  const parsed = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};

  // Rows written before 0409 (or a test fixture built by hand) carry no
  // `kind` — generic, same as everywhere else this is read (store.ts
  // normaliseEndpointRow, http.ts publicEndpoint).
  const kind = isDestinationKind(endpoint.kind) ? endpoint.kind : "generic";

  const patch: EndpointPatch = {};
  if (body.url !== undefined) {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return badRequest("url_required");
    const check = await validateEndpointUrl(url);
    if (!check.ok) return badRequest("url_rejected", { reason: check.reason });
    // G14-S38: affinity / airtable derive their url from destination_config
    // (immutable here — recreate to change it); slack's url IS the
    // credential and may rotate, but only onto another hooks.slack.com url.
    if (kind === "affinity" || kind === "airtable") return badRequest("url_immutable_for_kind");
    if (kind !== "generic" && !isHostAllowed(url, kind)) {
      return badRequest("host_not_allowed", { allowed: hostAllowList(kind) ?? [] });
    }
    patch.url = url;
  }
  if (body.events !== undefined) {
    const events = parseEventsInput(body.events);
    if (!events.ok) return badRequest(events.error);
    patch.events = events.events;
  }
  if (body.description !== undefined) {
    const d = parseDescription(body.description);
    if (!d.ok) return badRequest(d.error);
    patch.description = d.description;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return badRequest("invalid_active");
    patch.active = body.active;
    if (body.active) {
      patch.failure_count = 0;
      patch.disabled_reason = null;
    } else {
      patch.disabled_reason = "paused_by_user";
    }
  }
  if (Object.keys(patch).length === 0) return badRequest("nothing_to_update");

  await store.updateEndpoint(endpoint.id, patch);
  const fresh = (await store.getEndpoint(endpoint.id)) ?? { ...endpoint, ...patch };
  return NextResponse.json({ ok: true, endpoint: publicEndpoint(fresh) }, { headers: PRIVATE_JSON_HEADERS });
}

async function DELETE_handler(request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return unauth();
  const store = supabaseWebhookStore();
  if (!store) return noDb();

  const { id } = await ctx.params;
  const { endpoint, denied } = await loadEndpointForCaller(store, user, id);
  if (denied) return denied;

  await store.deleteEndpoint(endpoint.id);
  return NextResponse.json({ ok: true }, { headers: PRIVATE_JSON_HEADERS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/webhooks/[id]/route.ts", method: "PATCH", action: "webhook.endpoint.updated", entity: "webhook_endpoint" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/webhooks/[id]/route.ts", method: "DELETE", action: "webhook.endpoint.deleted", entity: "webhook_endpoint" }, DELETE_handler);
