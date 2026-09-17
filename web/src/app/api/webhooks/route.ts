// GET|POST /api/webhooks — outbound webhook endpoints (S20-B; destination
// kinds G14-S38).
//
// GET  ?project_id=<uuid>   → { ok, endpoints: PublicEndpoint[], access:
//                              { allowed, reason }, events: catalogue }
//        Without project_id: the caller's own endpoints (user-level AND the
//        project-level ones they created). With it: every endpoint of that
//        project — admin+ member required (assertProjectScope).
// POST { url?, events[], project_id?, description?, kind?, destination_config? }
//        `kind` defaults to `generic` (today's HMAC-signed JSON) — `url` is
//        required. `slack` also takes `url` (the incoming-webhook url IS
//        the credential) with no config. `affinity` / `airtable` take no
//        `url` — the endpoint url is derived from `destination_config`
//        (lib/webhooks/destinations) and `url`, if sent, is ignored.
//        201 { ok, endpoint, secret, destinations_unavailable? }
//        `secret` is returned ONCE; only its sha256 + a sealed copy are
//        stored (lib/webhooks/sign.ts) — `destination_config` is sealed the
//        same way and never echoed back (PublicEndpoint.destination is the
//        kind's REDACTED summary only). `destinations_unavailable: true`
//        means migration 0409 is not applied yet: the endpoint was created
//        as `generic` instead of the requested kind — never a 500.
//        401 anonymous · 402 plan_required (Growth / Package founders,
//        every evaluator plan, api.access) · 400 invalid body / unknown
//        event / unknown_kind / invalid_destination (Zod issues) /
//        host_not_allowed (kind's fixed host allow-list) / url_rejected
//        (https only, no private or internal hosts — S8-C SSRF guard,
//        DNS-resolved) · 403/404 project scope · 409 limit_reached (10
//        endpoints per scope) · 503 no DB.
//
// Rate limit: 20 creates per hour per user.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertProjectScope } from "@/lib/projects";
import { projectAccessResponse } from "@/lib/project-members/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { isUuid, PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { canUseWebhooks, WEBHOOK_EVENT_LABELS, WEBHOOK_EVENTS } from "@/lib/webhooks/registry";
import { validateEndpointUrl } from "@/lib/webhooks/dispatch";
import { isDestinationKind, parseDestinationInput, sealDestinationConfig } from "@/lib/webhooks/destinations";
import { generateSecret, hashSecret, sealSecret, WebhookSealKeyMissingError } from "@/lib/webhooks/sign";
import { supabaseWebhookStore } from "@/lib/webhooks/store";
import { badRequest, MAX_ENDPOINTS_PER_SCOPE, parseDescription, parseEventsInput, publicEndpoint } from "@/lib/webhooks/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function unauth() {
  return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
}
function noDb() {
  return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
}

const CATALOGUE = WEBHOOK_EVENTS.map((e) => ({ event: e, ...WEBHOOK_EVENT_LABELS[e] }));

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauth();
  const store = supabaseWebhookStore();
  if (!store) return noDb();

  let projectId: string | null = null;
  try {
    projectId = new URL(request.url).searchParams.get("project_id");
  } catch {
    projectId = null;
  }

  let rows;
  if (projectId) {
    if (!isUuid(projectId)) return badRequest("invalid_project_id");
    try {
      await assertProjectScope({ id: user.id, email: user.email }, projectId, "admin");
    } catch (err) {
      const denied = projectAccessResponse(err);
      if (denied) return denied;
      throw err;
    }
    rows = await store.listEndpoints({ projectId });
  } else {
    rows = await store.listEndpoints({ userId: user.id });
  }

  const access = await canUseWebhooks({ id: user.id, plan: user.plan, role: user.role }, { store });
  return NextResponse.json(
    { ok: true, endpoints: rows.map(publicEndpoint), access, events: CATALOGUE },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return unauth();

  const limited = enforceRateLimit("webhooks-create", user.id, request, 20, 60 * 60 * 1000);
  if (limited) return limited;

  const store = supabaseWebhookStore();
  if (!store) return noDb();

  const access = await canUseWebhooks({ id: user.id, plan: user.plan, role: user.role }, { store });
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: "plan_required", message: "Outbound webhooks are included with Growth, the Startup Package and every evaluator plan." },
      { status: 402 },
    );
  }

  const parsed = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  // G14-S38: `kind` picks the transformer (lib/webhooks/destinations); the
  // resulting `url` is either the caller's (generic / slack) or derived
  // from `destination_config` (affinity / airtable).
  const destination = parseDestinationInput(body.kind, body.destination_config, rawUrl || null);
  if (!destination.ok) {
    if (destination.error === "unknown_kind") return badRequest("unknown_kind");
    if (destination.error === "url_required") return badRequest("url_required");
    if (destination.error === "invalid_destination") return badRequest("invalid_destination", { issues: destination.issues ?? [] });
    return badRequest("host_not_allowed", { allowed: destination.allowed ?? [] });
  }
  const events = parseEventsInput(body.events);
  if (!events.ok) return badRequest(events.error);
  const description = parseDescription(body.description);
  if (!description.ok) return badRequest(description.error);

  let projectId: string | null = null;
  if (body.project_id !== undefined && body.project_id !== null && body.project_id !== "") {
    if (!isUuid(body.project_id)) return badRequest("invalid_project_id");
    try {
      await assertProjectScope({ id: user.id, email: user.email }, body.project_id, "admin");
    } catch (err) {
      const denied = projectAccessResponse(err);
      if (denied) return denied;
      throw err;
    }
    projectId = body.project_id;
  }

  const urlCheck = await validateEndpointUrl(destination.url);
  if (!urlCheck.ok) return badRequest("url_rejected", { reason: urlCheck.reason });

  const existing = await store.listEndpoints(projectId ? { projectId } : { userId: user.id });
  const inScope = projectId ? existing : existing.filter((e) => !e.project_id);
  if (inScope.length >= MAX_ENDPOINTS_PER_SCOPE) {
    return NextResponse.json({ ok: false, error: "limit_reached", max: MAX_ENDPOINTS_PER_SCOPE }, { status: 409 });
  }

  const secret = generateSecret();
  let sealed: string;
  let sealedDestination: string | null = null;
  try {
    sealed = sealSecret(secret);
    if (destination.kind !== "generic") sealedDestination = sealDestinationConfig(destination.config);
  } catch (err) {
    // S20-B review P2-4: production without WEBHOOK_SECRET_KEY must not
    // persist a plaintext-equivalent secret (or destination config,
    // G14-S38 — sealed with the same key) — fail the create, loudly.
    if (err instanceof WebhookSealKeyMissingError) {
      console.error("[blockid:webhooks] endpoint create refused —", err.message);
      return NextResponse.json({ ok: false, error: "sealing_key_missing" }, { status: 500 });
    }
    throw err;
  }
  const row = await store.insertEndpoint({
    user_id: user.id,
    project_id: projectId,
    url: destination.url,
    description: description.description,
    secret_hash: hashSecret(secret),
    secret_enc: sealed,
    events: events.events,
    // Omitted for `generic` so a pre-0409 insert still succeeds (store.ts
    // insertEndpoint also falls back to a plain generic insert on a
    // "column does not exist" error, so this route never 500s while the
    // migration is pending).
    ...(destination.kind !== "generic" ? { kind: destination.kind, destination_config_enc: sealedDestination } : {}),
  });
  if (!row) return NextResponse.json({ ok: false, error: "insert_failed" }, { status: 500 });

  // The store silently downgraded a non-generic request to `generic`
  // because migration 0409 (webhook_endpoints.kind) is not applied yet.
  const persistedKind = isDestinationKind(row.kind) ? row.kind : "generic";
  const destinationsUnavailable = destination.kind !== "generic" && persistedKind === "generic";

  return NextResponse.json(
    { ok: true, endpoint: publicEndpoint(row), secret, ...(destinationsUnavailable ? { destinations_unavailable: true } : {}) },
    { status: 201, headers: PRIVATE_JSON_HEADERS },
  );
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/webhooks/route.ts", method: "POST", action: "webhook.endpoint.created", entity: "webhook_endpoint" }, POST_handler);
