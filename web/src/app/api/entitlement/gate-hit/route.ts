/**
 * POST /api/entitlement/gate-hit — the client <FeatureGate> beacon.
 *
 * G16-B. FeatureGate has sent `navigator.sendBeacon("/api/entitlement/gate-hit",
 * { feature, source })` since day one — to a route that did not exist, so
 * every client-side gate hit (e.g. the Deal Flow inbox card a free founder
 * sees) was a 404 and never reached `feature_gate_hit`. This handler records
 * it through the same `recordGateHit()` the server gates use, with the
 * page path as `surface`.
 *
 * Body: { feature: string; source?: "menu" | "action"; surface?: string }
 * Auth: signed-in user only (an anonymous hit has no plan to sell against).
 * Rate-limited per user; fire-and-forget on the client, so the reply is a
 * bare 204 / 4xx.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordGateHit, type Feature, type UserWithPlan } from "@/lib/entitlements";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

const FEATURE_RE = /^[a-z][a-z0-9_.]{1,63}$/;
const RL_MAX = 60;
const RL_WINDOW_MS = 15 * 60 * 1000;

async function POST_handler(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

  const limited = enforceRateLimit("entitlement-gate-hit", user.id, request, RL_MAX, RL_WINDOW_MS);
  if (limited) return limited;

  let body: { feature?: unknown; source?: unknown; surface?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const feature = typeof body.feature === "string" ? body.feature.trim() : "";
  if (!FEATURE_RE.test(feature)) return NextResponse.json({ ok: false, error: "feature required" }, { status: 400 });
  const source = body.source === "action" ? "action" : "menu";
  const surface = typeof body.surface === "string" ? body.surface : null;

  const uwp: UserWithPlan = { id: user.id, plan: user.plan ?? "free", segment: "founder", email: user.email ?? null };
  try {
    await recordGateHit(uwp, feature as Feature, source, surface);
  } catch {
    // analytics only — never surface to the client
  }
  return new Response(null, { status: 204 });
}

export const POST = apiRoute({ route: "api/entitlement/gate-hit/route.ts", method: "POST" }, POST_handler);
