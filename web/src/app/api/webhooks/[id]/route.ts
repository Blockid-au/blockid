// PATCH|DELETE /api/webhooks/[id] — manage one outbound webhook endpoint (S20-B).
//
// PATCH  { url?, events?, active?, description? }
//        200 { ok, endpoint }. Re-enabling (`active: true`) resets the
//        consecutive-failure counter and clears `disabled_reason`. A new
//        URL goes through the same SSRF guard as on create (400
//        url_rejected). The signing secret cannot be changed — delete and
//        recreate to rotate.
// DELETE 200 { ok } — cascades the delivery log.
//
// Access (lib/webhooks/http.ts loadEndpointForCaller): the creator, or an
// admin+ member of the endpoint's project. Anyone else → 404.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { validateEndpointUrl } from "@/lib/webhooks/dispatch";
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
  const store = supabaseWebhookStore();
  if (!store) return noDb();

  const { id } = await ctx.params;
  const { endpoint, denied } = await loadEndpointForCaller(store, user, id);
  if (denied) return denied;

  const parsed = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};

  const patch: EndpointPatch = {};
  if (body.url !== undefined) {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) return badRequest("url_required");
    const check = await validateEndpointUrl(url);
    if (!check.ok) return badRequest("url_rejected", { reason: check.reason });
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
