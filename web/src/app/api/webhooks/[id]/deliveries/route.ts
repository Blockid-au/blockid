// GET /api/webhooks/[id]/deliveries — last 50 deliveries of one endpoint (S20-B).
//
//   200 { ok, deliveries: PublicDelivery[] }  newest first; ids + status +
//       attempts + last_error only (the payload itself is the subscriber's
//       own data but is not repeated here — the receiver already has it).
//   401 anonymous · 404 not yours (creator or admin+ member of the project).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PRIVATE_JSON_HEADERS } from "@/lib/security/request-guards";
import { supabaseWebhookStore } from "@/lib/webhooks/store";
import { loadEndpointForCaller, publicDelivery } from "@/lib/webhooks/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DELIVERIES_LIMIT = 50;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const store = supabaseWebhookStore();
  if (!store) return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });

  const { id } = await ctx.params;
  const { endpoint, denied } = await loadEndpointForCaller(store, user, id);
  if (denied) return denied;

  const rows = await store.listDeliveries(endpoint.id, DELIVERIES_LIMIT);
  return NextResponse.json({ ok: true, deliveries: rows.map(publicDelivery) }, { headers: PRIVATE_JSON_HEADERS });
}
