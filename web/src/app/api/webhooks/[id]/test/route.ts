// POST /api/webhooks/[id]/test — send one signed `ping` now (S20-B).
//
//   200 { ok: true,  delivery_id, status, duration_ms }
//   200 { ok: false, delivery_id, status, error, duration_ms }
//        The HTTP status is about THIS request; `ok` is the receiver's
//        verdict (2xx within 8 s). The ping is single-shot (no retry
//        ladder) and never counts towards the auto-disable threshold, so a
//        founder poking at a half-built receiver cannot disable their own
//        endpoint. Same SSRF guard as the dispatcher (`ssrf_refused:…`).
//   401 anonymous · 404 not yours · 429 > 10 tests / min.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, rejectCrossSite } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { sendPing } from "@/lib/webhooks/dispatch";
import { supabaseWebhookStore } from "@/lib/webhooks/store";
import { loadEndpointForCaller } from "@/lib/webhooks/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function POST_handler(request: Request, ctx: Ctx) {
  const crossSite = rejectCrossSite(request);
  if (crossSite) return crossSite;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });

  const limited = enforceRateLimit("webhooks-test", user.id, request, 10, 60 * 1000);
  if (limited) return limited;

  const store = supabaseWebhookStore();
  if (!store) return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  const { endpoint, denied } = await loadEndpointForCaller(store, user, id);
  if (denied) return denied;

  const { delivery_id, outcome } = await sendPing(store, endpoint);
  return NextResponse.json(
    outcome.ok
      ? { ok: true, delivery_id, status: outcome.status, duration_ms: outcome.durationMs }
      : { ok: false, delivery_id, status: outcome.status, error: outcome.error, duration_ms: outcome.durationMs },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/webhooks/[id]/test/route.ts", method: "POST", action: "webhook.endpoint.tested", entity: "webhook_endpoint" }, POST_handler);
